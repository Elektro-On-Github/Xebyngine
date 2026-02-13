from psycopg2 import pool
from flask import session, url_for
import json
import time
import os
import config


# ============================================================================
# CONNECTION POOL
# ============================================================================

db_pool = pool.SimpleConnectionPool(
    config.DB_POOL_MIN,
    config.DB_POOL_MAX,
    **config.DB_CONFIG
)

def get_conn():
    """Ottieni connessione dal pool."""
    return db_pool.getconn()

def release_conn(conn):
    """Rilascia connessione al pool."""
    db_pool.putconn(conn)

# ============================================================================
# TABLE INITIALIZATION
# ============================================================================

def ensure_crono_table():
    """Crea tabella crono se non esiste."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS crono (
                id BIGSERIAL PRIMARY KEY,
                owner_id UUID NOT NULL,
                username TEXT NOT NULL,
                avatar_path TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (owner_id, username)
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS crono_owner_created_idx ON crono (owner_id, created_at DESC)")
        conn.commit()
        cur.close()
    except Exception:
        import sys
        print("Warning: could not ensure crono table exists", file=sys.stderr)
    finally:
        if conn:
            release_conn(conn)

def ensure_post_views_table():
    """Assicura esistenza tabella post_views."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS post_views (
                id BIGSERIAL PRIMARY KEY,
                viewer_token TEXT NOT NULL,
                post_id BIGINT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (viewer_token, post_id)
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS post_views_post_idx ON post_views (post_id)")
        conn.commit()
        cur.close()
    except Exception:
        import sys
        print("Warning: could not ensure post_views table exists", file=sys.stderr)
    finally:
        if conn:
            release_conn(conn)

def ensure_report_table():
    """Crea tabella report se non esiste."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS report (
                id BIGSERIAL PRIMARY KEY,
                reporter_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reporter_username VARCHAR(32) NOT NULL,
                recipient_id VARCHAR(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                recipient_username VARCHAR(32) NOT NULL,
                message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                message_content VARCHAR(65536),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS report_reporter_idx ON report (reporter_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS report_recipient_idx ON report (recipient_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS report_created_idx ON report (created_at DESC)")
        conn.commit()
        cur.close()
    except Exception:
        import sys
        print("Warning: could not ensure report table exists", file=sys.stderr)
    finally:
        if conn:
            release_conn(conn)

def ensure_e2ee_table():
    """Crea tabella E2EE se non esiste."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        # Tabella chiavi pubbliche
        cur.execute("""
            CREATE TABLE IF NOT EXISTS e2ee_keys (
                user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                public_key TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Aggiungi colonna is_encrypted a messages se non esiste
        cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE")
        conn.commit()
        cur.close()
    except Exception:
        import sys
        print("Warning: could not ensure e2ee table exists", file=sys.stderr)
    finally:
        if conn:
            release_conn(conn)

def ensure_banned_table():
    """Crea tabella banned_users e user_fingerprints se non esistono."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS banned_users (
                id BIGSERIAL PRIMARY KEY,
                user_id VARCHAR(64),
                username TEXT,
                email TEXT,
                ip_address TEXT,
                fingerprint TEXT,
                reason TEXT,
                banned_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS banned_users_ip_idx ON banned_users (ip_address)")
        cur.execute("CREATE INDEX IF NOT EXISTS banned_users_fp_idx ON banned_users (fingerprint)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_fingerprints (
                user_id VARCHAR(32) PRIMARY KEY,
                ip_address TEXT,
                fingerprint TEXT,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        conn.commit()
        cur.close()
    except Exception:
        import sys
        print("Warning: could not ensure banned_users table exists", file=sys.stderr)
    finally:
        if conn:
            release_conn(conn)

def ensure_pending_registrations_table():
    """Crea tabella pending_registrations se non esiste."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pending_registrations (
                id BIGSERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                email VARCHAR(100) NOT NULL,
                password_hash TEXT NOT NULL,
                code VARCHAR(8) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL,
                verified BOOLEAN DEFAULT FALSE
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS pending_reg_email_idx ON pending_registrations (email)")
        cur.execute("CREATE INDEX IF NOT EXISTS pending_reg_code_idx ON pending_registrations (code)")
        conn.commit()
        cur.close()
    except Exception:
        import sys
        print("Warning: could not ensure pending_registrations table exists", file=sys.stderr)
    finally:
        if conn:
            release_conn(conn)

def save_user_fingerprint(user_id, ip_address, fingerprint):
    """Salva/aggiorna IP e fingerprint dell'utente."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO user_fingerprints (user_id, ip_address, fingerprint, updated_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET ip_address=EXCLUDED.ip_address, fingerprint=EXCLUDED.fingerprint, updated_at=NOW()
        """, (user_id, ip_address, fingerprint))
        conn.commit()
        cur.close()
    except Exception:
        if conn:
            conn.rollback()
    finally:
        if conn:
            release_conn(conn)

def ban_user(user_id, reason="moderation"):
    """Banna un utente e cancella tutti i suoi dati."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Fetch username and email
        cur.execute("SELECT username, email FROM users WHERE id=%s", (user_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            return False
        username, email = row

        # Fetch IP/fingerprint from user_fingerprints
        ip_addr = None
        fp = None
        try:
            cur.execute("SELECT ip_address, fingerprint FROM user_fingerprints WHERE user_id=%s", (user_id,))
            fp_row = cur.fetchone()
            if fp_row:
                ip_addr, fp = fp_row
        except Exception:
            pass

        # Insert ban record
        cur.execute("""
            INSERT INTO banned_users (user_id, username, email, ip_address, fingerprint, reason)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (user_id, username, email, ip_addr, fp, reason))

        # Delete all user data
        cur.execute("DELETE FROM poll_votes WHERE post_id IN (SELECT id FROM posts WHERE user_id=%s)", (user_id,))
        cur.execute("DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE post_id IN (SELECT id FROM posts WHERE user_id=%s))", (user_id,))
        cur.execute("DELETE FROM polls WHERE post_id IN (SELECT id FROM posts WHERE user_id=%s)", (user_id,))
        cur.execute("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE user_id=%s)", (user_id,))
        cur.execute("DELETE FROM comments WHERE user_id=%s", (user_id,))
        cur.execute("DELETE FROM likes WHERE user_id=%s", (user_id,))
        cur.execute("DELETE FROM post_views WHERE post_id IN (SELECT id FROM posts WHERE user_id=%s)", (user_id,))
        cur.execute("DELETE FROM posts WHERE user_id=%s", (user_id,))
        cur.execute("DELETE FROM messages WHERE sender_id=%s OR receiver_id=%s", (user_id, user_id))

        try:
            cur.execute("DELETE FROM conversations WHERE user_min=%s::uuid OR user_max=%s::uuid", (user_id, user_id))
        except Exception:
            conn.rollback()

        try:
            cur.execute("DELETE FROM pins WHERE owner_id=%s OR pinned_id=%s", (user_id, user_id))
        except Exception:
            conn.rollback()

        try:
            cur.execute("DELETE FROM crono WHERE owner_id=%s", (user_id,))
        except Exception:
            conn.rollback()

        try:
            cur.execute("DELETE FROM profile WHERE user_id=%s", (user_id,))
        except Exception:
            conn.rollback()

        try:
            cur.execute("DELETE FROM e2ee_keys WHERE user_id=%s::uuid", (user_id,))
        except Exception:
            conn.rollback()

        try:
            cur.execute("DELETE FROM secret WHERE user_id=%s", (user_id,))
        except Exception:
            conn.rollback()

        try:
            cur.execute("DELETE FROM user_fingerprints WHERE user_id=%s", (user_id,))
        except Exception:
            conn.rollback()

        cur.execute("DELETE FROM users WHERE id=%s", (user_id,))

        conn.commit()
        cur.close()
        return True
    except Exception:
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            release_conn(conn)

def save_ban_fingerprint(user_id, ip_address, fingerprint):
    """Salva IP e fingerprint per un utente bannato."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            UPDATE banned_users SET ip_address=%s, fingerprint=%s WHERE user_id=%s
        """, (ip_address, fingerprint, user_id))
        conn.commit()
        cur.close()
    finally:
        if conn:
            release_conn(conn)

def is_banned(ip_address=None, fingerprint=None, email=None):
    """Controlla se IP, fingerprint o email sono bannati."""
    if not ip_address and not fingerprint and not email:
        return False
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        conditions = []
        params = []
        if ip_address:
            conditions.append("ip_address=%s")
            params.append(ip_address)
        if fingerprint:
            conditions.append("fingerprint=%s")
            params.append(fingerprint)
        if email:
            conditions.append("email=%s")
            params.append(email)
        cur.execute(f"SELECT 1 FROM banned_users WHERE {' OR '.join(conditions)} LIMIT 1", params)
        result = cur.fetchone() is not None
        cur.close()
        return result
    finally:
        if conn:
            release_conn(conn)

def is_user_banned(user_id):
    """Controlla se un utente è bannato."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM banned_users WHERE user_id=%s LIMIT 1", (user_id,))
        result = cur.fetchone() is not None
        cur.close()
        return result
    finally:
        if conn:
            release_conn(conn)

# ============================================================================
# POST QUERIES
# ============================================================================

def get_post_view_count(post_id):
    """Conta visualizzazioni post."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM post_views WHERE post_id=%s", (post_id,))
    count = cur.fetchone()[0] or 0
    cur.close()
    release_conn(conn)
    return count

def get_post_like_count(post_id):
    """Conta like post."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM likes WHERE post_id=%s", (post_id,))
    count = cur.fetchone()[0]
    cur.close()
    release_conn(conn)
    return count

def get_comments(post_id):
    """Ottieni tutti i commenti di un post."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            comments.id,
            comments.content,
            users.username,
            comments.created_at,
            COALESCE(like_count.count, 0) AS like_count,
            COALESCE(p.avatar_path, '') AS avatar_path
        FROM comments
        JOIN users ON comments.user_id = users.id
        LEFT JOIN profile p ON users.id = p.user_id
        LEFT JOIN (
            SELECT comment_id, COUNT(*) AS count
            FROM comment_likes
            GROUP BY comment_id
        ) AS like_count ON comments.id = like_count.comment_id
        WHERE comments.post_id = %s
        ORDER BY comments.created_at ASC
    """, (post_id,))
    rows = cur.fetchall()
    comments = []
    for row in rows:
        comments.append({
            "id": row[0],
            "content": row[1],
            "username": row[2],
            "created_at": row[3],
            "like_count": row[4],
            "avatar_path": row[5]
        })
    cur.close()
    release_conn(conn)
    
    # FIX: Usa blueprint endpoint
    for c in comments:
        filename = os.path.basename(c.get('avatar_path') or '') if c.get('avatar_path') else 'default.png'
        c['avatar_url'] = url_for('uploaded_avatar', filename=filename)
    return comments

def get_poll_results(post_id, current_user_id):
    """Ottieni risultati sondaggio."""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id, question, post_id FROM polls WHERE post_id=%s", (post_id,))
    poll = cur.fetchone()
    if not poll:
        cur.close()
        release_conn(conn)
        return None

    poll_id, question, post_id = poll

    cur.execute("SELECT id, option_text FROM poll_options WHERE poll_id=%s", (poll_id,))
    options = cur.fetchall()

    cur.execute("""
        SELECT option_index, COUNT(*) 
        FROM poll_votes
        WHERE post_id=%s
        GROUP BY option_index
    """, (post_id,))
    counts = dict(cur.fetchall())

    total_votes = sum(counts.values()) if counts else 0

    cur.execute("SELECT user_id FROM posts WHERE id=%s", (post_id,))
    post_creator = cur.fetchone()[0]

    results = []
    for idx, (opt_id, text) in enumerate(options):
        votes = counts.get(idx, 0)
        percentage = (votes / total_votes * 100) if total_votes > 0 else 0

        option_result = {
            "text": text,
            "votes": votes,
            "percentage": round(percentage, 2),
        }

        if post_creator == current_user_id:
            cur.execute("""
                SELECT u.username, p.avatar_path
                FROM poll_votes v
                JOIN users u ON v.user_id = u.id
                LEFT JOIN profile p ON u.id = p.user_id
                WHERE v.post_id=%s AND v.option_index=%s
            """, (post_id, idx))
            v_rows = cur.fetchall()
            voters = []
            for uname, a_path in v_rows:
                try:
                    avatar_filename = os.path.basename(a_path) if a_path else 'default.png'
                    # FIX: Usa blueprint endpoint
                    avatar_url = url_for('uploaded_file', filename=avatar_filename)
                except Exception:
                    avatar_url = '/uploads/avatars/default.png'
                voters.append({
                    'username': uname,
                    'name': uname,
                    'avatar': avatar_url
                })
            option_result["voters"] = voters

        results.append(option_result)

    cur.close()
    release_conn(conn)
    return {
        "question": question,
        "results": results,
        "total_votes": total_votes,
        "is_creator": (post_creator == current_user_id)
    }

def get_all_posts():
    """Ottieni tutti i post attivi."""
    conn = get_conn()
    cur = conn.cursor()
    now_secs = int(time.time())
    cur.execute('''
        SELECT posts.id, posts.content, posts.image_path, posts.expires_at,
               COALESCE(like_count.count, 0) AS like_count,
               users.username, profile.avatar_path, profile.bio
        FROM posts
        JOIN users ON posts.user_id = users.id
        LEFT JOIN profile ON users.id = profile.user_id
        LEFT JOIN (
            SELECT post_id, COUNT(*) AS count
            FROM likes
            GROUP BY post_id
        ) AS like_count ON posts.id = like_count.post_id
        WHERE posts.expires_at > %s
        ORDER BY posts.id DESC
    ''', (now_secs,))
    posts_db = cur.fetchall()
    posts = []
    for p in posts_db:
        post_id, content, image_path, expires_at, like_count, username, avatar, bio = p
        image_urls = []
        image_paths_list = []
        if image_path:
            try:
                image_paths_list = json.loads(image_path)
            except Exception:
                image_paths_list = [image_path]
            for img in image_paths_list:
                try:
                    # FIX: Usa blueprint endpoint
                    image_urls.append(url_for('uploaded_file', filename=os.path.basename(img)))
                except Exception:
                    pass
        remaining_seconds = max(0, expires_at - now_secs)
        
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
        avatar_filename = os.path.basename(avatar) if avatar else 'default.png'
        # FIX: Usa blueprint endpoint
        avatar_url = url_for('uploaded_avatar', filename=avatar_filename)
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
            "show_timer": True,
            "comments": comments,
            "comment_count": len(comments),
            "poll": poll,
            "poll_data": poll_data,
            "bio": bio
        })
        try:
            posts[-1]["views"] = get_post_view_count(post_id)
        except Exception:
            posts[-1]["views"] = 0
    cur.close()
    release_conn(conn)
    return posts

# ============================================================================
# USER QUERIES
# ============================================================================

def search_users(query):
    """Cerca utenti per username."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT username FROM users WHERE LOWER(username) LIKE %s LIMIT %s", 
                (f"%{query.lower()}%", config.SEARCH_LIMIT_USERS))
    results = [row[0] for row in cur.fetchall()]
    cur.close()
    release_conn(conn)
    return results

def is_pinned(owner_id, target_id):
    """Controlla se utente è pinnato."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pins WHERE owner_id=%s AND pinned_id=%s", (owner_id, target_id))
    result = cur.fetchone() is not None
    cur.close()
    release_conn(conn)
    return result

def get_pinned_users(owner_id):
    """Ottieni utenti pinnati."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.username, p.avatar_path
        FROM pins AS pin
        JOIN users AS u ON pin.pinned_id = u.id
        LEFT JOIN profile AS p ON u.id = p.user_id
        WHERE pin.owner_id = %s
    """, (owner_id,))
    pinned_users = [
        {"id": row[0], "username": row[1], "avatar": row[2]}
        for row in cur.fetchall()
    ]
    cur.close()
    release_conn(conn)
    return pinned_users

# ============================================================================
# CHAT QUERIES
# ============================================================================

def save_message(sender_id, receiver_id, content):
    """Salva messaggio chat."""
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute(
                "INSERT INTO messages (sender_id, receiver_id, content) VALUES (%s, %s, %s)",
                (sender_id, receiver_id, content)
            )
            conn.commit()
    finally:
        try:
            release_conn(conn)
        except Exception:
            pass

    try:
        conn2 = get_conn()
        with conn2.cursor() as c2:
            c2.execute("""
                UPDATE conversations
                SET last_message = %s,
                    last_at = NOW(),
                    unread_for_a = CASE WHEN user_a = %s THEN unread_for_a ELSE unread_for_a + 1 END,
                    unread_for_b = CASE WHEN user_b = %s THEN unread_for_b ELSE unread_for_b + 1 END
                WHERE user_min = LEAST(%s::uuid, %s::uuid) AND user_max = GREATEST(%s::uuid, %s::uuid)
            """, (content, receiver_id, receiver_id, sender_id, receiver_id, sender_id, receiver_id))

            if c2.rowcount == 0:
                ua_unread = 0
                ub_unread = 1
                c2.execute("""
                    INSERT INTO conversations (user_a, user_b, last_message, last_at, unread_for_a, unread_for_b)
                    VALUES (%s, %s, %s, NOW(), %s, %s)
                """, (sender_id, receiver_id, content, ua_unread, ub_unread))
            conn2.commit()
    except Exception:
        pass
    finally:
        try:
            release_conn(conn2)
        except Exception:
            pass

def get_chat_users(user_id):
    """Ottieni utenti con cui si ha una chat."""
    conn = get_conn()
    with conn.cursor() as c:
        c.execute("""
            SELECT DISTINCT CASE
                WHEN sender_id=%s THEN receiver_id
                ELSE sender_id
            END AS other_user
            FROM messages
            WHERE sender_id=%s OR receiver_id=%s
        """, (user_id, user_id, user_id))
        rows = c.fetchall()
    release_conn(conn)
    return [r[0] for r in rows]

# ============================================================================
# CLEANUP
# ============================================================================

def cleanup_expired_posts():
    """Rimuove post scaduti."""
    from .helpers import remove_files_for_image_path
    
    conn = get_conn()
    cur = conn.cursor()
    now_secs = int(time.time())
    try:
        cur.execute("SELECT id, image_path FROM posts WHERE expires_at <= %s", (now_secs,))
        rows = cur.fetchall()
        removed = 0
        for pid, image_path in rows:
            try:
                if image_path:
                    remove_files_for_image_path(image_path)

                cur.execute("DELETE FROM poll_votes WHERE post_id=%s", (pid,))
                cur.execute("DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE post_id=%s)", (pid,))
                cur.execute("DELETE FROM polls WHERE post_id=%s", (pid,))
                cur.execute("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id=%s)", (pid,))
                cur.execute("DELETE FROM comments WHERE post_id=%s", (pid,))
                cur.execute("DELETE FROM likes WHERE post_id=%s", (pid,))
                cur.execute("DELETE FROM posts WHERE id=%s", (pid,))
                removed += 1
            except Exception:
                conn.rollback()
                continue

        conn.commit()
        return removed
    finally:
        try:
            cur.close()
        except Exception:
            pass
        release_conn(conn)


# auto delete expired posts periodically
def auto_cleanup_expired_posts():
    now_secs = int(time.time())
    
    conn = get_conn()
    cur = conn.cursor()
    
    try:
        cur.execute("""
            SELECT id, image_path 
            FROM posts 
            WHERE expires_at < %s
        """, (now_secs,))
        expired_posts = cur.fetchall()
        
        if not expired_posts:
            cur.close()
            release_conn(conn)
            return 0
        
        expired_ids = [p[0] for p in expired_posts]
        image_paths = [p[1] for p in expired_posts if p[1]]
        
        # Elimina dal DB
        cur.execute("DELETE FROM poll_votes WHERE post_id = ANY(%s)", (expired_ids,))
        cur.execute("DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE post_id = ANY(%s))", (expired_ids,))
        cur.execute("DELETE FROM polls WHERE post_id = ANY(%s)", (expired_ids,))
        cur.execute("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id = ANY(%s))", (expired_ids,))
        cur.execute("DELETE FROM comments WHERE post_id = ANY(%s)", (expired_ids,))
        cur.execute("DELETE FROM likes WHERE post_id = ANY(%s)", (expired_ids,))
        cur.execute("DELETE FROM post_views WHERE post_id = ANY(%s)", (expired_ids,))
        cur.execute("DELETE FROM posts WHERE id = ANY(%s)", (expired_ids,))
        
        conn.commit()
        
        # Elimina file
        for image_path in image_paths:
            try:
                paths_list = json.loads(image_path) if image_path.startswith('[') else [image_path]
                for img in paths_list:
                    file_path = os.path.join(config.UPLOAD_FOLDER, os.path.basename(img))
                    if os.path.exists(file_path):
                        os.remove(file_path)
            except:
                pass
        
        cur.close()
        release_conn(conn)
        return len(expired_ids)
        
    except Exception:
        conn.rollback()
        cur.close()
        release_conn(conn)
        return 0

# ============================================================================
# MESSAGE REPORTING
# ============================================================================

def report_message(reporter_id, reporter_username, recipient_id, recipient_username, message_id, message_content):
    """Salva una segnalazione di messaggio nel database."""
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("""
                INSERT INTO report 
                (reporter_id, reporter_username, recipient_id, recipient_username, message_id, message_content, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, (reporter_id, reporter_username, recipient_id, recipient_username, message_id, message_content))
            conn.commit()
            return True
    except Exception as e:
        print(f"Error reporting message: {e}")
        conn.rollback()
        return False
    finally:
        release_conn(conn)