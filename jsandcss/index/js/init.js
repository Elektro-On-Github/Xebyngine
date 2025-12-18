document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetPostId = urlParams.get('post');
    const pages = document.querySelectorAll('.create-page');
    const overlay = document.getElementById('create-overlay');

    const showPage = n => {
        pages.forEach(p => {
            const active = p.dataset.page === String(n);
            p.style.display = active ? '' : 'none';
            p.classList.toggle('page-active', active);
        });
        overlay?.querySelector(n === 1 ? 'textarea' : '[id^="timeline"]')?.focus();
    };

    document.getElementById('to-page-1')?.addEventListener('click', () => showPage(1));
    document.getElementById('to-page-2')?.addEventListener('click', () => showPage(2));
    document.getElementById('fab-create')?.addEventListener('click', () => showPage(1));

    [startTimers, bindPostEvents, applyCommentCollapse, applyPostCollapse].forEach(fn => {
        try { fn(document); } catch(e) { console.error(`${fn.name} init error`, e); }
    });

    if (!window.PROFILE_MODE) {
        loadMorePosts();
        window.addEventListener('scroll', onScroll);
        if (targetPostId) scrollToPost(targetPostId);
    } else {
        const username = document.querySelector('.main h2')?.textContent?.trim();
        (Array.isArray(SERVER_PROFILE_POSTS) ? SERVER_PROFILE_POSTS : []).forEach(appendPostToFeed);
        
        if (username) {
            fetch(`/user/${encodeURIComponent(username)}?json=1`)
                .then(r => r.json())
                .then(data => {
                    const feed = document.getElementById('post-feed');
                    feed.innerHTML = '';
                    if (data.posts?.length) data.posts.forEach(appendPostToFeed);
                    else feed.innerHTML = '<p class="status-msg">Nessun post trovato.</p>';
                })
                .catch(() => {
                    document.getElementById('post-feed').innerHTML = '<p class="status-msg error">Errore nel caricamento dei post.</p>';
                });
        }
    }

    // Poll setup
    const pollContainer = document.getElementById('poll-container');
    const pollOptionsContainer = document.getElementById('poll-options-container');
    
    document.getElementById('add-poll-btn')?.addEventListener('click', () => {
        pollContainer.style.display = pollContainer.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('add-option-btn')?.addEventListener('click', () => {
        const inputs = pollOptionsContainer.querySelectorAll('input');
        if (inputs.length && !inputs[inputs.length - 1].value.trim()) {
            return inputs[inputs.length - 1].focus();
        }
        if (inputs.length >= 6) return alert("Massimo 6 opzioni!");
        
        const newOption = Object.assign(document.createElement('input'), {
            type: 'text',
            name: `poll_option_${inputs.length + 1}`,
            placeholder: `Opzione ${inputs.length + 1}`,
            className: 'poll-input'
        });
        pollOptionsContainer.appendChild(newOption);
        newOption.focus();
    });

    if (INDEX_SEARCH_MODE) {
        const feed = document.getElementById("post-feed");
        if (feed) feed.innerHTML = "";
    }
});

// ===== SHARE MODAL =====
function openShareModal(postId) {
    let modal = document.getElementById('share-post-modal');
    if (!modal) modal = createShareModal();
    modal.dataset.postId = postId;
    modal.style.display = 'block';
    requestAnimationFrame(() => modal.classList.add('visible'));
    loadShareContacts();
}

function createShareModal() {
    const modal = document.createElement('div');
    modal.id = 'share-post-modal';
    modal.innerHTML = `
        <div id="share-modal-content">
            <div class="share-header"><h2>Condividi Post</h2></div>
            <div class="share-search-wrap">
                <input type="text" id="share-search-input" class="share-input" placeholder="Cerca contatti...">
            </div>
            <div id="share-contacts-list"></div>
            <div class="share-message-wrap">
                <label>Messaggio:</label>
                <input type="text" id="share-message-input" class="share-input" placeholder="Invia un messaggio..." maxlength="100">
            </div>
            <button id="share-send-btn" class="share-send-btn" disabled>Invia</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', e => e.target === modal && closeShareModal());
    
    document.getElementById('share-search-input').addEventListener('input', e => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.share-contact-item').forEach(item => {
            item.style.display = item.dataset.username.toLowerCase().includes(query) ? 'flex' : 'none';
        });
    });

    document.getElementById('share-send-btn').addEventListener('click', async () => {
    const selected = document.querySelectorAll('.share-contact-item.selected');
    if (!selected.length) return;
    
    const modal = document.getElementById('share-post-modal');
    const postId = modal.dataset.postId;
    const message = document.getElementById('share-message-input').value.trim() || 'Ti ho condiviso un post';
    
    // Crea tutte le richieste in parallelo
    const requests = Array.from(selected).map(item => {
        const formData = new FormData();
        formData.append('post_id', postId);
        formData.append('receiver_id', item.dataset.userId);
        formData.append('message_text', message);
        return fetch('/share_post', { method: 'POST', body: formData });
    });
    
    try {
        await Promise.all(requests);
        closeShareModal();
        alert(`Post condiviso con ${selected.length} contatt${selected.length > 1 ? 'i' : 'o'}!`);
    } catch {
        alert('Errore nella condivisione. Riprova.');
    }
});
return modal;
}

function closeShareModal() {
    const modal = document.getElementById('share-post-modal');
    modal.classList.remove('visible');
    document.querySelectorAll('.share-contact-item.selected').forEach(el => el.classList.remove('selected'));
    const btn = document.getElementById('share-send-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Invia';
    }
    setTimeout(() => modal.style.display = 'none', 400);
}

function loadShareContacts() {
    const list = document.getElementById('share-contacts-list');
    list.innerHTML = '<p class="status-msg">Caricamento...</p>';

    fetch('/get_chat_users')
        .then(r => r.json())
        .then(data => {
            if (!data.users?.length) {
                list.innerHTML = '<p class="status-msg">Nessun contatto disponibile</p>';
                return;
            }

            list.innerHTML = data.users.map(user => `
                <div class="share-contact-item" data-username="${escapeHtml(user.username)}" data-user-id="${user.id}">
                    <img class="share-contact-avatar" src="${user.avatar_url || '/uploads/avatars/default.png'}" alt="">
                    <div class="share-contact-name">${escapeHtml(user.username)}</div>
                </div>
            `).join('');

            list.querySelectorAll('.share-contact-item').forEach(item => {
                item.addEventListener('click', () => {
                    item.classList.toggle('selected');
                    const hasSelection = document.querySelector('.share-contact-item.selected');
                    document.getElementById('share-send-btn').disabled = !hasSelection;
                });
            });
        })
        .catch(() => {
            list.innerHTML = '<p class="status-msg error">Errore nel caricamento</p>';
        });
}

function sharePostToUser(userId, username) {
    const modal = document.getElementById('share-post-modal');
    const formData = new FormData();
    formData.append('post_id', modal.dataset.postId);
    formData.append('receiver_id', userId);
    formData.append('message_text', document.getElementById('share-message-input').value.trim() || 'Ti ho condiviso un post');

    fetch('/share_post', { method: 'POST', body: formData })
        .then(r => {
            if (!r.ok) throw new Error();
            closeShareModal();
            alert(`Post condiviso con ${username}!`);
        })
        .catch(() => alert('Errore nella condivisione. Riprova.'));
}

function sendSelectedShare() {
    const selected = document.querySelector('.share-contact-item.selected');
    if (!selected) return;
    
    const modal = document.getElementById('share-post-modal');
    const btn = document.getElementById('share-send-btn');
    btn.disabled = true;
    btn.textContent = 'Invio...';
    
    const formData = new FormData();
    formData.append('post_id', modal.dataset.postId);
    formData.append('receiver_id', selected.dataset.userId);
    formData.append('message_text', document.getElementById('share-message-input').value.trim() || 'Ti ho condiviso un post');

    fetch('/share_post', { method: 'POST', body: formData })
        .then(r => {
            if (!r.ok) throw new Error();
            closeShareModal();
            alert(`Post condiviso con ${selected.dataset.username}!`);
        })
        .catch(() => {
            alert('Errore nella condivisione. Riprova.');
            btn.disabled = false;
            btn.textContent = 'Invia';
        });
}

// ===== SCROLL TO POST =====
function scrollToPost(postId, attempts = 0) {
    const post = document.querySelector(`[data-post-id="${postId}"]`);
    
    if (post) {
        post.scrollIntoView({ behavior: 'smooth', block: 'center' });
        post.classList.add('post-highlight');
        setTimeout(() => post.classList.remove('post-highlight'), 3000);
        return;
    }

    if (attempts < 2) {
        loadMorePosts();
        setTimeout(() => scrollToPost(postId, attempts + 1), 500);
    }
}