function initPhotosPreview() {
    const { photosInput: input, photosBrowse: btn, photosPreview: preview } = CreateConfig.elements;

    if (!input || !preview) return;

    if (btn) {
        btn.addEventListener('click', () => input.click());
        btn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                input.click();
            }
        });
    }

    input.addEventListener('change', () => {
        preview.innerHTML = '';
        const files = Array.from(input.files).slice(0, 5);
        
        files.forEach(f => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            img.alt = f.name;
            img.loading = 'lazy';
            preview.appendChild(img);
        });
    });
}