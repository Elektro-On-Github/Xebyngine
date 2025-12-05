function updateFileName(input) {
    const fileNameElement = ProfileConfig.elements.fileNameText;
    const fileName = input.files[0]?.name || 'Nessun file selezionato';

    fileNameElement.style.cssText = 'opacity:0;transform:translateX(-20px);transition:opacity 300ms cubic-bezier(0.1,0.9,0.2,1),transform 300ms cubic-bezier(0.1,0.9,0.2,1)';

    setTimeout(() => {
        fileNameElement.textContent = fileName;
        fileNameElement.style.cssText = 'opacity:1;transform:translateX(0);transition:opacity 300ms cubic-bezier(0.1,0.9,0.2,1),transform 300ms cubic-bezier(0.1,0.9,0.2,1)';
    }, 300);
}

function initFileUpload() {
    const fileInput = ProfileConfig.elements.fileInput;
    fileInput?.addEventListener('change', function() {
        updateFileName(this);
    });
}