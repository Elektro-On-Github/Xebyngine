function showCustomNotification(message, type = 'info') {
    return new Promise(resolve => {
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
            setTimeout(() => {
                overlay.remove();
                if (!document.querySelector('.notify-overlay')) document.body.style.overflow = '';
                resolve(true);
            }, 200);
        };

        modal.appendChild(title);
        modal.appendChild(text);
        modal.appendChild(button);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    });
}

function showConfirmDialog(message, title = 'Conferma') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'notify-overlay';

        const modal = document.createElement('div');
        modal.className = 'notify-modal';

        const titleEl = document.createElement('div');
        titleEl.className = 'notify-title';
        titleEl.textContent = title;

        const text = document.createElement('div');
        text.className = 'notify-message';
        text.textContent = message;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '10px';
        buttonsContainer.style.justifyContent = 'center';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'notify-button';
        cancelBtn.textContent = 'Annulla';
        cancelBtn.style.background = '#636363ff';
        cancelBtn.style.flex = '1';
        cancelBtn.onclick = () => {
            overlay.classList.add('notify-fadeout');
            setTimeout(() => {
                overlay.remove();
                if (!document.querySelector('.notify-overlay')) document.body.style.overflow = '';
                resolve(false);
            }, 200);
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'notify-button';
        confirmBtn.textContent = 'Conferma';
        confirmBtn.style.flex = '1';
        confirmBtn.onclick = () => {
            overlay.classList.add('notify-fadeout');
            setTimeout(() => {
                overlay.remove();
                if (!document.querySelector('.notify-overlay')) document.body.style.overflow = '';
                resolve(true);
            }, 200);
        };

        buttonsContainer.appendChild(cancelBtn);
        buttonsContainer.appendChild(confirmBtn);

        modal.appendChild(titleEl);
        modal.appendChild(text);
        modal.appendChild(buttonsContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    });
}
