function initializeSSE() {
    const evtSource = new EventSource(`/stream/messages?user_id=${ChatConfig.myId}`);
    
    evtSource.addEventListener('message', e => {
        const data = JSON.parse(e.data);
        if (ChatConfig.activeChatId && String(data.sender) === String(ChatConfig.activeChatId)) {
            const avatar = ChatConfig.pinnedUsers.find(u => String(u.id) === String(data.sender))?.avatar_url || '/static/default.png';
            appendMessage(data.sender, data.content, avatar);
            markChatAsRead(data.sender);
        } else {
            const pu = ChatConfig.pinnedUsers.find(u => String(u.id) === String(data.sender));
            if (pu) {
                pu.unread_count = (Number(pu.unread_count) || 0) + 1;
                pu.last_message = data.content;
                pu.last_at = new Date().toISOString();
            } else {
                ChatConfig.pinnedUsers.unshift({ 
                    id: data.sender, 
                    username: data.sender, 
                    avatar_url: data.avatar || '/static/default.png', 
                    last_message: data.content, 
                    last_at: new Date().toISOString(), 
                    unread_count: 1 
                });
            }
            loadUserList();
        }
    });

    evtSource.addEventListener('typing', e => {
        const data = JSON.parse(e.data);
        if (String(data.user_id) === String(ChatConfig.activeChatId)) {
            showTypingIndicator(data.is_typing);
        }
    });

    evtSource.onerror = console.error;
}