from flask import request, session, jsonify
from functools import wraps
from collections import defaultdict
from threading import Lock
import time
import secrets
import re
import unicodedata
import imghdr
import config

# Storage globale
rate_limit_storage = defaultdict(list)
rate_limit_lock = Lock()

# ============================================================================
# INPUT SANITIZATION
# ============================================================================

def sanitize_input(text, max_length=None):
    """Sanitizza input: strip, escape HTML, limita lunghezza."""
    if not text:
        return ""
    text = str(text)
    text = unicodedata.normalize('NFKC', text)
    text = text.replace('\x00', '')
    text = text.strip()
    if max_length:
        text = text[:max_length]
    text = re.sub(r'\s+', ' ', text)
    return text

# ============================================================================
# VALIDATION
# ============================================================================

def validate_username(username):
    """Valida username: solo alfanumerici, underscore, dash."""
    if not username or len(username) > config.MAX_USERNAME_LENGTH:
        return False
    return bool(re.match(r'^[a-zA-Z0-9_-]+$', username))

def validate_email(email):
    """Valida email base."""
    if not email or len(email) > config.MAX_EMAIL_LENGTH:
        return False
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def validate_password(password):
    """Valida forza password."""
    if not password or len(password) < config.MIN_PASSWORD_LENGTH or len(password) > config.MAX_PASSWORD_LENGTH:
        return False
    has_letter = bool(re.search(r'[a-zA-Z]', password))
    has_number = bool(re.search(r'[0-9]', password))
    return has_letter and has_number

def validate_image_file(file_storage):
    """Valida immagine usando magic bytes."""
    if not file_storage:
        return False
    
    from .helpers import allowed_file
    
    if not allowed_file(file_storage.filename):
        return False
    
    header = file_storage.read(512)
    file_storage.seek(0)
    
    image_type = imghdr.what(None, header)
    return image_type in ['png', 'jpeg', 'jpg']

# ============================================================================
# RATE LIMITING
# ============================================================================

def rate_limit(max_requests=10, window_seconds=60):
    """Decorator rate limiting."""
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            if 'user_id' not in session:
                return f(*args, **kwargs)
            
            user_id = session['user_id']
            now = time.time()
            
            with rate_limit_lock:
                rate_limit_storage[user_id] = [
                    req_time for req_time in rate_limit_storage[user_id]
                    if now - req_time < window_seconds
                ]
                
                if len(rate_limit_storage[user_id]) >= max_requests:
                    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
                        return jsonify({'error': 'Troppi tentativi. Riprova tra poco.'}), 429
                    return "Troppi tentativi. Riprova tra poco.", 429
                
                rate_limit_storage[user_id].append(now)
            
            return f(*args, **kwargs)
        return wrapped
    return decorator

# ============================================================================
# CSRF PROTECTION
# ============================================================================

def validate_csrf():
    """Valida CSRF token."""
    if request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'):
        return True
    
    token = None
    try:
        token = request.headers.get('X-CSRFToken') or request.headers.get('X-CSRF-Token')
        if not token:
            token = request.form.get('csrf_token') if request.form else None
        if not token and request.is_json:
            j = request.get_json(silent=True) or {}
            token = j.get('csrf_token')
    except Exception:
        token = None

    session_token = session.get('csrf_token')
    return bool(token and session_token and secrets.compare_digest(token, session_token))

def require_csrf(f):
    """Decorator CSRF."""
    @wraps(f)
    def wrapped(*args, **kwargs):
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            if not validate_csrf():
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
                    return jsonify({'error': 'Invalid CSRF token'}), 403
                return "Richiesta non valida (CSRF)", 403
        return f(*args, **kwargs)
    return wrapped
