function initScrollAnimations() {
    let animatedCount = 0;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.classList.contains('animate-in')) {
                setTimeout(() => {
                    entry.target.classList.add('animate-in');
                }, animatedCount * 50);

                animatedCount++;
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        rootMargin: '50px',
        threshold: 0.1
    });

    document.querySelectorAll('li.user-item').forEach(item => observer.observe(item));
}