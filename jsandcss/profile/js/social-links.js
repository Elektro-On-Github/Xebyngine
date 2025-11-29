// Social links management

function updateAddButton() {
    const entries = Array.from(document.querySelectorAll('.social-entry'));
    const anyHidden = entries.some(e => e.style.display === 'none' || e.style.display === '');
    const btn = ProfileConfig.elements.addSocialBtn;
    
    if (!btn) return;
    
    btn.disabled = !anyHidden;
    
    const iconHtml = anyHidden 
        ? '<i class="fas fa-plus"></i> Aggiungi collegamento' 
        : '<i class="fas fa-check"></i> Limite raggiunto (8)';
    
    btn.innerHTML = iconHtml;
}

function addSocial() {
    const entries = Array.from(document.querySelectorAll('.social-entry'));
    for (let i = 0; i < entries.length; i++) {
        if (entries[i].style.display === 'none' || entries[i].style.display === '') {
            entries[i].style.display = 'flex';
            entries[i].offsetHeight; // Trigger reflow
            break;
        }
    }
    updateAddButton();
}

function removeSocial(index) {
    const entry = document.querySelector('.social-entry[data-index="' + index + '"]');
    if (!entry) return;
    
    const input = entry.querySelector('input');
    
    entry.classList.add('removing');
    
    setTimeout(() => {
        if (input) input.value = '';
        entry.style.display = 'none';
        entry.classList.remove('removing');
        updateAddButton();
    }, 400); // Match Metro animation duration
}

function initSocialLinks() {
    const addBtn = ProfileConfig.elements.addSocialBtn;
    
    if (addBtn) {
        addBtn.addEventListener('click', addSocial);
    }
    
    // Attach click handlers to all remove buttons
    document.querySelectorAll('.remove-social-btn').forEach(btn => {
        const index = btn.closest('.social-entry')?.dataset.index;
        if (index) {
            btn.addEventListener('click', () => removeSocial(index));
        }
    });
    
    // Initial update
    updateAddButton();
}

// Make removeSocial globally accessible for backwards compatibility
window.removeSocial = removeSocial;
