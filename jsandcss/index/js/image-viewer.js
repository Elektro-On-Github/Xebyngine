// Fullscreen Image Viewer with Pinch-to-Zoom

(function injectImageViewerStyles(){
    const css = `
    .img-viewer-overlay {
        position: fixed;
        inset: 0;
        background: var(--overlay-bg, rgba(0,0,0,0.6));
        backdrop-filter: blur(10px);
        z-index: 1000000;
        display:flex;
        align-items:center;
        justify-content:center;
        transition: opacity 220ms ease;
    }
    .img-viewer-inner {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        touch-action: none;
        display:flex;
        align-items:center;
        justify-content:center;
    }
    .img-viewer-img {
        max-width: none;
        max-height: none;
        width: auto;
        height: auto;
        will-change: transform;
        transform-origin: center center;
        user-select: none;
        -webkit-user-drag: none;
        object-fit: none;
        cursor: grab;
        display:block;
        transition: transform 200ms cubic-bezier(.22,.9,.3,1);
    }
    .img-viewer-img:active { cursor: grabbing; transition: none; }
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
})();

function openImageViewer(imgSrc, altText = '', options = {}) {
    if (document.getElementById('img-viewer-overlay')) return;

    const overlay = Object.assign(document.createElement('div'), {
        id: 'img-viewer-overlay',
        className: 'img-viewer-overlay',
        style: 'opacity:0'
    });
    const inner = Object.assign(document.createElement('div'), {
        className: 'img-viewer-inner'
    });
    const img = Object.assign(document.createElement('img'), {
        className: 'img-viewer-img',
        src: imgSrc,
        alt: altText
    });
    
    inner.appendChild(img);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.style.opacity = '1');
    document.body.style.overflow = 'hidden';

    const state = {
        scale: 1,
        lastScale: 1,
        minScale: 0.5,
        maxScale: 6,
        pos: { x: 0, y: 0 },
        lastPos: {},
        dragging: false,
        startDist: 0,
        origin: { x: 0, y: 0 },
        gestureActive: false,
        openedViaPinch: !!options.openedViaPinch,
        refW: options.refWidth || 0,
        refH: options.refHeight || 0,
        pinchMid: null
    };

    if (options.initTouches?.length >= 2) {
        const [a, b] = options.initTouches;
        state.startDist = Math.hypot(a.x - b.x, a.y - b.y);
        state.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function setTransform() {
        img.style.transform = `translate(${state.pos.x}px,${state.pos.y}px) scale(${state.scale})`;
    }

    function closeViewer() {
        overlay.style.opacity = '0';
        document.body.style.overflow = '';
        setTimeout(() => overlay.remove(), 220);
        window.removeEventListener('keydown', keyHandler);
    }

    function keyHandler(e) {
        if (e.key === 'Escape') closeViewer();
    }

    img.addEventListener('load', () => {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const vw = window.innerWidth * 0.96;
        const vh = window.innerHeight * 0.86;
        const fitScale = Math.min(vw / natW, vh / natH);
        state.minScale = Math.min(fitScale, 1);
        state.scale = state.minScale;
        
        if (state.openedViaPinch && state.refW && natW && state.pinchMid && state.startDist) {
            const feedScale = state.refW / natW;
            const computed = (state.startDist / state.refW) * feedScale;
            state.scale = Math.max(state.minScale, Math.min(computed, state.maxScale || 1000));
            const viewerCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const offsetX = state.pinchMid.x - (options.refLeft || 0);
            const offsetY = state.pinchMid.y - (options.refTop || 0);
            state.pos.x = viewerCenter.x - offsetX * (natW * state.scale / state.refW);
            state.pos.y = viewerCenter.y - offsetY * (natH * state.scale / state.refH);
        } else {
            state.pos = { x: 0, y: 0 };
        }
        
        state.lastScale = state.scale;
        state.maxScale = Math.max(6, state.scale * 6);
        setTransform();
    });

    overlay.addEventListener('wheel', e => {
        if (!e.ctrlKey && Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.06 : 0.94;
        const prev = state.scale;
        state.scale = Math.min(state.maxScale, Math.max(state.minScale, state.scale * factor));
        const rect = img.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        state.pos.x += (cx - rect.width / 2) * (1 - state.scale / prev);
        state.pos.y += (cy - rect.height / 2) * (1 - state.scale / prev);
        setTransform();
    }, { passive: false });

    img.addEventListener('mousedown', e => {
        e.preventDefault();
        state.dragging = true;
        state.lastPos = { x: e.clientX, y: e.clientY };
    });
    
    window.addEventListener('mousemove', e => {
        if (!state.dragging) return;
        const dx = e.clientX - state.lastPos.x;
        const dy = e.clientY - state.lastPos.y;
        state.lastPos = { x: e.clientX, y: e.clientY };
        state.pos.x += dx;
        state.pos.y += dy;
        setTransform();
    });
    
    window.addEventListener('mouseup', () => state.dragging = false);

    inner.addEventListener('touchstart', ev => {
        if (!ev.touches) return;
        img.style.transition = 'none';
        if (ev.touches.length === 1) {
            state.lastTouch = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, canPan: false };
        } else if (ev.touches.length >= 2) {
            const [a, b] = ev.touches;
            state.startDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            state.lastScale = state.scale;
            state.origin = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
            state.lastPos.mid = { ...state.origin };
            state.gestureActive = true;
        }
    }, { passive: false });

    inner.addEventListener('touchmove', ev => {
        if (!ev.touches || ev.touches.length < 2) return;
        ev.preventDefault();
        const [a, b] = ev.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        state.scale = Math.min(state.maxScale, Math.max(state.minScale, state.lastScale * (dist / state.startDist)));
        const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
        if (state.lastPos.mid) {
            state.pos.x += mid.x - state.lastPos.mid.x;
            state.pos.y += mid.y - state.lastPos.mid.y;
        }
        state.lastPos.mid = mid;
        setTransform();
    }, { passive: false });

    inner.addEventListener('touchend', ev => {
        if (!ev.touches || ev.touches.length === 0) {
            state.lastTouch = null;
            state.startDist = 0;
            state.lastScale = state.scale;
            state.lastPos.mid = null;
            if (state.gestureActive) {
                state.gestureActive = false;
                img.style.transition = 'transform 200ms cubic-bezier(.22,.9,.3,1)';
                setTimeout(closeViewer, 80);
                return;
            }
        }
        setTimeout(() => img.style.transition = 'transform 200ms cubic-bezier(.22,.9,.3,1)', 80);
    }, { passive: false });

    overlay.addEventListener('click', e => {
        if (!e.target.closest('.img-viewer-img')) closeViewer();
    });
    img.addEventListener('click', e => e.stopPropagation());
    window.addEventListener('keydown', keyHandler);

    return { overlay, img };
}

// Click to open viewer
document.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('.post img');
    if (!img) return;
    e.preventDefault();
    const src = img.src || img.getAttribute('src');
    openImageViewer(src, img.alt || '');
});

// Two-finger touch on image opens viewer
document.addEventListener('touchstart', (e) => {
    const imgEl = e.target.closest && e.target.closest('.post img');
    if (!imgEl) return;
    if ((e.touches || []).length >= 2) {
        const touches = Array.from(e.touches).slice(0,2).map(t => ({x: t.clientX, y: t.clientY}));
        const src = imgEl.src || imgEl.getAttribute('src');
        const rect = imgEl.getBoundingClientRect();
        openImageViewer(src, imgEl.alt || '', {
            initTouches: touches,
            openedViaPinch: true,
            refWidth: rect.width,
            refHeight: rect.height,
            refLeft: rect.left,
            refTop: rect.top
        });
        e.preventDefault();
    }
}, { passive: false, capture: true });

// Ctrl+wheel over image opens viewer
document.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    const imgEl = e.target.closest && e.target.closest('.post img');
    if (!imgEl) return;
    const src = imgEl.src || imgEl.getAttribute('src');
    if (document.getElementById('img-viewer-overlay')) return;
    openImageViewer(src, imgEl.alt || '');
    e.preventDefault();
}, { passive: false });
