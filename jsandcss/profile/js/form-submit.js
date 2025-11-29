// Form submission handler

function initFormSubmit() {
    const form = ProfileConfig.elements.form;
    const submitBtn = ProfileConfig.elements.submitBtn;
    
    if (!form || !submitBtn) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Add loading state
        submitBtn.classList.add('loading');
        submitBtn.innerHTML = '<i class="fas fa-spinner"></i> Salvataggio...';
        
        // Create FormData and send via fetch
        const formData = new FormData(form);
        
        fetch('/profile', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (response.ok) {
                // Success - add exit animation
                document.body.classList.add('page-exit');
                
                // Redirect to user page after animation
                setTimeout(() => {
                    window.location.href = '/user/' + ProfileConfig.username;
                }, 400);
            } else {
                // Error handling
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Errore';
                
                setTimeout(() => {
                    submitBtn.innerHTML = '<i class="fas fa-save"></i> Aggiorna Profilo';
                }, 2000);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Errore';
            
            setTimeout(() => {
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Aggiorna Profilo';
            }, 2000);
        });
    });
}
