function updateAddButton() {
    const entries = [...document.querySelectorAll('.social-entry')];
    const anyHidden = entries.some(e => e.style.display === 'none' || e.style.display === '');
    const btn = ProfileConfig.elements.addSocialBtn;

    if (!btn) return;

    btn.disabled = !anyHidden;
    btn.innerHTML = anyHidden
        ? '<i class="fas fa-plus"></i> Aggiungi collegamento'
        : '<i class="fas fa-check"></i> Limite raggiunto (8)';
}

function addSocial() {
    const entries = [...document.querySelectorAll('.social-entry')];
    
    for (const entry of entries) {
        if (entry.style.display === 'none' || entry.style.display === '') {
            entry.style.display = 'flex';
            entry.offsetHeight;
            break;
        }
    }
    updateAddButton();
}

function removeSocial(index) {
    const entry = document.querySelector(`.social-entry[data-index="${index}"]`);
    if (!entry) return;

    const input = entry.querySelector('input');
    entry.classList.add('removing');

    setTimeout(() => {
        if (input) input.value = '';
        entry.style.display = 'none';
        entry.classList.remove('removing');
        updateAddButton();
    }, 400);
}

function initSocialLinks() {
    const addBtn = ProfileConfig.elements.addSocialBtn;
    addBtn?.addEventListener('click', addSocial);

    document.querySelectorAll('.remove-social-btn').forEach(btn => {
        const index = btn.closest('.social-entry')?.dataset.index;
        if (index) {
            btn.addEventListener('click', () => removeSocial(index));
        }
    });

    updateAddButton();
}

window.removeSocial = removeSocial;