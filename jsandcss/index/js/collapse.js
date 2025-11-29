// Collapse Helpers for Posts and Comments

function collapseSetup(el, maxH, type) {
    if (el.__collapseToggleAttached) return;
    el.__collapseToggleAttached = true;

    const prevMax = el.style.maxHeight || '';
    el.__prevMaxHeight = prevMax;
    el.style.maxHeight = maxH + 'px';
    el.style.overflow = 'hidden';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = type === 'post' ? 'bio-show-more post-expand-btn' : 'bio-show-more comment-expand-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Mostra di più';

    try {
        el.insertAdjacentElement('afterend', btn);
    } catch (e) {
        (el.parentNode || document.body).appendChild(btn);
    }

    btn.addEventListener('click', function(){
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        if (!expanded) {
            el.style.maxHeight = '';
            el.style.overflow = '';
            btn.setAttribute('aria-expanded', 'true');
            btn.textContent = 'Mostra meno';
        } else {
            el.style.maxHeight = maxH + 'px';
            el.style.overflow = 'hidden';
            btn.setAttribute('aria-expanded', 'false');
            btn.textContent = 'Mostra di più';
        }
    });
}

function applyPostCollapse(root = document) {
    try {
        const nodes = root.querySelectorAll ? Array.from(root.querySelectorAll('.post-text-box')) : [];
        nodes.forEach(el => {
            if (el.__postCollapseProcessed) return;
            el.__postCollapseProcessed = true;
            const style = getComputedStyle(el);
            const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.4) || 18;
            const maxLines = 2;
            const maxH = Math.round(lineHeight * maxLines);
            if (el.scrollHeight > (maxH + 2)) collapseSetup(el, maxH, 'post');
        });
    } catch (e) {
        console.warn('applyPostCollapse error', e);
    }
}

function applyCommentCollapse(root = document) {
    try {
        const nodes = root.querySelectorAll ? Array.from(root.querySelectorAll('.comment-text-box')) : [];
        nodes.forEach(el => {
            if (el.__commentCollapseProcessed) return;
            el.__commentCollapseProcessed = true;
            const style = getComputedStyle(el);
            const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.35) || 16;
            const maxLines = 1;
            const maxH = Math.round(lineHeight * maxLines);
            if (el.scrollHeight > (maxH + 1)) collapseSetup(el, maxH, 'comment');
        });
    } catch (e) {
        console.warn('applyCommentCollapse error', e);
    }
}

// Bio Modal
(function(){
    function openBioModal(text){
        if (!text) return;
        if (document.getElementById('bio-modal-overlay')) return;
        
        const overlay = document.createElement('div');
        overlay.id = 'bio-modal-overlay';
        overlay.className = 'bio-modal-overlay';
        overlay.style.opacity = '0';
        overlay.innerHTML = `
            <div class="bio-modal-panel" role="dialog" aria-modal="true" aria-label="Bio completa" style="position:relative;">
                <div class="bio-modal-content">${escapeHtml(text)}</div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        try { document.body.style.overflow = 'hidden'; } catch(e) {}

        try { overlay.classList.add('overlay-win-open'); } catch(_) {}
        const panel = overlay.querySelector('.bio-modal-panel');
        try { panel.classList.add('bio-open'); } catch(_) {}
        setTimeout(() => { try { overlay.style.opacity = '1'; } catch(_) {} }, 10);

        function close(){
            try { panel.classList.remove('bio-open'); } catch(_) {}
            try { panel.classList.add('bio-closing'); } catch(_) {}
            try { overlay.classList.remove('overlay-win-open'); } catch(_) {}
            try { overlay.classList.add('overlay-win-closing'); } catch(_) {}
            setTimeout(() => {
                try { overlay.remove(); } catch(e) {}
                try { document.body.style.overflow = ''; } catch(e) {}
            }, 260);
        }
        
        overlay.addEventListener('click', function(ev){
            if (ev.target === overlay) close();
        });
        
        document.addEventListener('keydown', function esc(e){
            if (e.key === 'Escape'){
                close();
                document.removeEventListener('keydown', esc);
            }
        });
    }

    function init(){
        document.addEventListener('click', function(e){
            const btn = e.target.closest && e.target.closest('.bio-show-more');
            if (!btn) return;
            const preview = btn.closest('.meta') && btn.closest('.meta').querySelector('.profile-bio-preview');
            const full = preview ? preview.dataset.fullBio : '';
            if (full) openBioModal(full);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// Bio button pressed visual feedback
(function(){
    function handleDown(e){
        const b = e.target.closest && e.target.closest('.bio-show-more');
        if(!b) return;
        b.classList.add('pressed');
    }
    function handleUp(e){
        const b = e.target.closest && e.target.closest('.bio-show-more');
        if(!b) return;
        setTimeout(()=>b.classList.remove('pressed'), 120);
    }
    document.addEventListener('pointerdown', handleDown, {passive:true});
    document.addEventListener('pointerup', handleUp, {passive:true});
    document.addEventListener('pointercancel', handleUp, {passive:true});
})();

// Init on DOMContentLoaded and observe dynamic additions
document.addEventListener('DOMContentLoaded', () => {
    applyPostCollapse(document);
    applyCommentCollapse(document);

    const mo = new MutationObserver(muts => {
        muts.forEach(m => {
            m.addedNodes.forEach(n => {
                if (!(n instanceof HTMLElement)) return;
                applyPostCollapse(n);
                applyCommentCollapse(n);
            });
        });
    });
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
});

// Comment input sync with send button
(function () {
    function syncButton(input) {
        const form = input.closest("form");
        if (!form) return;

        const btn = form.querySelector(".comment-send-btn");
        if (!btn) return;

        btn.disabled = input.value.trim().length === 0;
    }

    function attachInput(input) {
        if (input.__wired) return;
        input.__wired = true;

        syncButton(input);
        input.addEventListener("input", () => syncButton(input));
    }

    document.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".comment-send-btn");
        if (!btn) return;

        const form = btn.closest("form");
        const input = form?.querySelector(".comment-input");
        if (!input) return;

        if (input.value.trim().length === 0) {
            ev.preventDefault();
            ev.stopPropagation();
        }
    }, true);

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".comment-input").forEach(attachInput);
    });

    const obs = new MutationObserver((muts) => {
        muts.forEach(m => {
            m.addedNodes.forEach(n => {
                if (!(n instanceof HTMLElement)) return;
                n.querySelectorAll?.(".comment-input").forEach(attachInput);
            });
        });
    });

    obs.observe(document.body, { childList: true, subtree: true });
})();
