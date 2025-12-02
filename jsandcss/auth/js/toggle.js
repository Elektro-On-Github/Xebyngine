// Tab toggle - Data-driven version

let isInitialized = false;

function switchTab(targetTab) {
    // Get elements by data attributes
    const tabs = document.querySelectorAll('[data-tab]');
    const forms = document.querySelectorAll('[data-tab-content]');
    const title = document.querySelector('h2[data-login-text]');
    
    // Find active tab
    const currentTab = document.querySelector('[data-tab].active')?.dataset.tab;
    if (currentTab === targetTab) return;
    
    const isLogin = targetTab === 'login';
    const showForm = document.querySelector(`[data-tab-content="${targetTab}"]`);
    const hideForm = document.querySelector(`[data-tab-content="${currentTab}"]`);
    
    // 1. Update tabs
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === targetTab);
    });
    
    // 2. Title transition
    title.classList.add('switching');
    
    // 3. Hide current form
    hideForm.classList.add(isLogin ? 'exit-right' : 'exit-left');
    hideForm.classList.remove('active');
    
    // 4. After exit, show new form
    setTimeout(() => {
        hideForm.classList.remove('exit-left', 'exit-right');
        
        // Update title from data attribute
        title.textContent = isLogin ? title.dataset.loginText : title.dataset.registerText;
        title.classList.remove('switching');
        
        // Show new form
        showForm.classList.add('active');
        
    }, 300);
    
    // 5. Update URL
    window.history?.replaceState(null, null, isLogin ? '/login' : '/register');
}

function initTabSwitcher() {
    if (isInitialized) return;
    isInitialized = true;
    
    const tabs = document.querySelectorAll('[data-tab]');
    const forms = document.querySelectorAll('[data-tab-content]');
    const title = document.querySelector('h2[data-login-text]');
    
    // Event delegation - usa click sui button con data-tab
    tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Cleanup initial animation dopo primo load
    setTimeout(() => {
        forms.forEach(form => form.classList.remove('initial-animate'));
    }, 800);
}