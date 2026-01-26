/**
 * Dirty Status Manager
 * Gestisce l'overlay e le chiamate API per il sistema dirty
 */

class DirtyManager {
    constructor() {
        this.overlay = null;
        this.cleanBtn = null;
        this.daysSpan = null;
        this.csrfToken = null;
        this.init();
    }

    init() {
        // Aspetta che il DOM sia pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        // Ottieni CSRF token
        this.csrfToken = this.getCSRFToken();
        
        // Crea l'overlay dinamicamente
        this.createOverlay();
        
        // Controlla lo stato dirty
        this.checkDirtyStatus();
    }

    getCSRFToken() {
        // Prova da meta tag
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');
        
        // Prova da input hidden
        const input = document.querySelector('input[name="csrf_token"]');
        if (input) return input.value;
        
        // Prova da variabile globale
        if (typeof csrfToken !== 'undefined') return csrfToken;
        
        return null;
    }

    createOverlay() {
        // Overlay giallo full screen
        const overlayHTML = `<div id="dirty-overlay" class="dirty-overlay hidden"></div>`;
        
        // Banner notifica sopra navbar
        const bannerHTML = `
            <div id="dirty-banner" class="dirty-banner hidden">
                <div class="dirty-card">
                    <div class="dirty-icon"><i class="fa-solid fa-bath"></i></div>
                    <div>
                        <h2 class="dirty-title">App sporca!</h2>
                        <h1 class="dirty-message">Non hai effettuato l'accesso per più di 7 giorni.</h1>
                    </div>
                </div>
                <button id="clean-btn" class="clean-button">
                    <i class="fa-solid fa-bath"></i> Pulisci
                </button>
            </div>
        `;

        // Inserisci nel body
        document.body.insertAdjacentHTML('beforeend', overlayHTML);
        document.body.insertAdjacentHTML('afterbegin', bannerHTML);

        // Salva riferimenti
        this.overlay = document.getElementById('dirty-overlay');
        this.banner = document.getElementById('dirty-banner');
        this.cleanBtn = document.getElementById('clean-btn');

        // Event listener per il bottone clean
        this.cleanBtn.addEventListener('click', () => this.cleanAccount());
    }

    async checkDirtyStatus() {
        try {
            const response = await fetch('/api/dirty/status', {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.log('Utente non autenticato - dirty check skipped');
                    return;
                }
                throw new Error('Errore nel controllo stato');
            }

            const data = await response.json();

            if (data.is_dirty) {
                this.showOverlay(data.days_inactive);
            } else {
                this.hideOverlay();
            }

        } catch (error) {
            console.error('Errore controllo dirty status:', error);
        }
    }

    async cleanAccount() {
        // Stato loading
        this.cleanBtn.classList.add('loading');
        this.cleanBtn.textContent = 'Pulizia in corso...';

        try {
            const headers = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            };
            
            // Aggiungi CSRF token se disponibile
            if (this.csrfToken) {
                headers['X-CSRFToken'] = this.csrfToken;
            }

            const response = await fetch('/api/dirty/clean', {
                method: 'POST',
                credentials: 'same-origin',
                headers: headers,
                body: JSON.stringify({
                    csrf_token: this.csrfToken
                })
            });

            const data = await response.json();

            if (data.success) {
                // Animazione di successo
                this.cleanBtn.textContent = 'Pulito!';
                this.cleanBtn.style.background = 'linear-gradient(145deg, #28a745, #218838)';
                
                // Nascondi overlay dopo un breve delay
                setTimeout(() => {
                    this.hideOverlay();
                    this.resetButton();
                }, 1000);

            } else {
                throw new Error(data.error || 'Errore durante la pulizia');
            }

        } catch (error) {
            console.error('Errore pulizia account:', error);
            this.cleanBtn.textContent = 'Errore - Riprova';
            this.cleanBtn.style.background = 'linear-gradient(145deg, #dc3545, #c82333)';
            
            setTimeout(() => this.resetButton(), 2000);
        }
    }

    showOverlay(days) {
        if (this.daysSpan) {
            this.daysSpan.textContent = days;
        }
        this.overlay.classList.remove('hidden');
        this.banner.classList.remove('hidden');
    }

    hideOverlay() {
        this.overlay.classList.add('hidden');
        this.banner.classList.add('hidden');
    }

    resetButton() {
        this.cleanBtn.classList.remove('loading');
        this.cleanBtn.textContent = 'Clean';
        this.cleanBtn.style.background = 'linear-gradient(145deg, #4CAF50, #45a049)';
    }
}

// Inizializza automaticamente
const dirtyManager = new DirtyManager();

// Esporta per uso globale se necessario
window.DirtyManager = DirtyManager;
window.dirtyManager = dirtyManager;