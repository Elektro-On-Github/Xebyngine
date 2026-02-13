from flask import Blueprint, render_template, request, redirect, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash
import secrets
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta
import config
from utils.security import sanitize_input, validate_username, validate_email, validate_password, rate_limit, require_csrf
from utils.helpers import register_user_db
from utils.db import get_conn, release_conn, is_banned, save_user_fingerprint

from utils.dirty_manager import update_last_activity  


auth_bp = Blueprint('auth_bp', __name__)

# ============================================================================
# EMAIL SENDING
# ============================================================================

def generate_verification_code():
    """Genera codice di verifica a 8 cifre."""
    return ''.join([str(random.randint(0, 9)) for _ in range(config.VERIFICATION_CODE_LENGTH)])

def send_verification_email(to_email, code):
    """Invia email di verifica con codice."""
    msg = MIMEMultipart('alternative')
    msg['From'] = config.MAIL_SENDER
    msg['To'] = to_email
    msg['Subject'] = f'Xebyngine - Codice di verifica: {code}'

    text = f"""Benvenuto su Xebyngine!

    Il tuo codice di verifica è: {code}

    Inseriscilo nella pagina di registrazione per completare la creazione del tuo account.

    Il codice scade tra 10 minuti.

    Se non hai richiesto questo codice, ignora questa email.
    """

    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
        <h1 style="color:#901010;font-size:24px;margin-bottom:8px;">Xebyngine</h1>
        <p style="color:#444;font-size:16px;margin-bottom:24px;">Il tuo codice di verifica:</p>
        <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:36px;font-weight:700;letter-spacing:6px;color:#222;">{code}</span>
        </div>
        <p style="color:#888;font-size:13px;">Il codice scade tra 10 minuti. Se non hai richiesto questo codice, ignora questa email.</p>
    </div>
    """

    msg.attach(MIMEText(text, 'plain'))
    msg.attach(MIMEText(html, 'html'))

    try:
        with smtplib.SMTP(config.MAIL_SMTP_HOST, config.MAIL_SMTP_PORT) as server:
            server.starttls()
            server.login(config.MAIL_SENDER, config.MAIL_PASSWORD)
            server.sendmail(config.MAIL_SENDER, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[MAIL ERROR] {e}")
        return False

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
    """Step 1: Valida dati e invia codice di verifica via email."""
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

        # Check if IP/fingerprint/email is banned
        ip_addr = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip_addr and ',' in ip_addr:
            ip_addr = ip_addr.split(',')[0].strip()
        fp = request.form.get('fingerprint', '') or request.headers.get('X-Fingerprint', '')
        if is_banned(ip_address=ip_addr, fingerprint=fp if fp else None, email=email):
            return redirect(url_for("auth_bp.login", banned=1))

        # Check if username/email already exists
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM users WHERE username=%s", (username,))
        if cur.fetchone():
            cur.close()
            release_conn(conn)
            return "Username già in uso", 400
        cur.execute("SELECT 1 FROM users WHERE email=%s", (email,))
        if cur.fetchone():
            cur.close()
            release_conn(conn)
            return "Email già in uso", 400

        # Generate code and save pending registration
        code = generate_verification_code()
        password_hash = generate_password_hash(password)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=config.VERIFICATION_CODE_EXPIRY)

        # Delete old pending registrations for this email
        cur.execute("DELETE FROM pending_registrations WHERE email=%s", (email,))
        cur.execute("""
            INSERT INTO pending_registrations (username, email, password_hash, code, expires_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (username, email, password_hash, code, expires_at))
        conn.commit()
        cur.close()
        release_conn(conn)

        # Send email
        sent = send_verification_email(email, code)
        if not sent:
            return "Errore nell'invio dell'email. Riprova.", 500

        # Save email in session for the verify step
        session['pending_email'] = email

        return redirect(url_for("auth_bp.verify")) #metti .login se vuoi bypassare la verify. LAscia .verify per la verifica con email

    return render_template("auth.html")


@auth_bp.route("/verify", methods=["GET", "POST"])
@rate_limit(*config.RATE_LIMIT_REGISTER)
@require_csrf
def verify():
    """Step 2: Verifica codice email e crea account."""
    pending_email = session.get('pending_email')
    if not pending_email:
        return redirect(url_for("auth_bp.login"))

    if request.method == "POST":
        code = sanitize_input(request.form.get("code", ""), 8)
        if not code or len(code) != 8:
            return render_template("verify.html", email=pending_email, error="Inserisci il codice a 8 cifre")

        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, username, email, password_hash FROM pending_registrations
            WHERE email=%s AND code=%s AND verified=FALSE AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
        """, (pending_email, code))
        row = cur.fetchone()

        if not row:
            cur.close()
            release_conn(conn)
            return render_template("verify.html", email=pending_email, error="Codice non valido o scaduto")

        pending_id, username, email, password_hash = row

        # Check again if username/email is taken (race condition protection)
        cur.execute("SELECT 1 FROM users WHERE username=%s OR email=%s", (username, email))
        if cur.fetchone():
            cur.close()
            release_conn(conn)
            return render_template("verify.html", email=pending_email, error="Username o email già in uso")

        # Create the actual user account
        import uuid
        user_id = uuid.uuid4().hex
        cur.execute(
            "INSERT INTO users (id, username, password_hash, email) VALUES (%s, %s, %s, %s)",
            (user_id, username, password_hash, email)
        )
        cur.execute(
            "INSERT INTO secret (user_id, text) VALUES (%s, %s)",
            (user_id, '')
        )

        # Mark as verified and cleanup
        cur.execute("UPDATE pending_registrations SET verified=TRUE WHERE id=%s", (pending_id,))
        conn.commit()
        cur.close()
        release_conn(conn)

        # Cleanup session
        session.pop('pending_email', None)

        return redirect(url_for("auth_bp.login"))

    return render_template("verify.html", email=pending_email, error=None)


@auth_bp.route("/resend_code", methods=["POST"])
@rate_limit(3, 120)
@require_csrf
def resend_code():
    """Reinvia codice di verifica."""
    pending_email = session.get('pending_email')
    if not pending_email:
        return redirect(url_for("auth_bp.login"))

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT username FROM pending_registrations
        WHERE email=%s AND verified=FALSE
        ORDER BY created_at DESC LIMIT 1
    """, (pending_email,))
    row = cur.fetchone()

    if not row:
        cur.close()
        release_conn(conn)
        return redirect(url_for("auth_bp.login"))

    # Generate new code
    code = generate_verification_code()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=config.VERIFICATION_CODE_EXPIRY)

    cur.execute("""
        UPDATE pending_registrations SET code=%s, expires_at=%s
        WHERE email=%s AND verified=FALSE
    """, (code, expires_at, pending_email))
    conn.commit()
    cur.close()
    release_conn(conn)

    send_verification_email(pending_email, code)

    return redirect(url_for("auth_bp.verify"))


@auth_bp.route("/logout")
def logout():
    """Logout utente."""
    session.clear()
    resp = redirect(url_for("auth_bp.login"))
    resp.delete_cookie("session")
    return resp
