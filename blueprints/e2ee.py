"""
Blueprint per E2EE - API di crittografia end-to-end
"""

from flask import Blueprint, request, session, jsonify, url_for
import os
from utils.security import require_csrf
from utils.e2ee import (
    generate_rsa_keypair, 
    save_public_key, 
    get_public_key,
    encrypt_message,
    decrypt_message,
    save_encrypted_message,
    get_conversation_history
)
from utils.db import get_conn, release_conn

# Importa send_to_user da chat per inviare messaggi in real-time
# Verrà definita globalmente in app.py per evitare circular import
# Per ora, la importeremo dinamicamente

e2ee_bp = Blueprint('e2ee_bp', __name__)


@e2ee_bp.route('/api/e2ee/generate-keypair', methods=['POST'])
@require_csrf
def api_generate_keypair():
    """
    Genera una nuova coppia RSA 4096.
    Il client riceve la chiave pubblica (da inviare al server)
    e salva la chiave privata nel browser.
    
    Risposta: {
        "public_key": "-----BEGIN PUBLIC KEY-----...",
        "private_key": "-----BEGIN PRIVATE KEY-----..."
    }
    """
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        public_key, private_key = generate_rsa_keypair()
        return jsonify({
            "public_key": public_key,
            "private_key": private_key,
            "status": "success"
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@e2ee_bp.route('/api/e2ee/save-public-key', methods=['POST'])
@require_csrf
def api_save_public_key():
    """
    Salva la chiave pubblica dell'utente nel server.
    
    Richiesta: {
        "public_key": "-----BEGIN PUBLIC KEY-----..."
    }
    """
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    public_key = data.get('public_key')
    
    if not public_key:
        return jsonify({"error": "Missing public_key"}), 400
    
    try:
        save_public_key(session["user_id"], public_key)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@e2ee_bp.route('/api/e2ee/get-public-key/<user_id>', methods=['GET'])
def api_get_public_key(user_id):
    """
    Recupera la chiave pubblica di un utente.
    Non richiede autenticazione (le chiavi pubbliche sono pubbliche!)
    """
    try:
        public_key = get_public_key(user_id)
        if not public_key:
            return jsonify({"error": "Public key not found"}), 404
        
        return jsonify({
            "user_id": user_id,
            "public_key": public_key
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@e2ee_bp.route('/api/e2ee/send-encrypted', methods=['POST'])
@require_csrf
def api_send_encrypted():
    """
    Invia un messaggio crittografato.
    Il client critta il messaggio con la chiave pubblica del destinatario.
    
    Richiesta: {
        "receiver_id": "...",
        "encrypted_content": "base64_encoded_ciphertext"
    }
    """
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    receiver_id = data.get('receiver_id')
    encrypted_content = data.get('encrypted_content')
    
    if not all([receiver_id, encrypted_content]):
        return jsonify({"error": "Missing parameters"}), 400
    
    try:
        sender_id = session["user_id"]
        msg_id = save_encrypted_message(sender_id, receiver_id, encrypted_content)
        
        # Invia il messaggio in real-time via SSE con il flag is_encrypted
        # Importa dinamicamente per evitare circular import
        from blueprints.chat import send_to_user
        
        # Recupera avatar mittente
        conn = get_conn()
        try:
            with conn.cursor() as c:
                c.execute("SELECT avatar_path FROM profile WHERE user_id=%s", (sender_id,))
                row = c.fetchone()
        finally:
            release_conn(conn)
        
        avatar_filename = os.path.basename(row[0]) if row and row[0] else 'default.png'
        avatar_url = f'/uploads/avatars/{avatar_filename}'
        
        # Invia SSE con is_encrypted: true per far decriptare lato client
        send_to_user(receiver_id, 'message', {
            'sender': sender_id,
            'content': encrypted_content,  # Il client lo decritterà
            'is_encrypted': True,
            'message_id': msg_id,
            'avatar': avatar_url
        })
        
        return jsonify({
            "status": "success",
            "message_id": msg_id
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@e2ee_bp.route('/api/e2ee/history/<other_user_id>', methods=['GET'])
def api_get_history(other_user_id):
    """
    Recupera la cronologia di messaggi crittografati tra due utenti.
    Il client decritterà i messaggi con la sua chiave privata.
    """
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        my_id = session["user_id"]
        messages = get_conversation_history(my_id, other_user_id)
        
        return jsonify({
            "messages": messages,
            "status": "success"
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@e2ee_bp.route('/api/e2ee/check-keys', methods=['GET'])
def api_check_keys():
    """
    Verifica se l'utente ha una coppia di chiavi E2EE.
    Ritorna true/false.
    """
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        public_key = get_public_key(session["user_id"])
        return jsonify({
            "has_keys": public_key is not None
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
