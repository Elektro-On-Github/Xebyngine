from flask import Blueprint, render_template, request, redirect, session, url_for
from werkzeug.security import check_password_hash
import secrets
import config
from utils.security import sanitize_input, validate_username, validate_password, rate_limit, require_csrf
from utils.helpers import register_user_db
from utils.db import get_conn, release_conn, is_banned, save_user_fingerprint


auth_bp = Blueprint('auth_bp', __name__)

# ============================================================================
# ROUTES
# ============================================================================

@auth_bp.route("/login", methods=["GET", "POST"])
@rate_limit(*config.RATE_LIMIT_LOGIN)
@require_csrf
def login():
    """Pagina login."""
    if request.method == "POST":
        username = sanitize_input(request.form.get("username", ""), config.MAX_USERNAME_LENGTH)
        password = request.form.get("password", "")[:config.MAX_PASSWORD_LENGTH]
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, password_hash, email FROM users WHERE username=%s", (username,))
        user = cur.fetchone()
        cur.close()
        release_conn(conn)

        if user and check_password_hash(user[1], password):
            session.permanent = True
            session["user_id"] = user[0]
            session["username"] = username
            session['csrf_token'] = secrets.token_urlsafe(32)

            # Save IP + fingerprint for ban tracking
            ip_addr = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip_addr and ',' in ip_addr:
                ip_addr = ip_addr.split(',')[0].strip()
            fp = request.form.get('fingerprint', '') or request.headers.get('X-Fingerprint', '')
            user_email = user[2] if len(user) > 2 else None
            
            # Check if this IP/fingerprint/email is banned
            if is_banned(ip_address=ip_addr, fingerprint=fp if fp else None, email=user_email):
                session.clear()
                return redirect(url_for("auth_bp.login", banned=1))

            # Save IP/fingerprint for ban tracking
            session['ip_address'] = ip_addr
            if fp:
                session['fingerprint'] = fp
            save_user_fingerprint(user[0], ip_addr, fp if fp else None)

            return redirect(url_for("misc_bp.index"))
        else:
            return "username o credenziali errate :("
    
    # Render unified auth page
    return render_template("auth.html")


@auth_bp.route("/register", methods=["GET", "POST"])
@rate_limit(*config.RATE_LIMIT_REGISTER)
@require_csrf
def register():
    """Crea un account con username e password."""
    if request.method == "POST":
        username = sanitize_input(request.form.get("username", ""), config.MAX_USERNAME_LENGTH)
        password = request.form.get("password", "")

        if not validate_username(username):
            return "Username non valido. Usa solo lettere, numeri, _ e -", 400
        if not validate_password(password):
            return f"Password troppo debole. Minimo {config.MIN_PASSWORD_LENGTH} caratteri con almeno una lettera e un numero", 400

        # Check if IP/fingerprint is banned
        ip_addr = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip_addr and ',' in ip_addr:
            ip_addr = ip_addr.split(',')[0].strip()
        fp = request.form.get('fingerprint', '') or request.headers.get('X-Fingerprint', '')
        if is_banned(ip_address=ip_addr, fingerprint=fp if fp else None):
            return redirect(url_for("auth_bp.login", banned=1))

        # Check if username already exists
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM users WHERE username=%s", (username,))
        if cur.fetchone():
            cur.close()
            release_conn(conn)
            return "Username già in uso", 400
        cur.close()
        release_conn(conn)

        register_user_db(username, password)
        return redirect(url_for("auth_bp.login"))

    return render_template("auth.html")

@auth_bp.route("/logout")
def logout():
    """Logout utente."""
    session.clear()
    resp = redirect(url_for("auth_bp.login"))
    resp.delete_cookie("session")
    return resp
