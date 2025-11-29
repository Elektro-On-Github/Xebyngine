// Initialization

function initAuthPage() {
    // Initialize tab switcher
    initTabSwitcher();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthPage);
} else {
    initAuthPage();
}