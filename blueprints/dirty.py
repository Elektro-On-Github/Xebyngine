from flask import Blueprint, jsonify, session
from utils.dirty_manager import (
    get_dirty_status, 
    clean_account, 
    get_all_dirty_users
)
from utils.security import require_csrf

dirty_bp = Blueprint('dirty_bp', __name__, url_prefix='/api/dirty')


@dirty_bp.route('/status', methods=['GET'])
def check_status():
    """
    GET /api/dirty/status
    Controlla lo stato dirty dell'utente corrente.
    """
    if 'user_id' not in session:
        return jsonify({
            'error': 'Non autenticato',
            'is_dirty': False
        }), 401
    
    user_id = session['user_id']
    status_info = get_dirty_status(user_id)
    
    return jsonify({
        'success': True,
        'is_dirty': status_info['is_dirty'],
        'status': status_info['status'],
        'days_inactive': status_info['days_inactive'],
        'last_activity': status_info['last_activity']
    })


@dirty_bp.route('/clean', methods=['POST'])
@require_csrf
def clean():
    """
    POST /api/dirty/clean
    Pulisce lo stato dirty e resetta il timer a 7 giorni.
    """
    if 'user_id' not in session:
        return jsonify({
            'error': 'Non autenticato'
        }), 401
    
    user_id = session['user_id']
    success = clean_account(user_id)
    
    if success:
        return jsonify({
            'success': True,
            'message': '🧹 Account pulito! Timer resettato a 7 giorni.'
        })
    else:
        return jsonify({
            'success': False,
            'error': 'Impossibile pulire l\'account'
        }), 500


@dirty_bp.route('/admin/list', methods=['GET'])
def admin_list_dirty():
    """
    GET /api/dirty/admin/list
    Lista tutti gli utenti dirty (solo admin).
    """
    if 'user_id' not in session:
        return jsonify({'error': 'Non autenticato'}), 401
    
    # TODO: Aggiungi controllo admin se hai ruoli
    # if not is_admin(session['user_id']):
    #     return jsonify({'error': 'Non autorizzato'}), 403
    
    dirty_users = get_all_dirty_users()
    
    return jsonify({
        'success': True,
        'count': len(dirty_users),
        'users': dirty_users
    })