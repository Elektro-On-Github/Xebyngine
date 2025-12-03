// UI Management functions

function handleBackButton() {
    // Se il menu utenti è aperto, vai a index.html
    if (ChatConfig.elements.usersMenu.classList.contains('open')) {
        window.location.href = '/';
    } else {
        // Altrimenti torna alla lista contatti
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

function updateChatHeader(username, avatar) {
    ChatConfig.elements.chatUserInfo.innerHTML = `
        <img class="chat-user-avatar" src="${avatar || '/static/default.png'}" alt="avatar">
        <span class="chat-user-name">${username}</span>
    `;
    // rende clikkabile il profilo
    ChatConfig.elements.chatUserInfo.cursor = 'pointer';
    ChatConfig.elements.chatUserInfo.onclick = function() {
        if (ChatConfig.activeChatId) {
            window.location.href = '/profile/$ChatConfig.activeChatId'
        }
    }
}
