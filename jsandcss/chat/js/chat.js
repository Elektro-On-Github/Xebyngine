// Chat management functions

function switchChat(userId, username, avatar) {
    if (ChatConfig.activeChatId === userId) return;

    ChatConfig.activeChatId = userId;
    ChatConfig.activeChatUsername = username;
    ChatConfig.activeChatAvatar = avatar || '/static/default.png';

    updateChatHeader(username, avatar);

    Array.from(ChatConfig.elements.usersList.children).forEach(child => child.classList.remove('active'));
    const activeItem = Array.from(ChatConfig.elements.usersList.children).find(c => c.dataset.userid === String(userId));
    if (activeItem) activeItem.classList.add('active');

    loadHistory();
    
    markChatAsRead(userId);
}

function markChatAsRead(userId) {
    fetch(`/chat/mark_read/${userId}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    })
    .then(response => {
        if (response.ok) {
            // Azzera il contatore locale
            const pu = ChatConfig.pinnedUsers.find(u => String(u.id) === String(userId));
            if (pu) {
                pu.unread_count = 0;
                loadUserList();
            }
        }
    })
    .catch(err => {
        console.error('Errore mark_read:', err);
    });
}


function loadHistory() {
    if (!ChatConfig.activeChatId) return;

    fetch(`/chat/history/${ChatConfig.activeChatId}`, {cache: "no-store"})
        .then(response => response.text())
        .then(html => {
            ChatConfig.elements.chatContainer.innerHTML = html;
            ChatConfig.elements.chatContainer.scrollTop = ChatConfig.elements.chatContainer.scrollHeight;
        })
        .catch(err => {
            console.error('Errore caricamento cronologia:', err);
            ChatConfig.elements.chatContainer.innerHTML = '<div class="empty-chat"><i class="fas fa-exclamation-triangle"></i><p>Errore nel caricamento dei messaggi</p></div>';
        });
}