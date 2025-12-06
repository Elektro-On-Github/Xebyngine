from flask import Blueprint, render_template, request, session, Response, url_for
from threading import Lock
from html import escape
import queue
import json
import os
import config
from utils.security import sanitize_input, rate_limit, require_csrf
from utils.db import get_conn, release_conn, save_message, get_pinned_users, get_chat_users

chat_bp = Blueprint('chat_bp', __name__)

# === SSE CLIENTS (unificato: messaggi + typing) ===
clients = {}
clients_lock = Lock()


def send_to_user(user_id, event_type, data):
    """Invia evento SSE a un utente specifico"""
    with clients_lock:
        for q in clients.get(str(user_id), []):
            try:
                q.put_nowait({'event': event_type, 'data': data})
            except queue.Full:
                pass


# === HELPER: Riduce duplicazione codice ===
def get_avatar_url(avatar_path):
    """Genera URL avatar"""
    filename = os.path.basename(avatar_path) if avatar_path else 'default.png'
    return url_for('uploaded_avatar', filename=filename)


def get_user_info(uid, my_id):
    """Recupera info utente + conversazione in una sola connessione"""
    conn = get_conn()
    try:
        with conn.cursor() as c:
            # Username + Avatar in una query
            c.execute("""
                SELECT u.username, p.avatar_path 
                FROM users u 
                LEFT JOIN profile p ON p.user_id = u.id 
                WHERE u.id = %s
            """, (uid,))
            row = c.fetchone()
            username = row[0] if row else f'User {uid}'
            avatar_url = get_avatar_url(row[1] if row else None)
            
            # Conversazione
            c.execute("""
                SELECT last_message, last_at, user_a, unread_for_a, unread_for_b
                FROM conversations
                WHERE user_min = LEAST(%s::uuid, %s::uuid) 
                AND user_max = GREATEST(%s::uuid, %s::uuid)
                LIMIT 1
            """, (my_id, uid, my_id, uid))
            conv = c.fetchone()
            
            if conv:
                last_message, last_at, user_a, unread_a, unread_b = conv
                last_at = last_at.isoformat() if last_at else None
                unread_count = (unread_a or 0) if str(user_a) == str(my_id) else (unread_b or 0)
            else:
                # Fallback: ultimo messaggio diretto
                c.execute("""
                    SELECT content, created_at FROM messages
                    WHERE (sender_id=%s AND receiver_id=%s) OR (sender_id=%s AND receiver_id=%s)
                    ORDER BY created_at DESC LIMIT 1
                """, (my_id, uid, uid, my_id))
                lm = c.fetchone()
                last_message = lm[0] if lm else None
                last_at = lm[1].isoformat() if lm and lm[1] else None
                unread_count = 0
            
            return {
                "id": uid,
                "username": username,
                "avatar_url": avatar_url,
                "last_message": last_message,
                "last_at": last_at,
                "unread_count": unread_count
            }
    finally:
        release_conn(conn)


# === CHAT PAGE ===
@chat_bp.route("/chat")
def chat_page():
    if "user_id" not in session:
        return "Login richiesto", 401

    my_id = session["user_id"]
    
    # Raccogli tutti gli user IDs unici
    raw = get_pinned_users(my_id)
    chat_users = get_chat_users(my_id)
    all_ids = {u['id'] for u in raw} | set(chat_users)
    
    # Ottieni info per tutti (una chiamata per utente, query ottimizzate)
    pinned_users = [get_user_info(uid, my_id) for uid in all_ids]
    
    # Initial chat target
    initial_target_info = None
    initial_target = request.args.get('user_id')
    if initial_target:
        conn = get_conn()
        try:
            with conn.cursor() as c:
                c.execute("""
                    SELECT u.username, p.avatar_path 
                    FROM users u 
                    LEFT JOIN profile p ON p.user_id = u.id 
                    WHERE u.id = %s
                """, (initial_target,))
                r = c.fetchone()
                if r:
                    initial_target_info = {
                        'id': initial_target,
                        'username': r[0],
                        'avatar_url': get_avatar_url(r[1])
                    }
        finally:
            release_conn(conn)

    return render_template("chat.html",
                           my_id=my_id,
                           pinned_users=pinned_users,
                           initial_chat=initial_target_info)


# === CHAT HISTORY ===
@chat_bp.route("/chat/history/<other_user_id>", endpoint="chat_history_html")
def chat_history(other_user_id):
    if "user_id" not in session:
        return "Login richiesto", 401

    my_id = session["user_id"]
    default = url_for('uploaded_avatar', filename='default.png')

    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("""
                SELECT sender_id, content FROM messages
                WHERE (sender_id=%s AND receiver_id=%s) OR (sender_id=%s AND receiver_id=%s)
                ORDER BY created_at ASC
            """, (my_id, other_user_id, other_user_id, my_id))
            rows = c.fetchall()

            user_ids = list({r[0] for r in rows} | {my_id, other_user_id})
            c.execute("SELECT user_id, avatar_path FROM profile WHERE user_id = ANY(%s)", (user_ids,))
            avatar_rows = {uid: get_avatar_url(path) for uid, path in c.fetchall()}
    finally:
        release_conn(conn)

    avatar_rows.setdefault(my_id, default)
    avatar_rows.setdefault(other_user_id, default)

    return "".join(
        f'<div class="message {"me" if sid == my_id else "other"}">'
        f'{"" if sid == my_id else f"<img class=\"message-avatar\" src=\"{avatar_rows.get(sid)}\" alt=\"\">"}'
        f'<span>{escape(content or "")}</span></div>'
        for sid, content in rows
    )


# === MARK READ ===
@chat_bp.route("/chat/mark_read/<other_user_id>", methods=["POST"])
@require_csrf
def mark_chat_read(other_user_id):
    if "user_id" not in session:
        return "Unauthorized", 401
    
    my_id = session["user_id"]
    conn = get_conn()
    
    try:
        with conn.cursor() as c:
            c.execute("""
                UPDATE messages SET is_read = TRUE 
                WHERE sender_id = %s AND receiver_id = %s AND is_read = FALSE
            """, (other_user_id, my_id))
            
            c.execute("""
                SELECT user_a FROM conversations 
                WHERE user_min = LEAST(%s::uuid, %s::uuid) 
                AND user_max = GREATEST(%s::uuid, %s::uuid)
            """, (my_id, other_user_id, my_id, other_user_id))
            
            row = c.fetchone()
            if row:
                field = "unread_for_a" if str(row[0]) == str(my_id) else "unread_for_b"
                c.execute(f"""
                    UPDATE conversations SET {field} = 0 
                    WHERE user_min = LEAST(%s::uuid, %s::uuid) 
                    AND user_max = GREATEST(%s::uuid, %s::uuid)
                """, (my_id, other_user_id, my_id, other_user_id))
            
            conn.commit()
        return "OK", 200
    except Exception as e:
        print(f"Errore mark_read: {e}")
        return "Error", 500
    finally:
        release_conn(conn)


# === SEND MESSAGE ===
@chat_bp.route('/send_message', methods=['POST'])
@require_csrf
@rate_limit(*config.RATE_LIMIT_MESSAGE)
def send_message():
    sender = request.form.get('my_id')
    receiver = request.form.get('other_id')
    content = sanitize_input(request.form.get('content', ''), config.MAX_CONTENT_LENGTH)

    if not all([sender, receiver, content]):
        return "Missing parameters", 400

    save_message(sender, receiver, content)

    # Avatar mittente
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("SELECT avatar_path FROM profile WHERE user_id=%s", (sender,))
            row = c.fetchone()
    finally:
        release_conn(conn)

    send_to_user(receiver, 'message', {
        'sender': sender,
        'content': content,
        'avatar': get_avatar_url(row[0] if row else None)
    })

    return "OK", 200


# === TYPING ===
@chat_bp.route('/chat/typing', methods=['POST'])
@require_csrf
def chat_typing():
    if "user_id" not in session:
        return "Unauthorized", 401
    
    data = request.get_json()
    send_to_user(
        str(data.get('recipient_id')), 
        'typing', 
        {'user_id': str(session['user_id']), 'is_typing': data.get('is_typing', False)}
    )
    return '', 204


# === SSE STREAM ===
@chat_bp.route('/stream/messages')
def stream_messages():
    if "user_id" not in session:
        return "Unauthorized", 401

    user_id = str(request.args.get('user_id'))
    if not user_id:
        return "Missing user_id", 400

    def generate():
        q = queue.Queue(maxsize=100)
        
        with clients_lock:
            clients.setdefault(user_id, []).append(q)
        
        try:
            while True:
                try:
                    msg = q.get(timeout=30)
                    yield f"event: {msg['event']}\ndata: {json.dumps(msg['data'])}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        except GeneratorExit:
            pass
        finally:
            with clients_lock:
                if user_id in clients:
                    try:
                        clients[user_id].remove(q)
                        if not clients[user_id]:
                            del clients[user_id]
                    except ValueError:
                        pass

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )

# === WEBRTC SIGNALING ===
call_signals = {}  # {user_id: [signals]}
call_signals_lock = Lock()

@chat_bp.route('/call/signal', methods=['POST'])
@require_csrf
def call_signal():
    if "user_id" not in session:
        return "Unauthorized", 401
    
    data = request.get_json()
    signal_type = data.get('type')
    signal_data = data.get('data')
    
    if not signal_type or not signal_data:
        return "Missing data", 400
    
    recipient_id = str(signal_data.get('to'))
    sender_id = str(session['user_id'])
    
    # Send signal to recipient via SSE
    send_to_user(recipient_id, 'call-signal', {
        'type': signal_type,
        'data': signal_data
    })
    
    return '', 204

