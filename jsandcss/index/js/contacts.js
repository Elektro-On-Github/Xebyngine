function openContactsModal() {
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = 'contacts-overlay';
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.id = 'contacts-modal';
    modal.innerHTML = `
        <div class="contacts-header"><h3>Contatti</h3></div>
        <div id="contacts-list"></div>
    `;
    overlay.appendChild(modal);

    requestAnimationFrame(() => overlay.classList.add('visible'));

    const closeModal = () => {
        document.body.style.overflow = '';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 340);
        document.removeEventListener('keydown', escHandler);
    };

    const escHandler = e => e.key === 'Escape' && closeModal();
    document.addEventListener('keydown', escHandler);
    overlay.addEventListener('click', e => e.target === overlay && closeModal());

    let startY = null;
    modal.addEventListener('touchstart', e => startY = e.touches[0].clientY);
    modal.addEventListener('touchmove', e => {
        if (startY !== null && e.touches[0].clientY - startY > 60) closeModal();
    });

    renderContacts(modal.querySelector('#contacts-list'));
}

function renderContacts(listDiv, filter = '') {
    const contacts = Array.isArray(PROFILE_CONTACTS) ? PROFILE_CONTACTS : [];
    const filtered = filter 
        ? contacts.filter(c => String(c).toLowerCase().includes(filter.toLowerCase())) 
        : contacts;

    if (!filtered.length) {
        listDiv.innerHTML = '<p class="contacts-empty">Nessun contatto disponibile.</p>';
        return;
    }

    listDiv.innerHTML = filtered.map(raw => {
        const text = String(raw).trim();
        const lower = text.toLowerCase();
        let href = '#', icon = 'fa-user';

        if (/^\+?\d[\d\s\-()]+$/.test(text)) {
            href = `tel:${text.replace(/[\s\-()]/g, '')}`;
            icon = 'fa-phone';
        } else if (lower.includes('://')) {
            href = text;
            icon = 'fa-globe';
        } else if (text.includes('@')) {
            href = `mailto:${text}`;
            icon = 'fa-envelope';
        }

        const target = href.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
        const prevent = href === '#' ? 'event.preventDefault();' : '';

        return `<div class="contact-row">
            <div class="contact-icon"><i class="fa-solid ${icon}"></i></div>
            <a href="${href}"${target} onclick="event.stopPropagation();${prevent}">${escapeHtml(text)}</a>
        </div>`;
    }).join('');
}

document.getElementById('open-contacts-btn')?.addEventListener('click', openContactsModal);