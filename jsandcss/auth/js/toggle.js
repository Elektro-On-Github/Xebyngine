// Tab toggle functionality - Metro UI clean and fixed

function switchTab(targetTab) {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const title = document.querySelector('h2');
    
    // Prevent double-click
    const currentTab = loginTab.classList.contains('active') ? 'login' : 'register';
    if (currentTab === targetTab) return;
    
    // Title fade-out animation
    title.style.opacity = '0';
    title.style.transform = 'translateX(30px)';
    
    if (targetTab === 'login') {
        // Attiva tab
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        
        // Metro transition: Register esce a DESTRA, Login entra da SINISTRA
        registerForm.classList.remove('active');
        registerForm.classList.add('exit-right');
        
        setTimeout(() => {
            loginForm.classList.add('active');
            loginForm.classList.remove('enter-left');
            registerForm.classList.remove('exit-right');
        }, 50);
        
        // Title fade-in with new text - FIXED
        setTimeout(() => {
            title.textContent = 'Accedi';
            // Force reflow
            void title.offsetWidth;
            title.style.opacity = '1';
            title.style.transform = 'translateX(0)';
        }, 267);
        
        // Update URL
        if (window.history.replaceState) {
            window.history.replaceState(null, null, '/login');
        }
        
    } else {
        // Attiva tab
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        
        // Metro transition: Login esce a SINISTRA, Register entra da DESTRA
        loginForm.classList.remove('active');
        loginForm.classList.add('exit-left');
        
        setTimeout(() => {
            registerForm.classList.add('active');
            registerForm.classList.remove('enter-right');
            loginForm.classList.remove('exit-left');
        }, 50);
        
        // Title fade-in with new text - FIXED
        setTimeout(() => {
            title.textContent = 'Crea un account';
            // Force reflow
            void title.offsetWidth;
            title.style.opacity = '1';
            title.style.transform = 'translateX(0)';
        }, 267);
        
        // Update URL
        if (window.history.replaceState) {
            window.history.replaceState(null, null, '/register');
        }
    }
}

function initTabSwitcher() {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const title = document.querySelector('h2');
    
    // Aggiungi animazione iniziale al title
    title.classList.add('initial-animation');
    
    // Rimuovi la classe animation dopo che finisce
    setTimeout(() => {
        title.classList.remove('initial-animation');
        // Forza gli stili finali
        title.style.opacity = '1';
        title.style.transform = 'translateX(0)';
    }, 1000); // 667ms animation + 200ms delay + margine
    
    // Event listeners
    loginTab.addEventListener('click', () => switchTab('login'));
    registerTab.addEventListener('click', () => switchTab('register'));
    
    // Check URL and set initial state
    const path = window.location.pathname;
    if (path.includes('register')) {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        title.textContent = 'Crea un account';
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    } else {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        title.textContent = 'Accedi';
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    }
}