// Contacts Modal
function openContactsModal() {
    const root = getComputedStyle(document.documentElement);
    
    if (!document.getElementById('contacts-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'contacts-modal-styles';
        style.textContent = `
            #contacts-overlay { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:99998; transition: opacity 0.35s cubic-bezier(.2,.8,.2,1); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); background: rgba(255,255,255,0); }
            #contacts-modal { position:relative; max-width:680px; width: min(680px, calc(100vw - 24px)); max-height:84vh; overflow:auto; background: rgba(255,255,255,0.85); border-radius:14px; box-shadow: 0 18px 50px rgba(0,0,0,0.28); padding:18px; z-index:99999; display:flex; flex-direction:column; }
            #contacts-list { overflow-y:auto; flex:1; padding-bottom:18px; }
            #contacts-modal .contact-row { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:0px solid #f0f0f0; }
            #contacts-modal .contact-row a { font-size:1.08em; color:#222; text-decoration:none; }
            #contacts-modal .contact-icon { width:36px; height:36px; display:flex; align-items:center; justify-content:center; }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'contacts-overlay';
    overlay.style.background = 'rgba(255,255,255,0)';
    overlay.style.backdropFilter = `blur(4px)`;
    overlay.style.opacity = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.inset = '0';
    document.body.appendChild(overlay);
    
    try { document.body.style.overflow = 'hidden'; } catch(_) {}

    const modal = document.createElement('div');
    modal.id = 'contacts-modal';
    modal.style.background = 'rgba(255,255,255,0.80)';
    modal.style.maxWidth = '680px';
    modal.style.width = 'calc(100vw - 24px)';
    modal.style.maxHeight = '84vh';
    modal.style.overflow = 'auto';
    modal.style.boxSizing = 'border-box';
    modal.style.borderRadius = '14px';
    modal.style.padding = '18px';
    modal.style.boxShadow = '0 18px 50px rgba(0,0,0,0.28)';
    modal.style.zIndex = '99999';
    overlay.appendChild(modal);

    try { overlay.classList.add('overlay-win-open'); } catch(_) {}
    setTimeout(() => { overlay.style.opacity = '1'; }, 10);

    modal.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; position:relative; margin-bottom:12px;">
            <h3 style="margin:0; font-size:1.05em;">Contatti</h3>
        </div>
        <div id="contacts-list"></div>
    `;

    try { modal.classList.add('bio-open'); } catch(_) {}

    let startY = null;
    modal.addEventListener('touchstart', e => { startY = e.touches[0].clientY; });
    modal.addEventListener('touchmove', e => {
        if (startY !== null) {
            const deltaY = e.touches[0].clientY - startY;
            if (deltaY > 60) closeModal();
        }
    });

    function closeModal() {
        try { modal.classList.remove('bio-open'); } catch(_) {}
        try { modal.classList.add('bio-closing'); } catch(_) {}
        try { overlay.classList.remove('overlay-win-open'); } catch(_) {}
        try { overlay.classList.add('overlay-win-closing'); } catch(_) {}
        document.body.style.overflow = '';
        setTimeout(() => { try { modal.remove(); } catch(_) {} try { overlay.remove(); } catch(_) {} }, 340);
    }

    overlay.addEventListener('click', () => closeModal());

    function renderList(filter = '') {
        const listDiv = modal.querySelector('#contacts-list');
        const contacts = Array.isArray(PROFILE_CONTACTS) ? PROFILE_CONTACTS : [];
        let filtered = contacts;
        if (filter) filtered = contacts.filter(c => String(c).toLowerCase().includes(filter.toLowerCase()));
        
        if (!filtered.length) {
            listDiv.innerHTML = '<p style="color:#888;text-align:center;margin-top:24px;">Nessun contatto disponibile.</p>';
            return;
        }
        
        listDiv.innerHTML = filtered.map(raw => {
            const text = (typeof raw === 'string') ? raw.trim() : String(raw);
            const lower = text.toLowerCase();
            let href = '#';
            let icon = '<i class="fa-solid fa-user" style="font-size:1.2em;color:#901010;"></i>';
            
            if (/^\+?\d[\d\s\-()]+$/.test(text)) {
                href = `tel:${text.replace(/[\s\-()]/g,'')}`;
                icon = '<i class="fa-solid fa-phone" style="font-size:1.1em;color:#901010;"></i>';
            } else if (lower.includes('http://') || lower.includes('https://')) {
                href = text;
                icon = '<i class="fa-solid fa-globe" style="font-size:1.1em;color:#901010;"></i>';
            } else if (text.includes('@')) {
                href = `mailto:${text}`;
                icon = '<i class="fa-solid fa-envelope" style="font-size:1.1em;color:#901010;"></i>';
            }
            
            const safe = escapeHtml(text);
            const target = href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
            
            return `
                <div class="contact-row">
                    <div class="contact-icon">${icon}</div>
                    <a href="${href}"${target} onclick="event.stopPropagation();${href === '#' ? 'event.preventDefault();' : ''}">${safe}</a>
                </div>
            `;
        }).join('');
    }

    renderList();

    function escHandler(e) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', escHandler);
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('open-contacts-btn');
    if (btn) btn.addEventListener('click', openContactsModal);
});
