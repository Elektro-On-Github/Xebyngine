// Fullscreen Search Overlay

document.addEventListener('DOMContentLoaded', function() {
    const overlay = document.getElementById('search-overlay');
    const openBtn = document.getElementById('open-search-overlay');
    if (!overlay || !openBtn) return;

    const elements = initializeElements();
    setupEventListeners(elements);
});

function initializeElements() {
    return {
        overlay: document.getElementById('search-overlay'),
        openBtn: document.getElementById('open-search-overlay'),
        closeBtn: document.getElementById('close-search-overlay'),
        input: document.getElementById('overlay-search-input'),
        resultsDiv: document.getElementById('overlay-results'),
        historyDiv: document.getElementById('overlay-history'),
        sendBtn: document.getElementById('overlay-send-btn'),
        clearBtn: document.getElementById('overlay-clear-btn')
    };
}

function setupEventListeners({ overlay, openBtn, closeBtn, input, sendBtn, clearBtn, historyDiv }) {
    openBtn.addEventListener('click', showOverlay);
    closeBtn?.addEventListener('click', hideOverlay);
    overlay.addEventListener('click', (e) => e.target === overlay && hideOverlay());

    if (input) {
        let searchTimeout = null;
        
        input.addEventListener('input', debounceSearch(searchTimeout, input, historyDiv));
        input.addEventListener('keydown', (e) => e.key === 'Enter' && performSearch(input.value));
        
        sendBtn?.addEventListener('click', () => performSearch(input.value));
        clearBtn?.addEventListener('click', () => clearSearch(input, historyDiv));
    }
}

function showOverlay() {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('overlay-search-input');
    
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => input?.focus(), 80);
    renderSearchHistory();
}

function hideOverlay() {
    const overlay = document.getElementById('search-overlay');
    const panel = overlay.querySelector('.overlay-panel');
    const input = document.getElementById('overlay-search-input');
    const resultsDiv = document.getElementById('overlay-results');
    
    overlay.classList.remove('open');
    
    const cleanup = () => {
        document.body.style.overflow = '';
        input.value = '';
        resultsDiv.innerHTML = '';
    };
    
    if (panel) {
        panel.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 500);
    } else {
        cleanup();
    }
}

function debounceSearch(timeout, input, historyDiv) {
    return (e) => {
        const query = e.target.value.trim();
        clearTimeout(timeout);
        
        if (historyDiv) historyDiv.innerHTML = '';
        if (!query) {
            document.getElementById('overlay-results').innerHTML = '';
            return;
        }
        
        timeout = setTimeout(() => fetchSuggestions(query), 200);
    };
}

async function performSearch(query) {
    if (!query.trim()) return;
    window.location.href = `/?q=${encodeURIComponent(query)}`;
}

function clearSearch(input, historyDiv) {
    input.value = '';
    document.getElementById('overlay-results').innerHTML = '';
    renderSearchHistory();
    input.focus();
}

async function renderSearchHistory() {
    const historyDiv = document.getElementById('overlay-history');
    if (!historyDiv) return;

    try {
        const response = await fetch('/crono');
        const history = response.ok ? await response.json() : [];
        
        historyDiv.innerHTML = history.length 
            ? renderHistoryItems(history)
            : '<p style="color:#665;">Nessuna ricerca recente.</p>';
            
    } catch (error) {
        console.error('History render error:', error);
        historyDiv.innerHTML = '<p style="color:#646464;">Nessuna ricerca recente.</p>';
    }
}

function renderHistoryItems(history) {
    return history.map(item => `
        <div class="history-item" style="display:flex; align-items:center; justify-content:space-between; padding:6px 4px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <img src="${chooseAvatar(item) || '/uploads/avatars/default.png'}" 
                     style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                <a href="/user/${encodeURIComponent(item.username)}" 
                   style="color:#901010; text-decoration:none;">
                    ${item.username}
                </a>
            </div>
            <button class="delete-history" 
                    style="background:none; border:none; cursor:pointer;"
                    onclick="deleteHistoryItem('${encodeURIComponent(item.username)}')">
                ✕
            </button>
        </div>
    `).join('');
}

async function deleteHistoryItem(username) {
    await fetch('/crono/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${username}`
    });
    renderSearchHistory();
}

async function fetchSuggestions(query) {
    const resultsDiv = document.getElementById('overlay-results');
    if (!resultsDiv) return;

    try {
        const [users, posts] = await Promise.all([
            fetchUsers(query),
            fetchPosts(query)
        ]);

        renderSearchResults({ users, posts }, query);
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<p style="color:var(--muted)">Errore durante la ricerca.</p>';
    }
}

async function fetchUsers(query) {
    try {
        const response = await fetch(`/usernames_preview?q=${encodeURIComponent(query)}`);
        return response.ok ? await response.json() : [];
    } catch {
        return [];
    }
}

async function fetchPosts(query) {
    try {
        const response = await fetch(`/search_posts?q=${encodeURIComponent(query)}&limit=20`);
        const posts = response.ok ? await response.json() : [];
        return posts.length > 0 ? posts : searchLocalPosts(query);
    } catch {
        return searchLocalPosts(query);
    }
}

function searchLocalPosts(query) {
    if (!window.POSTS_BY_ID || !query) return [];
    
    const queryLower = query.toLowerCase();
    return Object.values(window.POSTS_BY_ID)
        .filter(post => post?.content?.toLowerCase().includes(queryLower))
        .slice(0, 12)
        .map(post => ({ 
            id: post.id, 
            content: post.content, 
            username: post.username 
        }));
}

function renderSearchResults(data, query) {
    const resultsDiv = document.getElementById('overlay-results');
    const { users = [], posts = [] } = data;
    
    const filteredPosts = filterPostsByQuery(posts, query);
    
    if (!users.length && !filteredPosts.length) {
        resultsDiv.innerHTML = '<p style="color:var(--muted)">Nessun risultato.</p>';
        return;
    }
    
    resultsDiv.innerHTML = `
        ${renderUsersSection(users)}
        ${renderPostsSection(filteredPosts, query)}
    `;
    
    attachResultHandlers();
}

function filterPostsByQuery(posts, query) {
    if (!query) return posts;
    
    const queryLower = query.toLowerCase();
    return posts.filter(post => 
        post?.content?.toLowerCase().includes(queryLower)
    );
}

function renderUsersSection(users) {
    if (!users.length) return '';
    
    return `
        <section class="search-section">
            <h3 class="section-title">Utenti</h3>
            <div class="users-list">
                ${users.map(user => `
                    <div class="user-result" data-username="${user.username || user}">
                        <div class="user-info">
                            <img src="${chooseAvatar(user) || '/uploads/avatars/default.png'}" 
                                 class="user-avatar">
                            <span class="username">${user.username || user}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
}

function renderPostsSection(posts, query) {
    if (!posts.length) return '';
    
    return `
        <div style="height:18px;"></div>
        <section class="search-section">
            <h3 class="section-title">Post</h3>
            <div class="posts-list">
                ${posts.slice(0, 20).map(post => `
                    <div class="post-result" data-post-id="${post.id}">
                        <div class="post-title">
                            ${post.title || post.content?.substring(0, 60) || `Post ${post.id}`}
                        </div>
                        <div class="post-snippet">
                            ${post.content?.substring(0, 140) || ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
}

function attachResultHandlers() {
    attachUserHandlers();
    attachPostHandlers();
}

function attachUserHandlers() {
    document.querySelectorAll('.user-result').forEach(userEl => {
        const username = userEl.dataset.username;
        userEl.addEventListener('click', async () => {
            window.location.href = `/user/${encodeURIComponent(username)}`;
        });
    });
}

function attachPostHandlers() {
    document.querySelectorAll('.post-result').forEach(postEl => {
        postEl.addEventListener('click', () => {
            const qInput = document.getElementById('overlay-search-input');
            let query = qInput?.value?.trim();
            if (!query) {
                const snippet = postEl.querySelector('.post-snippet')?.textContent || '';
                query = snippet.split(/\s+/).filter(Boolean)[0] || '';
            }
            if (query) startFilteredFeed(query);
        });
    });
}

function startFilteredFeed(query) {
    if (!query) return;
    query = query.trim();
    try { hideOverlay(); } catch(_) {}

    const feed = document.getElementById('post-feed');
    if (!feed) return;

    window.FILTERING = true;
    window.FILTER_QUERY = query;
    window.FILTERED_RESULTS = [];
    window.FILTER_INDEX = 0;
    window.FILTER_EXHAUSTED = false;

    feed.innerHTML = `<div id="filter-bar" style="padding:12px; text-align:center; background:rgba(255,255,255,0.98); box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <strong>Filtrando per:</strong> "${escapeHtml(query)}" &nbsp;
        <button id="clear-filter-btn" style="background:#901010;color:#fff;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;">Mostra tutti i post</button>
    </div>`;

    document.getElementById('clear-filter-btn')?.addEventListener('click', clearFilterMode);

    (async () => {
        try {
            const resp = await fetch(`/search_posts?q=${encodeURIComponent(query)}&limit=200`);
            const data = resp.ok ? await resp.json() : null;
            const posts = (data && data.posts) ? data.posts : [];
            window.FILTERED_RESULTS = (posts.length ? posts : searchLocalPosts(query)) || [];
        } catch (e) {
            window.FILTERED_RESULTS = searchLocalPosts(query) || [];
        }

        if (!window.FILTERED_RESULTS.length) {
            feed.innerHTML += `<p style="padding:18px; text-align:center; color:var(--muted);">Nessun post filtrato trovato. Verranno mostrati i post normali.</p>`;
            window.FILTER_EXHAUSTED = true;
            window.FILTERING = false;
            loadMorePosts();
            return;
        }

        appendFilteredBatch();
    })();
}

function appendFilteredBatch(batchSize = 8) {
    if (!window.FILTERING) return;
    const feed = document.getElementById('post-feed');
    if (!feed) return;

    const start = window.FILTER_INDEX || 0;
    const results = window.FILTERED_RESULTS || [];
    const slice = results.slice(start, start + batchSize);
    slice.forEach(p => appendPostToFeed(p));
    window.FILTER_INDEX = start + slice.length;

    if (slice.length) {
        const last = slice[slice.length - 1];
        try {
            lastId = last.id || lastId;
            lastExpiresAt = last.expires_at || lastExpiresAt;
        } catch(_) {}
    }

    if (window.FILTER_INDEX >= results.length) {
        window.FILTER_EXHAUSTED = true;
        window.FILTERING = false;
        setTimeout(() => loadMorePosts(), 80);
    }
}

function clearFilterMode() {
    window.FILTERING = false;
    window.FILTER_QUERY = null;
    window.FILTERED_RESULTS = [];
    window.FILTER_INDEX = 0;
    window.FILTER_EXHAUSTED = false;

    const feed = document.getElementById('post-feed');
    if (!feed) return;
    feed.innerHTML = '';
    lastId = 0;
    lastExpiresAt = 0;
    loading = false;
    try { window.addEventListener('scroll', onScroll, { passive: true }); } catch(_) {}
    loadMorePosts();
}

// Allow pressing Enter in search input
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('overlay-search-input');
    const sendBtn = document.getElementById('overlay-send-btn');
    if (!input || !sendBtn) return;

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            sendBtn.click?.();
        }
    });
});
