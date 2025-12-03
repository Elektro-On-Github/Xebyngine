// Server-Sent Events (SSE) management

function initializeSSE() {
    const evtSource = new EventSource(`/stream/messages?user_id=${ChatConfig.myId}`);
    
    evtSource.onmessage = e => {
        try {
            const data = JSON.parse(e.data);
            // If the incoming message belongs to the currently open chat, append it
            if (ChatConfig.activeChatId && String(data.sender) === String(ChatConfig.activeChatId)) {
                const avatarUrl = ChatConfig.pinnedUsers.find(u => String(u.id) === String(data.sender))?.avatar_url || '/static/default.png';
                appendMessage(data.sender, data.content, avatarUrl);
                
                // marka come letto
                markChatAsRead(data.sender);
                return;
            }

            // Otherwise it's a message for another conversation: update local unread counter and refresh the list
            const pu = ChatConfig.pinnedUsers.find(u => String(u.id) === String(data.sender));
            if (pu) {
                pu.unread_count = (Number(pu.unread_count) || 0) + 1;
                pu.last_message = data.content;
                pu.last_at = new Date().toISOString();
            } else {
                // If the sender is not in the list, add a minimal entry so it appears
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
        } catch (error) {
            console.error('Errore parsing SSE:', error);
        }
    };

    evtSource.onerror = (err) => {
        console.error('Errore SSE:', err);
    };
}
