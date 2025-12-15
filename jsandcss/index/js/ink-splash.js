const easeOutQuad = t => t * (2 - t);

const colorCache = new Map();

function cssToRgba(cssColor, alpha = 1) {
    const key = cssColor || '#e53935';
    
    if (colorCache.has(key)) {
        const [r, g, b] = colorCache.get(key);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    
    const tmp = document.createElement('div');
    tmp.style.cssText = `color:${key};display:none`;
    document.body.appendChild(tmp);
    const match = getComputedStyle(tmp).color.match(/(\d+),\s*(\d+),\s*(\d+)/);
    tmp.remove();
    
    const rgb = match ? [match[1], match[2], match[3]] : [229, 57, 53];
    colorCache.set(key, rgb);
    
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function spawnInkSplash(postEl, x, y, color) {
    if (!postEl) return;
    
    const DURATION = 700;
    const DPR = devicePixelRatio || 1;
    
    if (getComputedStyle(postEl).position === 'static') {
        postEl.classList.add('ink-container');
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'ink-canvas';
    postEl.insertBefore(canvas, postEl.firstChild);

    const rect = postEl.getBoundingClientRect();
    canvas.width = Math.max(300, rect.width) * DPR;
    canvas.height = Math.max(200, rect.height) * DPR;
    
    const ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const cx = Math.max(8, Math.min(rect.width - 8, Math.round(x)));
    const cy = Math.max(8, Math.min(rect.height - 8, Math.round(y)));
    const colorFill = cssToRgba(color, 1);

    const COUNT = 18 + Math.round(Math.random() * 12);
    const particles = Array.from({ length: COUNT }, (_, i) => ({
        angle: (Math.PI * 2) * (i / COUNT) + (Math.random() - 0.5) * 0.6,
        speed: 40 + Math.random() * 120,
        size: 3 + Math.random() * 12,
        wobble: (Math.random() - 0.5) * 6
    }));

    const start = performance.now();

    function drawFrame(now) {
        const t = Math.min(1, (now - start) / DURATION);
        ctx.clearRect(0, 0, canvas.width / DPR, canvas.height / DPR);

        particles.forEach(p => {
            const dist = p.speed * easeOutQuad(t);
            const px = cx + Math.cos(p.angle) * dist + Math.sin(p.angle * 3) * (p.wobble * (1 - t));
            const py = cy + Math.sin(p.angle) * dist + (t * 6);
            const size = p.size * (1 - t * 0.6);
            
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = colorFill;
            ctx.beginPath();
            ctx.ellipse(px, py, size, size * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // Centro splash
        ctx.globalAlpha = 1 - t * 0.9;
        ctx.fillStyle = colorFill;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 6 + 20 * t, (6 + 12 * t) * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (t < 1) {
            requestAnimationFrame(drawFrame);
        } else {
            canvas.classList.add('fade-out');
            setTimeout(() => canvas.remove(), 240);
        }
    }

    requestAnimationFrame(drawFrame);
}

function spawnInkSplashFromElement(el, containerEl, color) {
    if (!el) return;
    
    containerEl = containerEl || el.closest('.post') || document.body;
    
    const elRect = el.getBoundingClientRect();
    const contRect = containerEl.getBoundingClientRect();
    
    const x = (elRect.left + elRect.width / 2) - contRect.left + (containerEl.scrollLeft || 0);
    const y = (elRect.top + elRect.height / 2) - contRect.top + (containerEl.scrollTop || 0);
    
    spawnInkSplash(containerEl, Math.round(x), Math.round(y), color);
}