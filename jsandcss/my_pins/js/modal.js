let pendingUser = null;

function initModal() {
    const { confirmOverlay: overlay, confirmMessage: msg, confirmOk: btnOk, confirmCancel: btnCancel } = MyPinsConfig.elements;

    const showModal = user => {
        pendingUser = user;
        msg.textContent = `Sei sicuro di voler rimuovere "${user}" dalla lista?`;
        overlay.classList.add('open');
        setTimeout(() => btnOk.focus(), 120);
    };

    const hideModal = () => {
        pendingUser = null;
        overlay.classList.remove('open');
    };

    document.addEventListener('click', e => {
        const btn = e.target.closest('.unpin-btn');
        if (btn?.dataset.username) showModal(btn.dataset.username);
    });

    btnCancel?.addEventListener('click', hideModal);

    btnOk?.addEventListener('click', async () => {
        if (!pendingUser) return hideModal();

        btnOk.disabled = true;
        btnOk.textContent = 'Rimuovendo...';

        try {
            const res = await fetch(`/pin_toggle/${encodeURIComponent(pendingUser)}`, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const data = await res.json();

            if (data.status === 'ok' && data.pinned === false) {
                const item = document.querySelector(`li.user-item[data-username="${CSS.escape(pendingUser)}"]`);
                if (item) {
                    item.style.animation = 'slideInFromLeft 0.3s cubic-bezier(0.7, 0, 0.3, 1) reverse';
                    setTimeout(() => item.remove(), 300);
                }
                hideModal();
            } else {
                await showCustomNotification(data.error || 'Errore durante la rimozione', 'error');
            }
        } catch (err) {
            console.error(err);
            await showCustomNotification('Errore di rete', 'error');
        } finally {
            btnOk.disabled = false;
            btnOk.textContent = 'Rimuovi';
        }
    });

    overlay?.addEventListener('click', e => {
        if (e.target === overlay) hideModal();
    });

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') hideModal();
    });
}