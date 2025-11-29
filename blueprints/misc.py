from flask import Blueprint, render_template, request, redirect, session, url_for, jsonify
import secrets
import os
import json
import config
from utils.security import sanitize_input, rate_limit, require_csrf
from utils.db import get_conn, release_conn, get_all_posts, search_users, get_post_like_count, get_post_view_count, get_comments

misc_bp = Blueprint('misc_bp', __name__)

@misc_bp.route("/")
def index():
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))

    posts = get_all_posts()
    return render_template("index.html", username=session["username"], posts=posts, profile_mode=False)

@misc_bp.route('/usernames')
def usernames_page():
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))
    q = sanitize_input(request.args.get('q', ''), config.MAX_USERNAME_LENGTH)
    conn = get_conn()
    cur = conn.cursor()
    if q:
        cur.execute("SELECT username FROM users WHERE LOWER(username) LIKE %s ORDER BY LOWER(username) ASC LIMIT 100", (f"%{q.lower()}%",))
    else:
        cur.execute("SELECT username FROM users ORDER BY LOWER(username) ASC LIMIT 100")
    rows = cur.fetchall()
    usernames = [r[0] for r in rows]
    cur.close()
    release_conn(conn)
    return render_template('usernames.html', usernames=usernames, search_query=q)

@misc_bp.route("/search_users", methods=["GET"])
def search_users_route():
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))
    q = sanitize_input(request.args.get("q", ""), config.MAX_USERNAME_LENGTH)
    found_users = search_users(q) if q else []
    return render_template("index.html", username=session["username"], search_query=q, found_users=found_users)

@misc_bp.route('/usernames_preview')
def usernames_preview():
    if "user_id" not in session:
        return jsonify([])
    q = sanitize_input(request.args.get('q', ''), config.MAX_USERNAME_LENGTH)
    conn = get_conn()
    cur = conn.cursor()
    if q:
        cur.execute("""
            SELECT u.username, COALESCE(p.avatar_path, '')
            FROM users u
            LEFT JOIN profile p ON u.id = p.user_id
            WHERE LOWER(u.username) LIKE %s
            ORDER BY LOWER(u.username) ASC
            LIMIT 10
        """, (f"{q.lower()}%",))
    else:
        cur.execute("""
            SELECT u.username, COALESCE(p.avatar_path, '')
            FROM users u
            LEFT JOIN profile p ON u.id = p.user_id
            ORDER BY LOWER(u.username) ASC
            LIMIT 5
        """)
    rows = cur.fetchall()
    results = []
    for username, avatar_path in rows:
        filename = os.path.basename(avatar_path) if avatar_path else 'default.png'
        # FIX: Blueprint endpoint
        avatar_url = url_for('uploaded_avatar', filename=filename)
        results.append({ 'username': username, 'avatar_url': avatar_url })
    cur.close()
    release_conn(conn)
    return jsonify(results)

@misc_bp.route('/crono', methods=['GET'])
def get_crono():
    if 'user_id' not in session:
        return jsonify([])
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT username, avatar_path, created_at
        FROM crono
        WHERE owner_id = %s
        ORDER BY created_at DESC
        LIMIT 10
    """, (session['user_id'],))
    rows = cur.fetchall()
    results = []
    for username, avatar_path, created_at in rows:
        filename = os.path.basename(avatar_path) if avatar_path else 'default.png'
        # FIX: Blueprint endpoint
        avatar_url = url_for('uploaded_avatar', filename=filename)
        results.append({ 'username': username, 'avatar_url': avatar_url, 'created_at': created_at.isoformat() if created_at else None })
    cur.close()
    release_conn(conn)
    return jsonify(results)

@misc_bp.route('/crono/add', methods=['POST'])
@require_csrf
@rate_limit(*config.RATE_LIMIT_CRONO)
def add_crono():
    if 'user_id' not in session:
        return 'not logged in', 401
    
    username = None
    try:
        username = request.form.get('username')
    except Exception:
        username = None
    if not username:
        j = None
        try:
            j = request.get_json(silent=True)
        except Exception:
            j = None
        if j and isinstance(j, dict):
            username = j.get('username')
    if not username:
        username = request.args.get('username')
    
    username = sanitize_input(username, config.MAX_USERNAME_LENGTH)
    if not username:
        return 'missing username', 400

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM users WHERE username=%s", (username,))
    row = cur.fetchone()
    avatar_path = None
    if row:
        target_id = row[0]
        cur.execute("SELECT avatar_path FROM profile WHERE user_id=%s", (target_id,))
        r = cur.fetchone()
        avatar_path = r[0] if r and r[0] else None

    cur.execute("DELETE FROM crono WHERE created_at < NOW() - INTERVAL '90 days'")

    cur.execute("""
        INSERT INTO crono (owner_id, username, avatar_path, created_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (owner_id, username) DO UPDATE
        SET avatar_path = EXCLUDED.avatar_path, created_at = NOW()
    """, (session['user_id'], username, avatar_path))

    conn.commit()
    cur.close()
    release_conn(conn)
    return '', 200

@misc_bp.route('/crono/delete', methods=['POST'])
@require_csrf
def delete_crono():
    if 'user_id' not in session:
        return 'not logged in', 401
    username = request.form.get('username') or (request.json.get('username') if request.is_json else None)
    username = sanitize_input(username, config.MAX_USERNAME_LENGTH)
    if not username:
        return 'missing username', 400
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM crono WHERE owner_id=%s AND username=%s", (session['user_id'], username))
    conn.commit()
    cur.close()
    release_conn(conn)
    return '', 200

@misc_bp.route('/search_posts')
def search_posts():
    q = sanitize_input(request.args.get('q', ''), config.MAX_CONTENT_LENGTH)
    try:
        limit = int(request.args.get('limit', 4))
    except Exception:
        limit = 4
    limit = max(1, min(limit, config.SEARCH_LIMIT_POSTS))
    if not q:
        return jsonify([])

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT p.id, p.content, u.username
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE LOWER(p.content) LIKE %s
            ORDER BY p.id DESC
            LIMIT %s
        """, (f"%{q.lower()}%", limit))
        rows = cur.fetchall()
        results = []
        for row in rows:
            pid, content, username = row
            results.append({ 'id': pid, 'content': content, 'username': username })
    finally:
        cur.close()
        release_conn(conn)
    return jsonify(results)

@misc_bp.route('/search_comments')
def search_comments():
    q = sanitize_input(request.args.get('q', ''), config.MAX_CONTENT_LENGTH)
    try:
        limit = int(request.args.get('limit', 8))
    except Exception:
        limit = 8
    limit = max(1, min(limit, config.SEARCH_LIMIT_COMMENTS))
    if not q:
        return jsonify([])

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT c.id, c.content, u.username, c.post_id
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE LOWER(c.content) LIKE %s
            ORDER BY c.created_at DESC
            LIMIT %s
        """, (f"%{q.lower()}%", limit))
        rows = cur.fetchall()
        results = []
        for row in rows:
            cid, content, username, post_id = row
            results.append({ 'id': cid, 'content': content, 'username': username, 'post_id': post_id })
    finally:
        cur.close()
        release_conn(conn)
    return jsonify(results)

@misc_bp.route('/search')
def search_page():
    q = sanitize_input(request.args.get('q', ''), config.MAX_CONTENT_LENGTH)
    posts = []
    if q:
        conn = get_conn()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT p.id, p.content, p.image_path, p.expires_at, u.username, COALESCE(profile.avatar_path, '')
                FROM posts p
                JOIN users u ON p.user_id = u.id
                LEFT JOIN profile ON u.id = profile.user_id
                WHERE LOWER(p.content) LIKE %s
                ORDER BY p.id DESC
                LIMIT 50
            """, (f"%{q.lower()}%",))
            rows = cur.fetchall()
            import time
            now_secs = int(time.time())
            for row in rows:
                pid, content, image_path, expires_at, username, avatar_path = row
                remaining_seconds = max(0, (expires_at or now_secs) - now_secs)
                image_urls = []
                if image_path:
                    try:
                        imgs = json.loads(image_path)
                    except Exception:
                        imgs = [image_path]
                    for im in imgs:
                        try:
                            # FIX: Blueprint endpoint
                            image_urls.append(url_for('uploaded_file', filename=os.path.basename(im)))
                        except Exception:
                            pass
                posts.append({
                    'id': pid,
                    'content': content,
                    'image_urls': image_urls,
                    'image_url': image_urls[0] if image_urls else None,
                    'remaining_seconds': remaining_seconds,
                    'expires_at': expires_at,
                    'username': username,
                    'like_count': get_post_like_count(pid),
                    'comment_count': 0,
                    'views': get_post_view_count(pid),
                    'comments': get_comments(pid)
                })
        finally:
            cur.close()
            release_conn(conn)

    return render_template('search.html', query=q, posts=posts, username=session.get('username'))