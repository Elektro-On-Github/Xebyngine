// CSRF Token Management
// This is critical for security - handles CSRF token injection for all requests

document.addEventListener('DOMContentLoaded', function() {
    // Get CSRF token from meta tag
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    
    if (csrfToken) {
        // Add CSRF to all forms automatically
        document.querySelectorAll('form').forEach(form => {
            // Skip if already has CSRF input
            if (form.querySelector('input[name="csrf_token"]')) return;
            
            // Create hidden input
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
                
                // Add CSRF header if not already present
                if (!options.headers['X-CSRF-Token'] && !options.headers['X-CSRFToken']) {
                    options.headers['X-CSRF-Token'] = csrfToken;
                }
                
                // If using FormData, append CSRF
                if (options.body instanceof FormData && !options.body.has('csrf_token')) {
                    options.body.append('csrf_token', csrfToken);
                }
            }
            return originalFetch(url, options);
        };
    }
});
