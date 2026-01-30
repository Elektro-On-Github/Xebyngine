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

    async setup() {
        const isDirty = await this.checkDirtyStatus();
        if (isDirty) {
            this.createOverlay();
            this.showOverlay();
        }
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
                            <h2 class="dirty-message"></h2>
                            <h1 class="dirty-message">App sporca! <br> Non hai effettuato l'accesso per più di 7 giorni.</h1>
                        </div>
                    </div>
                    <button id="clean-btn" class="clean-button">Pulisci</button>
                    <button id="dirty-close-btn" class="dirty-close-btn" title="Chiudi">×</button>
                </div>
            `;
            document.body.insertAdjacentHTML('afterbegin', bannerHTML);
            this.banner = document.getElementById('dirty-banner');
            this.cleanBtn = document.getElementById('clean-btn');
            this.closeBtn = document.getElementById('dirty-close-btn');
            
            this.cleanBtn.addEventListener('click', () => this.showLoadingOverlay());
            this.closeBtn.addEventListener('click', () => this.closeBanner());
        }
    }

    async checkDirtyStatus() {
        try {
            const response = await fetch('/api/dirty/status', {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });

            if (!response.ok) return false;

            const data = await response.json();
            return data.is_dirty;

        } catch (e) {
            console.error(e);
            return false;
        }
    }


    cleanAccount() {
        try {
            const headers = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            };
            
            // Aggiungi CSRF token se disponibile
            if (this.csrfToken) {
                headers['X-CSRFToken'] = this.csrfToken;
            }

            const response = fetch('/api/dirty/clean', {
                method: 'POST',
                credentials: 'same-origin',
                headers: headers,
                body: JSON.stringify({
                    csrf_token: this.csrfToken
                })
            });

            const data = response.json();

            if (data.success) {
                console.log('Account pulito con successo');
            } else {
                throw new Error(data.error || 'Errore durante la pulizia');
            }

        } catch (error) {
            console.error('Errore pulizia account:', error);
        }
    }

    showLoadingOverlay() {
        // Crea l'overlay di pulizia con progress bar
        const loadingOverlayHTML = `
            <div id="cleaning-overlay" class="cleaning-overlay">
                <div class="cleaning-container">
                    <div class="cleaning-content">
                        <p>L'app sarà pulita tra poco</p>
                        <div class="progress-bar-container">
                            <div class="progress-bar"></div>
                        </div>
                        <p class="progress-text">30 secondi rimanenti</p>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', loadingOverlayHTML);
        const cleaningOverlay = document.getElementById('cleaning-overlay');
        const progressBar = cleaningOverlay.querySelector('.progress-bar');
        const progressText = cleaningOverlay.querySelector('.progress-text');

        // Durata totale: 30 secondi
        const duration = 30000; // 60 secondi in millisecondi
        const startTime = Date.now();

        // Anima la progress bar
        const updateProgress = () => {
            const elapsed = Date.now() - startTime;
            const percentage = Math.min((elapsed / duration) * 100, 100);
            progressBar.style.width = percentage + '%';

            const remainingSeconds = Math.max(Math.ceil((duration - elapsed) / 1000), 0);
            progressText.textContent = remainingSeconds + ' secondo' + (remainingSeconds !== 1 ? 'i' : '') + ' rimanenti';

            if (percentage < 100) {
                requestAnimationFrame(updateProgress);
            } else {
                // Quando la progress bar arriva al 100%, esegui cleanAccount
                this.cleanAccount();
                
                // Refresh della pagina dopo 1 secondo
                setTimeout(() => {
                    location.reload();
                }, 1000);
            }
        };

        updateProgress();
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

    closeBanner() {
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