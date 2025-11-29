// Like / Comment / Poll Handler

function bindPostEvents(root = document) {
    const $ = sel => root.querySelectorAll(sel);

    // LIKE POST
    $('.like-form').forEach(form => {
        if (form.__bound) return;
        form.__bound = true;

        let liked = false;
        const postEl = form.closest('.post');
        const btn = form.querySelector('.like-btn-modern, .like-btn');

        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (liked) return;
            liked = true;

            if (postEl && btn) {
                const heart = btn.querySelector('.fa-heart');
                const color = heart ? getComputedStyle(heart).color : '#e53935';
                spawnInkSplashFromElement(btn, postEl, color);
            }

            try {
                await fetch(`/like/${form.dataset.postId}`, {
                    method: 'POST',
                    credentials: 'include'
                });

                if (btn) {
                    btn.classList.add('heartbeat', 'liked');
                    setTimeout(() => btn.classList.remove('heartbeat'), 520);
                }

                const countEl = postEl?.querySelector('.like-count');
                if (countEl) countEl.textContent = +countEl.textContent + 1;
            } catch (err) {
                console.error(err);
            }
        });
    });

    // LIKE COMMENTI
    $('.like-comment-form').forEach(form => {
        if (form.__bound) return;
        form.__bound = true;

        let liked = false;
        const btn = form.querySelector('.like-comment-btn');

        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (liked) return;
            liked = true;

            if (btn) {
                btn.classList.add('heartbeat', 'liked');
                setTimeout(() => btn.classList.remove('heartbeat'), 520);
            }

            try {
                await fetch(form.action, {
                    method: 'POST',
                    credentials: 'include'
                });

                const countSpan = root.querySelector(
                    `.comment-like-count[data-comment-id="${form.dataset.commentId}"]`
                );
                if (countSpan) countSpan.textContent = +countSpan.textContent + 1;
            } catch (err) {
                console.error(err);
            }
        });
    });

    // COMMENTI POST
    $('.comment-form').forEach(form => {
        if (form.__bound) return;
        form.__bound = true;

        const input = form.querySelector('input[name="content"]');
        const postId = form.dataset.postId;

        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (form.dataset.submitting === '1') return;
            form.dataset.submitting = '1';

            const content = input.value.trim();
            if (!content) return (form.dataset.submitting = '0');

            const csrfToken =
                document.querySelector('meta[name="csrf-token"]')?.content ||
                document.querySelector('input[name="csrf_token"]')?.value;

            if (!csrfToken) {
                console.error('CSRF token non trovato');
                form.dataset.submitting = '0';
                return;
            }

            const body = new URLSearchParams({
                content,
                csrf_token: csrfToken
            });

            try {
                const resp = await fetch(`/comment/${postId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRFToken': csrfToken
                    },
                    body,
                    credentials: 'include'
                });

                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

                const commentsList =
                    root.querySelector(`.post[data-post-id="${postId}"] .comments-list`) ||
                    form.closest('.comments-list') ||
                    document.getElementById(`comments-list-${postId}`);

                if (commentsList) {
                    const div = createCommentHTML(content);
                    commentsList.prepend(div);

                    const modalList = document.getElementById(`comments-list-${postId}`);
                    if (modalList && modalList !== commentsList) {
                        modalList.prepend(div.cloneNode(true));
                        bindPostEvents(modalList);
                    }

                    window.POSTS_BY_ID = window.POSTS_BY_ID || {};
                    window.POSTS_BY_ID[postId] = window.POSTS_BY_ID[postId] || { comments: [] };
                    const avatar = chooseAvatar() || '/uploads/avatars/default.png';
                    window.POSTS_BY_ID[postId].comments.push({
                        id: 'local-' + Date.now(),
                        username: window.LOGGED_USERNAME || 'Tu',
                        content,
                        like_count: 0,
                        avatar_url: avatar
                    });
                }

                input.value = '';
            } catch (err) {
                console.error('ERRORE COMMENTO:', err);
            } finally {
                form.dataset.submitting = '0';
            }
        });
    });

    // POLL
    $('input[type="radio"][name^="poll_"]').forEach(radio => {
        if (radio.__bound) return;
        radio.__bound = true;

        radio.addEventListener('change', function () {
            const postId = this.name.replace('poll_', '');
            const poll = this.closest('.poll');
            const selected = this.closest('label.poll-option');
            if (!poll || !selected) return;

            poll.querySelectorAll('.poll-option').forEach(opt => {
                opt.classList.remove('selected');
                const bar = opt.querySelector('.bar-fill');
                if (bar) {
                    bar.style.background = 'linear-gradient(90deg,#ff5f6d,#ffc371)';
                    const orig = bar.dataset.origPerc;
                    if (orig) bar.style.width = orig + '%';
                }
            });

            selected.classList.add('selected');
            const bar = selected.querySelector('.bar-fill');
            if (bar) {
                const allBars = poll.querySelectorAll('.bar-fill');
                let total = 0, optionVotes = 0;
                allBars.forEach(b => {
                    const v = +b.dataset.votes || 0;
                    total += v;
                    if (b === bar) optionVotes = v;
                });
                total++;
                optionVotes++;

                allBars.forEach(b => {
                    const v = +b.dataset.votes || 0;
                    b.style.width = (b === bar ? optionVotes / total : v / total) * 100 + '%';
                });
            }

            votePoll(postId, this.value, this);
        });
    });
}

function createCommentHTML(content) {
    const div = document.createElement('div');
    Object.assign(div.style, {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        marginBottom: '14px'
    });

    const avatar = chooseAvatar() || '/uploads/avatars/default.png';
    const img = document.createElement('img');
    img.src = avatar;
    img.alt = 'avatar';
    img.className = 'avatar';
    Object.assign(img.style, {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        objectFit: 'cover'
    });

    const contentWrapper = document.createElement('div');
    Object.assign(contentWrapper.style, {
        flex: '1',
        paddingRight: '60px',
        minWidth: '0',
        display: 'block'
    });

    const userDiv = document.createElement('div');
    Object.assign(userDiv.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    });
    const strong = document.createElement('strong');
    strong.textContent = 'Tu';
    userDiv.appendChild(strong);

    const textDiv = document.createElement('div');
    textDiv.className = 'comment-text';
    textDiv.style.marginTop = '8px';
    const span = document.createElement('span');
    span.className = 'comment-text-box';
    span.textContent = content;
    textDiv.appendChild(span);

    contentWrapper.append(userDiv, textDiv);
    div.append(img, contentWrapper);

    return div;
}

function votePoll(postId, selected, radioElem) {
    if (!selected) return;
    fetch(`/poll_vote/${postId}`, {
        method: 'POST',
        headers: {'Content-Type':'application/x-www-form-urlencoded'},
        body: `option_index=${encodeURIComponent(selected)}`
    }).then(async resp => {
        if (resp.ok) {
            reloadPoll(postId);
        }
    });
}

function reloadPoll(postId) {
    fetch(`/load_posts?last_id=${postId}&limit=1`)
        .then(resp => resp.json())
        .then(data => {
            const p = data.posts?.[0];
            if (!p || !p.poll) return;

            const pollDiv = document.querySelector(`#poll-block-${p.id}`);
            if (!pollDiv) return;

            const pollHTML = `
                <div class="poll"><br>
                    <strong>${escapeHtml(p.poll.question)}</strong><br>
                    ${p.poll_data.results.map((opt, idx) => {
                        const optionIndex = opt.index ?? idx;
                        const percent = opt.percentage ?? 0;
                        const barColor = '#4CAF50';
                        return `
                            <label class="poll-option ${opt.voted ? 'selected' : ''}">
                                <input type="radio" name="poll_${p.id}" value="${optionIndex}" disabled ${opt.voted ? 'checked' : ''}>
                                <span>${escapeHtml(opt.text)}</span>
                                <div class="poll-bar" style="width:${percent}%;background:${barColor};"></div>
                                <span class="poll-percent">${percent}%</span>
                            </label>
                        `;
                    }).join('')}
                </div>
                ${p.poll_data.is_creator && p.poll_data.results.some(r => Array.isArray(r.voters) && r.voters.length)
                    ? `<button class="show-more-comments-btn show-voters-btn" 
                        data-post-id="${p.id}" 
                        data-poll-voters="${encodeURIComponent(JSON.stringify(p.poll_data.results))}"
                        style="margin:8px 0; background:#901010; color:#fff; border:none; border-radius:50px; padding:12px 32px; font-size:1em; cursor:pointer; width:90vw">
                        Mostra votanti
                    </button>`
                    : ''
                }
            `;

            pollDiv.innerHTML = pollHTML;
        })
        .catch(err => console.error('Errore reloadPoll:', err));
}
