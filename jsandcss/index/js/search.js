// Fullscreen Search Overlay

(function () {
    const overlay = document.getElementById('search-overlay');
    const openBtn = document.getElementById('open-search-overlay');
    if (!overlay || !openBtn) return;

    const closeBtn = document.getElementById('close-search-overlay');
    const input = document.getElementById('overlay-search-input');
    const resultsDiv = document.getElementById('overlay-results');
    const historyDiv = document.getElementById('overlay-history');
    const sendBtn = document.getElementById('overlay-send-btn');
    const clearBtn = document.getElementById('overlay-clear-btn');

    let debounceTimer = null;

    // Event Listeners
    openBtn.addEventListener('click', showOverlay);
    closeBtn?.addEventListener('click', hideOverlay);
    overlay.addEventListener('click', e => e.target === overlay && hideOverlay());

    if (input) {
        input.addEventListener('input', handleInput);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                performSearch(input.value);
            }
        });
        sendBtn?.addEventListener('click', () => performSearch(input.value));
        clearBtn?.addEventListener('click', clearSearch);
    }

    function showOverlay() {
        overlay.classList.add('open');
        document.body.classList.add('body-overlay-open');
        setTimeout(() => input?.focus(), 80);
        renderHistory();
    }

    function hideOverlay() {
        overlay.classList.remove('open');
        const panel = overlay.querySelector('.overlay-panel');

        const cleanup = () => {
            document.body.classList.remove('body-overlay-open');
            if (input) input.value = '';
            if (resultsDiv) resultsDiv.innerHTML = '';
        };

        if (panel) {
            panel.addEventListener('transitionend', cleanup, { once: true });
            setTimeout(cleanup, 500);
        } else {
            cleanup();
        }
    }

    function handleInput(e) {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (historyDiv) historyDiv.innerHTML = '';

        if (!query) {
            resultsDiv.innerHTML = '';
            return;
        }

        debounceTimer = setTimeout(() => fetchSuggestions(query), 200);
    }

    function performSearch(query) {
        if (!query?.trim()) return;
        window.location.href = `/?q=${encodeURIComponent(query)}`;
    }

    function clearSearch() {
        input.value = '';
        resultsDiv.innerHTML = '';
        renderHistory();
        input.focus();
    }

    async function renderHistory() {
        if (!historyDiv) return;

        try {
            const resp = await fetch('/crono');
            const history = resp.ok ? await resp.json() : [];

            if (!history.length) {
                historyDiv.innerHTML = '<p class="history-empty">Nessuna ricerca recente.</p>';
                return;
            }

            historyDiv.innerHTML = history.map(item => `
                <div class="history-item">
                    <div class="history-item-info">
                        <img src="${chooseAvatar(item) || '/uploads/avatars/default.png'}" 
                             class="history-avatar" alt="">
                        <a href="/user/${encodeURIComponent(item.username)}" 
                           class="history-username">${item.username}</a>
                    </div>
                    <button class="delete-history" data-username="${encodeURIComponent(item.username)}">✕</button>
                </div>
            `).join('');

            historyDiv.querySelectorAll('.delete-history').forEach(btn => {
                btn.addEventListener('click', () => deleteHistoryItem(btn.dataset.username));
            });

        } catch {
            historyDiv.innerHTML = '<p class="history-empty">Nessuna ricerca recente.</p>';
        }
    }

    async function deleteHistoryItem(username) {
        await fetch('/crono/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${username}`
        });
        renderHistory();
    }

    async function fetchSuggestions(query) {
        try {
            const [users, posts] = await Promise.all([
                fetch(`/usernames_preview?q=${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : []).catch(() => []),
                fetch(`/search_posts?q=${encodeURIComponent(query)}&limit=20`).then(r => r.ok ? r.json() : []).catch(() => [])
            ]);

            const finalPosts = posts.length ? posts : searchLocalPosts(query);
            renderResults(users, finalPosts, query);

        } catch {
            resultsDiv.innerHTML = '<p class="search-message">Errore durante la ricerca.</p>';
        }
    }

    function searchLocalPosts(query) {
        if (!window.POSTS_BY_ID || !query) return [];

        const q = query.toLowerCase();
        return Object.values(window.POSTS_BY_ID)
            .filter(p => p?.content?.toLowerCase().includes(q))
            .slice(0, 12)
            .map(p => ({ id: p.id, content: p.content, username: p.username }));
    }

    function renderResults(users, posts, query) {
        const q = query.toLowerCase();
        const filteredPosts = posts.filter(p => p?.content?.toLowerCase().includes(q));

        if (!users.length && !filteredPosts.length) {
            resultsDiv.innerHTML = '<p class="search-message">Nessun risultato.</p>';
            return;
        }

        resultsDiv.innerHTML = renderUsersSection(users) + renderPostsSection(filteredPosts);
        attachResultHandlers();
    }

    function renderUsersSection(users) {
        if (!users.length) return '';

        return `
            <section class="search-section">
                <h3 class="section-title">Utenti</h3>
                <div class="users-list">
                    ${users.map(u => `
                        <div class="user-result" data-username="${u.username || u}">
                            <div class="user-info">
                                <img src="${chooseAvatar(u) || '/uploads/avatars/default.png'}" class="user-avatar" alt="">
                                <span class="username">${u.username || u}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    }

    function renderPostsSection(posts) {
        if (!posts.length) return '';

        return `
            <div class="posts-section-spacer"></div>
            <section class="search-section">
                <h3 class="section-title">Post</h3>
                <div class="posts-list">
                    ${posts.slice(0, 20).map(p => `
                        <div class="post-result" data-post-id="${p.id}" data-full-content="${escapeHtml(p.content || '')}">
                            <div class="post-title">${p.title || p.content?.substring(0, 30) || `Post ${p.id}`}</div>
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    }

    function attachResultHandlers() {
        resultsDiv.querySelectorAll('.user-result').forEach(el => {
            el.addEventListener('click', () => {
                window.location.href = `/user/${encodeURIComponent(el.dataset.username)}`;
            });
        });

        resultsDiv.querySelectorAll('.post-result').forEach(el => {
            el.addEventListener('click', () => {
                const query = el.dataset.fullContent || el.querySelector('.post-title')?.textContent?.trim();
                if (query) performSearch(query);
            });
        });
    }
})();

// Filter Mode (se usato altrove)
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
        if (last.id) lastId = last.id;
        if (last.expires_at) lastExpiresAt = last.expires_at;
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

    window.addEventListener('scroll', onScroll, { passive: true });
    loadMorePosts();
}