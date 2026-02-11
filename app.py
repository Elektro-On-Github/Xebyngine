from flask import Flask, session, request, send_from_directory
from flask_socketio import SocketIO
from datetime import timedelta
import secrets
import os
import config
from apscheduler.schedulers.background import BackgroundScheduler
# Import utils per inizializzazione
from utils.db import ensure_crono_table, ensure_post_views_table, ensure_report_table, ensure_e2ee_table
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
os.makedirs(config.VIDEO_FOLDER, exist_ok=True)
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
ensure_report_table()
ensure_e2ee_table()


# ============================================================================
# UPLOAD ROUTES (GLOBALI - senza blueprint prefix)
# ============================================================================

@app.route('/uploads/avatars/<path:filename>')
def uploaded_avatar(filename):
    """Serve avatar - GLOBALE."""
    safe_name = os.path.basename(filename)
    directory = os.path.join(config.AVATARS_FOLDER)
    file_path = os.path.join(directory, safe_name)
    if not os.path.isfile(file_path):
        safe_name = 'default.png'

    resp = send_from_directory(directory, safe_name)
    resp.headers['Cache-Control'] = 'public, max-age=86400'
    return resp

@app.route('/uploads/avif/<path:filename>')
def uploaded_file(filename):
    safe_name = os.path.basename(filename)
    ext = os.path.splitext(safe_name)[1].lower()
    
    # Valida estensione: solo immagini permesse
    valid_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.avif'}
    if ext not in valid_extensions:
        return "Invalid file type", 404
    
    # Prova il file con estensione originale
    file_path = os.path.join(config.UPLOAD_FOLDER, safe_name)
    if os.path.isfile(file_path):
        return send_from_directory(config.UPLOAD_FOLDER, safe_name)
    
    # Se non esiste, prova con estensione .avif (file convertito)
    name_without_ext = os.path.splitext(safe_name)[0]
    avif_name = name_without_ext + ".avif"
    avif_path = os.path.join(config.UPLOAD_FOLDER, avif_name)
    if os.path.isfile(avif_path):
        return send_from_directory(config.UPLOAD_FOLDER, avif_name, mimetype='image/avif')
    
    # Se non trovato, return 404
    return "File not found", 404

@app.route('/uploads/videos/<path:filename>')
def uploaded_video(filename):
    safe_name = os.path.basename(filename)
    resp = send_from_directory(config.VIDEO_FOLDER, safe_name)
    resp.headers['Accept-Ranges'] = 'bytes'
    return resp

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


# ============================================================================
# BACKGROUND JOBS
# ============================================================================

# Import processing workers
from utils.moderation import process_one as mod_process_one
from utils.avif import process_one as avif_process_one
from utils.db import auto_cleanup_expired_posts

# Start scheduler with multiple jobs
scheduler = BackgroundScheduler()

# Moderation pipeline: continuous scanning of uploads/moderation/raw/
scheduler.add_job(
    func=mod_process_one,
    trigger='interval',
    seconds=1,
    id='moderation_job',
    name='Moderation Pipeline'
)

# AVIF conversion pipeline: continuous scanning of uploads/raw/
scheduler.add_job(
    func=avif_process_one,
    trigger='interval',
    seconds=1,
    id='avif_job',
    name='AVIF Conversion'
)

# Cleanup expired posts periodically
scheduler.add_job(
    func=auto_cleanup_expired_posts,
    trigger='interval',
    minutes=1,
    id='cleanup_job',
    name='Expired Posts Cleanup'
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