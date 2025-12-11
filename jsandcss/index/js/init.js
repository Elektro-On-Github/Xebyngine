// Main Initialization and Page Setup
document.addEventListener('DOMContentLoaded', () => {
    // Estrai parametro post dall'URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetPostId = urlParams.get('post');
    
    // Page setup controls
    const pages = document.querySelectorAll('.create-page');
    const overlay = document.getElementById('create-overlay');

    const showPage = n => {
        pages.forEach(p => {
            const active = p.dataset.page === String(n);
            p.style.display = active ? '' : 'none';
            p.classList.toggle('page-active', active);
        });

        const el = overlay?.querySelector(n === 1 ? 'textarea' : '[id^="timeline"]');
        el?.focus();


    };

    document.getElementById('to-page-1')?.addEventListener('click', () => showPage(1));
    document.getElementById('to-page-2')?.addEventListener('click', () => showPage(2));
    document.getElementById('fab-create')?.addEventListener('click', () => showPage(1));

    // Initialize all core features
    [startTimers, bindPostEvents, applyCommentCollapse, applyPostCollapse].forEach(fn => {
        try { fn(document); } catch(e) { console.error(`${fn.name} init error`, e); }
    });

    // Load posts based on mode
    if (!window.PROFILE_MODE) {
        try { loadMorePosts(); } catch(e) { console.error('loadMorePosts init error', e); }
        window.addEventListener('scroll', onScroll);
        
        // Se c'è un post target, carica post fino a trovarlo e scrolla
        if (targetPostId) {
            scrollToPost(targetPostId);
        }
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
                    else feed.innerHTML = '<p style="text-align:center;">Nessun post trovato.</p>';
                })
                .catch(() => {
                    document.getElementById('post-feed').innerHTML = '<p style="text-align:center; color:#e53935;">Errore nel caricamento dei post.</p>';
                });
        }
    }

    // Poll setup
    const addPollBtn = document.getElementById('add-poll-btn');
    const pollContainer = document.getElementById('poll-container');
    addPollBtn?.addEventListener('click', () => {
        pollContainer.style.display = pollContainer.style.display === 'none' ? 'block' : 'none';
    });

    const addOptionBtn = document.getElementById('add-option-btn');
    const pollOptionsContainer = document.getElementById('poll-options-container');
    addOptionBtn?.addEventListener('click', () => {
        const inputs = pollOptionsContainer.querySelectorAll('input');
        if (inputs.length && !inputs[inputs.length - 1].value.trim()) {
            return inputs[inputs.length - 1].focus();
        }
        if (inputs.length >= 6) return alert("Massimo 6 opzioni!");
        const newOption = Object.assign(document.createElement('input'), {
            type: 'text',
            name: `poll_option_${inputs.length + 1}`,
            placeholder: `Opzione ${inputs.length + 1}`,
            className: 'poll-input',
            style: 'box-sizing:border-box;width:100%'
        });
        pollOptionsContainer.appendChild(newOption);
        newOption.focus();
    });

    // Initialize search mode if applicable
    if (INDEX_SEARCH_MODE) {
        const feed = document.getElementById("post-feed");
        if (feed) feed.innerHTML = "";
    }
});

// === POST SHARING ===
function openShareModal(postId) {
    let modal = document.getElementById('share-post-modal');
    
    if (!modal) {
        createShareModal();
        modal = document.getElementById('share-post-modal');
    }
    
    modal.dataset.postId = postId;
    showShareModal();
    loadShareContacts();
}

function createShareModal() {
    const modal = document.createElement('div');
    modal.id = 'share-post-modal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255,255,255,0);
        backdrop-filter: blur(0px);
        -webkit-backdrop-filter: blur(0px);
        z-index: 9999;
        transition: background 0.4s cubic-bezier(0.1, 0.9, 0.2, 1), backdrop-filter 0.4s cubic-bezier(0.1, 0.9, 0.2, 1), -webkit-backdrop-filter 0.4s cubic-bezier(0.1, 0.9, 0.2, 1);
    `;
    
    modal.innerHTML = `
        <div id="share-modal-content" style="
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%) translateY(100%);
            background: white;
            border-radius: 20px 20px 0 0;
            padding: 20px;
            width: 100%;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
            box-sizing: border-box;
            transition: transform 0.4s cubic-bezier(0.1, 0.9, 0.2, 1);
        ">
            <div style="display: flex; justify-content:center; align-items: center; margin-bottom: 16px;">
                <h2 style="margin: 0; font-size: 18px; padding: 6px; text-align: center;">Condividi Post</h2>
            </div>
            
            <div style="margin-bottom: 12px;">
                <input type="text" id="share-search-input" placeholder="Cerca contatti..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 50px; box-sizing: border-box;">
            </div>
            
            <div id="share-contacts-list" style="max-height: 400px; overflow-y: auto;"></div>
            
            <div style="margin-top: 16px;">
                <label style="display: block; margin-bottom: 8px;">Messaggio (opzionale):</label>
                <input type="text" id="share-message-input" placeholder="Es: Guarda questo post!" maxlength="100" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 50px; box-sizing: border-box;">
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeShareModal();
    });
    
    document.getElementById('share-search-input').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.share-contact-item');
        items.forEach(item => {
            const name = item.dataset.username.toLowerCase();
            item.style.display = name.includes(query) ? '' : 'none';
        });
    });
}

function showShareModal() {
    const modal = document.getElementById('share-post-modal');
    const content = document.getElementById('share-modal-content');
    
    modal.style.display = 'block';
    modal.style.background = 'rgba(255,255,255,0)';
    modal.style.backdropFilter = 'blur(0px)';
    modal.style.webkitBackdropFilter = 'blur(0px)';
    content.style.transform = 'translateX(-50%) translateY(100%)';
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modal.style.background = 'rgba(255,255,255,0.1)';
            modal.style.backdropFilter = 'blur(8px)';
            modal.style.webkitBackdropFilter = 'blur(8px)';
            content.style.transform = 'translateX(-50%) translateY(0)';
        });
    });
}

function closeShareModal() {
    const modal = document.getElementById('share-post-modal');
    const content = document.getElementById('share-modal-content');
    
    modal.style.background = 'rgba(255,255,255,0)';
    modal.style.backdropFilter = 'blur(0px)';
    modal.style.webkitBackdropFilter = 'blur(0px)';
    content.style.transform = 'translateX(-50%) translateY(100%)';
    
    setTimeout(() => {
        modal.style.display = 'none';
    }, 400);
}

function loadShareContacts() {
    const list = document.getElementById('share-contacts-list');
    list.innerHTML = '<p style="text-align: center; color: #999;">Caricamento...</p>';
    
    fetch('/get_chat_users')
        .then(r => r.json())
        .then(data => {
            if (!data.users || data.users.length === 0) {
                list.innerHTML = '<p style="text-align: center; color: #999;">Nessun contatto disponibile</p>';
                return;
            }
            
            list.innerHTML = '';
            data.users.forEach(user => {
                const item = document.createElement('div');
                item.className = 'share-contact-item';
                item.dataset.username = user.username;
                item.dataset.userId = user.id;
                item.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px;
                    margin-bottom: 8px;
                    background: #f5f5f5;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                `;
                
                item.innerHTML = `
                    <img src="${user.avatar_url || '/uploads/avatars/default.png'}" alt="avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${escapeHtml(user.username)}</div>
                    </div>
                `;
                
                item.addEventListener('click', () => sharePostToUser(user.id, user.username));
                item.addEventListener('mouseover', () => item.style.background = '#efefef');
                item.addEventListener('mouseout', () => item.style.background = '#f5f5f5');
                
                list.appendChild(item);
            });
        })
        .catch(err => {
            console.error('Errore caricamento contatti:', err);
            list.innerHTML = '<p style="text-align: center; color: #e53935;">Errore nel caricamento</p>';
        });
}

function sharePostToUser(userId, username) {
    const modal = document.getElementById('share-post-modal');
    const postId = modal.dataset.postId;
    const messageText = document.getElementById('share-message-input').value.trim() || 'Ti ho condiviso un post';
    
    const formData = new FormData();
    formData.append('post_id', postId);
    formData.append('receiver_id', userId);
    formData.append('message_text', messageText);
    
    fetch('/share_post', {
        method: 'POST',
        body: formData
    })
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        
        modal.style.display = 'none';
        alert(`Post condiviso con ${username}!`);
    })
    .catch(err => {
        console.error('Errore sharing:', err);
        alert('Errore nella condivisione. Riprova.');
    });
}

// === SCROLL TO POST ===
function scrollToPost(postId) {
    // Controlla se il post è già in DOM
    const postElement = document.querySelector(`[data-post-id="${postId}"]`);
    
    if (postElement) {
        // Post già caricato, scrolla direttamente
        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightPost(postElement);
        return;
    }
    
    // Post non trovato, carica post fino a trovarlo
    const maxAttempts = 2;
    let attempts = 0;
    
    const checkAndScroll = () => {
        const post = document.querySelector(`[data-post-id="${postId}"]`);
        
        if (post) {
            // Post trovato!
            post.scrollIntoView({ behavior: 'smooth', block: 'center' });
            highlightPost(post);
            return;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
            // Carica altri post e controlla di nuovo
            loadMorePosts();
            // Attendi un po' e riprova
            setTimeout(checkAndScroll, 500);
        } else {
            console.warn(`Post ${postId} non trovato dopo ${maxAttempts} tentativi`);
        }
    };
    
    // Avvia la ricerca
    checkAndScroll();
}

function highlightPost(postElement) {
    // Aggiungi evidenziazione visiva
    postElement.style.boxShadow = '0 0 0 3px var(--primary), 0 4px 12px rgba(144,16,16,.3)';
    postElement.style.transition = 'box-shadow 0.3s ease';
    
    // Rimuovi l'evidenziazione dopo 3 secondi
    setTimeout(() => {
        postElement.style.boxShadow = '';
    }, 3000);
}
