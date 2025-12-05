function initSearch() {
    const { searchInput: input, userList: list } = MyPinsConfig.elements;

    const filter = query => {
        const s = (query || '').trim().toLowerCase();
        list.forEach(li => {
            const name = (li.dataset.username || li.textContent || '').toLowerCase();
            li.style.display = !s || name.includes(s) ? 'flex' : 'none';
        });
    };

    if (input) {
        input.addEventListener('input', e => filter(e.target.value));
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                filter(input.value);
            }
        });
    }
}