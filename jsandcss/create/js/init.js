// Initialization

function initCreatePage() {
    // Initialize configuration
    CreateConfig.init();
    
    // Initialize all components
    initPhotosPreview();
    initPollModal();
    initTimeline();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCreatePage);
} else {
    initCreatePage();
}
