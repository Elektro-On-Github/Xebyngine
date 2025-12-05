function initFormSubmit() {
    const { form, submitBtn } = ProfileConfig.elements;

    if (!form || !submitBtn) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();

        submitBtn.classList.add('loading');
        submitBtn.innerHTML = '<i class="fas fa-spinner"></i> Salvataggio...';

        try {
            const response = await fetch('/profile', {
                method: 'POST',
                body: new FormData(form)
            });

            if (response.ok) {
                document.body.classList.add('page-exit');
                setTimeout(() => {
                    window.location.href = '/user/' + ProfileConfig.username;
                }, 400);
            } else {
                throw new Error('Response not ok');
            }
        } catch (error) {
            console.error('Error:', error);
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Errore';

            setTimeout(() => {
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Aggiorna Profilo';
            }, 2000);
        }
    });
}