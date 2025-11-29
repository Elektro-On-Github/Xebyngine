// File upload functionality

function updateFileName(input) {
    const fileNameElement = ProfileConfig.elements.fileNameText;
    const fileName = input.files[0] ? input.files[0].name : 'Nessun file selezionato';
    
    // Metro style slide animation
    fileNameElement.style.transition = 'opacity 300ms cubic-bezier(0.1, 0.9, 0.2, 1), transform 300ms cubic-bezier(0.1, 0.9, 0.2, 1)';
    fileNameElement.style.opacity = '0';
    fileNameElement.style.transform = 'translateX(-20px)';
    
    setTimeout(() => {
        fileNameElement.textContent = fileName;
        fileNameElement.style.opacity = '1';
        fileNameElement.style.transform = 'translateX(0)';
    }, 300);
}

function initFileUpload() {
    const fileInput = ProfileConfig.elements.fileInput;
    
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            updateFileName(this);
        });
    }
}
