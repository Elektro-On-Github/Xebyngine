from flask import Blueprint, render_template, request, redirect, session, url_for
from werkzeug.security import check_password_hash
import secrets
import config
from utils.security import sanitize_input, validate_username, validate_email, validate_password, rate_limit
from utils.helpers import register_user_db
from utils.db import get_conn, release_conn

from utils.dirty_manager import update_last_activity  


auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route("/login", methods=["GET", "POST"])
@rate_limit(*config.RATE_LIMIT_LOGIN)
def login():
    """Pagina login."""
    if request.method == "POST":
        username = sanitize_input(request.form.get("username", ""), config.MAX_USERNAME_LENGTH)
        password = request.form.get("password", "")[:config.MAX_PASSWORD_LENGTH]
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, password_hash FROM users WHERE username=%s", (username,))
        user = cur.fetchone()
        cur.close()
        release_conn(conn)

        if user and check_password_hash(user[1], password):
            session.permanent = True
            session["user_id"] = user[0]
            session["username"] = username
            session['csrf_token'] = secrets.token_urlsafe(32)

            return redirect(url_for("misc_bp.index"))
        else:
            return "username o credenziali errate :("
    
    # Render unified auth page
    return render_template("auth.html")


@auth_bp.route("/register", methods=["GET", "POST"])
@rate_limit(*config.RATE_LIMIT_REGISTER)
def register():
    """Pagina registrazione."""
    if request.method == "POST":
        username = sanitize_input(request.form.get("username", ""), config.MAX_USERNAME_LENGTH)
        password = request.form.get("password", "")
        email = sanitize_input(request.form.get("email", ""), config.MAX_EMAIL_LENGTH)

        if not validate_username(username):
            return "Username non valido. Usa solo lettere, numeri, _ e -", 400
        if not validate_email(email):
            return "Email non valida", 400
        if not validate_password(password):
            return f"Password troppo debole. Minimo {config.MIN_PASSWORD_LENGTH} caratteri con almeno una lettera e un numero", 400

        try:
            register_user_db(username, password, email)
            return redirect(url_for("auth_bp.login"))
        except Exception as e:
            return f"Errore: {e}"

    return render_template("auth.html")



@auth_bp.route("/logout")
def logout():
    """Logout utente."""
    session.clear()
    resp = redirect(url_for("auth_bp.login"))
    resp.delete_cookie("session")
    return resp