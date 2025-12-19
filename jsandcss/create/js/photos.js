function initPhotosPreview() {
    const { photosInput, photosBrowse: photosBtn, videosInput, videosBrowse: videosBtn, photosPreview: preview } = CreateConfig.elements;

    if (!photosInput || !preview) return;

    const handle = (input, btn) => {
        if (btn) {
            btn.addEventListener('click', () => input.click());
            btn.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    input.click();
                }
            });
        }
        input.addEventListener('change', updatePreview);
    };

    handle(photosInput, photosBtn);
    if (videosInput) handle(videosInput, videosBtn);

    function updatePreview() {
        preview.innerHTML = '';
        const files = [];
        if (photosInput.files) files.push(...Array.from(photosInput.files));
        if (videosInput?.files) files.push(...Array.from(videosInput.files));
        
        files.slice(0, 5).forEach(f => {
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