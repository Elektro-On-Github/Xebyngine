// Comments Modal System

function showCommentsModal(postId) {
    const modalId = `comments-modal-${postId}`;
    if (document.getElementById(modalId)) return;

    const overlay = createOverlay(postId);
    const modal = createModal(postId);
    
    document.body.append(overlay, modal);
    document.body.style.overflow = 'hidden';
    
    requestAnimationFrame(() => {
        overlay.classList.add('active');
        modal.classList.add('open');
    });
    
    setupFloatingForm(modal);
    setupModalInteractions(modal, overlay, postId);
    loadComments(postId, modal);
}

function createOverlay(postId) {
    const overlay = document.createElement('div');
    overlay.id = `comments-overlay-${postId}`;
    overlay.className = 'comments-overlay';
    return overlay;
}

function createModal(postId) {
    const modal = document.createElement('div');
    modal.id = `comments-modal-${postId}`;
    modal.className = 'comments-modal';
    modal.innerHTML = `
        <div class="comments-modal-handle-wrap">
            <div class="comments-modal-handle" id="comments-modal-handle-${postId}"></div>
        </div>
        <div id="comments-list-${postId}" class="comments-modal-list"></div>
        <form id="comment-form-${postId}" class="comment-form" data-post-id="${postId}">
            <input type="text" name="content" placeholder="Commenta qui..." class="comment-input">
            <button type="submit" class="comment-send-btn">
                <i class="fa-solid fa-paper-plane"></i>
            </button>
        </form>`;
    return modal;
}

function setupFloatingForm(modal) {
    const form = modal.querySelector('.comment-form');
    if (!form) return;
    
    const width = Math.max(200, Math.min(920, modal.getBoundingClientRect().width - 36));
    form.style.width = `${width}px`;
    form.classList.add('floating');
    
    requestAnimationFrame(() => setTimeout(() => form.classList.add('visible'), 40));
}

function setupModalInteractions(modal, overlay, postId) {
    const listEl = modal.querySelector(`#comments-list-${postId}`);
    const handle = modal.querySelector(`#comments-modal-handle-${postId}`);
    
    overlay.addEventListener('click', () => closeModal(modal, overlay));
    
    if (handle) {
        const toggle = () => {
            modal.classList.toggle('expanded');
            modal.querySelector('.comment-form')?.classList.toggle('expanded');
        };
        handle.addEventListener('click', toggle);
        handle.addEventListener('dblclick', toggle);
    }
    
    if (listEl) setupPullToClose(listEl, modal, () => closeModal(modal, overlay));
    setupCommentForm(modal, postId);
}

function loadComments(postId, modal) {
    const listDiv = modal.querySelector(`#comments-list-${postId}`);
    const clientPost = window.POSTS_BY_ID?.[postId];
    
    let commentsHtml = clientPost?.comments
        ? clientPost.comments.slice().reverse().map(c => 
            renderCommentHtml(c, chooseAvatar(clientPost) || '/uploads/avatars/default.png'))
        : getCommentsFromDOM(postId);
    
    if (!commentsHtml.length) {
        listDiv.innerHTML = '<p class="comments-empty">Nessun commento.</p>';
    } else {
        renderCommentsWithPagination(listDiv, commentsHtml, 20);
    }
    
    bindModalCommentHandlers(modal);
}

function renderCommentHtml(comment, fallbackAvatar) {
    const avatar = chooseAvatar(comment) || fallbackAvatar;
    const id = comment.id || '';
    return `
        <div class="comment-row">
            <img src="${avatar}" alt="avatar" class="comment-avatar">
            <div class="comment-content">
                <div class="comment-header">
                    <strong><a href="/user/${encodeURIComponent(comment.username || '')}" class="comment-username">${escapeHtml(comment.username || 'Utente')}</a></strong>
                </div>
                <div class="comment-text"><span class="comment-text-box">${escapeHtml(comment.content)}</span></div>
            </div>
            <form method="POST" action="/comment/like/${id}" data-comment-id="${id}" class="like-comment-form">
                <span class="comment-like-count" data-comment-id="${id}">${comment.like_count || 0}</span>
                <button type="submit" class="like-btn-modern like-comment-btn" aria-label="Mi piace commento">
                    <i class="fa-solid fa-heart"></i>
                </button>
            </form>
        </div>`;
}

function closeModal(modal, overlay) {
    const form = modal.querySelector('.comment-form');
    if (form) {
        form.classList.remove('visible');
        form.classList.add('hiding');
    }
    
    modal.classList.remove('open');
    overlay.classList.remove('active');
    
    setTimeout(() => {
        modal.remove();
        overlay.remove();
        document.body.style.overflow = '';
    }, 340);
}

function setupPullToClose(listEl, modal, onClose) {
    let startY = null, moved = 0;

    listEl.addEventListener('touchstart', e => {
        if (e.touches?.[0]) { startY = e.touches[0].clientY; moved = 0; }
    }, { passive: true });

    listEl.addEventListener('touchmove', e => {
        if (startY === null) return;
        moved = e.touches[0].clientY - startY;
        if (moved > 0) {
            modal.style.transform = `translateY(${Math.min(moved, 200)}px)`;
            modal.style.transition = 'none';
        }
    }, { passive: true });

    const end = () => {
        if (startY === null) return;
        modal.style.transition = '';
        modal.style.transform = '';
        if (moved > 120) onClose?.();
        startY = null;
    };

    listEl.addEventListener('touchend', end);
    listEl.addEventListener('touchcancel', end);
}

function setupCommentForm(modal, postId) {
    const form = modal.querySelector('.comment-form');
    if (!form || form.__bound) return;
    form.__bound = true;

    const input = form.querySelector('.comment-input');
    const sendBtn = form.querySelector('.comment-send-btn');
    const updateBtn = () => sendBtn && (sendBtn.disabled = !input?.value?.trim());

    input?.addEventListener('input', updateBtn);
    updateBtn();

    form.addEventListener('submit', e => {
        e.preventDefault();
        if (form.dataset.submitting === '1') return;
        
        const content = input?.value?.trim();
        if (!content) return;
        form.dataset.submitting = '1';

        updateModalComments(postId, createCommentHTML(content).cloneNode(true));
        updatePostsCache(postId, content);

        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || 
                     document.querySelector('input[name="csrf_token"]')?.value || '';
        const body = new URLSearchParams({ content });
        if (csrf) body.append('csrf_token', csrf);

        fetch(`/comment/${postId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrf },
            body,
            credentials: 'include'
        }).finally(() => {
            if (input) input.value = '';
            form.dataset.submitting = '0';
            updateBtn();
        });
    });
}

function renderCommentsWithPagination(listDiv, commentsHtml, perPage) {
    const items = commentsHtml.map(c => typeof c === 'string' ? c : c?.outerHTML || String(c));
    listDiv.innerHTML = '';
    
    const total = items.length;
    let shown = 0;

    const loadNext = () => {
        const start = Math.max(0, total - shown - perPage);
        items.slice(start, total - shown).forEach(html => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            listDiv.appendChild(wrapper.firstElementChild || wrapper);
        });
        shown += total - shown - start;
    };

    loadNext();
    
    if (shown < total) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'comments-load-more';
        btn.textContent = 'Carica altri commenti';
        btn.addEventListener('click', () => { loadNext(); if (shown >= total) btn.remove(); });
        listDiv.appendChild(btn);
    }
}

function getCommentsFromDOM(postId) {
    const list = document.querySelector(`.post[data-post-id="${postId}"] .comments-list, .post[data-post-id="${postId}"] .comments`) || 
                 document.getElementById(`comments-list-${postId}`);
    return list ? [...list.children].map(c => c.outerHTML) : [];
}

function bindModalCommentHandlers(modal) {
    modal.querySelectorAll('[class*="like-comment-form"]').forEach(f => f.classList.add('like-comment-form'));
    modal.querySelectorAll('.like-comment-form button').forEach(b => b.classList.add('like-comment-btn'));

    try { bindPostEvents(modal); } catch(e) { console.warn('bindPostEvents failed:', e); }

    modal.addEventListener('click', e => {
        const btn = e.target.closest?.('.like-comment-btn');
        if (!btn) return;
        spawnInkSplashFromElement?.(btn, btn.closest('.post') || modal, '#e53935');
        btn.classList.add('heartbeat');
        setTimeout(() => btn.classList.remove('heartbeat'), 520);
    });
}

function updateModalComments(postId, clone) {
    const list = document.getElementById(`comments-list-${postId}`);
    if (list) { list.prepend(clone); bindPostEvents?.(list); }
}

function updatePostsCache(postId, content) {
    window.POSTS_BY_ID ||= {};
    window.POSTS_BY_ID[postId] ||= { comments: [] };
    window.POSTS_BY_ID[postId].comments.push({
        id: 'local-' + Date.now(),
        username: window.LOGGED_USERNAME || 'Tu',
        content,
        like_count: 0,
        avatar_url: chooseAvatar() || '/uploads/avatars/default.png'
    });
}