// Intersection Observer per animazioni on-scroll

function initScrollAnimations() {
    // Contatore per lo stagger effect
    let animatedCount = 0;
    
    // Crea l'Intersection Observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // Quando l'elemento entra nel viewport
            if (entry.isIntersecting && !entry.target.classList.contains('animate-in')) {
                // Piccolo delay progressivo per effetto stagger
                const delay = animatedCount * 50; // 50ms tra ogni elemento
                
                setTimeout(() => {
                    entry.target.classList.add('animate-in');
                }, delay);
                
                animatedCount++;
                
                // Smetti di osservare questo elemento dopo l'animazione
                observer.unobserve(entry.target);
            }
        });
    }, {
        // Opzioni dell'observer
        root: null, // usa il viewport
        rootMargin: '50px', // inizia l'animazione 50px prima che entri
        threshold: 0.1 // triggera quando almeno il 10% è visibile
    });
    
    // Osserva tutti gli user-item
    document.querySelectorAll('li.user-item').forEach(item => {
        observer.observe(item);
    });
}
