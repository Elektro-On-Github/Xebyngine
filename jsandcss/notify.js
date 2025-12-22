function showCustomNotification(message, type = 'info') {
    const overlay = document.createElement('div');
    overlay.className = 'notify-overlay';

    const modal = document.createElement('div');
    modal.className = 'notify-modal';

    const title = document.createElement('div');
    title.className = 'notify-title';
    title.textContent = type === 'error' ? 'Errore' : type === 'success' ? 'Successo' : 'Notifica';

    const text = document.createElement('div');
    text.className = 'notify-message';
    text.textContent = message;

    const button = document.createElement('button');
    button.className = 'notify-button';
    button.textContent = 'OK';
    button.onclick = () => {
        overlay.classList.add('notify-fadeout');
        setTimeout(() => overlay.remove(), 200);
    };

    modal.appendChild(title);
    modal.appendChild(text);
    modal.appendChild(button);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}
