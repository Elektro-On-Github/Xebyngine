// === POSTS LOADING ===
async function loadMorePosts() {
    if (window.PROFILE_MODE || loading) return;
    loading = true;

    try {
        const resp = await fetch(`/load_posts?last_expires_at=${lastExpiresAt}&last_id=${lastId}&limit=20`);
        if (!resp.ok) {
            console.error("Errore load_posts", resp.status);
            return;
        }

        const data = await resp.json();
        const posts = data.posts || [];

        if (!posts.length && lastId === 0) {
            const noEl = document.getElementById('no-posts-msg');
            if (noEl) noEl.style.display = 'block';
            window.removeEventListener('scroll', onScroll);
            return;
        }

        if (!posts.length) {
            window.removeEventListener('scroll', onScroll);
            if (INDEX_SEARCH_MODE && INDEX_SEARCH_FOUND === 0) {
                const feed = document.getElementById('post-feed');
                if (feed) feed.innerHTML = `<p style="text-align:center;color:#646464">Nessun post trovato per "${escapeHtml(INDEX_QUERY_RAW)}".</p>`;
            }
            return;
        }

        for (const p of posts) {
            if (!INDEX_SEARCH_MODE || postMatchesIndexQuery(p)) {
                appendPostToFeed(p);
                if (INDEX_SEARCH_MODE) INDEX_SEARCH_FOUND++;
            }
            lastExpiresAt = p.expires_at;
            lastId = p.id;
        }

        applyCommentCollapse(document);
        applyPostCollapse(document);
    } catch (err) {
        console.error(err);
    } finally {
        loading = false;
    }
}

let scrollTick = false;
function onScroll() {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
        if (innerHeight + scrollY >= document.body.offsetHeight - 500) {
            window.FILTERING ? appendFilteredBatch() : loadMorePosts();
        }
        scrollTick = false;
    });
}
window.addEventListener("scroll", onScroll, { passive: true });

function appendPostToFeed(p) {
    window.POSTS_BY_ID = window.POSTS_BY_ID || {};
    window.POSTS_BY_ID[p.id] = p;

    const feed = document.getElementById('post-feed');
    const div = document.createElement('div');
    div.classList.add('post');
    div.dataset.postId = p.id;

    const avatarSrc = chooseAvatar(p) || '/uploads/avatars/default.png';
    const COMMENTS_PER_PAGE = 3;

    const renderComments = () => {
        const allComments = (p.comments || []).slice().reverse();
        const shown = allComments.slice(0, COMMENTS_PER_PAGE);

        let html = shown.map(c => `
            <div style="display:flex; align-items:flex-start; gap:10px; margin-bottom:14px; position:relative;">
                <img src="${chooseAvatar(c) || avatarSrc}" alt="avatar" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                <div style="flex:1; padding-right:60px; min-width:0; display:block;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <strong><a href="/user/${encodeURIComponent(c.username)}" style="color:inherit; text-decoration:none;">${escapeHtml(c.username)}</a></strong>
                    </div>
                    <div class="comment-text" style="margin-top:8px;"><span class="comment-text-box">${escapeHtml(c.content)}</span></div>
                </div>
                <form method="POST" action="/comment/like/${c.id}" data-comment-id="${c.id}" class="like-comment-form-ajax" style="display:flex; align-items:center; gap:6px; position:absolute; right:8px; top:10px; background:transparent; border:none; padding:0; margin:0;">
                    <span class="comment-like-count">${c.like_count}</span>
                    <button type="submit" class="like-btn-modern like-comment-btn" style="all:unset; width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.15); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.25); display:flex; align-items:center; justify-content:center; color:#e53935; font-size:1.3em; box-shadow:0 2px 10px rgba(0,0,0,0.15); cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.background='rgba(255,255,255,0.3)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(255,255,255,0.15)'; this.style.transform='scale(1)';">
                        <i class='fa-solid fa-heart'></i>
                    </button>
                </form>
            </div>
        `).join('');

        setTimeout(() => bindCommentLikeEvents(div), 0);

        if (shown.length < allComments.length) {
            html += `<button class="show-more-comments-btn" data-post-id="${p.id}" type="button" style="margin:8px 0; background:#901010; color:#fff; border:none; border-radius:50px; padding:12px 32px; font-size:1em; cursor:pointer; width: 90vw">Mostra di più</button>`;
        }
        return html;
    };

    const pollHTML = p.poll ? renderPoll(p, avatarSrc) : '';

    div.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <img src="${avatarSrc}" class="avatar" alt="avatar">
            <strong style="display:flex;align-items:center;gap:8px;">
                <a href="/user/${encodeURIComponent(p.username)}">${escapeHtml(p.username)}</a>
            </strong>
        </div>
        ${renderPostMenu(p)}
        ${renderImages(p)}
        <p><span class="post-text-box">${escapeHtml(p.content)}</span></p>
        ${renderPostActions(p)}
        ${renderCommentForm(p)}
        <div class="comments">
            <div class="comments-list">${renderComments()}</div>
        </div>
        ${pollHTML}
    `;

    feed.appendChild(div);
    initializePostComponents(div, p);
    startTimers(div);

    return div;
}

const renderPostMenu = (p) => `
    <div class="post-menu" style="position:absolute; top:12px; right:12px; z-index:2; display:flex; align-items:center; gap:8px;">
        <div class="post-timer-top" style="display:flex; align-items:center; gap:6px; color:#222; margin-right:6px;">
            <i class="fa-solid fa-clock fa-spin" style="color:#ff9800; font-size:calc(1em + 2px);"></i>
            <span class="timer" data-expires-at="${p.expires_at || Math.floor(Date.now()/1000 + p.remaining_seconds)}" style="font-weight:700; font-size:calc(1em + 2px);"></span>
        </div>
        <button class="post-menu-btn" title="Altro" style="background:none;border:none;cursor:pointer;font-size:18px;padding:6px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;">
            <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
        <div class="post-menu-popup" style="display:none;">
            <button class="post-delete-btn" data-post-id="${p.id}" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;text-align:left;cursor:pointer;color:#e53935;">
                <i class="fa-solid fa-trash-can" style="font-size:16px; color: #e53935;"></i>
                Elimina post
            </button>
        </div>
    </div>
`;

const renderImages = (p) => {
    if (Array.isArray(p.image_urls) && p.image_urls.length) {
        return `<div class="post-images-scroller" style="display:flex;gap:8px;overflow-x:auto;padding:6px 0;">${p.image_urls.map((u, i) => {
            const media = p.media?.[i];
            const dataAttrs = media?.width && media?.height 
                ? ` data-width="${media.width}" data-height="${media.height}"` 
                : '';
            return media?.type === 'video' 
                ? `<div class="post-media-wrapper" style="height:240px;border-radius:12px;overflow:hidden;"><video src="${u}" class="post-media" style="height:240px;border-radius:12px;object-fit:cover;background:#000;" muted></video><div class="post-media-play"><i class="fa-solid fa-play"></i></div></div>`
                : `<img src="${u}" alt="post image" class="post-media"${dataAttrs} style="height:240px;border-radius:12px;object-fit:cover;">`;
        }).join('')}</div>`;
    }
    return p.image_url ? `<img src="${p.image_url}" alt="post image">` : '';
};

const renderPostActions = (p) => `
    <div class="post-actions-modern" style="display:flex; align-items:center; gap:18px; margin:12px 0;">
        <form class="like-form" data-post-id="${p.id}" style="margin:0; display:flex; align-items:center;">
            <button type="submit" class="like-btn-modern" title="Mi piace" style="all:unset; width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.15); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.25); display:flex; align-items:center; justify-content:center; color:#e53935; font-size:1.3em; box-shadow:0 2px 10px rgba(0,0,0,0.15); cursor:pointer; transition:all 0.2s ease;" onmouseover="this.style.background='rgba(255,255,255,0.3)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(255,255,255,0.15)'; this.style.transform='scale(1)';">
                <i class="fa-solid fa-heart"></i>
            </button>
            <span class="like-count" style="font-size:1.1em; color:#222; font-weight:500; margin-left:8px; user-select:none;">${p.like_count}</span>
        </form>
        <button class="show-likers-btn" onclick="showLikers(${p.id})" style="all:unset; width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.15); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.25); display:flex; align-items:center; justify-content:center; color:#e53935; font-size:1.3em; box-shadow:0 2px 10px rgba(0,0,0,0.05); cursor:pointer; transition:all 0.2s ease;">
            <i class="fa-solid fa-users"></i>
        </button>
        <span class="view-count-modern" style="display:flex; align-items:center; gap:6px; font-size:1.1em; color:#9B2727;">
            <i class="fa-solid fa-eye"></i> <span class="post-views" data-post-id="${p.id}">${p.views || 0}</span>
        </span>
        <button class="share-post-btn" data-post-id="${p.id}" onclick="openShareModal(${p.id})" style="all:unset; width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.15); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.25); display:flex; align-items:center; justify-content:center; color:#e53935; font-size:1.3em; box-shadow:0 2px 10px rgba(0,0,0,0.15); cursor:pointer; transition:all 0.2s ease;" title="Condividi in chat">
            <i class="fa-solid fa-share"></i>
        </button>
    </div>
`;

const renderCommentForm = (p) => `
    <form class="comment-form" data-post-id="${p.id}" style="position:sticky;bottom:76px;z-index:50;padding:12px 12px;display:flex;align-items:center;gap:8px;border-radius:22px;">
        <input class="comment-input" type="text" name="content" placeholder="Commenta qui..." required style="flex:1;">
        <button class="comment-send-btn" type="submit" title="Commenta"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
    <br>
`;

const renderPoll = (p) => {
    let html = `<div class="poll"><br><strong>${escapeHtml(p.poll.question)}</strong><br>`;

    p.poll_data.results.forEach((opt, idx) => {
        const optionIndex = opt.index ?? opt.id ?? idx;
        const disabled = p.poll_data.is_creator ? 'disabled' : '';
        const optText = opt.text || opt.label || opt.choice || `Opzione ${idx+1}`;
        const votes = opt.votes ?? 0;
        const perc = opt.percentage ?? 0;

        html += `
            <label class="poll-option">
                <input type="radio" name="poll_${p.id}" value="${optionIndex}" id="poll${p.id}_${optionIndex}" data-option-index="${optionIndex}" ${disabled}
                    onchange="document.querySelectorAll('[name=\\'poll_${p.id}\\']').forEach(r => { if(!r.checked) r.disabled = true; });">
                <div class="bar-container">
                    <div class="bar-fill" style="--w:${perc}%;" data-votes="${votes}" data-orig-perc="${perc}"></div>
                    <span class="bar-label">${escapeHtml(optText)} — ${votes} ${votes !== 1 ? 'voti' : 'voto'} (${perc}%)</span>
                </div>
            </label>
        `;
    });

    if (p.poll_data.is_creator && p.poll_data.results.some(r => Array.isArray(r.voters) && r.voters.length)) {
        html += `<p><em></em></p><button class="show-more-comments-btn show-voters-btn" data-post-id="${p.id}" type="button" style="margin:8px 0; background:#901010; color:#fff; border:none; border-radius:50px; padding:12px 32px; font-size:1em; cursor:pointer; width: 90vw" data-poll-voters="${encodeURIComponent(JSON.stringify(p.poll_data.results))}">Mostra votanti</button>`;
    }

    return html + '</div>';
};

const bindCommentLikeEvents = (div) => {
    div.querySelectorAll('.like-comment-form-ajax').forEach(form => {
        if (form.__bound) return;
        form.__bound = true;
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            if (form.classList.contains('liked')) return;
            form.classList.add('liked');

            const btn = form.querySelector('button');
            const postEl = form.closest('.post');

            if (postEl && btn) {
                const heart = btn.querySelector('.fa-heart');
                const color = heart ? getComputedStyle(heart).color : '#e53935';
                try { spawnInkSplashFromElement(btn, postEl, color); } catch(_) {}
            }

            fetch(form.action, { method: 'POST' })
                .then(() => {
                    if (btn) {
                        btn.classList.add('heartbeat');
                        setTimeout(() => btn.classList.remove('heartbeat'), 520);
                    }
                    const countSpan = form.querySelector('.comment-like-count');
                    if (countSpan) countSpan.textContent = (parseInt(countSpan.textContent) || 0) + 1;
                });
        });
    });
};

const initializePostComponents = (div, p) => {
    try { applyPostCollapse(div); } catch(_) {}
    setupScrollerDots(div);
    startTimers(div);
    bindPostEvents(div);
    try { observePostVisibility(div); } catch (e) { console.error(e); }
    setupPollEvents(div, p);
    setupCommentEvents(div, p);
    hideMenuForNonOwner(div, p);
};

const setupScrollerDots = (div) => {
    const scroller = div.querySelector('.post-images-scroller');
    if (!scroller) return;
    const media = Array.from(scroller.querySelectorAll('img, video'));
    if (media.length < 2) return;

    const dots = document.createElement('div');
    dots.className = 'post-scroller-dots';
    media.forEach((_, idx) => {
        const btn = document.createElement('button');
        btn.className = 'scroller-dot';
        btn.dataset.index = idx;
        btn.addEventListener('click', () => {
            scroller.scrollTo({ left: media[idx].offsetLeft, behavior: 'smooth' });
            updateDots();
        });
        dots.appendChild(btn);
    });

    scroller.parentNode.insertBefore(dots, scroller.nextSibling);

    const updateDots = () => {
        const idx = Math.round((scroller.scrollLeft || 0) / (scroller.clientWidth || 1));
        const active = Math.max(0, Math.min(media.length - 1, idx));
        dots.querySelectorAll('.scroller-dot').forEach((b, i) => b.classList.toggle('active', i === active));
    };

    updateDots();
    let tto = null;
    scroller.addEventListener('scroll', () => {
        clearTimeout(tto);
        tto = setTimeout(updateDots, 80);
    }, { passive: true });
    window.addEventListener('resize', updateDots);
};

const setupPollEvents = (div, p) => {
    setTimeout(() => {
        div.querySelectorAll(`input[type='radio'][name='poll_${p.id}']`).forEach(radio => {
            radio.addEventListener('change', function() {
                div.querySelectorAll('.poll-option').forEach(opt => opt.classList.remove('selected'));
                this.closest('label.poll-option')?.classList.add('selected');
                setTimeout(() => votePoll(p.id, this.value), 10);
            });
            if (radio.checked) radio.closest('label.poll-option')?.classList.add('selected');
        });
    }, 0);
};

const setupCommentEvents = (div, p) => {
    div.querySelector('.comments-list')?.addEventListener('click', (e) => {
        if (e.target?.classList.contains('show-more-comments-btn') && !e.target.classList.contains('show-voters-btn')) {
            try { showCommentsModal(p.id); } catch (err) { console.warn('showCommentsModal failed', err); }
        }
    });
};

const hideMenuForNonOwner = (div, p) => {
    const loggedUser = window.LOGGED_USERNAME;
    if (!loggedUser || loggedUser !== p.username) {
        const menu = div.querySelector('.post-menu');
        if (menu) menu.style.display = 'none';
    }
};