"""
Gestione della tabella 'dirty' per tracciare l'inattività degli utenti.
Si integra con il connection pool esistente.
"""

from datetime import datetime, timedelta
from .db import get_conn, release_conn

INACTIVITY_DAYS = 7  # Giorni prima che l'account diventi "dirty"


def ensure_dirty_table():
    """Crea la tabella dirty se non esiste."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # USA VARCHAR(32) invece di UUID per matchare la tabella users
        cur.execute('''
            CREATE TABLE IF NOT EXISTS dirty (
                id BIGSERIAL PRIMARY KEY,
                user_id VARCHAR(32) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(3) DEFAULT 'no' CHECK(status IN ('yes', 'no')),
                last_activity TIMESTAMPTZ DEFAULT NOW()
            )
        ''')
        
        # Indici per performance
        cur.execute('CREATE INDEX IF NOT EXISTS idx_dirty_user_id ON dirty(user_id)')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_dirty_status ON dirty(status)')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_dirty_last_activity ON dirty(last_activity)')
        
        conn.commit()
        cur.close()
    except Exception as e:
        import sys
        print(f"Warning: could not ensure dirty table exists: {e}", file=sys.stderr)
    finally:
        if conn:
            release_conn(conn)

def ensure_user_in_dirty(user_id):
    """Assicura che l'utente abbia un record nella tabella dirty."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        cur.execute('SELECT id FROM dirty WHERE user_id = %s', (user_id,))
        
        if cur.fetchone() is None:
            cur.execute('''
                INSERT INTO dirty (user_id, status, last_activity) 
                VALUES (%s, 'no', NOW())
                ON CONFLICT (user_id) DO NOTHING
            ''', (user_id,))
            conn.commit()
        
        cur.close()
    finally:
        if conn:
            release_conn(conn)


def get_dirty_status(user_id):
    """
    Controlla e ritorna lo stato dirty di un utente.
    Aggiorna automaticamente a 'yes' se inattivo per 7+ giorni.
    """
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Assicura che l'utente esista nella tabella
        ensure_user_in_dirty(user_id)
        
        # Recupera lo stato attuale
        cur.execute('''
            SELECT status, last_activity 
            FROM dirty 
            WHERE user_id = %s
        ''', (user_id,))
        
        result = cur.fetchone()
        
        if not result:
            cur.close()
            return {
                'status': 'no',
                'is_dirty': False,
                'days_inactive': 0,
                'last_activity': None
            }
        
        status, last_activity = result
        
        # Calcola giorni di inattività
        if last_activity:
            # Gestisci timezone-aware datetime
            now = datetime.now(last_activity.tzinfo) if last_activity.tzinfo else datetime.now()
            days_inactive = (now - last_activity).days
        else:
            days_inactive = 0
        
        # Controlla se sono passati 7 giorni di inattività
        if days_inactive >= INACTIVITY_DAYS and status == 'no':
            # Aggiorna a 'yes' perché l'utente è inattivo
            cur.execute('''
                UPDATE dirty 
                SET status = 'yes' 
                WHERE user_id = %s
            ''', (user_id,))
            conn.commit()
            status = 'yes'
        
        cur.close()
        
        return {
            'status': status,
            'is_dirty': status == 'yes',
            'days_inactive': days_inactive,
            'last_activity': last_activity.isoformat() if last_activity else None
        }
    
    finally:
        if conn:
            release_conn(conn)


def update_last_activity(user_id):
    """
    Aggiorna l'ultima attività dell'utente.
    ⚠️ CHIAMARE AD OGNI LOGIN!
    """
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # UPSERT: inserisce o aggiorna
        cur.execute('''
            INSERT INTO dirty (user_id, status, last_activity) 
            VALUES (%s, 'no', NOW())
            ON CONFLICT (user_id) DO UPDATE SET 
                last_activity = NOW()
        ''', (user_id,))
        
        conn.commit()
        cur.close()
        print(f"✅ Attività aggiornata per user_id: {user_id}")
    
    finally:
        if conn:
            release_conn(conn)


def clean_account(user_id):
    """
    Pulisce lo stato dirty e RESETTA il timer.
    Chiamato quando l'utente clicca 'Clean'.
    """
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        cur.execute('''
            UPDATE dirty 
            SET status = 'no', last_activity = NOW() 
            WHERE user_id = %s
        ''', (user_id,))
        
        rows_affected = cur.rowcount
        conn.commit()
        cur.close()
        
        return rows_affected > 0
    
    finally:
        if conn:
            release_conn(conn)


def get_all_dirty_users():
    """Ritorna tutti gli utenti con status 'dirty' (per admin)."""
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        cur.execute('''
            SELECT d.user_id, u.username, d.status, d.last_activity
            FROM dirty d
            JOIN users u ON d.user_id = u.id
            WHERE d.status = 'yes'
            ORDER BY d.last_activity ASC
        ''')
        
        users = cur.fetchall()
        cur.close()
        
        return [
            {
                'user_id': str(u[0]),
                'username': u[1],
                'status': u[2],
                'last_activity': u[3].isoformat() if u[3] else None
            } for u in users
        ]
    
    finally:
        if conn:
            release_conn(conn)


def check_and_update_all_dirty():
    """
    Job schedulato: controlla TUTTI gli utenti e aggiorna lo status.
    Utile per cron job o scheduler.
    """
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Aggiorna a 'yes' tutti gli utenti inattivi da 7+ giorni
        cur.execute('''
            UPDATE dirty 
            SET status = 'yes' 
            WHERE status = 'no' 
            AND last_activity < NOW() - INTERVAL '%s days'
        ''', (INACTIVITY_DAYS,))
        
        updated = cur.rowcount
        conn.commit()
        cur.close()
        
        print(f"✅ Aggiornati {updated} account a status 'dirty'")
        return updated
    
    finally:
        if conn:
            release_conn(conn)