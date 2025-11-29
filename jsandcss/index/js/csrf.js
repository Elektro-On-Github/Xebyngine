// CSRF Token Auto-Injection

document.addEventListener('DOMContentLoaded', function() {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    
    if (csrfToken) {
        // Add CSRF to all forms automatically
        document.querySelectorAll('form').forEach(form => {
            if (form.querySelector('input[name="csrf_token"]')) return;
            
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'csrf_token';
            input.value = csrfToken;
            form.appendChild(input);
        });
        
        // Add CSRF to all AJAX requests automatically
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            if (options.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method.toUpperCase())) {
                options.headers = options.headers || {};
                
                if (!options.headers['X-CSRF-Token'] && !options.headers['X-CSRFToken']) {
                    options.headers['X-CSRF-Token'] = csrfToken;
                }
                
                if (options.body instanceof FormData && !options.body.has('csrf_token')) {
                    options.body.append('csrf_token', csrfToken);
                }
            }
            return originalFetch(url, options);
        };
    }
});
