from flask import Blueprint, render_template, request, redirect, session, url_for, jsonify, send_from_directory, flash
from psycopg2.errors import UniqueViolation
import json
import time
import os
import config
from utils.security import sanitize_input, validate_image_file, validate_video_file, rate_limit, require_csrf
from utils.helpers import generate_filename, remove_files_for_image_path, ensure_viewer_token
from utils.db import (get_conn, release_conn, get_comments, get_post_like_count, 
                      get_post_view_count, get_poll_results, cleanup_expired_posts)

posts_bp = Blueprint('posts_bp', __name__)

@posts_bp.route('/create')
def create():
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))
    return render_template('create.html')

@posts_bp.route('/create_post', methods=['POST'])
@require_csrf
@rate_limit(*config.RATE_LIMIT_POST)
def create_post():
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))

    user_id = session["user_id"]
    content = sanitize_input(request.form.get("content", ""), config.MAX_CONTENT_LENGTH)
    
    duration = None
    try:
        d_days = request.form.get('duration_days')
        d_hours = request.form.get('duration_hours')
        d_mins = request.form.get('duration_mins')
        if d_days is not None or d_hours is not None or d_mins is not None:
            days = int(d_days) if d_days not in (None, '') else 0
            hours = int(d_hours) if d_hours not in (None, '') else 0
            mins = int(d_mins) if d_mins not in (None, '') else 0
            duration = days * 24 * 3600 + hours * 3600 + mins * 60
        else:
            duration = int(request.form.get("duration", config.DEFAULT_POST_DURATION) or config.DEFAULT_POST_DURATION)
    except Exception:
        duration = config.DEFAULT_POST_DURATION

    if duration <= 0:
        duration = config.DEFAULT_POST_DURATION
    if duration > config.MAX_POST_DURATION_SECONDS:
        duration = config.MAX_POST_DURATION_SECONDS

    now_secs = int(time.time())
    expires_at = now_secs + duration

    media = []
    # Carica foto
    for idx, photo in enumerate((request.files.getlist('photos') or [])[:5]):
        if photo and validate_image_file(photo):
            new_filename = generate_filename(session["user_id"], "avif")
            os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
            photo.save(os.path.join(config.UPLOAD_FOLDER, new_filename))
            media.append({'path': new_filename, 'type': 'photo'})
    
    # Carica video
    for idx, video in enumerate((request.files.getlist('videos') or [])[:5 - len(media)]):
        if video and validate_video_file(video):
            ext = video.filename.rsplit('.', 1)[1].lower()
            new_filename = generate_filename(session["user_id"], ext)
            os.makedirs(config.VIDEO_FOLDER, exist_ok=True)
            video.save(os.path.join(config.VIDEO_FOLDER, new_filename))
            media.append({'path': new_filename, 'type': 'video'})
    
    image_path = json.dumps(media) if media else None

    poll_question = sanitize_input(request.form.get("poll_question", ""), config.MAX_POLL_QUESTION_LENGTH)
    poll_options = []
    for i in range(1, config.MAX_POLL_OPTIONS + 1):
        opt = sanitize_input(request.form.get(f"poll_option_{i}", ""), config.MAX_POLL_OPTION_LENGTH)
        if opt:
            poll_options.append(opt)
    if len(poll_options) < 2:
        poll_options = None

    has_images = bool(media)
    has_text = bool(content)
    has_poll = bool(poll_options)
    if not (has_text or has_images or has_poll):
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
            return jsonify({'status': 'error', 'error': 'Empty post not allowed'}), 400
        flash('Il post non può essere vuoto. Aggiungi testo, foto o video.', 'error')
        return redirect(request.referrer or url_for('misc_bp.index'))

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO posts (user_id, content, expires_at, image_path) VALUES (%s, %s, %s, %s) RETURNING id",
        (user_id, content, expires_at, image_path)
    )
    post_id = cur.fetchone()[0]

    if poll_options:
        cur.execute(
            "INSERT INTO polls (post_id, question) VALUES (%s, %s) RETURNING id",
            (post_id, poll_question)
        )
        poll_id = cur.fetchone()[0]

        for idx, opt_text in enumerate(poll_options):
            cur.execute(
                "INSERT INTO poll_options (poll_id, option_index, option_text) VALUES (%s, %s, %s)",
                (poll_id, idx, opt_text)
            )

    conn.commit()
    cur.close()
    release_conn(conn)

    return redirect(url_for("misc_bp.index"))

@posts_bp.route("/like/<int:post_id>", methods=["POST"])
@require_csrf
@rate_limit(*config.RATE_LIMIT_LIKE)
def like_post(post_id):
    user_id = session.get("user_id")
    if not user_id: 
        return "not logged in", 401
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO likes (user_id, post_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (user_id, post_id))
    conn.commit()
    cur.close()
    release_conn(conn)
    return '', 200

@posts_bp.route("/comment/<int:post_id>", methods=["POST"])
@require_csrf
@rate_limit(*config.RATE_LIMIT_COMMENT)
def add_comment(post_id):
    user_id = session.get("user_id")
    if not user_id: 
        return "not logged in", 401

    content = sanitize_input(request.form.get("content", ""), config.MAX_CONTENT_LENGTH)
    if not content:
        return jsonify({'error': 'Empty comment'}), 400
    
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO comments (post_id, user_id, content) VALUES (%s,%s,%s)", (post_id, user_id, content))
    conn.commit()
    cur.execute("SELECT c.id, c.content, u.username, c.created_at FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id=%s AND c.user_id=%s ORDER BY c.created_at DESC LIMIT 1", (post_id, user_id))
    row = cur.fetchone()
    cur.close()
    release_conn(conn)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
        if row:
            cid, ccontent, username, created_at = row
            return jsonify({'id': cid, 'content': ccontent, 'username': username, 'created_at': created_at.isoformat() if created_at else None}), 201
        return jsonify({'status': 'ok'}), 201

    return redirect(request.referrer or url_for('misc_bp.index'))

@posts_bp.route('/delete_post/<int:post_id>', methods=['POST'])
@require_csrf
def delete_post(post_id):
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT user_id FROM posts WHERE id=%s", (post_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        release_conn(conn)
        return jsonify({"error": "not found"}), 404

    owner_id = row[0]
    if owner_id != session["user_id"]:
        cur.close()
        release_conn(conn)
        return jsonify({"error": "forbidden"}), 403

    try:
        cur.execute("SELECT image_path FROM posts WHERE id=%s", (post_id,))
        img_row = cur.fetchone()
        if img_row and img_row[0]:
            remove_files_for_image_path(img_row[0])
    except Exception:
        pass

    try:
        cur.execute("DELETE FROM poll_votes WHERE post_id=%s", (post_id,))
        cur.execute("DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE post_id=%s)", (post_id,))
        cur.execute("DELETE FROM polls WHERE post_id=%s", (post_id,))
        cur.execute("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id=%s)", (post_id,))
        cur.execute("DELETE FROM comments WHERE post_id=%s", (post_id,))
        cur.execute("DELETE FROM likes WHERE post_id=%s", (post_id,))
        cur.execute("DELETE FROM posts WHERE id=%s", (post_id,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        cur.close()
        release_conn(conn)
        return jsonify({"error": str(e)}), 500

    cur.close()
    release_conn(conn)
    return jsonify({"status": "ok"}), 200

@posts_bp.route("/comment/like/<int:comment_id>", methods=["POST"])
@require_csrf
@rate_limit(*config.RATE_LIMIT_LIKE)
def like_comment(comment_id):
    if "user_id" not in session:
        return "not logged in", 401

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO comment_likes (user_id, comment_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (session["user_id"], comment_id)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        return f"Errore: {e}"
    finally:
        cur.close()
        release_conn(conn)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
        return jsonify({'status': 'ok'}), 200

    return redirect(request.referrer or url_for("misc_bp.index"))

@posts_bp.route('/comments_json/<int:post_id>')
def comments_json(post_id):
    if "user_id" not in session:
        return jsonify({"error": "not logged in"}), 401

    offset = request.args.get('offset', 0, type=int)
    limit = request.args.get('limit', config.COMMENTS_PER_PAGE, type=int)
    limit = max(1, min(limit, config.COMMENTS_MAX_PER_PAGE))

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT c.id, c.content, u.username, c.created_at,
               COALESCE(lc.count, 0) AS like_count,
               COALESCE(p.avatar_path, '') AS avatar_path
        FROM comments c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN profile p ON u.id = p.user_id
        LEFT JOIN (
            SELECT comment_id, COUNT(*) AS count FROM comment_likes GROUP BY comment_id
        ) lc ON c.id = lc.comment_id
        WHERE c.post_id = %s
        ORDER BY c.created_at DESC
        LIMIT %s OFFSET %s
    """, (post_id, limit, offset))
    rows = cur.fetchall()
    comments = []
    for cid, content, username, created_at, like_count, avatar_path in rows:
        filename = os.path.basename(avatar_path) if avatar_path else 'default.png'
        # FIX: Blueprint endpoint
        avatar_url = url_for('uploaded_avatar', filename=filename)
        comments.append({
            'id': cid,
            'content': content,
            'username': username,
            'created_at': created_at.isoformat() if created_at else None,
            'like_count': like_count,
            'avatar_url': avatar_url
        })

    cur.close()
    release_conn(conn)
    return jsonify({'comments': comments})

@posts_bp.route("/likes/<int:post_id>")
def post_likes(post_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT users.username, COALESCE(p.avatar_path, '')
        FROM likes
        JOIN users ON likes.user_id = users.id
        LEFT JOIN profile p ON users.id = p.user_id
        WHERE likes.post_id = %s
    """, (post_id,))
    likers = []
    for username, avatar_path in cur.fetchall():
        filename = os.path.basename(avatar_path) if avatar_path else 'default.png'
        # FIX: Blueprint endpoint
        avatar_url = url_for('uploaded_avatar', filename=filename)
        likers.append({ 'username': username, 'avatar_url': avatar_url })
    cur.close()
    release_conn(conn)

    return jsonify(likers)

@posts_bp.route("/poll_vote/<int:post_id>", methods=["POST"])
@require_csrf
@rate_limit(*config.RATE_LIMIT_POLL_VOTE)
def poll_vote(post_id):
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))

    option_index = request.form.get("option_index")
    user_id = session["user_id"]

    if option_index is None:
        return "Manca opzione selezionata", 400

    try:
        option_index = int(option_index)
    except ValueError:
        return "Opzione non valida", 400

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM polls WHERE post_id=%s", (post_id,))
    poll_row = cur.fetchone()
    if not poll_row:
        cur.close()
        release_conn(conn)
        return "Sondaggio inesistente", 404
    poll_id = poll_row[0]

    try:
        cur.execute("""
            INSERT INTO poll_votes (post_id, user_id, option_index)
            VALUES (%s, %s, %s)
            """,
            (post_id, user_id, option_index))
        conn.commit()
    except UniqueViolation:
        conn.rollback()
        cur.close()
        release_conn(conn)
        return "Hai già votato!", 403
    except Exception as e:
        conn.rollback()
        cur.close()
        release_conn(conn)
        return f"Errore: {e}", 500

    cur.close()
    release_conn(conn)
    return '', 200

@posts_bp.route('/post_view', methods=['POST'])
@rate_limit(*config.RATE_LIMIT_VIEW)
def post_view():
    post_id = request.form.get('post_id') or request.json and request.json.get('post_id')
    if not post_id:
        return jsonify({'error': 'post_id required'}), 400
    try:
        post_id_int = int(post_id)
    except Exception:
        return jsonify({'error': 'invalid post_id'}), 400

    viewer_token = ensure_viewer_token()
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO post_views (viewer_token, post_id) VALUES (%s, %s) ON CONFLICT (viewer_token, post_id) DO NOTHING",
            (viewer_token, post_id_int)
        )
        conn.commit()
        cur.close()
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': 'db error', 'detail': str(e)}), 500
    finally:
        if conn:
            release_conn(conn)

    count = get_post_view_count(post_id_int)
    return jsonify({'post_id': post_id_int, 'views': count})

@posts_bp.route("/load_posts")
def load_posts():
    if "user_id" not in session:
        return {"error": "not logged in"}, 401

    last_post_id = request.args.get("last_id", type=int)
    limit = request.args.get("limit", config.LOAD_POSTS_LIMIT, type=int)
    limit = max(1, min(limit, config.LOAD_POSTS_MAX))

    conn = get_conn()
    cur = conn.cursor()
    now_secs = int(time.time())

    if last_post_id:
        cur.execute("""
            SELECT posts.id, posts.content, posts.image_path, posts.expires_at,
                   users.username,
                   COALESCE(like_count.count, 0) AS like_count,
                   p.avatar_path
            FROM posts
            JOIN users ON posts.user_id = users.id
            LEFT JOIN (
                SELECT post_id, COUNT(*) AS count
                FROM likes
                GROUP BY post_id
            ) AS like_count ON posts.id = like_count.post_id
            LEFT JOIN profile AS p ON users.id = p.user_id
            WHERE posts.id < %s AND posts.expires_at > %s
            ORDER BY posts.id DESC
            LIMIT %s
        """, (last_post_id, now_secs, limit))
    else:
        cur.execute("""
            SELECT posts.id, posts.content, posts.image_path, posts.expires_at,
                   users.username,
                   COALESCE(like_count.count, 0) AS like_count,
                   p.avatar_path
            FROM posts
            JOIN users ON posts.user_id = users.id
            LEFT JOIN (
                SELECT post_id, COUNT(*) AS count
                FROM likes
                GROUP BY post_id
            ) AS like_count ON posts.id = like_count.post_id
            LEFT JOIN profile AS p ON users.id = p.user_id
            WHERE posts.expires_at > %s
            ORDER BY posts.id DESC
            LIMIT %s
        """, (now_secs, limit))

    posts_db = cur.fetchall()
    posts = []
    for p in posts_db:
        post_id = p[0]
        content = p[1]
        image_path = p[2]
        expires_at = p[3]
        username = p[4]
        like_count = p[5]
        avatar_path = p[6]

        avatar_filename = os.path.basename(avatar_path) if avatar_path else 'default.png'
        # FIX: Blueprint endpoint
        avatar_url = url_for('uploaded_avatar', filename=avatar_filename)

        image_urls = []
        media = []
        image_paths_list = []
        if image_path:
            try:
                parsed = json.loads(image_path)
                if parsed and isinstance(parsed[0], dict):
                    media = parsed
                    image_paths_list = [m['path'] for m in parsed]
                    for m in parsed:
                        if m.get('type') == 'video':
                            image_urls.append(url_for('uploaded_video', filename=os.path.basename(m['path'])))
                        else:
                            image_urls.append(url_for('uploaded_file', filename=os.path.basename(m['path'])))
                else:
                    image_paths_list = parsed
                    for img in parsed:
                        image_urls.append(url_for('uploaded_file', filename=os.path.basename(img)))
                        media.append({'path': img, 'type': 'photo'})
            except Exception:
                image_paths_list = [image_path]
                image_urls.append(url_for('uploaded_file', filename=os.path.basename(image_path)))
                media.append({'path': image_path, 'type': 'photo'})

        remaining_seconds = max(0, expires_at - now_secs)

        comments = get_comments(post_id)
        cur.execute("SELECT id, question FROM polls WHERE post_id=%s", (post_id,))
        poll_row = cur.fetchone()
        poll = None
        poll_data = None
        if poll_row:
            poll_id, question = poll_row
            cur.execute("SELECT option_index, option_text FROM poll_options WHERE poll_id=%s ORDER BY option_index", (poll_id,))
            options = cur.fetchall()
            poll = {
                "id": poll_id,
                "question": question,
                "options": [{"index": o[0], "text": o[1]} for o in options]
            }

            poll_data = get_poll_results(post_id, session["user_id"])

        posts.append({
            "id": post_id,
            "content": content,
            "image_path": image_path,
            "image_paths": image_paths_list,
            "image_urls": image_urls,
            "media": media,
            "avatar": avatar_filename,
            "avatar_url": avatar_url,
            "like_count": like_count,
            "username": username,
            "remaining_seconds": remaining_seconds,
            "show_timer": True,
            "comments": comments,
            "comment_count": len(comments),
            "poll": poll,
            "poll_data" : poll_data
        })
        try:
            posts[-1]["views"] = get_post_view_count(post_id)
        except Exception:
            posts[-1]["views"] = 0

    cur.close()
    release_conn(conn)
    return {"posts": posts}