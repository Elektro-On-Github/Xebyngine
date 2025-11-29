// Initialization

function initProfilePage() {
    // Initialize configuration
    ProfileConfig.init();
    
    // Initialize all components
    initFileUpload();
    initSocialLinks();
    initFormSubmit();
    
    // Enable smooth scrolling
    document.documentElement.style.scrollBehavior = 'smooth';
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfilePage);
} else {
    initProfilePage();
}
