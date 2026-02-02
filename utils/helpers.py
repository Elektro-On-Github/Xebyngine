"""
🛠️ HELPER FUNCTIONS
Funzioni utility riusabili
"""

import os
import secrets
import uuid
import json
from datetime import datetime
from werkzeug.security import generate_password_hash
from flask import session
import config

# ============================================================================
# FILE HANDLING
# ============================================================================

def allowed_file(filename):
    """Controlla se estensione file è permessa."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in config.ALLOWED_EXTENSIONS

def generate_filename(user_id, ext):
    """Genera filename univoco con timestamp e random hex."""
    timestamp = datetime.now().strftime("%Y-%m-%d---%H:%M:%S.%f")[:-3]
    random_hex = secrets.token_hex(3)
    return f"{timestamp}_{user_id}_{random_hex}.{ext}"

def remove_files_for_image_path(image_path_value):
    """Rimuove file da disco usando basename."""
    if not image_path_value:
        return
    try:
        image_list = json.loads(image_path_value)
    except Exception:
        image_list = [image_path_value]

    for img in image_list:
        try:
            safe_name = os.path.basename(img)
            file_path = os.path.join(config.UPLOAD_FOLDER, safe_name)
            if os.path.isfile(file_path):
                os.remove(file_path)
        except Exception:
            pass

# ============================================================================
# USER MANAGEMENT
# ============================================================================

def register_user_db(username, password, email):
    """Registra nuovo utente nel DB."""
    from .db import get_conn, release_conn
    
    user_id = uuid.uuid4().hex
    hashed = generate_password_hash(password)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (id, username, password_hash, email) VALUES (%s, %s, %s, %s)",
        (user_id, username, hashed, email)
    )
    # Aggiungi utente alla tabella secret con testo vuoto
    cur.execute(
        "INSERT INTO secret (user_id, text) VALUES (%s, %s)",
        (user_id, '')
    )
    conn.commit()
    cur.close()
    release_conn(conn)
    return True

def ensure_viewer_token():
    """Assicura viewer token in session per tracking anonimo."""
    if 'viewer_token' not in session:
        session['viewer_token'] = secrets.token_urlsafe(32)
    return session['viewer_token']