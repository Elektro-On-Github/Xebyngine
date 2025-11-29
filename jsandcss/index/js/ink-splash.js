// Ink Splash Visual Effect

function spawnInkSplash(postEl, x, y, color) {
    try {
        const DURATION = 700;
        const CLEANUP_FADE_MS = 220;

        if (!postEl) return;
        if (getComputedStyle(postEl).position === 'static') postEl.style.position = 'relative';

        const canvas = document.createElement('canvas');
        canvas.className = 'ink-canvas transient-ink-canvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = 0;
        canvas.style.mixBlendMode = 'normal';
        canvas.style.transition = `opacity ${CLEANUP_FADE_MS}ms ease`;
        canvas.style.opacity = '1';
        postEl.insertBefore(canvas, postEl.firstChild);

        const rect = postEl.getBoundingClientRect();
        const DPR = window.devicePixelRatio || 1;
        canvas.width = Math.max(300, rect.width) * DPR;
        canvas.height = Math.max(200, rect.height) * DPR;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

        const cx = Math.max(8, Math.min(rect.width - 8, Math.round(x)));
        const cy = Math.max(8, Math.min(rect.height - 8, Math.round(y)));

        function rgbaFromCSS(cssColor, a) {
            const tmp = document.createElement('div');
            tmp.style.color = cssColor || '#e53935';
            tmp.style.display = 'none';
            document.body.appendChild(tmp);
            const cs = getComputedStyle(tmp).color;
            document.body.removeChild(tmp);
            const m = cs.match(/([0-9]+),\s*([0-9]+),\s*([0-9]+)/);
            if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
            return `rgba(229,57,53,${a})`;
        }

        const colorFill = rgbaFromCSS(color, 1);
        const start = performance.now();

        const particles = [];
        const COUNT = 18 + Math.round(Math.random() * 12);
        for (let i = 0; i < COUNT; i++) {
            const angle = (Math.PI * 2) * (i / COUNT) + (Math.random() - 0.5) * 0.6;
            const speed = 40 + Math.random() * 120;
            const size = 3 + Math.random() * 12;
            particles.push({ angle, speed, size, wobble: (Math.random() - 0.5) * 6 });
        }

        function drawFrame(now) {
            const t = Math.min(1, (now - start) / DURATION);
            ctx.clearRect(0, 0, canvas.width / DPR, canvas.height / DPR);

            for (let p of particles) {
                const dist = p.speed * easeOutQuad(t);
                const px = cx + Math.cos(p.angle) * dist + Math.sin(p.angle * 3) * (p.wobble * (1 - t));
                const py = cy + Math.sin(p.angle) * dist + (t * 6);
                ctx.beginPath();
                ctx.globalAlpha = 1 - t;
                ctx.fillStyle = colorFill;
                ctx.ellipse(px, py, p.size * (1 - t * 0.6), p.size * (1 - t * 0.6) * 0.7, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            ctx.save();
            ctx.globalAlpha = 1 - t * 0.9;
            ctx.beginPath();
            ctx.fillStyle = rgbaFromCSS(color, 1);
            ctx.ellipse(cx, cy, 6 + 20 * t, (6 + 12 * t) * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            if (t < 1) {
                requestAnimationFrame(drawFrame);
            } else {
                try {
                    canvas.style.opacity = '0';
                    setTimeout(() => {
                        try {
                            if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
                        } catch (e) {}
                    }, CLEANUP_FADE_MS + 20);
                } catch (e) {
                    try {
                        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
                    } catch (e) {}
                }
            }
        }

        function easeOutQuad(t){ return t * (2 - t); }

        requestAnimationFrame(drawFrame);
    } catch (err) {
        console.warn('spawnInkSplash error', err);
    }
}

function spawnInkSplashFromElement(el, containerEl, color) {
    try {
        if (!el) return;
        if (!containerEl) containerEl = el.closest && el.closest('.post') ? el.closest('.post') : document.body;

        try {
            let cx = Math.round(el.offsetWidth / 2);
            let cy = Math.round(el.offsetHeight / 2);
            let cur = el;
            while (cur && cur !== containerEl && cur !== document.body) {
                cx += cur.offsetLeft || 0;
                cy += cur.offsetTop || 0;
                cur = cur.offsetParent;
            }
            if (cur === containerEl) {
                spawnInkSplash(containerEl, cx, cy, color);
                return;
            }
        } catch (inner) {}

        const elRect = el.getBoundingClientRect();
        const contRect = containerEl.getBoundingClientRect ? containerEl.getBoundingClientRect() : { left: 0, top: 0 };
        const contContentLeft = contRect.left + (containerEl.clientLeft || 0);
        const contContentTop = contRect.top + (containerEl.clientTop || 0);
        const x = (elRect.left + elRect.width / 2) - contContentLeft + (containerEl.scrollLeft || 0);
        const y = (elRect.top + elRect.height / 2) - contContentTop + (containerEl.scrollTop || 0);
        spawnInkSplash(containerEl, Math.round(x), Math.round(y), color);
    } catch (e) {
        try {
            spawnInkSplash(containerEl || document.body, 20, 20, color);
        } catch(_) {}
    }
}
