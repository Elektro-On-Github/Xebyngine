const DEFAULT_AVATAR = '/static/default.png';

function initializeSSE() {
    const evtSource = new EventSource(`/stream/messages?user_id=${ChatConfig.myId}`);

    evtSource.addEventListener('message', e => {
        const data = JSON.parse(e.data);
        const senderId = String(data.sender);
        const isActiveChat = ChatConfig.activeChatId && 
                             senderId === String(ChatConfig.activeChatId);
        
        // Ricerca singola invece di due separate
        const pinnedUser = ChatConfig.pinnedUsers.find(u => String(u.id) === senderId);
        
        if (isActiveChat) {
            appendMessage(data.sender, data.content, pinnedUser?.avatar_url || DEFAULT_AVATAR);
            markChatAsRead(data.sender);
            return; // Early return evita else nesting
        }
        
        const now = new Date().toISOString(); // Calcolato una sola volta
        
        if (pinnedUser) {
            pinnedUser.unread_count = (Number(pinnedUser.unread_count) || 0) + 1;
            pinnedUser.last_message = data.content;
            pinnedUser.last_at = now;
        } else {
            ChatConfig.pinnedUsers.unshift({
                id: data.sender,
                username: data.sender,
                avatar_url: data.avatar || DEFAULT_AVATAR,
                last_message: data.content,
                last_at: now,
                unread_count: 1
            });
        }
        loadUserList();
    });

    evtSource.addEventListener('typing', e => {
        const { user_id, is_typing } = JSON.parse(e.data);
        if (String(user_id) === String(ChatConfig.activeChatId)) {
            showTypingIndicator(is_typing);
        }
    });

    evtSource.addEventListener('call-signal', e => {
        handleCallSignal(JSON.parse(e.data));
    });

    evtSource.onerror = console.error;
}

const CALL_HANDLERS = {
    offer:          data => CallManager.handleIncomingCall(data),
    answer:         data => CallManager.handleAnswer(data),
    'ice-candidate': data => CallManager.handleIceCandidate(data),
    hangup:         () => CallManager.endCall(),
    reject:         () => { CallManager.endCall(); alert('Chiamata rifiutata'); }
};

function handleCallSignal({ type, data }) {
    CALL_HANDLERS[type]?.(data);
}