from flask import Blueprint, render_template, request, redirect, session, url_for, jsonify, send_from_directory, Response
import os
import io
from PIL import Image
import json
import time
import config
from utils.security import sanitize_input, validate_image_file, rate_limit, require_csrf, validate_csrf
from utils.helpers import generate_filename
from utils.db import get_conn, release_conn, is_pinned, get_pinned_users, get_post_view_count, get_comments, get_poll_results, ban_user
from utils.moderation import analyze_text_from_post

try:
    import qrcode
except Exception:
    qrcode = None

profile_bp = Blueprint('profile_bp', __name__)

@profile_bp.route("/profile", methods=["GET", "POST"])
@rate_limit(*config.RATE_LIMIT_PROFILE_UPDATE)
def profile():
    """Pagina profilo personale."""
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))

    conn = get_conn()
    cur = conn.cursor()

    if request.method == "POST":
        if not validate_csrf():
            return "Invalid CSRF token", 403
        
        new_bio = sanitize_input(request.form.get("bio", ""), config.MAX_BIO_LENGTH)
        if new_bio:
            print(f"    [BIO] {new_bio}")
            action, reason, report = analyze_text_from_post(new_bio)
            if report.get("text"):
                print(f"    [BIO] {report['text']}")
            if action == "BLOCK":
                ban_user(session["user_id"], reason=f"Text moderation BLOCK (BIO): {reason}")
                session['banned'] = True
                session.pop('user_id', None)
                session.pop('username', None)
                return f"Bio non consentita: {reason}", 400
        social_links = []
        for i in range(config.MAX_SOCIAL_LINKS):
            link = sanitize_input(request.form.get(f"social{i}", ""), 500)
            if link:
                social_links.append(link)
        if len(social_links) > config.MAX_SOCIAL_LINKS:
            social_links = social_links[:config.MAX_SOCIAL_LINKS]

        avatar_file = request.files.get("avatar")
        avatar_path = None
        if avatar_file and validate_image_file(avatar_file):
            ext = avatar_file.filename.rsplit('.', 1)[1].lower()
            filename = generate_filename(session["user_id"], ext)
            avatars_folder = os.path.join(config.AVATARS_FOLDER)
            os.makedirs(avatars_folder, exist_ok=True)
            save_path = os.path.join(avatars_folder, filename)

            avatar_file.save(save_path)

            img = Image.open(save_path)
            width, height = img.size
            min_dim = min(width, height)
            left = (width - min_dim) // 2
            top = (height - min_dim) // 2
            right = left + min_dim
            bottom = top + min_dim
            img_cropped = img.crop((left, top, right, bottom))
            img_resized = img_cropped.resize((1024, 1024), Image.LANCZOS)
            img_resized.save(save_path)

            avatar_path = f"avatars/{filename}"

        if avatar_path:
            cur.execute("""
                INSERT INTO profile (user_id, bio, avatar_path, social_links, updated_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (user_id) DO UPDATE
                SET bio=%s, avatar_path=%s, social_links=%s, updated_at=NOW()
            """, (session["user_id"], new_bio, avatar_path, social_links,
                  new_bio, avatar_path, social_links))
        else:
            cur.execute("""
                INSERT INTO profile (user_id, bio, social_links, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (user_id) DO UPDATE
                SET bio=%s, social_links=%s, updated_at=NOW()
            """, (session["user_id"], new_bio, social_links,
                  new_bio, social_links))

        conn.commit()

    cur.execute("SELECT bio, avatar_path, social_links FROM profile WHERE user_id=%s", (session["user_id"],))
    profile_data = cur.fetchone()
    cur.close()
    release_conn(conn)

    bio = profile_data[0] if profile_data else ''
    avatar = profile_data[1] if profile_data else ''
    social_links = profile_data[2] if profile_data and profile_data[2] else []

    conn = get_conn()
    cur = conn.cursor()
    now_secs = int(time.time())
    cur.execute("""
        SELECT id, content, expires_at, image_path
        FROM posts
        WHERE user_id=%s
        ORDER BY id DESC
    """, (session["user_id"],))
    posts_db = cur.fetchall()
    cur.close()
    release_conn(conn)

    posts = []
    for p in posts_db:
        remaining_seconds = max(0, p[2] - now_secs)
        image_path = p[3]
        image_paths_list = []
        image_urls = []
        if image_path:
            try:
                image_paths_list = json.loads(image_path)
            except Exception:
                image_paths_list = [image_path]
        posts.append({
            "id": p[0],
            "content": p[1],
            "remaining_seconds": remaining_seconds,
            "show_timer": True,
            "image_path": image_path,
            "image_paths": image_paths_list,
            "image_urls": image_urls
        })
        try:
            posts[-1]["views"] = get_post_view_count(p[0])
        except Exception:
            posts[-1]["views"] = 0

    return render_template("profile.html",
                           username=session["username"],
                           bio=bio,
                           avatar=avatar,
                           social_links=social_links,
                           posts=posts)

@profile_bp.route("/user/<username>")
def view_profile(username):
    """Visualizza profilo pubblico utente."""
    username = sanitize_input(username, config.MAX_USERNAME_LENGTH)
    
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM users WHERE username=%s", (username,))
    user = cur.fetchone()
    if not user:
        cur.close()
        release_conn(conn)
        return "Utente non trovato", 404

    user_id = user[0]

    cur.execute("SELECT bio, avatar_path, social_links FROM profile WHERE user_id=%s", (user_id,))
    profile_data = cur.fetchone()
    bio = profile_data[0] if profile_data else ''
    avatar = profile_data[1] if profile_data else ''
    social_links = profile_data[2] if profile_data and profile_data[2] else []

    now_secs = int(time.time())
    cur.execute("""
        SELECT posts.id, posts.content, posts.image_path, posts.expires_at,
               COALESCE(like_count.count, 0) AS like_count
        FROM posts
        LEFT JOIN (
            SELECT post_id, COUNT(*) AS count
            FROM likes
            GROUP BY post_id
        ) AS like_count ON posts.id = like_count.post_id
        WHERE posts.user_id=%s AND posts.expires_at > %s
        ORDER BY posts.id DESC
    """, (user_id, now_secs))
    posts_db = cur.fetchall()

    posts = []
    avatar_filename = os.path.basename(avatar) if avatar else 'default.png'
    for p in posts_db:
        post_id, content, image_path, expires_at, like_count = p
        image_urls = []
        image_paths_list = []
        if image_path:
            try:
                image_paths_list = json.loads(image_path)
            except Exception:
                image_paths_list = [image_path]
            for img in image_paths_list:
                try:
                    image_urls.append(url_for('uploaded_file', filename=os.path.basename(img)))
                except Exception:
                    pass
        remaining_seconds = max(0, expires_at - now_secs)
        avatar_url = url_for('uploaded_avatar', filename=avatar_filename)
        
        cur.execute("SELECT id, question FROM polls WHERE post_id=%s", (post_id,))
        poll_row = cur.fetchone()
        poll = None
        poll_data = {"results": [], "is_creator": False}
        if poll_row:
            poll_id, question = poll_row
            cur.execute(
                "SELECT option_index, option_text FROM poll_options WHERE poll_id=%s ORDER BY option_index",
                (poll_id,)
            )
            options = cur.fetchall()
            poll = {
                "id": poll_id,
                "question": question,
                "options": [{"index": o[0], "text": o[1]} for o in options]
            }
            if "user_id" in session:
                poll_data = get_poll_results(post_id, session["user_id"])
            if not poll_data or not poll_data.get("results"):
                poll_data = {
                    "results": [{"index": o[0], "text": o[1], "votes": 0, "percentage": 0, "voters": []} for o in options],
                    "is_creator": False
                }
        
        comments = get_comments(post_id)
        posts.append({
            "id": post_id,
            "content": content,
            "image_path": image_path,
            "image_paths": image_paths_list,
            "image_urls": image_urls,
            "username": username,
            "avatar": avatar_filename,
            "avatar_url": avatar_url,
            "like_count": like_count,
            "remaining_seconds": remaining_seconds,
            "comments": comments,
            "comment_count": len(comments),
            "poll": poll,
            "poll_data": poll_data
        })
        try:
            posts[-1]["views"] = get_post_view_count(post_id)
        except Exception:
            posts[-1]["views"] = 0

    cur.close()
    release_conn(conn)

    pinned_status = is_pinned(session["user_id"], user_id) if "user_id" in session else False

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('json') == '1':
        return jsonify({"posts": posts})
    
    contacts = []
    if social_links:
        try:
            contacts = [s for s in social_links if s and str(s).strip()]
        except Exception:
            contacts = []
    is_owner = ('username' in session and session['username'] == username)

    return render_template(
        "index.html",
        username=username,
        bio=bio,
        avatar=avatar,
        social_links=social_links,
        posts=posts,
        profile_mode=True,
        contacts=contacts,
        is_owner=is_owner,
        pinned_status=pinned_status,
        user_id=user_id
    )

@profile_bp.route('/qr_me')
def qr_me():
    """Genera QR code profilo."""
    if 'user_id' not in session:
        return redirect(url_for('auth_bp.login'))

    username = session.get('username')
    if not username:
        return "Utente non valido", 400

    profile_url = url_for('profile_bp.view_profile', username=username, _external=True)

    if qrcode is None:
        return jsonify({'url': profile_url, 'warning': 'qrcode library not installed'}), 200

    try:
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
        qr.add_data(profile_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)

        resp = Response(buf.getvalue(), mimetype='image/png')
        resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return resp
    except Exception as e:
        return jsonify({'url': profile_url, 'error': str(e)}), 200

@profile_bp.route("/pin_toggle/<username>", methods=["POST"])
@require_csrf
@rate_limit(*config.RATE_LIMIT_PIN)
def pin_toggle(username):
    """Toggle pin utente."""
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))

    username = sanitize_input(username, config.MAX_USERNAME_LENGTH)
    
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE username=%s", (username,))
    target = cur.fetchone()
    if not target:
        cur.close()
        release_conn(conn)
        return "Utente non trovato", 404

    owner_id = session["user_id"]
    pinned_id = target[0]

    if owner_id == pinned_id:
        cur.close()
        release_conn(conn)
        return "Non puoi mettere te stesso in lista", 400

    cur.execute("SELECT 1 FROM pins WHERE owner_id=%s AND pinned_id=%s", (owner_id, pinned_id))
    already = cur.fetchone() is not None
    pinned_result = False
    if already:
        cur.execute("DELETE FROM pins WHERE owner_id=%s AND pinned_id=%s", (owner_id, pinned_id))
        pinned_result = False
    else:
        cur.execute("INSERT INTO pins (owner_id, pinned_id) VALUES (%s, %s)", (owner_id, pinned_id))
        pinned_result = True

    conn.commit()
    cur.close()
    release_conn(conn)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
        return jsonify({"status": "ok", "pinned": pinned_result})
    return redirect(url_for("profile_bp.view_profile", username=username))

@profile_bp.route("/my_pins")
def my_pins():
    """Pagina lista utenti pinnati."""
    if "user_id" not in session:
        return redirect(url_for("auth_bp.login"))

    pinned_users = get_pinned_users(session["user_id"])

    return render_template("my_pins.html", pinned_users=pinned_users)
