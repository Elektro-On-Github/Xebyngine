async function initializeChat() {
    // Mostra indicatore di caricamento E2EE
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'e2ee-loading';
    loadingDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: #4ec9b0;
        padding: 30px 50px;
        border-radius: 10px;
        text-align: center;
        z-index: 9999;
        font-family: monospace;
    `;
    loadingDiv.innerHTML = '🔐 Caricamento chiavi E2EE...';
    document.body.appendChild(loadingDiv);
    
    // Aspetta che E2EE sia inizializzato prima di procedere
    let attempts = 0;
    while (!E2EE.initialized && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }
    
    // Rimuovi l'indicatore di caricamento
    loadingDiv.remove();
    
    // Se E2EE non si è inizializzato, log e prosegui comunque
    if (!E2EE.initialized) {
        console.warn('⚠ E2EE non inizializzato dopo attesa, continuando...');
    } else {
        console.log('✓ E2EE pronto');
    }
    
    ChatConfig.init();
    
    // Send button
    ChatConfig.elements.sendBtn.addEventListener('click', sendMessage);
    
    // Enter to send
    ChatConfig.elements.input.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Typing indicator
    let typingTimer;       // Timer per lo stop
    let lastTypingTime = 0; // Timestamp dell'ultimo invio "true"

    ChatConfig.elements.input.addEventListener('input', () => {
        const now = Date.now();

        // 1. THROTTLE: Invia "sta scrivendo" (true) al massimo una volta ogni 2 secondi
        if (now - lastTypingTime > 2000) {
            sendTypingStatus(true);
            lastTypingTime = now;
        }

        // 2. DEBOUNCE: Gestisce quando smetti di scrivere
        clearTimeout(typingTimer);
        
        // Se l'utente non scrive per 1 secondo, inviamo "false"
        typingTimer = setTimeout(() => {
            sendTypingStatus(false);
            lastTypingTime = 0; // Resetta il timer così al prossimo tasto parte subito
        }, 1000);
    });
    
    loadUserList();
    initializeSSE();

    if (ChatConfig.initialChat?.id) {
        const found = ChatConfig.pinnedUsers.find(u => u.id === ChatConfig.initialChat.id);
        if (found) {
            switchChat(found.id, found.username, found.avatar_url);
            closeUsersMenu();
        } else {
            ChatConfig.pinnedUsers.unshift(ChatConfig.initialChat);
            loadUserList();
            switchChat(ChatConfig.initialChat.id, ChatConfig.initialChat.username, ChatConfig.initialChat.avatar_url);
            closeUsersMenu();
        }
    } else {
        openUsersMenu();
    }
}

document.readyState === 'loading' ? 
    document.addEventListener('DOMContentLoaded', initializeChat) : 
    initializeChat();