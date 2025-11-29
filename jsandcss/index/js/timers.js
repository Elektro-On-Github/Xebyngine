// Post Timers

function startTimers(root = document) {
    root.querySelectorAll('.timer:not([data-timer-started])').forEach(timer => {
        timer.dataset.timerStarted = 'true';
        const expiry = getExpiryTime(timer);
        
        if (window.PROFILE_MODE) {
            timer.textContent = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
            return;
        }
        
        const tick = () => {
            const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
            timer.textContent = remaining;
            
            if (remaining <= 0) {
                removeExpiredPost(timer.closest('.post'));
            } else {
                setTimeout(tick, 1000 - (Date.now() % 1000) || 1000);
            }
        };
        tick();
    });
}

function getExpiryTime(timer) {
    const expiresAttr = timer.dataset.expiresAt || timer.dataset.expires_at;
    if (expiresAttr) {
        const raw = parseFloat(expiresAttr) || 0;
        return raw > 1e12 ? raw : raw * 1000;
    }
    return Date.now() + (parseInt(timer.dataset.seconds, 10) || 0) * 1000;
}

function removeExpiredPost(postEl) {
    if (!postEl?.parentNode) return;
    postEl.style.cssText = 'transition:opacity 400ms ease; opacity:0;';
    setTimeout(() => postEl.remove(), 450);
}

// Post visibility observer for view counting
function observePostVisibility(root) {
    const postEl = (root && root.classList && root.classList.contains('post')) ? root : null;
    if (!postEl) return;

    const postId = postEl.dataset.postId;
    if (!postId) return;

    const alreadyObserved = postEl.__viewObserverAttached;
    if (alreadyObserved) return;
    postEl.__viewObserverAttached = true;

    let timer = null;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0) {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    fetch('/post_view', {
                        method: 'POST',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ post_id: postId })
                    }).then(r => r.json()).then(data => {
                        if (data && typeof data.views !== 'undefined') {
                            const span = postEl.querySelector('.post-views[data-post-id="' + postId + '"]');
                            if (span) span.textContent = data.views;
                        }
                    }).catch(e => {
                        console.error('post_view error', e);
                    });
                }, 3000);
            } else {
                if (timer) { clearTimeout(timer); timer = null; }
            }
        });
    }, { threshold: [0, 0.25, 0.5, 1] });

    observer.observe(postEl);
}
