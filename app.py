from flask import Flask, session, request, send_from_directory
from flask_socketio import SocketIO
from datetime import timedelta
import secrets
import os
import config
from apscheduler.schedulers.background import BackgroundScheduler
# Import utils per inizializzazione
from utils.db import ensure_crono_table, ensure_post_views_table
from utils.dirty_manager import ensure_dirty_table

# Import blueprints
from blueprints import all_blueprints

# ============================================================================
# FLASK APP INITIALIZATION
# ============================================================================

app = Flask(__name__, static_folder='jsandcss', static_url_path='/jsandcss')
app.secret_key = config.SECRET_KEY

# Session configuration
app.permanent_session_lifetime = timedelta(days=config.SESSION_LIFETIME_DAYS)
app.config.update(
    SESSION_COOKIE_HTTPONLY=config.SESSION_COOKIE_HTTPONLY,
    SESSION_COOKIE_SAMESITE=config.SESSION_COOKIE_SAMESITE,
    SESSION_COOKIE_SECURE=config.SESSION_COOKIE_SECURE
)

# Upload configuration
os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
os.makedirs(config.AVATARS_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = config.UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = config.MAX_FILE_SIZE

# ============================================================================
# SOCKETIO
# ============================================================================

socketio = SocketIO(app, cors_allowed_origins=config.SOCKETIO_CORS_ORIGINS)

# ============================================================================
# DATABASE INITIALIZATION
# ============================================================================

ensure_crono_table()
ensure_post_views_table()
ensure_dirty_table()


# ============================================================================
# UPLOAD ROUTES (GLOBALI - senza blueprint prefix)
# ============================================================================

@app.route('/uploads/avatars/<path:filename>')
def uploaded_avatar(filename):
    """Serve avatar - GLOBALE."""
    safe_name = os.path.basename(filename)
    directory = os.path.join(config.UPLOAD_FOLDER, 'avatars')
    file_path = os.path.join(directory, safe_name)
    if not os.path.isfile(file_path):
        safe_name = 'default.png'

    resp = send_from_directory(directory, safe_name)
    resp.headers['Cache-Control'] = 'public, max-age=86400'
    return resp

@app.route('/uploads/avif/<path:filename>')
def uploaded_file(filename):
    safe_name = os.path.basename(filename)
    return send_from_directory(config.UPLOAD_FOLDER, safe_name)

# ============================================================================
# SECURITY MIDDLEWARE
# ============================================================================

@app.before_request
def refresh_session_timeout():
    if "user_id" in session:
        session.permanent = True
        session.modified = True
    try:
        if 'csrf_token' not in session:
            session['csrf_token'] = secrets.token_urlsafe(32)
    except Exception:
        pass

@app.context_processor
def inject_csrf_token():
    try:
        return { 'csrf_token': session.get('csrf_token') }
    except Exception:
        return { 'csrf_token': None }

@app.after_request
def add_security_headers(response):
    for header, value in config.SECURITY_HEADERS.items():
        response.headers[header] = value
    
    if request.is_secure:
        response.headers['Strict-Transport-Security'] = config.HSTS_HEADER
    
    return response

# ============================================================================
# BLUEPRINT REGISTRATION
# ============================================================================

for blueprint, options in all_blueprints:
    app.register_blueprint(blueprint, **options)

# ============================================================================
# Service Worker Route - per fare in modo che venga servito dalla root (e' un casino, lo so)
# ============================================================================

@app.route('/service-worker.js')
def service_worker():
    return send_from_directory(os.getcwd(), 'service-worker.js')


# idem qui per il manifest.json, ho usato lo stesso identico metodo di sopra
@app.route('/manifest.json')
def manifest():
    return send_from_directory(os.getcwd(), 'manifest.json')

#idem anche qui per le icone (o altro) per far funzionare la PWA.
@app.route('/public_stuff/icon-192.png')
def public_stuff_ico1():
    return send_from_directory(os.getcwd(), 'public_stuff/icon-192.png')

@app.route('/public_stuff/icon-512.png')
def public_stuff_ico2():
    return send_from_directory(os.getcwd(), 'public_stuff/icon-512.png')


# clean expired posts periodically
from utils.db import auto_cleanup_expired_posts
scheduler = BackgroundScheduler()
scheduler.add_job(
    func=auto_cleanup_expired_posts,
    trigger='interval',
    minutes=1
)
scheduler.start()
# ============================================================================
# SERVER START
# ============================================================================

if __name__ == "__main__":
    print("="*60)
    print(f"Host: {config.HOST}")
    print(f"Port: {config.PORT}")
    print(f"Debug: {config.DEBUG}")
    print(f"HTTPS: {config.SESSION_COOKIE_SECURE}")
    print("="*60 + "\n")
    
    app.run(
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG
    )