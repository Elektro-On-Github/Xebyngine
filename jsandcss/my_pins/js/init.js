// Initialization

function initMyPinsPage() {
    // Initialize configuration
    MyPinsConfig.init();
    
    // Initialize all components
    initScrollAnimations();
    initModal();
    initSearch();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMyPinsPage);
} else {
    initMyPinsPage();
}
