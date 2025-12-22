// Profile: Pin Toggle & QR Code

// Pin Toggle
(function () {
    const btn = document.getElementById('pin-toggle-btn');
    if (!btn) return;

    const username = btn.dataset.username || '';
    const initialPinned = btn.dataset.initialPinned === 'true' || btn.dataset.initialPinned === '1';

    setPinState(btn, initialPinned);
    attachHandler(btn);

    function setPinState(el, pinned) {
        el.classList.toggle('pin-btn-pinned', pinned);
        el.classList.toggle('pin-btn-unpinned', !pinned);
        el.classList.toggle('pinned-icon', pinned);
        el.dataset.pinned = pinned ? '1' : '0';

        if (pinned) {
            el.innerHTML = '<i class="fa-solid fa-check"></i>';
            el.setAttribute('data-initial-pinned', '1');
        } else {
            el.textContent = 'Metti in lista';
            el.removeAttribute('data-initial-pinned');
            el.classList.remove('pinned-circle');
        }

        toggleSiblings(el, pinned);
    }

    function toggleSiblings(el, expand) {
        const parent = el.closest('.profile-actions');
        if (!parent) return;

        parent.querySelectorAll('.profile-action-btn').forEach(s => {
            if (s === el) return;
            s.classList.toggle('expanded', expand);
            if (!expand) s.classList.remove('pinned-icon', 'pinned-circle');
        });
    }

    function showCaption(el, text, duration = 800) {
        const rect = el.getBoundingClientRect();
        const caption = document.createElement('div');
        caption.className = 'pinned-caption';
        caption.textContent = text;
        caption.style.setProperty('--caption-x', `${rect.left + rect.width / 2 - 40}px`);
        caption.style.setProperty('--caption-y', `${rect.top - 12}px`);
        document.body.appendChild(caption);

        requestAnimationFrame(() => caption.classList.add('visible'));

        setTimeout(() => {
            caption.classList.remove('visible');
            setTimeout(() => caption.remove(), 300);
        }, duration);
    }

    function removeAllCaptions() {
        document.querySelectorAll('.pinned-caption, .pinned-flyer').forEach(el => el.remove());
    }

    function attachHandler(el) {
        if (el._attached) return;
        el._attached = true;

        el.addEventListener('click', async (e) => {
            e.preventDefault();
            if (el._pending) return;

            el._pending = true;
            el.disabled = true;

            try {
                const resp = await fetch(`/pin_toggle/${encodeURIComponent(username)}`, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });

                if (!resp.ok) throw new Error('Network');

                const data = await resp.json();

                if (data?.status === 'ok') {
                    data.pinned ? animatePin(el) : restorePin(el);
                } else {
                    showCustomNotification('Errore nel mettere in lista', 'error');
                }
            } catch {
                showCustomNotification('Errore di rete', 'error');
            } finally {
                el._pending = false;
                el.disabled = false;
            }
        });
    }

    function animatePin(el) {
        showCaption(el, 'Aggiunto', 600);
        el.setAttribute('data-original-html', el.innerHTML);
        el.classList.add('morphing');
        el.offsetWidth; // reflow
        el.classList.add('morphed');

        el.addEventListener('transitionend', function handler(e) {
            if (e.target !== el) return;
            el.removeEventListener('transitionend', handler);
            el.classList.remove('morphing');
            el.classList.add('pinned-circle');
            setPinState(el, true);
        }, { once: false });
    }

    function restorePin(el) {
        removeAllCaptions();
        const isMorphed = el.classList.contains('pinned-circle') || el.classList.contains('morphed');

        if (isMorphed) {
            el.classList.remove('pinned-circle');
            el.classList.add('morphing');
            el.classList.remove('morphed');

            el.addEventListener('transitionend', function handler(e) {
                if (e.target !== el) return;
                el.removeEventListener('transitionend', handler);
                el.classList.remove('morphing');
                setPinState(el, false);
            }, { once: false });

            el.offsetWidth; // reflow
        } else {
            setPinState(el, false);
        }
    }
})();

// QR Code
(function () {
    const btn = document.getElementById('qr-me-btn');
    if (!btn) return;

    const origText = btn.innerHTML;

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.innerHTML = 'Generando...';

        try {
            const resp = await fetch('/qr_me');
            const type = resp.headers.get('Content-Type') || '';

            if (type.startsWith('image/')) {
                const blob = await resp.blob();
                openModal(URL.createObjectURL(blob), false);
            } else {
                const data = await resp.json();
                data?.url ? openModal(data.url, true) : showCustomNotification('Impossibile ottenere il QR', 'error');
            }
        } catch {
            showCustomNotification('Errore nella generazione del QR', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    });

    function openModal(src, isLink) {
        const overlay = document.createElement('div');
        overlay.className = 'site-overlay overlay-win-open';

        const panel = document.createElement('div');
        panel.className = 'overlay-panel bio-open';

        const title = document.createElement('h3');
        title.className = 'qr-modal-title';
        title.textContent = 'Il tuo QR code';
        panel.appendChild(title);

        if (isLink) {
            const p = document.createElement('p');
            p.className = 'qr-modal-url-text';
            p.textContent = src;
            panel.appendChild(p);

            const link = document.createElement('a');
            link.className = 'qr-modal-link';
            link.href = src;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Apri profilo';
            panel.appendChild(link);
        } else {
            const img = document.createElement('img');
            img.className = 'qr-modal-image';
            img.src = src;
            img.alt = 'QR code';
            panel.appendChild(img);

            panel.appendChild(document.createElement('br'));

            const dl = document.createElement('a');
            dl.className = 'qr-modal-link';
            dl.href = src;
            dl.download = `qr_${window.LOGGED_USERNAME || 'me'}.png`;
            dl.textContent = 'Scarica QR';
            panel.appendChild(dl);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'qr-modal-link';
            copyBtn.textContent = 'Copia';
            copyBtn.addEventListener('click', () => copyLink(copyBtn));
            panel.appendChild(copyBtn);
        }

        panel.addEventListener('click', e => e.stopPropagation());
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.classList.add('open'));

        overlay.addEventListener('click', (e) => {
            if (e.target !== overlay) return;
            overlay.classList.remove('open', 'overlay-win-open');
            overlay.classList.add('overlay-win-closing');
            panel.classList.replace('bio-open', 'bio-closing');
            setTimeout(() => overlay.remove(), 260);
        });
    }

    async function copyLink(btn) {
        const url = `${location.origin}/user/${encodeURIComponent(window.LOGGED_USERNAME || '')}`;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const ta = document.createElement('textarea');
                ta.className = 'qr-hidden-textarea';
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            btn.textContent = 'Copiato!';
            setTimeout(() => (btn.textContent = 'Copia'), 1300);
        } catch {
            showCustomNotification('Copia fallita', 'error');
        }
    }
})();