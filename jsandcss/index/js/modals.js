// Modals: Voters, Likers, Post Menu

// Voters Modal
document.addEventListener('click', e => {
    const btn = e.target.closest?.('.show-voters-btn');
    if (!btn) return;

    try {
        const raw = btn.dataset.pollVoters;
        if (!raw) return;

        const res = JSON.parse(decodeURIComponent(raw));
        const c = document.getElementById('voters-modal-content');
        const overlay = document.getElementById('voters-modal-overlay');
        const modal = document.getElementById('voters-modal');
        const defAvatar = overlay?.dataset.defaultAvatar || '';
        const curr = overlay?.dataset.currentUser || '';

        c.innerHTML = res.map((opt, i) => {
            const voters = Array.isArray(opt.voters) ? opt.voters : [];
            const label = opt.text || opt.label || `Opzione ${i + 1}`;

            let html = `
                <div class="vm-section">
                    <div class="vm-count">
                        <div style="font-weight:800;color:#111">${escapeHtml(label)}</div>
                        <div style="color:#646464;font-size:0.95em;margin-left:8px;">
                            ${voters.length} ${voters.length !== 1 ? 'voti' : 'voto'}
                        </div>
                    </div>
            `;

            html += !voters.length
                ? `<div style="color:#646464">Nessun votante per questa opzione.</div>`
                : voters.map(v => {
                    const name = v?.name || v?.username || v || '';
                    const uname = encodeURIComponent(v?.username || v?.name || v || '');
                    const img = v?.avatar
                        ? `<img class="avatar" src="${v.avatar}" alt="${name}" loading="lazy"
                             onerror="this.src='${defAvatar}'"/>`
                        : `<div class="vm-avatar-fallback">${
                            (name.split(' ').map(s => s[0]).slice(0, 2).join('') || '?').toUpperCase()
                          }</div>`;
                    const highlight = curr && (name === curr || v?.username === curr) ? ' highlight' : '';
                    return `
                        <div class="vm-row${highlight}">
                            ${img}
                            <div style="display:flex;flex-direction:column;justify-content:center">
                                <a href="/user/${uname}" style="text-decoration:none;color:#111;font-weight:600"
                                   onclick="event.stopPropagation()">${name}${highlight ? ' (tu)' : ''}</a>
                            </div>
                        </div>`;
                }).join('');

            return html + '</div>';
        }).join('');

        try {
            const sy = window.scrollY || window.pageYOffset || 0;
            document.documentElement.style.setProperty('--voters-scroll-y', `-${sy}px`);
            document.documentElement.classList.add('modal-open');
        } catch(_) {}

        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        
        try { overlay.classList.remove('overlay-win-closing'); } catch(_) {}
        try { overlay.classList.add('overlay-win-open'); } catch(_) {}

        try { modal.classList.remove('win-open'); } catch(_) {}
        try { modal.classList.remove('win-closing'); } catch(_) {}
        try { modal.classList.remove('bio-closing'); } catch(_) {}
        
        void overlay.offsetHeight;
        requestAnimationFrame(() => {
            try { modal.classList.add('bio-open'); } catch(_) {}
        });
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

    requestAnimationFrame(() => {
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
            try {
                document.documentElement.classList.remove('modal-open');
                const val = getComputedStyle(document.documentElement).getPropertyValue('--voters-scroll-y') || '0';
                const sy = parseInt((val || '0').replace(/[^0-9\-]/g,'')) || 0;
                window.scrollTo(0, Math.abs(sy));
                document.documentElement.style.removeProperty('--voters-scroll-y');
            } catch(_) {}
            overlay.classList.remove('overlay-win-closing');
            modal.classList.remove('bio-closing');
        }, 260);
    });
}

document.getElementById('voters-modal-close')?.addEventListener('click', closeVotersModal);
document.getElementById('voters-modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'voters-modal-overlay') closeVotersModal();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeVotersModal();
});

// Likers Modal
function showLikers(postId) {
    fetch(`/likes/${postId}`)
        .then(res => res.json())
        .then(users => {
            document.body.style.overflow = 'hidden';

            const root = getComputedStyle(document.documentElement);
            const overlay = document.createElement('div');
            overlay.id = 'likers-overlay';
            Object.assign(overlay.style, {
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                background: root.getPropertyValue('--overlay-bg') || 'rgba(255,255,255,0)',
                backdropFilter: `blur(${root.getPropertyValue('--glass-blur')||'4px'})`,
                zIndex: 99998, opacity: 0, transition: 'opacity 0.35s cubic-bezier(.2,.8,.2,1)'
            });
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = '1');

            const modal = document.createElement('div');
            modal.id = 'likers-modal';
            Object.assign(modal.style, {
                position: 'fixed', left: 0, right: 0, bottom: '-100%', height: '50vh',
                background: root.getPropertyValue('--panel-bg')||'rgba(255,255,255,0.98)',
                borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
                boxShadow: '0 -8px 32px 0 rgba(0,0,0,0.18)', zIndex: 99999,
                display: 'flex', flexDirection: 'column', padding: '18px',
                transition: 'bottom 0.35s cubic-bezier(.2,.8,.2,1)'
            });
            modal.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                    <button id="likers-back-btn" style="background:rgba(144, 16, 16, 0.1);border:none;font-size:22px;cursor:pointer;width:44px;height:44px;color:rgba(144, 16, 16, 1);border-radius:50px;">
                        <i class="fa-solid fa-arrow-left"></i>
                    </button>
                    <div style="position:relative; flex:1;">
                        <input id="likers-search" class="comment-input" type="text" placeholder="Cerca qui!" style="width:100%; padding:9px 44px 9px 12px; border-radius:24px; font-size:16px; box-shadow:0 4px 15px rgba(0,0,0,0.08);">
                        <button id="likers-clear-btn" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; width:34px; height:34px; cursor:pointer; display:flex;align-items:center;justify-content:center;padding:6px;">
                            <i class="fa-solid fa-xmark" style="font-size:18px;"></i>
                        </button>
                    </div>
                    <button id="likers-send" type="button" class="comment-send-btn"><i class="fa-solid fa-magnifying-glass"></i></button>
                </div>
                <div id="likers-list" style="overflow-y:auto;flex:1;padding-bottom:18px;"></div>
            `;
            document.body.appendChild(modal);

            try { modal.classList.remove('notif-closing'); } catch(_) {}
            void modal.offsetHeight;
            requestAnimationFrame(() => {
                try {
                    modal.classList.add('notif-open');
                    modal.style.bottom = '0';
                } catch(_) {}
            });

            const closeModal = () => {
                try { modal.classList.remove('notif-open'); } catch(_) {}
                try { modal.classList.add('notif-closing'); } catch(_) {}
                overlay.style.opacity = '0';
                document.body.style.overflow = '';
                setTimeout(() => { modal.remove(); overlay.remove(); }, 350);
            };

            overlay.addEventListener('click', closeModal);
            modal.querySelector('#likers-back-btn')?.addEventListener('click', closeModal);

            const listEl = modal.querySelector('#likers-list');
            let startY = 0, pulling = false, lastTranslate = 0, THRESHOLD = 80;
            const onTouchStart = e => {
                if(!e.touches?.length) return;
                startY = e.touches[0].clientY;
                pulling=false;
                modal.style.transition='';
            };
            const onTouchMove = e => {
                if(!e.touches?.length) return;
                const dy = e.touches[0].clientY - startY;
                if(dy>0 && listEl.scrollTop<=0) {
                    pulling=true;
                    e.preventDefault?.();
                    lastTranslate=Math.min(dy,window.innerHeight);
                    modal.style.transform=`translateY(${lastTranslate*0.6}px)`;
                }
            };
            const onTouchEnd = () => {
                if(!pulling) return;
                modal.style.transition='transform 220ms cubic-bezier(.2,.8,.2,1)';
                if(lastTranslate>=THRESHOLD){
                    modal.style.transform='translateY(100%)';
                    setTimeout(closeModal, 260);
                } else modal.style.transform='';
                pulling=false;
                lastTranslate=0;
            };
            listEl.addEventListener('touchstart', onTouchStart, {passive:true});
            listEl.addEventListener('touchmove', onTouchMove, {passive:false});
            listEl.addEventListener('touchend', onTouchEnd);
            listEl.addEventListener('touchcancel', onTouchEnd);

            const renderList = (filter='') => {
                const needle = filter.toLowerCase();
                const html = users
                    .filter(u => ((u.username||u)+'').toLowerCase().includes(needle))
                    .map(u => {
                        const uname = u.username || u;
                        const avatar = u.avatar_url
                            ? `<img src="${u.avatar_url}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`
                            : `<i class="fa-solid fa-user" style="font-size:1.2em;color:#901010;"></i>`;
                        return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0;">${avatar}<a href="/user/${encodeURIComponent(uname)}" style="font-size:1.08em;color:#222;text-decoration:none;" onclick="event.stopPropagation()">${escapeHtml(uname)}</a></div>`;
                    }).join('') || '<p style="color:#888;text-align:center;margin-top:24px;">Nessun utente trovato.</p>';
                listEl.innerHTML = html;
            };
            renderList();

            const searchInput = modal.querySelector('#likers-search');
            const sendBtn = modal.querySelector('#likers-send');
            const clearBtn = modal.querySelector('#likers-clear-btn');

            searchInput.value='';
            setTimeout(()=>searchInput.focus(),120);
            searchInput.addEventListener('input',()=>renderList(searchInput.value));
            searchInput.addEventListener('keydown',e=>{
                if(e.key==='Enter'){
                    e.preventDefault();
                    renderList(searchInput.value);
                }
            });
            sendBtn?.addEventListener('click',()=>renderList(searchInput.value));
            clearBtn?.addEventListener('click',()=>{
                searchInput.value='';
                renderList('');
                searchInput.focus();
            });
        })
        .catch(console.error);
}

// Post Menu Handling
function closePopup(popup) {
    if (!popup) return;

    popup.classList.remove("open");
    popup.classList.add("closing");
    delete popup.dataset.openedAt;

    const finish = () => {
        popup.style.display = "none";
        popup.classList.remove("closing");
        popup.removeEventListener("transitionend", finish);
    };

    popup.addEventListener("transitionend", finish, { once: true });

    setTimeout(() => {
        if (popup.classList.contains("closing")) finish();
    }, 380);
}

function openPopup(popup, menuBtn) {
    if (!popup) return;

    document.querySelectorAll('.post-menu-popup').forEach(p => {
        if (p !== popup) closePopup(p);
    });

    popup.style.display = 'block';
    popup.dataset.openedAt = Date.now();

    if (menuBtn) {
        const pRect = popup.getBoundingClientRect();
        const bRect = menuBtn.getBoundingClientRect();
        popup.style.transformOrigin = `${(bRect.left + bRect.width / 2) - pRect.left}px ${(bRect.top + bRect.height / 2) - pRect.top}px`;
    }

    requestAnimationFrame(() => {
        popup.classList.remove('closing');
        popup.classList.add('open');
    });
}

document.addEventListener("click", e => {
    const menuBtn = e.target.closest?.(".post-menu-btn");

    if (menuBtn) {
        const popup = menuBtn.parentNode.querySelector(".post-menu-popup");
        if (!popup) return;

        const postEl = menuBtn.closest(".post");
        const owner = postEl?.querySelector("strong a")?.textContent.trim();
        const logged = window.LOGGED_USERNAME;

        if (logged && owner !== logged) return;

        if (popup.classList.contains("open")) {
            closePopup(popup);
        } else {
            openPopup(popup, menuBtn);
        }

        return;
    }

    if (e.target.closest?.(".post-menu-popup")) return;
    if (e.target.closest?.(".post-menu-btn")) return;

    const now = Date.now();

    document.querySelectorAll(".post-menu-popup").forEach(p => {
        const openedAt = Number(p.dataset.openedAt) || 0;
        if (now - openedAt < 300) return;
        closePopup(p);
    });
});

// Delete Post Handler
document.addEventListener('click', e => {
    const btn = e.target.closest?.('.post-delete-btn');
    if (!btn) return;

    const postId = btn.dataset.postId;
    if (!postId) return;

    if (!confirm('Sei sicuro di voler eliminare questo post?')) return;

    fetch(`/delete_post/${postId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    .then(res => res.json())
    .then(j => {
        if (j?.status === 'ok') {
            const el = document.querySelector(`.post[data-post-id="${postId}"]`);
            if (el) {
                el.style.transition = 'opacity 300ms ease, height 300ms ease';
                el.style.opacity = 0;
                setTimeout(() => el.remove(), 320);
            }
        } else {
            alert('Errore: ' + (j?.error || 'nella cancellazione'));
        }
    })
    .catch(err => {
        console.error(err);
        alert('Errore nella richiesta');
    });
});
