from flask import Blueprint, render_template, request, session, Response, url_for
from threading import Lock
import queue
import json
import os
from html import escape
import config
from utils.security import sanitize_input, rate_limit, require_csrf
from utils.db import get_conn, release_conn, save_message, get_pinned_users, get_chat_users

chat_bp = Blueprint('chat_bp', __name__)

# SSE clients storage
clients = {}
clients_lock = Lock()

@chat_bp.route("/send_message", methods=["POST"])
@require_csrf
@rate_limit(*config.RATE_LIMIT_MESSAGE)
def send_message():
    sender = request.form.get("my_id")
    receiver = request.form.get("other_id")
    content = sanitize_input(request.form.get("content", ""), config.MAX_CONTENT_LENGTH)

    if not sender or not receiver or not content:
        return "Missing parameters", 400

    save_message(sender, receiver, content)

    conn = get_conn()
    with conn.cursor() as c:
        c.execute("SELECT avatar_path FROM profile WHERE user_id=%s", (sender,))
        row = c.fetchone()
    release_conn(conn)
    filename = os.path.basename(row[0]) if row and row[0] else 'default.png'
    avatar_url = url_for('uploaded_avatar', filename=filename)  # FIX

    with clients_lock:
        if receiver in clients:
            for q in clients[receiver]:
                q.put({"sender": sender, "content": content, "avatar": avatar_url})

    return "OK", 200

@chat_bp.route("/stream/messages")
def stream_messages():
    if "user_id" not in session:
        return "Unauthorized", 401

    user_id = request.args.get("user_id")
    if not user_id:
        return "Missing user_id", 400

    def event_stream():
        q = queue.Queue()
        with clients_lock:
            clients.setdefault(user_id, []).append(q)
        try:
            while True:
                msg = q.get()
                yield f"data: {json.dumps(msg)}\n\n"
        except GeneratorExit:
            with clients_lock:
                clients[user_id].remove(q)

    return Response(event_stream(), mimetype="text/event-stream")

@chat_bp.route("/chat")
def chat_page():
    if "user_id" not in session:
        return "Login richiesto", 401

    my_id = session["user_id"]
    raw = get_pinned_users(my_id)
    pinned_users = []

    initial_target = request.args.get('user_id')
    initial_target_info = None

    for u in raw:
        uid = u['id']
        username = u.get('username')
        if not username:
            conn = get_conn()
            with conn.cursor() as c:
                c.execute("SELECT username FROM users WHERE id=%s", (uid,))
                row = c.fetchone()
            release_conn(conn)
            username = row[0] if row else f'User {uid}'

        avatar = u.get('avatar')
        filename = os.path.basename(avatar) if avatar else 'default.png'
        avatar_url = url_for('uploaded_avatar', filename=filename)  # FIX
        
        last_message = None
        last_at = None
        unread_count = 0
        try:
            conn = get_conn()
            with conn.cursor() as c:
                c.execute("""
                    SELECT last_message, last_at, user_a, user_b, unread_for_a, unread_for_b
                    FROM conversations
                    WHERE user_min = LEAST(%s::uuid, %s::uuid) AND user_max = GREATEST(%s::uuid, %s::uuid)
                    LIMIT 1
                """, (my_id, uid, my_id, uid))
                conv = c.fetchone()
                if conv:
                    last_message = conv[0]
                    last_at = conv[1].isoformat() if conv[1] else None
                    user_a, user_b = conv[2], conv[3]
                    if str(user_a) == str(my_id):
                        unread_count = conv[4] or 0
                    else:
                        unread_count = conv[5] or 0
                else:
                    c.execute("""
                        SELECT content, sender_id, created_at
                        FROM messages
                        WHERE (sender_id=%s AND receiver_id=%s) OR (sender_id=%s AND receiver_id=%s)
                        ORDER BY created_at DESC
                        LIMIT 1
                    """, (my_id, uid, uid, my_id))
                    lm = c.fetchone()
                    if lm:
                        last_message = lm[0]
                        last_at = lm[2].isoformat() if lm[2] else None
                    unread_count = 0
        finally:
            try:
                release_conn(conn)
            except Exception:
                pass

        pinned_users.append({
            "id": uid,
            "username": username,
            "avatar_url": avatar_url,
            "last_message": last_message,
            "last_at": last_at,
            "unread_count": unread_count
        })

    chat_users = get_chat_users(my_id)
    for uid in chat_users:
        if uid not in [u['id'] for u in pinned_users]:
            conn = get_conn()
            with conn.cursor() as c:
                c.execute("SELECT username FROM users WHERE id=%s", (uid,))
                row = c.fetchone()
            release_conn(conn)

            username = row[0] if row else f'User {uid}'

            conn = get_conn()
            with conn.cursor() as c:
                c.execute("SELECT avatar_path FROM profile WHERE user_id=%s", (uid,))
                row = c.fetchone()
            release_conn(conn)
            avatar = os.path.basename(row[0]) if row and row[0] else 'default.png'
            avatar_url = url_for('uploaded_avatar', filename=avatar)  # FIX

            last_message = None
            last_at = None
            unread_count = 0
            try:
                conn = get_conn()
                with conn.cursor() as c:
                    c.execute("""
                        SELECT last_message, last_at, user_a, user_b, unread_for_a, unread_for_b
                        FROM conversations
                        WHERE user_min = LEAST(%s::uuid, %s::uuid) AND user_max = GREATEST(%s::uuid, %s::uuid)
                        LIMIT 1
                    """, (my_id, uid, my_id, uid))
                    conv = c.fetchone()
                    if conv:
                        last_message = conv[0]
                        last_at = conv[1].isoformat() if conv[1] else None
                        user_a, user_b = conv[2], conv[3]
                        if str(user_a) == str(my_id):
                            unread_count = conv[4] or 0
                        else:
                            unread_count = conv[5] or 0
                    else:
                        c.execute("""
                            SELECT content, sender_id, created_at
                            FROM messages
                            WHERE (sender_id=%s AND receiver_id=%s) OR (sender_id=%s AND receiver_id=%s)
                            ORDER BY created_at DESC
                            LIMIT 1
                        """, (my_id, uid, uid, my_id))
                        lm = c.fetchone()
                        if lm:
                            last_message = lm[0]
                            last_at = lm[2].isoformat() if lm[2] else None
                        unread_count = 0
            finally:
                try:
                    release_conn(conn)
                except Exception:
                    pass

            pinned_users.append({
                "id": uid,
                "username": username,
                "avatar_url": avatar_url,
                "last_message": last_message,
                "last_at": last_at,
                "unread_count": unread_count
            })

    if initial_target:
        try:
            conn = get_conn()
            with conn.cursor() as c:
                c.execute("SELECT username FROM users WHERE id=%s", (initial_target,))
                r = c.fetchone()
                if r:
                    uname = r[0]
                else:
                    uname = None
                c.execute("SELECT avatar_path FROM profile WHERE user_id=%s", (initial_target,))
                r2 = c.fetchone()
                avatar = os.path.basename(r2[0]) if r2 and r2[0] else 'default.png'
                avatar_url = url_for('uploaded_avatar', filename=avatar)  # FIX
                if uname:
                    initial_target_info = { 'id': initial_target, 'username': uname, 'avatar_url': avatar_url }
        finally:
            try:
                release_conn(conn)
            except Exception:
                pass

    return render_template("chat.html",
                        my_id=my_id,
                        pinned_users=pinned_users,
                        initial_chat=initial_target_info)

@chat_bp.route("/chat/history/<other_user_id>", endpoint="chat_history_html")
def chat_history(other_user_id):
    if "user_id" not in session:
        return "Login richiesto", 401

    my_id = session["user_id"]

    conn = get_conn()
    with conn.cursor() as c:
        c.execute("""
            SELECT sender_id, content FROM messages
            WHERE (sender_id=%s AND receiver_id=%s) OR (sender_id=%s AND receiver_id=%s)
            ORDER BY created_at ASC
        """, (my_id, other_user_id, other_user_id, my_id))
        rows = c.fetchall()

        user_ids = list({r[0] for r in rows} | {my_id, other_user_id})
        if user_ids:
            c.execute("SELECT user_id, avatar_path FROM profile WHERE user_id = ANY(%s)", (user_ids,))
            avatar_rows = c.fetchall()
        else:
            avatar_rows = []
    release_conn(conn)

    avatars = {}
    for uid, a_path in avatar_rows:
        avatars[uid] = url_for('uploaded_avatar', filename=os.path.basename(a_path)) if a_path else url_for('uploaded_avatar', filename='default.png')

    avatars.setdefault(my_id, url_for('uploaded_avatar', filename='default.png'))
    avatars.setdefault(other_user_id, url_for('uploaded_avatar', filename='default.png'))

    html_parts = []
    for sender_id, content in rows:
        cls = "me" if sender_id == my_id else "other"
        avatar_html = ''
        if cls == "other":
            avatar_html = f'<img class="message-avatar" src="{avatars.get(sender_id)}" alt="avatar" />'
        safe = escape(content or "")
        html_parts.append(f'<div class="message {cls}">{avatar_html}<span>{safe}</span></div>')

    return "".join(html_parts)


@chat_bp.route("/chat/mark_read/<other_user_id>", methods=["POST"])
@require_csrf
def mark_chat_read(other_user_id):
    """Segna tutti i messaggi di una chat come letti"""
    if "user_id" not in session:
        return "Unauthorized", 401
    
    my_id = session["user_id"]
    
    try:
        conn = get_conn()
        with conn.cursor() as c:
            # 1. Segna i messaggi come letti
            c.execute("""
                UPDATE messages 
                SET is_read = TRUE 
                WHERE sender_id = %s AND receiver_id = %s AND (is_read IS NULL OR is_read = 'true')
            """, (other_user_id, my_id))
            
            # 2. Azzera il contatore nella conversazione
            c.execute("""
                SELECT user_a, user_b 
                FROM conversations 
                WHERE user_min = LEAST(%s::uuid, %s::uuid) 
                AND user_max = GREATEST(%s::uuid, %s::uuid) 
                LIMIT 1
            """, (my_id, other_user_id, my_id, other_user_id))
            
            row = c.fetchone()
            if row:
                user_a, user_b = row
                # Azzera il contatore per l'utente corrente
                if str(user_a) == str(my_id):
                    c.execute("""
                        UPDATE conversations 
                        SET unread_for_a = 0 
                        WHERE user_min = LEAST(%s::uuid, %s::uuid) 
                        AND user_max = GREATEST(%s::uuid, %s::uuid)
                    """, (my_id, other_user_id, my_id, other_user_id))
                else:
                    c.execute("""
                        UPDATE conversations 
                        SET unread_for_b = 0 
                        WHERE user_min = LEAST(%s::uuid, %s::uuid) 
                        AND user_max = GREATEST(%s::uuid, %s::uuid)
                    """, (my_id, other_user_id, my_id, other_user_id))
            
            conn.commit()
        release_conn(conn)
        return "OK", 200
        
    except Exception as e:
        print(f"Errore mark_read: {e}")
        return "Error", 500
    finally:
        try:
            release_conn(conn)
        except:
            pass