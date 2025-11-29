// Photos preview functionality

function initPhotosPreview() {
    const input = CreateConfig.elements.photosInput;
    const btn = CreateConfig.elements.photosBrowse;
    const preview = CreateConfig.elements.photosPreview;
    
    if (!input || !preview) return;

    // Click handler
    if (btn) {
        btn.addEventListener('click', () => input.click());
        
        // Keyboard accessibility
        btn.addEventListener('keydown', e => {
            if (['Enter', ' '].includes(e.key)) {
                e.preventDefault();
                input.click();
            }
        });
    }

    // File change handler
    input.addEventListener('change', () => {
        preview.innerHTML = '';
        Array.from(input.files || [])
            .slice(0, 5)
            .forEach(f => {
                const img = Object.assign(document.createElement('img'), {
                    src: URL.createObjectURL(f),
                    alt: f.name,
                    loading: 'lazy',
                    style: `
                        height: 120px;
                        border-radius: 12px;
                        object-fit: cover;
                    `
                });
                preview.appendChild(img);
            });
    });
}
