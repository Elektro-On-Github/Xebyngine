// === VOTERS MODAL ===
document.addEventListener('click', e => {
    const btn = e.target.closest?.('.show-voters-btn');
    if (!btn?.dataset.pollVoters) return;

    try {
        const res = JSON.parse(decodeURIComponent(btn.dataset.pollVoters));
        const content = document.getElementById('voters-modal-content');
        const overlay = document.getElementById('voters-modal-overlay');
        const modal = document.getElementById('voters-modal');
        const defAvatar = overlay?.dataset.defaultAvatar || '';
        const curr = overlay?.dataset.currentUser || '';

        content.innerHTML = res.map((opt, i) => {
            const voters = Array.isArray(opt.voters) ? opt.voters : [];
            const label = opt.text || opt.label || `Opzione ${i + 1}`;

            const votersHtml = voters.length
                ? voters.map(v => {
                    const name = v?.name || v?.username || v || '';
                    const uname = encodeURIComponent(v?.username || v?.name || v || '');
                    const initials = (name.split(' ').map(s => s[0]).slice(0, 2).join('') || '?').toUpperCase();
                    const isMe = curr && (name === curr || v?.username === curr);
                    return `
                        <div class="vm-row${isMe ? ' highlight' : ''}">
                            ${v?.avatar
                                ? `<img class="avatar" src="${v.avatar}" alt="${name}" loading="lazy" onerror="this.src='${defAvatar}'"/>`
                                : `<div class="vm-avatar-fallback">${initials}</div>`}
                            <div class="vm-voter-info">
                                <a href="/user/${uname}" class="vm-voter-link" onclick="event.stopPropagation()">${name}${isMe ? ' (tu)' : ''}</a>
                            </div>
                        </div>`;
                }).join('')
                : '<div class="vm-no-voters">Nessun votante per questa opzione.</div>';

            return `
                <div class="vm-section">
                    <div class="vm-count">
                        <div class="vm-label">${escapeHtml(label)}</div>
                        <div class="vm-vote-count">${voters.length} ${voters.length !== 1 ? 'voti' : 'voto'}</div>
                    </div>
                    ${votersHtml}
                </div>`;
        }).join('');

        const sy = window.scrollY || 0;
        document.documentElement.style.setProperty('--voters-scroll-y', `-${sy}px`);
        document.documentElement.classList.add('modal-open');

        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        overlay.classList.remove('overlay-win-closing');
        overlay.classList.add('overlay-win-open');
        modal.classList.remove('win-open', 'win-closing', 'bio-closing');

        void overlay.offsetHeight;
        requestAnimationFrame(() => modal.classList.add('bio-open'));
    } catch (err) {
        console.error('show voters error', err);
    }
});

function closeVotersModal() {
    const overlay = document.getElementById('voters-modal-overlay');
    const modal = document.getElementById('voters-modal');
    if (!overlay || overlay.style.display !== 'flex') return;

    overlay.classList.remove('overlay-win-open');
    overlay.classList.add('overlay-win-closing');
    modal.classList.remove('bio-open');
    modal.classList.add('bio-closing');

    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.classList.remove('overlay-win-closing');
        modal.classList.remove('bio-closing');

        document.documentElement.classList.remove('modal-open');
        const val = getComputedStyle(document.documentElement).getPropertyValue('--voters-scroll-y') || '0';
        window.scrollTo(0, Math.abs(parseInt(val.replace(/\D/g, '')) || 0));
        document.documentElement.style.removeProperty('--voters-scroll-y');
    }, 260);
}

document.getElementById('voters-modal-close')?.addEventListener('click', closeVotersModal);
document.getElementById('voters-modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'voters-modal-overlay') closeVotersModal();
});
document.addEventListener('keydown', e => e.key === 'Escape' && closeVotersModal());

// === LIKERS MODAL ===
function showLikers(postId) {
    fetch(`/likes/${postId}`)
        .then(r => r.json())
        .then(users => {
            document.body.classList.add('body-locked');

            const overlay = document.createElement('div');
            overlay.id = 'likers-overlay';
            overlay.className = 'likers-overlay';

            const modal = document.createElement('div');
            modal.id = 'likers-modal';
            modal.className = 'likers-modal';
            modal.innerHTML = `
                <div class="likers-header">
                    <button id="likers-back-btn" class="likers-back-btn"><i class="fa-solid fa-arrow-left"></i></button>
                    <div class="likers-search-wrap">
                        <input id="likers-search" class="comment-input likers-search" type="text" placeholder="Cerca qui!">
                        <button id="likers-clear-btn" class="likers-clear-btn"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <button id="likers-send" type="button" class="comment-send-btn"><i class="fa-solid fa-magnifying-glass"></i></button>
                </div>
                <div id="likers-list" class="likers-list"></div>`;

            document.body.append(overlay, modal);
            void modal.offsetHeight;
            requestAnimationFrame(() => {
                overlay.classList.add('active');
                modal.classList.add('active');
            });

            const close = () => {
                modal.classList.remove('active');
                overlay.classList.remove('active');
                document.body.classList.remove('body-locked');
                setTimeout(() => { modal.remove(); overlay.remove(); }, 350);
            };

            overlay.onclick = close;
            modal.querySelector('#likers-back-btn').onclick = close;

            const list = modal.querySelector('#likers-list');
            let startY = 0, pulling = false, dy = 0;

            list.addEventListener('touchstart', e => {
                startY = e.touches[0].clientY;
                pulling = false;
                modal.classList.add('dragging');
            }, { passive: true });

            list.addEventListener('touchmove', e => {
                dy = e.touches[0].clientY - startY;
                if (dy > 0 && list.scrollTop <= 0) {
                    pulling = true;
                    e.preventDefault();
                    modal.style.transform = `translateY(${Math.min(dy * 0.6, window.innerHeight)}px)`;
                }
            }, { passive: false });

            const endDrag = () => {
                modal.classList.remove('dragging');
                if (!pulling) return;
                if (dy >= 80) {
                    modal.classList.add('dismiss');
                    setTimeout(close, 260);
                } else {
                    modal.style.transform = '';
                }
                pulling = false;
                dy = 0;
            };
            list.addEventListener('touchend', endDrag);
            list.addEventListener('touchcancel', endDrag);

            const render = (q = '') => {
                const needle = q.toLowerCase();
                const filtered = users.filter(u => ((u.username || u) + '').toLowerCase().includes(needle));
                list.innerHTML = filtered.length
                    ? filtered.map(u => {
                        const name = u.username || u;
                        const avatar = u.avatar_url
                            ? `<img src="${u.avatar_url}" class="likers-avatar">`
                            : `<i class="fa-solid fa-user likers-icon"></i>`;
                        return `<div class="likers-item">${avatar}<a href="/user/${encodeURIComponent(name)}" class="likers-name" onclick="event.stopPropagation()">${escapeHtml(name)}</a></div>`;
                    }).join('')
                    : '<p class="likers-empty">Nessun utente trovato.</p>';
            };
            render();

            const input = modal.querySelector('#likers-search');
            setTimeout(() => input.focus(), 120);
            input.oninput = () => render(input.value);
            input.onkeydown = e => e.key === 'Enter' && (e.preventDefault(), render(input.value));
            modal.querySelector('#likers-send').onclick = () => render(input.value);
            modal.querySelector('#likers-clear-btn').onclick = () => { input.value = ''; render(); input.focus(); };
        })
        .catch(console.error);
}

// === POST MENU ===
function closePopup(popup) {
    if (!popup) return;

    popup.classList.remove('open');
    popup.classList.add('closing');
    delete popup.dataset.openedAt;

    const done = () => {
        popup.style.display = 'none';
        popup.classList.remove('closing');
        popup.removeEventListener('transitionend', done);
    };

    popup.addEventListener('transitionend', done, { once: true });
    setTimeout(() => popup.classList.contains('closing') && done(), 380);
}

function openPopup(popup, btn) {
    if (!popup) return;

    document.querySelectorAll('.post-menu-popup').forEach(p => {
        if (p !== popup) closePopup(p);
    });

    popup.style.display = 'block';
    popup.dataset.openedAt = Date.now();

    if (btn) {
        const p = popup.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        popup.style.transformOrigin = `${b.left + b.width / 2 - p.left}px ${b.top + b.height / 2 - p.top}px`;
    }

    requestAnimationFrame(() => {
        popup.classList.remove('closing');
        popup.classList.add('open');
    });
}

document.addEventListener('click', e => {
    const menuBtn = e.target.closest?.('.post-menu-btn');

    if (menuBtn) {
        const popup = menuBtn.parentNode.querySelector('.post-menu-popup');
        if (!popup) return;

        const post = menuBtn.closest('.post');
        const owner = post?.querySelector('strong a')?.textContent.trim();
        if (window.LOGGED_USERNAME && owner !== window.LOGGED_USERNAME) return;

        popup.classList.contains('open') ? closePopup(popup) : openPopup(popup, menuBtn);
        return;
    }

    if (e.target.closest?.('.post-menu-popup, .post-menu-btn')) return;

    const now = Date.now();
    document.querySelectorAll('.post-menu-popup').forEach(p => {
        if (now - (Number(p.dataset.openedAt) || 0) >= 300) closePopup(p);
    });
});

// === DELETE POST ===
document.addEventListener('click', async e => {
    const btn = e.target.closest?.('.post-delete-btn');
    if (!btn?.dataset.postId) return;

    const id = btn.dataset.postId;
    const confirmed = await showConfirmDialog('Sei sicuro di voler eliminare questo post?', 'Elimina post');
    if (!confirmed) return;

    fetch(`/delete_post/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    .then(r => r.json())
    .then(j => {
        if (j?.status === 'ok') {
            const el = document.querySelector(`.post[data-post-id="${id}"]`);
            if (el) {
                el.classList.add('post-removing');
                setTimeout(() => el.remove(), 320);
            }
        } else {
            showCustomNotification('Errore: ' + (j?.error || 'nella cancellazione'), 'error');
        }
    })
    .catch(() => showCustomNotification('Errore nella richiesta', 'error'));
});