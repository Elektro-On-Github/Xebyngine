// Touch Gesture Handlers for Horizontal Scrolling

(function enableHorizontalImageScroll(){
    const THRESHOLD = 20;
    const isPointerSupported = !!window.PointerEvent;
    const state = new WeakMap();

    function getScrollerFromTarget(t) {
        return t && t.closest ? t.closest('.post-images-scroller') : null;
    }

    function onStart(scroller, id, x, y) {
        state.set(scroller, { id, startX: x, startY: y, lastX: x, lastY: y, isHorizontal: null });
    }

    function onMove(scroller, x, y, ev) {
        const s = state.get(scroller);
        if (!s) return;
        const dx = x - s.startX;
        const dy = y - s.startY;
        if (s.isHorizontal === null) {
            if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
            s.isHorizontal = Math.abs(dx) > Math.abs(dy);
        }
        if (s.isHorizontal) {
            ev.preventDefault();
            const delta = x - s.lastX;
            scroller.scrollLeft -= delta;
            s.lastX = x;
            s.lastY = y;
        }
    }

    function onEnd(scroller) {
        const s = state.get(scroller);
        if (!s) return state.delete(scroller);
        if (s.isHorizontal) {
            const imgs = Array.from(scroller.querySelectorAll('img'));
            if (imgs.length) {
                const idx = Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth));
                const clamped = Math.max(0, Math.min(imgs.length - 1, idx));
                const target = imgs[clamped];
                if (target) scroller.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
            }
        }
        state.delete(scroller);
    }

    if (isPointerSupported) {
        document.addEventListener('pointerdown', (ev) => {
            if (ev.pointerType !== 'touch') return;
            const scroller = getScrollerFromTarget(ev.target);
            if (!scroller) return;
            scroller.setPointerCapture && scroller.setPointerCapture(ev.pointerId);
            onStart(scroller, ev.pointerId, ev.clientX, ev.clientY);
        }, { passive: true });

        document.addEventListener('pointermove', (ev) => {
            if (ev.pointerType !== 'touch') return;
            const scroller = getScrollerFromTarget(ev.target);
            if (!scroller) return;
            onMove(scroller, ev.clientX, ev.clientY, ev);
        }, { passive: false });

        document.addEventListener('pointerup', (ev) => {
            const scroller = getScrollerFromTarget(ev.target);
            if (!scroller) return;
            onEnd(scroller);
        }, { passive: true });

        document.addEventListener('pointercancel', (ev) => {
            const scroller = getScrollerFromTarget(ev.target);
            if (!scroller) return;
            onEnd(scroller);
        }, { passive: true });
    } else {
        let activeScroller = null;
        document.addEventListener('touchstart', (ev) => {
            if (!ev.touches || ev.touches.length !== 1) return;
            const scroller = getScrollerFromTarget(ev.target);
            if (!scroller) return;
            activeScroller = scroller;
            onStart(scroller, 'touch', ev.touches[0].clientX, ev.touches[0].clientY);
        }, { passive: true });

        document.addEventListener('touchmove', (ev) => {
            if (!activeScroller || !ev.touches || ev.touches.length !== 1) return;
            onMove(activeScroller, ev.touches[0].clientX, ev.touches[0].clientY, ev);
        }, { passive: false });

        document.addEventListener('touchend', (ev) => {
            if (!activeScroller) return;
            onEnd(activeScroller);
            activeScroller = null;
        }, { passive: true });
    }
})();

// Gallery Gesture Helper
(function(){
    function setupGalleryGestures(container){
        let startX=0, startY=0, isDragging=null;
        container.addEventListener('touchstart', function(e){
            if(e.touches.length>1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = null;
        }, {passive:true});

        container.addEventListener('touchmove', function(e){
            if(e.touches.length>1) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if(isDragging === null){
                if(Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) isDragging = true;
                else if(Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) isDragging = false;
            }
            if(isDragging === true){
                e.preventDefault();
                container.scrollLeft -= dx;
                startX = e.touches[0].clientX;
            }
        }, {passive:false});

        container.addEventListener('touchend', function(){ isDragging = null; }, {passive:true});
    }

    document.addEventListener('DOMContentLoaded', function(){
        const scrollers = document.querySelectorAll('.post-images-scroller');
        scrollers.forEach(s=> setupGalleryGestures(s));

        const feed = document.getElementById('post-feed');
        if(feed){
            const mo = new MutationObserver((mutations)=>{
                for(const m of mutations){
                    for(const n of m.addedNodes){
                        if(n && n.querySelector){
                            const s = n.querySelector('.post-images-scroller');
                            if(s) setupGalleryGestures(s);
                        }
                    }
                }
            });
            mo.observe(feed, { childList: true, subtree: true });
        }
    });
})();
