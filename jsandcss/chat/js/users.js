// User list management

function loadUserList() {
    ChatConfig.elements.usersList.innerHTML = '';
    if (!Array.isArray(ChatConfig.pinnedUsers) || ChatConfig.pinnedUsers.length === 0) {
        ChatConfig.elements.usersList.innerHTML = `
            <div class="empty-menu">
                <i class="fas fa-user-friends"></i>
                <p>Non hai contatti nella lista</p>
            </div>
        `;
        return;
    }

    // Ordina le chat per data dell'ultimo messaggio (più recente in alto)
    const sorted = ChatConfig.pinnedUsers.slice().sort((a, b) => {
        const ta = Date.parse(a.last_at || a.updated_at || 0) || 0;
        const tb = Date.parse(b.last_at || b.updated_at || 0) || 0;
        return tb - ta;
    });

    sorted.forEach(user => {
        const item = document.createElement('div');
        item.classList.add('user-item');
        item.dataset.userid = user.id;
        item.dataset.username = user.username;
        item.dataset.avatar = user.avatar_url || '/uploads/avatars/default.png';

        const avatar = document.createElement('img');
        avatar.classList.add('user-avatar');
        avatar.src = user.avatar_url || '/uploads/avatars/default.png';
        avatar.alt = 'avatar';

        const meta = document.createElement('div');
        meta.className = 'user-meta';

        const row = document.createElement('div');
        row.className = 'user-row';

        const name = document.createElement('span');
        name.className = 'user-name';
        name.textContent = user.username;

        const time = document.createElement('span');
        time.className = 'user-time';
        time.textContent = user.last_at ? new Date(user.last_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

        row.appendChild(name);
        row.appendChild(time);

        const preview = document.createElement('div');
        preview.className = 'user-preview';
        preview.textContent = user.last_message || '';

        meta.appendChild(row);
        meta.appendChild(preview);

        item.appendChild(avatar);
        item.appendChild(meta);

        // Se ci sono messaggi non letti, mostra un pallino con il colore del tema
        if (user.unread_count && Number(user.unread_count) > 0) {
            const dot = document.createElement('span');
            dot.className = 'unread-dot';
            dot.setAttribute('title', `${user.unread_count} messaggi non letti`);
            row.appendChild(dot);
        }

        item.addEventListener('click', () => {
            switchChat(user.id, user.username, user.avatar_url);
            closeUsersMenu();
        });

        ChatConfig.elements.usersList.appendChild(item);
    });
}
