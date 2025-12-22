// Chat switching and history
function switchChat(userId, username, avatar) {
    if (ChatConfig.activeChatId === userId) return;

    ChatConfig.activeChatId = userId;
    ChatConfig.activeChatUsername = username;
    ChatConfig.activeChatAvatar = avatar || '/uploads/avatars/default.png';

    updateChatHeader();
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    const active = document.querySelector(`[data-userid="${userId}"]`);
    if (active) active.classList.add('active');

    loadHistory();
    markChatAsRead(userId);
}

function markChatAsRead(userId) {
    fetch(`/chat/mark_read/${userId}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
    }).then(r => {
        if (r.ok) {
            const pu = ChatConfig.pinnedUsers.find(u => String(u.id) === String(userId));
            if (pu) {
                pu.unread_count = 0;
                loadUserList();
            }
        }
    }).catch(console.error);
}

function loadHistory() {
    if (!ChatConfig.activeChatId) return;
    fetch(`/chat/history/${ChatConfig.activeChatId}`, {cache: "no-store"})
        .then(r => r.text())
        .then(html => {
            ChatConfig.elements.chatContainer.innerHTML = html;
            ChatConfig.elements.chatContainer.scrollTop = ChatConfig.elements.chatContainer.scrollHeight;
        })
        .catch(() => {
            ChatConfig.elements.chatContainer.innerHTML = '<div class="empty-chat"><i class="fas fa-exclamation-triangle"></i><p>Errore nel caricamento</p></div>';
        });
}

// Message handling
function appendMessage(sender, text, avatar = null) {
    const empty = ChatConfig.elements.chatContainer.querySelector('.empty-chat');
    if (empty) empty.remove();

    const isMine = sender === ChatConfig.myId;
    const msg = document.createElement('div');
    msg.className = `message ${isMine ? 'me' : 'other'}`;

    if (!isMine) {
        const img = document.createElement('img');
        img.className = 'message-avatar';
        img.src = avatar || '/uploads/avatars/default.png';
        msg.appendChild(img);
    }

    const span = document.createElement('span');
    span.textContent = text;
    msg.appendChild(span);

    ChatConfig.elements.chatContainer.appendChild(msg);
    ChatConfig.elements.chatContainer.scrollTop = ChatConfig.elements.chatContainer.scrollHeight;
}

function appendPostShareMessage(sender, jsonContent, avatar = null) {
    const empty = ChatConfig.elements.chatContainer.querySelector('.empty-chat');
    if (empty) empty.remove();

    const isMine = sender === ChatConfig.myId;
    const msg = document.createElement('div');
    msg.className = `message ${isMine ? 'me' : 'other'}`;

    if (!isMine) {
        const img = document.createElement('img');
        img.className = 'message-avatar';
        img.src = avatar || '/uploads/avatars/default.png';
        msg.appendChild(img);
    }

    try {
        const payload = JSON.parse(jsonContent);
        
        const card = document.createElement('div');
        card.className = 'post-share-card';
        
        // Header con autore
        const header = document.createElement('div');
        header.className = 'post-share-header';
        header.innerHTML = `<strong>Post di ${payload.author}</strong>`;
        card.appendChild(header);
        
        // Immagine se disponibile
        if (payload.first_image) {
            const img = document.createElement('img');
            img.src = payload.first_image;
            img.alt = 'Post image';
            img.className = 'post-share-thumbnail';
            card.appendChild(img);
        }
        
        // Contenuto
        const content = document.createElement('div');
        content.className = 'post-share-content';
        
        const text = document.createElement('p');
        text.className = 'post-share-text';
        text.textContent = payload.message_text || 'Ti ho condiviso un post';
        content.appendChild(text);
        
        const preview = document.createElement('p');
        preview.className = 'post-share-preview';
        preview.textContent = payload.content_preview;
        content.appendChild(preview);
        
        // Link per aprire il post
        const link = document.createElement('a');
        link.href = `/?post=${payload.post_id}`;
        link.className = 'post-share-link';
        link.textContent = 'Apri Post';
        link.target = '_blank';
        content.appendChild(link);
        
        card.appendChild(content);
        msg.appendChild(card);
    } catch (e) {
        const span = document.createElement('span');
        span.textContent = 'Post condiviso (errore nel caricamento)';
        msg.appendChild(span);
    }

    ChatConfig.elements.chatContainer.appendChild(msg);
    ChatConfig.elements.chatContainer.scrollTop = ChatConfig.elements.chatContainer.scrollHeight;
}

function sendMessage() {
    if (!ChatConfig.activeChatId) return showCustomNotification('Seleziona un contatto', 'info');
    
    const content = ChatConfig.elements.input.value.trim();
    if (!content) return;

    fetch('/send_message', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
            my_id: ChatConfig.myId,
            other_id: ChatConfig.activeChatId,
            content
        })
    }).then(() => {
        appendMessage(ChatConfig.myId, content);
        ChatConfig.elements.input.value = '';
        ChatConfig.elements.input.focus();
        sendTypingStatus(false); // Stop typing
    }).catch(() => showCustomNotification('Errore invio messaggio', 'error'));
}

// User list
function loadUserList() {
    const list = ChatConfig.elements.usersList;
    list.innerHTML = '';
    
    if (!ChatConfig.pinnedUsers?.length) {
        list.innerHTML = '<div class="empty-menu"><i class="fas fa-user-friends"></i><p>Nessun contatto</p></div>';
        return;
    }

    const sorted = [...ChatConfig.pinnedUsers].sort((a, b) => {
        const ta = Date.parse(a.last_at || a.updated_at || 0) || 0;
        const tb = Date.parse(b.last_at || b.updated_at || 0) || 0;
        return tb - ta;
    });

    const template = document.getElementById('user-item-template');
    sorted.forEach(user => {
        const item = template.content.cloneNode(true);
        const div = item.querySelector('.user-item');
        
        div.dataset.userid = user.id;
        div.querySelector('.user-avatar').src = user.avatar_url || '/uploads/avatars/default.png';
        div.querySelector('.user-name').textContent = user.username;
        div.querySelector('.user-time').textContent = user.last_at ? 
            new Date(user.last_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        div.querySelector('.user-preview').textContent = user.last_message || '';
        
        if (user.unread_count > 0) {
            const dot = document.createElement('span');
            dot.className = 'unread-dot';
            dot.title = `${user.unread_count} non letti`;
            div.querySelector('.user-preview').appendChild(dot);
        }

        div.addEventListener('click', () => {
            switchChat(user.id, user.username, user.avatar_url);
            closeUsersMenu();
        });

        list.appendChild(item);
    });
}

function switchChat(userId, username, avatar) {
    if (ChatConfig.activeChatId === userId) return;

    ChatConfig.activeChatId = userId;
    ChatConfig.activeChatUsername = username;
    ChatConfig.activeChatAvatar = avatar || '/uploads/avatars/default.png';

    updateChatHeader();
    enableCallButtons();
    
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    const active = document.querySelector(`[data-userid="${userId}"]`);
    if (active) active.classList.add('active');

    loadHistory();
    markChatAsRead(userId);
}