// Modal confirmation logic

let pendingUser = null;

function initModal() {
    const overlay = MyPinsConfig.elements.confirmOverlay;
    const msg = MyPinsConfig.elements.confirmMessage;
    const btnOk = MyPinsConfig.elements.confirmOk;
    const btnCancel = MyPinsConfig.elements.confirmCancel;

    const showModal = (user) => {
        pendingUser = user;
        msg.textContent = `Sei sicuro di voler rimuovere "${user}" dalla lista?`;
        overlay.classList.add('open');
        setTimeout(() => btnOk.focus(), 120);
    };

    const hideModal = () => {
        pendingUser = null;
        overlay.classList.remove('open');
    };

    // Click on unpin button
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.unpin-btn');
        if (btn?.dataset.username) {
            showModal(btn.dataset.username);
        }
    });

    // Cancel button
    btnCancel?.addEventListener('click', hideModal);

    // Confirm button
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
                    // Animazione di uscita verso sinistra prima di rimuovere
                    item.style.animation = 'slideInFromLeft 0.3s cubic-bezier(0.7, 0, 0.3, 1) reverse';
                    setTimeout(() => item.remove(), 300);
                }
                hideModal();
            } else {
                alert(data.error || 'Errore durante la rimozione');
            }
        } catch (err) {
            console.error(err);
            alert('Errore di rete');
        } finally {
            btnOk.disabled = false;
            btnOk.textContent = 'Rimuovi';
        }
    });

    // Click outside modal
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) hideModal();
    });

    // Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideModal();
    });
}
