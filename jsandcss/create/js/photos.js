function initPhotosPreview() {
    const { mediaInput, mediaBrowse: mediaBtn, photosPreview: preview } = CreateConfig.elements;

    if (!mediaInput || !preview) return;

    if (mediaBtn) {
        mediaBtn.addEventListener('click', () => mediaInput.click());
        mediaBtn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                mediaInput.click();
            }
        });
    }

    mediaInput.addEventListener('change', updatePreview);

    function updatePreview() {
        preview.innerHTML = '';
        const files = Array.from(mediaInput.files || []).slice(0, 5);
        
        files.forEach(f => {
            if (f.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(f);
                img.alt = f.name;
                img.loading = 'lazy';
                preview.appendChild(img);
            } else if (f.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = URL.createObjectURL(f);
                video.style.backgroundColor = '#000';
                preview.appendChild(video);
            }
        });
    }
}