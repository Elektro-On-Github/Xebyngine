// Poll overlay modal behavior

function initPollModal() {
    const openBtn = document.getElementById('add-poll-btn');
    const overlay = CreateConfig.elements.pollOverlay;
    
    if (!openBtn || !overlay) return;
    
    const panel = overlay.querySelector('.overlay-panel');
    const modalCancel = document.getElementById('modal-cancel');
    const modalSave = document.getElementById('modal-save');
    const modalAdd = document.getElementById('modal-add-option');
    const modalOptions = CreateConfig.elements.pollOptions;
    const modalQuestion = CreateConfig.elements.pollQuestion;

    function showModal() {
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        
        if (modalAdd) {
            modalAdd.style.display = modalOptions.querySelectorAll('input').length >= 6 ? 'none' : '';
        }
        
        setTimeout(() => {
            try {
                modalQuestion.focus();
            } catch (_) {}
        }, 220);
    }

    function hideModal() {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
    }

    // Event listeners
    openBtn.onclick = e => {
        e.preventDefault();
        showModal();
    };

    if (modalCancel) {
        modalCancel.onclick = hideModal;
    }

    overlay.onclick = e => {
        if (e.target === overlay) hideModal();
    };

    document.onkeydown = e => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) {
            hideModal();
        }
    };

    // Add option button
    if (modalAdd) {
        modalAdd.onclick = () => {
            const inputs = modalOptions.querySelectorAll('input');
            const last = inputs[inputs.length - 1];
            
            if (last && !last.value.trim()) {
                last.focus();
                return;
            }
            
            if (inputs.length >= 6) return;
            
            const inp = document.createElement('input');
            inp.className = 'modal-poll-option';
            inp.placeholder = `Opzione ${inputs.length + 1}`;
            modalOptions.appendChild(inp);
            
            if (modalOptions.querySelectorAll('input').length >= 6) {
                modalAdd.style.display = 'none';
            }
        };
    }

    // Save button
    if (modalSave) {
        modalSave.onclick = () => {
            const q = modalQuestion.value || '';
            const formQ = document.querySelector('input[name="poll_question"]');
            if (formQ) formQ.value = q;

            const container = document.getElementById('poll-options-container');
            if (!container) return;
            
            container.innerHTML = '';
            let idx = 1;
            
            modalOptions.querySelectorAll('input').forEach(i => {
                const val = i.value.trim();
                if (!val) return;
                
                const f = document.createElement('input');
                f.type = 'hidden';
                f.name = `poll_option_${idx++}`;
                f.value = val;
                container.appendChild(f);
            });
            
            if (idx <= 2) {
                alert('Inserisci almeno 2 opzioni per il sondaggio');
                return;
            }
            
            hideModal();
        };
    }
}
