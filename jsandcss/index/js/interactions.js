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
                await fetch(`/like/${form.dataset.postId}`, { method: 'POST', credentials: 'include' });

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
                await fetch(form.action, { method: 'POST', credentials: 'include' });

                const countSpan = root.querySelector(`.comment-like-count[data-comment-id="${form.dataset.commentId}"]`);
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
            if (!content) return void (form.dataset.submitting = '0');

            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ||
                              document.querySelector('input[name="csrf_token"]')?.value;

            if (!csrfToken) {
                console.error('CSRF token non trovato');
                form.dataset.submitting = '0';
                return;
            }

            try {
                const resp = await fetch(`/comment/${postId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrfToken },
                    body: new URLSearchParams({ content, csrf_token: csrfToken }),
                    credentials: 'include'
                });

                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

                const commentsList = root.querySelector(`.post[data-post-id="${postId}"] .comments-list`) ||
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
                    window.POSTS_BY_ID[postId].comments.push({
                        id: 'local-' + Date.now(),
                        username: window.LOGGED_USERNAME || 'Tu',
                        content,
                        like_count: 0,
                        avatar_url: chooseAvatar() || '/uploads/avatars/default.png'
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

            const allBars = poll.querySelectorAll('.bar-fill');

            poll.querySelectorAll('.poll-option').forEach(opt => {
                opt.classList.remove('selected');
                const bar = opt.querySelector('.bar-fill');
                if (bar) {
                    bar.classList.remove('voted');
                    bar.classList.add('default');
                    if (bar.dataset.origPerc) bar.style.setProperty('--w', bar.dataset.origPerc + '%');
                }
            });

            selected.classList.add('selected');
            const bar = selected.querySelector('.bar-fill');

            if (bar) {
                let total = 0, optionVotes = 0;
                allBars.forEach(b => {
                    const v = +b.dataset.votes || 0;
                    total += v;
                    if (b === bar) optionVotes = v;
                });
                total++;
                optionVotes++;

                allBars.forEach(b => {
                    const v = (b === bar) ? optionVotes : (+b.dataset.votes || 0);
                    b.style.setProperty('--w', (v / total * 100) + '%');
                });
            }

            votePoll(postId, this.value);
        });
    });
}

function createCommentHTML(content) {
    const avatar = chooseAvatar() || '/uploads/avatars/default.png';
    const wrapper = document.createElement('div');
    wrapper.className = 'comment-item';
    wrapper.innerHTML = `
        <img src="${escapeHtml(avatar)}" alt="avatar" class="avatar">
        <div class="comment-content">
            <div class="comment-user-info"><strong>Tu</strong></div>
            <div class="comment-text"><span class="comment-text-box">${escapeHtml(content)}</span></div>
        </div>
    `;
    return wrapper;
}

function votePoll(postId, selected) {
    if (!selected) return;
    fetch(`/poll_vote/${postId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `option_index=${encodeURIComponent(selected)}`
    }).then(resp => { if (resp.ok) reloadPoll(postId); });
}

function reloadPoll(postId) {
    fetch(`/load_posts?last_id=${postId}&limit=1`)
        .then(r => r.json())
        .then(data => {
            const p = data.posts?.[0];
            if (!p?.poll) return;

            const pollDiv = document.querySelector(`#poll-block-${p.id}`);
            if (!pollDiv) return;

            const options = p.poll_data.results.map((opt, idx) => `
                <label class="poll-option ${opt.voted ? 'selected' : ''}">
                    <input type="radio" name="poll_${p.id}" value="${opt.index ?? idx}" disabled ${opt.voted ? 'checked' : ''}>
                    <div class="bar-container">
                        <div class="bar-fill" style="--w:${opt.percentage ?? 0}%;" data-votes="${opt.votes ?? 0}" data-orig-perc="${opt.percentage ?? 0}"></div>
                        <span class="bar-label">${escapeHtml(opt.text)} — ${opt.votes ?? 0} ${(opt.votes ?? 0) !== 1 ? 'voti' : 'voto'} (${opt.percentage ?? 0}%)</span>
                    </div>
                </label>
            `).join('');

            const hasVoters = p.poll_data.is_creator && p.poll_data.results.some(r => r.voters?.length);

            pollDiv.innerHTML = `
                <div class="poll"><br>
                    <strong>${escapeHtml(p.poll.question)}</strong><br>
                    ${options}
                </div>
                ${hasVoters ? `<button class="show-more-comments-btn voters-btn" data-post-id="${p.id}" data-poll-voters="${encodeURIComponent(JSON.stringify(p.poll_data.results))}">Mostra votanti</button>` : ''}
            `;
        })
        .catch(err => console.error('Errore reloadPoll:', err));
}