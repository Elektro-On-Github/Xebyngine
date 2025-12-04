function initializeChat() {
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
    let typingTimer;
    ChatConfig.elements.input.addEventListener('input', () => {
        clearTimeout(typingTimer);
        sendTypingStatus(true);
        typingTimer = setTimeout(() => sendTypingStatus(false), 3000);
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