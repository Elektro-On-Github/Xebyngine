// Profile-related functionality: Pin Toggle and QR Code

// Pin Toggle (Metti in lista)
(function(){
    const btn = document.getElementById('pin-toggle-btn');
    if (!btn) return;
    
    (function(){
        const initialPinned = btn.getAttribute('data-initial-pinned') === 'true' || btn.getAttribute('data-initial-pinned') === '1';
        const uname = btn.getAttribute('data-username') || '';
        btn.dataset.username = uname;
        
        if (initialPinned) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
            btn.dataset.pinned = '1';
            btn.style.background = '';
            btn.style.color = '#901010';
            btn.classList.add('pinned-icon');
            btn.setAttribute('data-initial-pinned','1');
            const parent = btn.closest('.profile-actions');
            if (parent) {
                const siblings = Array.from(parent.querySelectorAll('.profile-action-btn'))
                    .filter(el => el !== btn);
                siblings.forEach(s => s.classList.add('expanded'));
            }
        } else {
            btn.textContent = 'Metti in lista';
            btn.dataset.pinned = '0';
            btn.style.background = '#901010';
            btn.style.color = '#fff';
        }
    })();

    function attachPinHandler(el) {
        if (!el || el.__pinHandlerAttached) return;
        el.__pinHandlerAttached = true;
        el.addEventListener('click', async function(e){
            e.preventDefault();
            if (el.__pending) return;
            el.__pending = true;
            el.disabled = true;
            const username = (el.dataset && el.dataset.username) ? el.dataset.username : (btn && btn.dataset && btn.dataset.username ? btn.dataset.username : '');
            try {
                const resp = await fetch(`/pin_toggle/${encodeURIComponent(username)}`, {
                    method: 'POST',
                    headers: {'X-Requested-With': 'XMLHttpRequest'}
                });
                if (!resp.ok) throw new Error('Network');
                const j = await resp.json();
                if (j && j.status === 'ok') {
                    if (j.pinned) {
                        if (el.classList && el.classList.contains('pinned-circle')) {
                            const rect = el.getBoundingClientRect();
                            const caption = document.createElement('div');
                            caption.className = 'pinned-caption';
                            caption.textContent = 'Aggiunto';
                            caption.style.left = (rect.left + rect.width/2 - 40) + 'px';
                            caption.style.top = (rect.top - 12) + 'px';
                            document.body.appendChild(caption);
                            requestAnimationFrame(()=>{
                                caption.style.opacity = '1';
                                caption.style.transform = 'translateY(0)';
                            });
                            setTimeout(()=>{
                                caption.style.opacity = '0';
                                caption.style.transform = 'translateY(-6px)';
                                setTimeout(()=> caption.remove(), 300);
                            }, 800);
                        } else {
                            animatePinToEdge(el);
                        }
                    } else {
                        restorePinButton(el);
                    }
                } else {
                    alert('Errore nel mettere in lista');
                }
            } catch (err) {
                console.error(err);
                alert('Errore di rete');
            } finally {
                el.__pending = false;
                el.disabled = false;
            }
        });
    }

    function restorePinButton(el) {
        const origHtml = (el.getAttribute && el.getAttribute('data-original-html')) || 'Metti in lista';
        const isMorphed = el.classList && (el.classList.contains('pinned-circle') || el.classList.contains('morphed'));
        
        if (isMorphed) {
            el.classList.remove('pinned-circle');
            el.classList.add('morphing');
            el.classList.remove('morphed');

            const cap = document.querySelector('.pinned-caption');
            if (cap) {
                cap.style.opacity = '0';
                cap.style.transform = 'translateY(-6px)';
                setTimeout(()=>cap.remove(),300);
            }

            const onEnd = function(e) {
                if (e.target !== el) return;
                el.removeEventListener('transitionend', onEnd);
                el.innerHTML = origHtml;
                el.dataset.pinned = '0';
                el.removeAttribute('data-initial-pinned');
                el.classList.remove('morphing');
                el.classList.remove('pinned-icon');
                const parent = el.closest('.profile-actions');
                if (parent) {
                    const siblings = Array.from(parent.querySelectorAll('.profile-action-btn'));
                    siblings.forEach(s => s.classList.remove('expanded', 'pinned-icon', 'pinned-circle'));
                }
                try { attachPinHandler(el); } catch (err) { console.error('attachPinHandler restore err', err); }
            };
            el.addEventListener('transitionend', onEnd);
            void el.offsetWidth;
            return;
        }

        el.dataset.pinned = '0';
        el.innerHTML = 'Metti in lista';
        el.style.background = '#901010';
        el.style.color = '#fff';
        const existing = document.querySelector('.pinned-flyer');
        if (existing) existing.remove();
        const cap2 = document.querySelector('.pinned-caption');
        if (cap2) cap2.remove();
        const parent2 = el.closest('.profile-actions');
        if (parent2) {
            const siblings2 = Array.from(parent2.querySelectorAll('.profile-action-btn'));
            siblings2.forEach(s => s.classList.remove('expanded', 'pinned-icon', 'pinned-circle'));
        }
        try { attachPinHandler(el); } catch (e) { console.error('attachPinHandler final attach error', e); }
    }

    function animatePinToEdge(sourceBtn) {
        const rect = sourceBtn.getBoundingClientRect();
        const caption = document.createElement('div');
        caption.className = 'pinned-caption';
        caption.textContent = 'Aggiunto';
        caption.style.left = (rect.left + rect.width/2 - 40) + 'px';
        caption.style.top = (rect.top - 12) + 'px';
        document.body.appendChild(caption);
        requestAnimationFrame(()=>{
            caption.style.opacity = '1';
            caption.style.transform = 'translateY(0)';
        });

        sourceBtn.setAttribute('data-original-html', sourceBtn.innerHTML || 'Metti in lista');
        sourceBtn.classList.add('morphing');
        void sourceBtn.offsetWidth;
        sourceBtn.classList.add('morphed');

        const onEnd = function(e) {
            if (e.target !== sourceBtn) return;
            sourceBtn.removeEventListener('transitionend', onEnd);
            sourceBtn.classList.remove('morphing');
            sourceBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
            sourceBtn.classList.add('pinned-circle');
            sourceBtn.dataset.pinned = '1';
            sourceBtn.setAttribute('data-initial-pinned','1');
            try { attachPinHandler(sourceBtn); } catch (err) { console.error('attachPinHandler error', err); }
            const parent = sourceBtn.closest('.profile-actions');
            if (parent) {
                const siblings = Array.from(parent.querySelectorAll('.profile-action-btn')).filter(el => el !== sourceBtn);
                siblings.forEach(s => s.classList.add('expanded'));
            }
            setTimeout(()=>{
                caption.style.opacity = '0';
                caption.style.transform = 'translateY(-6px)';
                setTimeout(()=> caption.remove(), 300);
            }, 600);
        };

        sourceBtn.addEventListener('transitionend', onEnd);
    }

    attachPinHandler(btn);
})();

// QR Code "Fatti conoscere" Button
(function(){
    const btn = document.getElementById('qr-me-btn');
    if (!btn) return;

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        btn.disabled = true;
        const origText = btn.innerHTML;
        btn.innerHTML = 'Generando...';
        try {
            const resp = await fetch('/qr_me');
            const contentType = resp.headers.get('Content-Type') || '';
            if (contentType.startsWith('image/')) {
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                showQrModal(url, blob);
            } else {
                const j = await resp.json();
                const link = j && j.url ? j.url : null;
                if (link) {
                    showQrModal(link, null, true);
                } else {
                    alert('Impossibile ottenere il QR');
                }
            }
        } catch (err) {
            console.error('qr generation error', err);
            alert('Errore nella generazione del QR');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    });

    function showQrModal(srcOrUrl, blob, isLinkOnly = false) {
        const overlay = document.createElement('div');
        overlay.className = 'site-overlay overlay-win-open';

        const panel = document.createElement('div');
        panel.className = 'overlay-panel bio-open';

        const h = document.createElement('h3');
        h.textContent = 'Il tuo QR code';
        h.className = 'qr-modal-title';
        panel.appendChild(h);

        if (!isLinkOnly) {
            const img = document.createElement('img');
            img.src = srcOrUrl;
            img.alt = 'QR code';
            img.className = 'qr-modal-image';
            panel.appendChild(img);
            panel.appendChild(document.createElement('br'));

            const dl = document.createElement('a');
            dl.href = srcOrUrl;
            dl.download = `qr_${(window.LOGGED_USERNAME || 'me')}.png`;
            dl.textContent = 'Scarica QR';
            dl.className = 'qr-modal-link';
            panel.appendChild(dl);

            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copia link profilo';
            copyBtn.className = 'qr-modal-copy-btn';
            copyBtn.addEventListener('click', async () => {
                try {
                    const profileLink = await fetch('/qr_me')
                        .then(r => r.headers.get('Content-Type').startsWith('image/') 
                            ? null 
                            : r.json().then(j => j.url).catch(() => null))
                        .catch(() => null);
                    
                    const toCopy = profileLink || (window.location.origin + '/user/' + encodeURIComponent(window.LOGGED_USERNAME || ''));

                    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                        await navigator.clipboard.writeText(toCopy);
                        copyBtn.textContent = 'Copiato!';
                        setTimeout(() => copyBtn.textContent = 'Copia link profilo', 1300);
                        return;
                    }

                    const ta = document.createElement('textarea');
                    ta.className = 'qr-hidden-textarea';
                    ta.value = toCopy;
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    
                    let ok = false;
                    try {
                        ok = document.execCommand('copy');
                    } catch (e) {
                        console.warn('execCommand copy failed', e);
                        ok = false;
                    }
                    ta.remove();
                    
                    if (ok) {
                        copyBtn.textContent = 'Copiato!';
                        setTimeout(() => copyBtn.textContent = 'Copia link profilo', 1300);
                    } else {
                        throw new Error('copy failed');
                    }
                } catch (err) {
                    console.warn(err);
                    alert('Copia fallita');
                }
            });
            panel.appendChild(copyBtn);
        } else {
            const p = document.createElement('p');
            p.className = 'qr-modal-url-text';
            p.textContent = srcOrUrl;
            panel.appendChild(p);

            const open = document.createElement('a');
            open.href = srcOrUrl;
            open.textContent = 'Apri profilo';
            open.target = '_blank';
            open.rel = 'noopener noreferrer';
            open.className = 'qr-modal-link';
            panel.appendChild(open);
        }

        panel.addEventListener('click', (ev) => {
            ev.stopPropagation();
        });

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        
        requestAnimationFrame(() => {
            overlay.classList.add('open');
        });

        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) {
                overlay.classList.remove('open');
                overlay.classList.remove('overlay-win-open');
                overlay.classList.add('overlay-win-closing');
                panel.classList.remove('bio-open');
                panel.classList.add('bio-closing');
                setTimeout(() => overlay.remove(), 260);
            }
        });
    }
})();
