function handleBackButton() {
    if (ChatConfig.elements.usersMenu.classList.contains('open')) {
        window.location.href = '/';
    } else {
        openUsersMenu();
    }
}

function openUsersMenu() {
    ChatConfig.elements.chatContainerEl.classList.add('hiding');
    ChatConfig.elements.inputContainer.classList.add('hiding');
    setTimeout(() => ChatConfig.elements.usersMenu.classList.add('open'), 50);
}

function closeUsersMenu() {
    ChatConfig.elements.usersMenu.classList.remove('open');
    setTimeout(() => {
        ChatConfig.elements.chatContainerEl.classList.remove('hiding');
        ChatConfig.elements.inputContainer.classList.remove('hiding');
    }, 100);
}

function updateChatHeader() {
    const info = ChatConfig.elements.chatUserInfo;
    info.querySelector('img').src = ChatConfig.activeChatAvatar;
    info.querySelector('span').textContent = ChatConfig.activeChatUsername;
}

function showTypingIndicator(show) {
    let indicator = ChatConfig.elements.chatContainer.querySelector('.typing-indicator');
    
    if (show && !indicator) {
        const template = document.getElementById('typing-template');
        indicator = template.content.cloneNode(true);
        ChatConfig.elements.chatContainer.appendChild(indicator);
        ChatConfig.elements.chatContainer.scrollTop = ChatConfig.elements.chatContainer.scrollHeight;
    } else if (!show && indicator) {
        indicator.style.animation = 'none';           // reset
        indicator.offsetHeight;                        // forza reflow
        indicator.style.animation = 'easewriting 0.4s reverse forwards';
        setTimeout(() => indicator.remove(), 400);
    }
}

function sendTypingStatus(isTyping) {
    if (!ChatConfig.activeChatId) return;
    
    fetch('/chat/typing', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            recipient_id: ChatConfig.activeChatId,
            is_typing: isTyping
        })
    }).catch(console.error);
}