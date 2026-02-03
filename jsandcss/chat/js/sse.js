const DEFAULT_AVATAR = '/uploads/avatars/default.png';

let eventSource = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;

function initializeSSE() {
    if (eventSource) {
        eventSource.close();
    }
    
    eventSource = new EventSource(`/stream/messages?user_id=${ChatConfig.myId}`);
    
    setupSSEEventListeners(eventSource);
}

function setupSSEEventListeners(evtSource) {
    evtSource.addEventListener('message', async e => {
        try {
            const data = JSON.parse(e.data);
            const senderId = String(data.sender);
            const isActiveChat = ChatConfig.activeChatId && 
                                 senderId === String(ChatConfig.activeChatId);
            
            const pinnedUser = ChatConfig.pinnedUsers.find(u => String(u.id) === senderId);
            
            if (isActiveChat) {
                if (data.message_type === 'post_share') {
                    appendPostShareMessage(data.sender, data.content, pinnedUser?.avatar_url || DEFAULT_AVATAR);
                } else {
                    // Decritto il messaggio se è crittografato E2EE
                    let messageContent = data.content;
                    if (data.is_encrypted && E2EE && E2EE.initialized && E2EE.myPrivateKey) {
                        try {
                            messageContent = await E2EE.decryptMessage(data.content);
                        } catch (err) {
                            console.error('Errore decrittografia SSE:', err);
                            messageContent = '[Errore decrittografia]';
                        }
                    }
                    appendMessage(data.sender, messageContent, pinnedUser?.avatar_url || DEFAULT_AVATAR);
                }
                markChatAsRead(data.sender);
                return;
            }
            
            const now = new Date().toISOString();
            let previewText = data.content;
            
            // Decritto il preview se è crittografato
            if (data.is_encrypted && E2EE && E2EE.initialized && E2EE.myPrivateKey) {
                try {
                    previewText = await E2EE.decryptMessage(data.content);
                    if (previewText.length > 50) {
                        previewText = previewText.substring(0, 50) + '...';
                    }
                } catch (err) {
                    previewText = '[Messaggio crittografato]';
                }
            }
            
            if (data.message_type === 'post_share') {
                try {
                    const payload = JSON.parse(data.content);
                    previewText = `Post di ${payload.author}: ${payload.content_preview}`;
                } catch (e) {
                    previewText = 'Post condiviso';
                }
            }
            
            if (pinnedUser) {
                pinnedUser.unread_count = (Number(pinnedUser.unread_count) || 0) + 1;
                pinnedUser.last_message = previewText;
                pinnedUser.last_at = now;
            } else {
                ChatConfig.pinnedUsers.unshift({
                    id: data.sender,
                    username: data.sender,
                    avatar_url: data.avatar || DEFAULT_AVATAR,
                    last_message: previewText,
                    last_at: now,
                    unread_count: 1
                });
            }
            loadUserList();
            reconnectAttempts = 0;
        } catch (error) {
            console.error('Errore parsing messaggio:', error);
        }
    });

    evtSource.addEventListener('typing', e => {
        try {
            const { user_id, is_typing } = JSON.parse(e.data);
            if (String(user_id) === String(ChatConfig.activeChatId)) {
                showTypingIndicator(is_typing);
            }
        } catch (error) {
            console.error('Errore parsing typing:', error);
        }
    });

    evtSource.onerror = () => {
        handleSSEError(evtSource);
    };
}

function handleSSEError(evtSource) {
    evtSource.close();
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max riconnessioni raggiunto');
        return;
    }
    
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
    reconnectAttempts++;
    
    console.log(`Riconnessione SSE tra ${delay}ms (tentativo ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    
    setTimeout(() => {
        if (eventSource && eventSource.readyState === EventSource.CLOSED) {
            initializeSSE();
        }
    }, delay);
}

