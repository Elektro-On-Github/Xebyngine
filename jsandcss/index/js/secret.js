/**
 * Secret Message System
 * Mostra il messaggio segreto al caricamento della pagina index
 */

document.addEventListener('DOMContentLoaded', function() {
    fetch('/get-secret')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.message && data.message.trim()) {
                console.log(data.message);
            }
        })
        .catch(error => console.error('Errore caricamento messaggio segreto:', error));
});