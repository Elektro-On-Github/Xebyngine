// Comments Modal System

function showCommentsModal(postId) {
    const overlayId = `comments-overlay-${postId}`;
    const modalId = `comments-modal-${postId}`;
    
    if (document.getElementById(modalId)) return;

    const root = getComputedStyle(document.documentElement);
    const overlay = createOverlay(overlayId, root);
    const modal = createModal(modalId, postId);
    
    document.body.append(overlay, modal);
    
    setupModalAnimations(overlay, modal, postId);
    setupModalInteractions(modal, overlay, postId);
    loadComments(postId, modal);
    
    document.body.style.overflow = 'hidden';
}

function createOverlay(id, root) {
    const overlay = document.createElement('div');
    overlay.id = id;
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        background: root.getPropertyValue('--overlay-bg') || 'rgba(255,255,255,0)',
        zIndex: '10998',
        transition: 'opacity 0.35s cubic-bezier(.2,.8,.2,1)',
        opacity: '0'
    });
    try {
        overlay.style.background = root.getPropertyValue('--overlay-bg') || 'rgba(255,255,255,0)';
        overlay.style.backdropFilter = root.getPropertyValue('--glass-blur') ? `blur(${root.getPropertyValue('--glass-blur')})` : 'blur(4px)';
        overlay.style.webkitBackdropFilter = overlay.style.backdropFilter;
    } catch(_) {}
    return overlay;
}

function createModal(id, postId) {
    const modal = document.createElement('div');
    modal.id = id;
    Object.assign(modal.style, {
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '-100%',
        height: '50vh',
        background: '#ffffff',
        borderTopLeftRadius: '18px',
        borderTopRightRadius: '18px',
        boxShadow: '0 -8px 32px 0 rgba(0,0,0,0.25)',
        zIndex: '10999',
        transition: 'bottom 0.35s cubic-bezier(.2,.8,.2,1)',
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 2px 0 18px'
    });

    modal.innerHTML = `
        <div style="width:100%; display:flex; justify-content:center;">
            <div id="comments-modal-handle-${postId}" style="width:48px; height:4px; background:rgba(0,0,0,0.12); border-radius:4px; margin:8px 0;"></div>
        </div>
        <div id="comments-list-${postId}" style="overflow-y:auto; flex:1; padding-bottom:140px;"></div>
        <form id="comment-form-${postId}" class="comment-form" data-post-id="${postId}" 
            style="position:absolute; left:18px; right:18px; bottom:18px; display:flex; gap:8px; align-items:center; margin:0; padding:12px; border-radius:24px; background:#ffffff; box-shadow:0 -2px 16px rgba(0,0,0,0.06);">
            <input type="text" name="content" placeholder="Commenta qui..." class="comment-input" style="flex:1; padding:10px 12px; border-radius:24px; border:1px solid #e3e3e3; box-shadow:none;" />
                <button type="submit" class="comment-send-btn" style="border:none; padding:12px 18px; border-radius:24px;">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
        </form>
    `;

    return modal;
}

function setupModalAnimations(overlay, modal, postId) {
    injectScrollStyle(modal.id, postId);
    
    setTimeout(() => overlay.style.opacity = '1', 10);
    try { modal.classList.remove('notif-closing'); } catch(_) {}
    void modal.offsetHeight;
    requestAnimationFrame(() => {
        try {
            modal.classList.add('notif-open');
            modal.style.bottom = '0';
        } catch(_) {}
    });
    
    setTimeout(() => {
        positionFloatingForm(modal, false);
        animateFloatingForm(modal);
    }, 40);
}

function setupModalInteractions(modal, overlay, postId) {
    const commentsListEl = modal.querySelector(`#comments-list-${postId}`);
    
    overlay.addEventListener('click', () => closeModal(modal, overlay, postId));
    
    if (commentsListEl) {
        setupScrollExpansion(commentsListEl, modal);
        setupPullToClose(commentsListEl, modal, () => closeModal(modal, overlay, postId));
    }
    
    setupCommentForm(modal, postId);
}

function loadComments(postId, modal) {
    const listDiv = modal.querySelector(`#comments-list-${postId}`);
    const clientPost = window.POSTS_BY_ID?.[postId];
    const PREVIEW_LIMIT = 20;
    
    let commentsHtml = [];
    
    if (clientPost?.comments) {
        const avatarSrc = chooseAvatar(clientPost) || '/uploads/avatars/default.png';
        commentsHtml = clientPost.comments.slice().reverse().map(comment => 
            renderCommentHtml(comment, avatarSrc)
        );
    } else {
        commentsHtml = getCommentsFromDOM(postId);
    }
    
    if (commentsHtml.length === 0) {
        listDiv.innerHTML = '<p style="color:#888;text-align:center;margin-top:24px;">Nessun commento.</p>';
    } else {
        renderCommentsWithPagination(listDiv, commentsHtml, postId, PREVIEW_LIMIT);
    }
    
    bindModalCommentHandlers(modal);
}

function renderCommentHtml(comment, fallbackAvatar) {
    const avatar = chooseAvatar(comment) || fallbackAvatar;
    return `
        <div class="comment-row" style="display:flex; align-items:flex-start; gap:10px; margin-bottom:14px; position:relative;">
            <img src="${avatar}" alt="avatar" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
            <div style="flex:1; padding-right:60px; min-width:0; display:block;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong>
                        <a href="/user/${encodeURIComponent(comment.username || '')}" 
                           style="color:inherit; text-decoration:none;">
                            ${escapeHtml(comment.username || 'Utente')}
                        </a>
                    </strong>
                </div>
                <div class="comment-text" style="margin-top:8px;">
                    <span class="comment-text-box">${escapeHtml(comment.content)}</span>
                </div>
            </div>
            <form method="POST" action="/comment/like/${comment.id || ''}" 
                data-comment-id="${comment.id || ''}" class="like-comment-form" 
                style="display:flex; align-items:center; gap:6px; position:absolute; right:8px; top:10px;">
                <span class="comment-like-count" data-comment-id="${comment.id || ''}">
                    ${comment.like_count || 0}
                </span>
                <button type="submit" class="like-btn-modern like-comment-btn" aria-label="Mi piace commento" style="all:unset; width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.15); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.25); display:flex; align-items:center; justify-content:center; color:#e53935; font-size:1.3em; box-shadow:0 2px 10px rgba(0,0,0,0.15); cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.background='rgba(255,255,255,0.3)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(255,255,255,0.15)'; this.style.transform='scale(1)';">
                    <i class='fa-solid fa-heart'></i>
                </button>
            </form>
        </div>
    `;
}

function closeModal(modal, overlay, postId) {
    animateFloatingFormOut(modal);
    
    try { modal.classList.remove('notif-open'); } catch(_) {}
    try { modal.classList.add('notif-closing'); } catch(_) {}
    overlay.style.opacity = '0';
    
    cleanupModal(postId);
    
    setTimeout(() => {
        modal.remove();
        overlay.remove();
        document.body.style.overflow = '';
    }, 340);
}

function positionFloatingForm(modal, expanded) {
    const form = modal.querySelector('.comment-form');
    if (!form) return;
    
    let width = modal.__cachedFloatingFormWidth;
    if (!width) {
        const rect = modal.getBoundingClientRect();
        width = Math.max(200, Math.min(920, Math.floor(rect.width - 36)));
        modal.__cachedFloatingFormWidth = width;
    }
    
    Object.assign(form.style, {
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${width}px`,
        zIndex: '11001',
        transition: 'transform 0.35s cubic-bezier(.2,.8,.2,1), opacity 0.35s cubic-bezier(.2,.8,.2,1), left 0.18s',
        bottom: expanded ? '28px' : '18px'
    });
}

function animateFloatingForm(modal) {
    const form = modal.querySelector('.comment-form');
    if (!form) return;
    
    requestAnimationFrame(() => {
        setTimeout(() => {
            form.style.opacity = '1';
            form.style.transform = 'translateX(-50%) translateY(0)';
        }, 40);
    });
}

function animateFloatingFormOut(modal) {
    const form = modal.querySelector('.comment-form');
    if (form) {
        form.style.opacity = '0';
        form.style.transform = 'translateX(-50%) translateY(24px)';
    }
}

function injectScrollStyle(modalId, postId) {
    try {
        const style = document.createElement('style');
        style.id = `comments-scrollstyle-${postId}`;
        style.textContent = `
            #${modalId} #comments-list-${postId} { 
                scrollbar-width: none; 
                -ms-overflow-style: none; 
            }
            #${modalId} #comments-list-${postId}::-webkit-scrollbar { 
                width: 0; 
                height: 0; 
                display: none; 
            }
        `;
        document.head.appendChild(style);
    } catch (err) {
        console.warn('Scroll style injection failed:', err);
    }
}

function setupScrollExpansion(listEl, modal) {
    if (!listEl || !modal) return;
    const postId = (modal.id || '').split('-').pop();
    const handle = modal.querySelector(`#comments-modal-handle-${postId}`);
    if (!handle) return;

    let expanded = false;
    const toggle = () => {
        expanded = !expanded;
        modal.style.height = expanded ? 'calc(100vh - 28px)' : '50vh';
        positionFloatingForm(modal, expanded);
    };

    handle.addEventListener('click', toggle);
    handle.addEventListener('dblclick', toggle);
}

function setupPullToClose(listEl, modal, onClose) {
    if (!listEl || !modal) return;
    let startY = null;
    let moved = 0;

    listEl.addEventListener('touchstart', (e) => {
        if (!e.touches || !e.touches[0]) return;
        startY = e.touches[0].clientY;
        moved = 0;
    }, { passive: true });

    listEl.addEventListener('touchmove', (e) => {
        if (startY === null) return;
        const y = e.touches[0].clientY;
        moved = y - startY;
        if (moved > 0) {
            modal.style.transform = `translateY(${Math.min(moved, 200)}px)`;
            modal.style.transition = 'transform 0s';
        }
    }, { passive: true });

    const end = () => {
        if (startY === null) return;
        modal.style.transition = '';
        modal.style.transform = '';
        if (moved > 120) {
            try { (typeof onClose === 'function') && onClose(); } catch(_) {}
        }
        startY = null;
        moved = 0;
    };

    listEl.addEventListener('touchend', end);
    listEl.addEventListener('touchcancel', end);
}

function setupCommentForm(modal, postId) {
    if (!modal) return;
    const form = modal.querySelector(`#comment-form-${postId}`) || modal.querySelector('.comment-form');
    if (!form) return;
    if (form.__modalBound) return;
    form.__modalBound = true;

    const input = form.querySelector('.comment-input') || form.querySelector('input[name="content"]');
    const sendBtn = form.querySelector('.comment-send-btn') || form.querySelector('button[type="submit"]');

    const setBtn = () => {
        try {
            if (sendBtn) sendBtn.disabled = !(input && input.value && input.value.trim().length > 0);
        } catch(_) {}
    };

    if (input) {
        input.addEventListener('input', setBtn);
        setBtn();
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (form.dataset.submitting === '1') return;
        const content = (input && input.value || '').trim();
        if (!content) return;
        form.dataset.submitting = '1';

        try {
            const clone = createCommentHTML(content);
            updateModalComments(postId, clone.cloneNode(true));
            updatePostsCache(postId, content);
        } catch (_) {}

        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || 
                         document.querySelector('input[name="csrf_token"]')?.value || '';
        const body = new URLSearchParams();
        body.append('content', content);
        if (csrfToken) body.append('csrf_token', csrfToken);

        fetch(`/comment/${postId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRFToken': csrfToken
            },
            body: body,
            credentials: 'include'
        }).then(resp => {
            if (input) input.value = '';
            form.dataset.submitting = '0';
            setBtn();
        }).catch(err => {
            console.error('comment post failed', err);
            form.dataset.submitting = '0';
            setBtn();
        });
    });
}

function renderCommentsWithPagination(listDiv, commentsHtml, postId, perPage) {
    if (!listDiv) return;
    const normalized = Array.isArray(commentsHtml) ? commentsHtml.map(c => 
        (typeof c === 'string') ? c : (c && c.outerHTML) ? c.outerHTML : String(c || '')
    ) : [];
    listDiv.innerHTML = '';

    const total = normalized.length;
    let shown = 0;

    const loadNext = () => {
        const start = Math.max(0, total - shown - perPage);
        const end = total - shown;
        const chunk = normalized.slice(start, end);
        chunk.forEach(html => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            const el = wrapper.firstElementChild || wrapper;
            listDiv.appendChild(el);
        });
        shown += chunk.length;
    };

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.textContent = 'Carica altri commenti';
    moreBtn.style.cssText = 'margin:12px auto; display:block; padding:8px 12px; border-radius:8px;';
    moreBtn.addEventListener('click', () => {
        loadNext();
        if (shown >= total) moreBtn.remove();
    });

    if (total === 0) return;
    loadNext();
    if (shown < total) listDiv.appendChild(moreBtn);
}

function getCommentsFromDOM(postId) {
    try {
        const list = document.querySelector(`.post[data-post-id="${postId}"] .comments-list`) || 
                    document.querySelector(`.post[data-post-id="${postId}"] .comments`) || 
                    document.getElementById(`comments-list-${postId}`);
        if (!list) return [];
        return Array.from(list.children).map(ch => ch.outerHTML || ch.innerHTML || String(ch));
    } catch (e) {
        return [];
    }
}

function bindModalCommentHandlers(modal) {
    if (!modal) return;
    modal.querySelectorAll('[class*="like-comment-form"]').forEach(f => f.classList.add('like-comment-form'));
    modal.querySelectorAll('button').forEach(b => {
        if (b.closest && b.closest('.like-comment-form')) {
            b.classList.add('like-comment-btn');
        }
    });

    try { bindPostEvents(modal); } catch (e) { console.warn('bindPostEvents failed for modal', e); }

    modal.addEventListener('click', (ev) => {
        const btn = ev.target.closest && ev.target.closest('.like-comment-btn');
        if (!btn) return;
        try {
            const postEl = btn.closest('.post') || modal;
            spawnInkSplashFromElement(btn, postEl, '#e53935');
            btn.classList.add('heartbeat');
            setTimeout(() => btn.classList.remove('heartbeat'), 520);
        } catch (e) {}
    });
}

function cleanupModal(postId) {
    try {
        const s = document.getElementById(`comments-scrollstyle-${postId}`);
        if (s) s.remove();
    } catch(_) {}
    try {
        const modal = document.getElementById(`comments-modal-${postId}`);
        if (modal) modal.__cachedFloatingFormWidth = null;
    } catch(_) {}
}

function updateModalComments(postId, commentClone) {
    try {
        const openModalList = document.getElementById(`comments-list-${postId}`);
        if (openModalList) {
            openModalList.prepend(commentClone);
            bindPostEvents(openModalList);
        }
    } catch(_) {}
}

function updatePostsCache(postId, content) {
    try {
        window.POSTS_BY_ID = window.POSTS_BY_ID || {};
        if (!window.POSTS_BY_ID[postId]) {
            window.POSTS_BY_ID[postId] = { comments: [] };
        }
        
        const avatar = chooseAvatar() || '/uploads/avatars/default.png';
        window.POSTS_BY_ID[postId].comments.push({
            id: 'local-' + Date.now(),
            username: window.LOGGED_USERNAME || 'Tu',
            content: content,
            like_count: 0,
            avatar_url: avatar
        });
    } catch(_) {}
}
