function initProfilePage() {
    ProfileConfig.init();
    initFileUpload();
    initSocialLinks();
    initFormSubmit();
    document.documentElement.style.scrollBehavior = 'smooth';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfilePage);
} else {
    initProfilePage();
}