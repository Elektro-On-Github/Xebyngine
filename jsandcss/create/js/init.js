function initCreatePage() {
    CreateConfig.init();
    initPhotosPreview();
    initPollModal();
    initTimeline();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCreatePage);
} else {
    initCreatePage();
}