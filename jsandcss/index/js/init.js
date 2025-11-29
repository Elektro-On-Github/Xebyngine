// Main Initialization and Page Setup
document.addEventListener('DOMContentLoaded', () => {
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
