// Initialization and event listeners

function initializeEventListeners() {
    // Send button click
    ChatConfig.elements.sendBtn.addEventListener('click', sendMessage);

    // Enter key to send message
    ChatConfig.elements.input.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function initializeChat() {
    // Initialize configuration (now reads from JSON in the HTML)
    ChatConfig.init();
    
    // Set up event listeners
    initializeEventListeners();
    
    // Load user list
    loadUserList();

    // Initialize SSE
    initializeSSE();

    // Handle initial chat if provided
    if (ChatConfig.initialChat && ChatConfig.initialChat.id) {
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

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeChat);
} else {
    initializeChat();
}
