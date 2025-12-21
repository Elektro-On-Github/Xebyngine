// Fullscreen Video Viewer with controls and blur background

(function loadVideoViewerStyles(){
    if (!document.querySelector('link[href*="video-viewer.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/jsandcss/index/css/video-viewer.css';
        document.head.appendChild(link);
    }
})();

function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function openVideoViewer(videoSrc) {
    if (document.getElementById('video-viewer-overlay')) return;

    const overlay = Object.assign(document.createElement('div'), {
        id: 'video-viewer-overlay',
        className: 'video-viewer-overlay',
        style: 'opacity:0'
    });

    const inner = Object.assign(document.createElement('div'), {
        className: 'video-viewer-inner'
    });

    const video = Object.assign(document.createElement('video'), {
        className: 'video-viewer-video',
        src: videoSrc,
        controls: false,
        autoplay: true,
        preload: 'metadata'
    });

    const closeBtn = Object.assign(document.createElement('button'), {
        className: 'video-viewer-close',
        innerHTML: '<i class="fa-solid fa-xmark"></i>',
        type: 'button'
    });

    const controlsDiv = Object.assign(document.createElement('div'), {
        className: 'video-viewer-controls'
    });

    const playBtn = Object.assign(document.createElement('button'), {
        className: 'video-viewer-btn',
        innerHTML: '<i class="fa-solid fa-play"></i>',
        type: 'button',
        title: 'Riproduci'
    });

    const progressDiv = Object.assign(document.createElement('div'), {
        className: 'video-viewer-progress'
    });

    const progressBar = Object.assign(document.createElement('div'), {
        className: 'video-viewer-progress-bar'
    });
    progressDiv.appendChild(progressBar);

    const timeDiv = Object.assign(document.createElement('div'), {
        className: 'video-viewer-time',
        textContent: '0:00'
    });

    controlsDiv.appendChild(playBtn);
    controlsDiv.appendChild(progressDiv);
    controlsDiv.appendChild(timeDiv);

    inner.appendChild(video);
    inner.appendChild(closeBtn);
    inner.appendChild(controlsDiv);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.style.opacity = '1');
    document.body.style.overflow = 'hidden';

    let controlsTimeout;
    function showControls() {
        controlsDiv.style.opacity = '1';
        clearTimeout(controlsTimeout);
        if (video.playing) {
            controlsTimeout = setTimeout(() => {
                controlsDiv.style.opacity = '0.5';
            }, 3000);
        }
    }

    function closeViewer() {
        overlay.style.opacity = '0';
        video.pause();
        document.body.style.overflow = '';
        setTimeout(() => overlay.remove(), 220);
        clearTimeout(controlsTimeout);
        window.removeEventListener('keydown', keyHandler);
    }

    function keyHandler(e) {
        if (e.key === 'Escape') closeViewer();
        if (e.key === ' ') {
            e.preventDefault();
            video.paused ? video.play() : video.pause();
        }
        if (e.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
        if (e.key === 'ArrowRight') video.currentTime = Math.min(video.duration, video.currentTime + 5);
    }

    video.addEventListener('play', () => {
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        playBtn.title = 'Pausa';
        controlsDiv.style.opacity = '1';
        showControls();
    });

    video.addEventListener('pause', () => {
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        playBtn.title = 'Riproduci';
        controlsDiv.style.opacity = '1';
        clearTimeout(controlsTimeout);
    });

    video.addEventListener('timeupdate', () => {
        const percent = video.duration ? (video.currentTime / video.duration) * 100 : 0;
        progressBar.style.width = percent + '%';
        timeDiv.textContent = formatTime(video.currentTime);
    });

    video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {}); // gestisce errori se l'autoplay si dovesse scassare
        timeDiv.textContent = formatTime(video.duration || 0);
    });

    video.addEventListener('ended', () => {
        video.currentTime = 0;
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    });

    playBtn.addEventListener('click', () => {
        video.paused ? video.play() : video.pause();
    });

    progressDiv.addEventListener('click', (e) => {
        const rect = progressDiv.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        video.currentTime = percent * video.duration;
        showControls();
    });

    closeBtn.addEventListener('click', closeViewer);
    overlay.addEventListener('click', (e) => {
        if (!e.target.closest('.video-viewer-video') && !e.target.closest('.video-viewer-controls') && !e.target.closest('.video-viewer-close')) {
            closeViewer();
        }
    });

    video.addEventListener('click', (e) => e.stopPropagation());
    controlsDiv.addEventListener('click', (e) => e.stopPropagation());
    inner.addEventListener('mousemove', showControls);

    window.addEventListener('keydown', keyHandler);

    return { overlay, video };
}

// Auto-bind video click handlers
document.addEventListener('click', e => {
    const video = e.target.closest && e.target.closest('.post video');
    if (!video || video.controls) return;
    e.preventDefault();
    e.stopPropagation();
    openVideoViewer(video.src || video.getAttribute('src'));
});
