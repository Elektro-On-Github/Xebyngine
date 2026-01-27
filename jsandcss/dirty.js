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
        this.createOverlay();
        this.checkDirtyStatus();
    }

    createOverlay() {
        // Overlay sempre visibile su tutte le pagine
        const overlayHTML = `<div id="dirty-overlay" class="dirty-overlay hidden"></div>`;
        document.body.insertAdjacentHTML('beforeend', overlayHTML);
        this.overlay = document.getElementById('dirty-overlay');

        // Banner solo su index.html o root
        const isIndex = window.location.pathname.includes('index.html') || window.location.pathname === '/';
        if (isIndex) {
            const bannerHTML = `
                <div id="dirty-banner" class="dirty-banner hidden">
                    <div class="dirty-card">
                        <div class="dirty-icon"><i class="fa-solid fa-bath"></i></div>
                        <div>
                            <h2 class="dirty-message">App sporca!</h2>
                            <h1 class="dirty-message">Non hai effettuato l'accesso per più di 7 giorni.</h1>
                        </div>
                    </div>
                    <button id="clean-btn" class="clean-button">Pulisci</button>
                </div>
            `;
            document.body.insertAdjacentHTML('afterbegin', bannerHTML);
            this.banner = document.getElementById('dirty-banner');
            this.cleanBtn = document.getElementById('clean-btn');
            this.cleanBtn.addEventListener('click', () => this.cleanAccount());
        }
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

        if (this.overlay) {
            this.overlay.classList.remove('hidden');
        }

        if (this.banner) {
            this.banner.classList.remove('hidden');
        }
    }

    hideOverlay() {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }

        if (this.banner) {
            this.banner.classList.add('hidden');
        }
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