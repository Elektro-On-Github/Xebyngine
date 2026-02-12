"""
E2EE Module: End-to-End Encryption per la chat
- Salva chiavi pubbliche nel DB
- Crittografa/decrittografa messaggi con RSA 4096
- Nessun double ratchet: chiavi stabili
"""

from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64
import json
from utils.db import get_conn, release_conn
import os


def generate_rsa_keypair():
    """
    Genera una coppia RSA 4096 per E2EE.
    Ritorna: (public_key_pem, private_key_pem)
    """
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=4096,
        backend=default_backend()
    )
    
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode('utf-8')
    
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode('utf-8')
    
    return public_pem, private_pem


def save_public_key(user_id, public_key_pem):
    """Salva la chiave pubblica nel DB."""
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("""
                INSERT INTO e2ee_keys (user_id, public_key)
                VALUES (%s, %s)
                ON CONFLICT (user_id) DO UPDATE
                SET public_key = EXCLUDED.public_key, updated_at = CURRENT_TIMESTAMP
            """, (user_id, public_key_pem))
            conn.commit()
    finally:
        release_conn(conn)


def get_public_key(user_id):
    """Recupera la chiave pubblica di un utente dal DB."""
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("SELECT public_key FROM e2ee_keys WHERE user_id = %s", (user_id,))
            row = c.fetchone()
            return row[0] if row else None
    finally:
        release_conn(conn)


def encrypt_message(plain_text, recipient_public_key_pem):
    """
    Crittografa un messaggio con HYBRID ENCRYPTION:
    1. Genera una chiave AES-256 casuale
    2. Critta il messaggio con AES-256-GCM
    3. Critta la chiave AES con RSA-4096-OAEP
    
    Ritorna: JSON base64 con {aes_key_encrypted, iv, ciphertext, tag}
    """
    # Step 1: Genera chiave AES-256 casuale e IV
    aes_key = os.urandom(32)  # 256-bit AES key
    iv = os.urandom(16)  # 128-bit IV
    
    # Step 2: Critta il messaggio con AES-256-GCM
    cipher = Cipher(
        algorithms.AES(aes_key),
        modes.GCM(iv),
        backend=default_backend()
    )
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(plain_text.encode('utf-8')) + encryptor.finalize()
    tag = encryptor.tag
    
    # Step 3: Critta la chiave AES con RSA-4096-OAEP
    public_key = serialization.load_pem_public_key(
        recipient_public_key_pem.encode('utf-8'),
        backend=default_backend()
    )
    
    aes_key_encrypted = public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    
    # Step 4: Combina tutto in un JSON e ritorna base64
    hybrid_payload = {
        'aes_key': base64.b64encode(aes_key_encrypted).decode('utf-8'),
        'iv': base64.b64encode(iv).decode('utf-8'),
        'ciphertext': base64.b64encode(ciphertext).decode('utf-8'),
        'tag': base64.b64encode(tag).decode('utf-8')
    }
    
    return base64.b64encode(json.dumps(hybrid_payload).encode('utf-8')).decode('utf-8')


def decrypt_message(cipher_b64, private_key_pem):
    """
    Decrittografa un messaggio crittato con HYBRID ENCRYPTION:
    1. Decritterà la chiave AES con RSA-4096-OAEP
    2. Decritterà il messaggio con AES-256-GCM
    
    Ritorna: testo plaintext originale
    """
    try:
        # Step 1: Decodifica il JSON hybrid
        hybrid_payload = json.loads(base64.b64decode(cipher_b64).decode('utf-8'))
        
        # Step 2: Carica i dati dal payload
        aes_key_encrypted = base64.b64decode(hybrid_payload['aes_key'])
        iv = base64.b64decode(hybrid_payload['iv'])
        ciphertext = base64.b64decode(hybrid_payload['ciphertext'])
        tag = base64.b64decode(hybrid_payload['tag'])
        
        # Step 3: Decritterà la chiave AES con la chiave privata RSA
        private_key = serialization.load_pem_private_key(
            private_key_pem.encode('utf-8'),
            password=None,
            backend=default_backend()
        )
        
        aes_key = private_key.decrypt(
            aes_key_encrypted,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # Step 4: Decritterà il messaggio con AES-256-GCM
        cipher = Cipher(
            algorithms.AES(aes_key),
            modes.GCM(iv, tag),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()
        plaintext = decryptor.update(ciphertext) + decryptor.finalize()
        
        return plaintext.decode('utf-8')
    except Exception as e:
        raise ValueError(f"Decryption failed: {e}")


def save_encrypted_message(sender_id, receiver_id, encrypted_content, original_hash=None):
    """
    Salva il messaggio crittografato nel DB.
    original_hash: hash SHA256 del contenuto originale (per integrità)
    """
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("""
                INSERT INTO messages (sender_id, receiver_id, content, message_type, is_encrypted)
                VALUES (%s, %s, %s, 'text', TRUE)
                RETURNING id
            """, (sender_id, receiver_id, encrypted_content))
            msg_id = c.fetchone()[0]
            conn.commit()
            return msg_id
    finally:
        release_conn(conn)


def get_conversation_history(user_a, user_b, limit=50):
    """
    Recupera la cronologia di messaggi tra due utenti.
    Ritorna: lista di dict con messaggio crittografato
    """
    conn = get_conn()
    try:
        with conn.cursor() as c:
            c.execute("""
                SELECT id, sender_id, content, created_at, is_encrypted, message_type
                FROM messages
                WHERE (sender_id=%s AND receiver_id=%s) OR (sender_id=%s AND receiver_id=%s)
                ORDER BY created_at DESC
                LIMIT %s
            """, (user_a, user_b, user_b, user_a, limit))
            rows = c.fetchall()
            
            messages = []
            for msg_id, sender_id, content, created_at, is_encrypted, message_type in rows:
                messages.append({
                    'id': msg_id,
                    'sender_id': sender_id,
                    'content': content,
                    'created_at': created_at.isoformat() if created_at else None,
                    'is_encrypted': is_encrypted,
                    'message_type': message_type
                })
            
            return messages[::-1]  # Ordine cronologico
    finally:
        release_conn(conn)
