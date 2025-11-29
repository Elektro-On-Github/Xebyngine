// Message handling functions

function appendMessage(sender, text, avatar = null) {
    const emptyChat = ChatConfig.elements.chatContainer.querySelector('.empty-chat');
    if (emptyChat) emptyChat.remove();

    const div = document.createElement('div');
    div.classList.add('message', sender === ChatConfig.myId ? 'me' : 'other');

    if (sender !== ChatConfig.myId) {
        const img = document.createElement('img');
        img.className = 'message-avatar';
        img.src = avatar || '/static/default.png';
        img.alt = 'avatar';
        div.appendChild(img);
    }

    const span = document.createElement('span');
    span.textContent = text;
    div.appendChild(span);

    ChatConfig.elements.chatContainer.appendChild(div);
    ChatConfig.elements.chatContainer.scrollTop = ChatConfig.elements.chatContainer.scrollHeight;
}

function sendMessage() {
    if (!ChatConfig.activeChatId) {
        alert('Seleziona un contatto prima di inviare un messaggio');
        return;
    }
    
    const content = ChatConfig.elements.input.value.trim();
    if (!content) return;

    const formData = new URLSearchParams({
        my_id: ChatConfig.myId,
        other_id: ChatConfig.activeChatId,
        content: content
    });

    fetch('/send_message', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: formData.toString()
    }).then(() => {
        appendMessage(ChatConfig.myId, content);
        ChatConfig.elements.input.value = '';
        ChatConfig.elements.input.focus();
    }).catch(err => {
        console.error('Errore invio messaggio:', err);
        alert('Errore nell\'invio del messaggio');
    });
}
