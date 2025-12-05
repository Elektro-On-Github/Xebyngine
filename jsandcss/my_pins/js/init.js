function initMyPinsPage() {
    MyPinsConfig.init();
    initScrollAnimations();
    initModal();
    initSearch();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMyPinsPage);
} else {
    initMyPinsPage();
}