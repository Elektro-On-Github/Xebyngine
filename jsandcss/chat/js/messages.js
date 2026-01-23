// Message long press and reporting functions

// Long press tracking
let longPressTimer = null;
let longPressMessage = null;
let longPressMetadata = null;

function handleMessageLongPress(messageEl, messageText, senderId, messageId, recipientId) {
    longPressMessage = messageEl;
    longPressMetadata = {
        text: messageText,
        senderId: senderId,
        messageId: messageId,
        recipientId: recipientId
    };

    // Highlight il messaggio
    messageEl.classList.add('long-pressed');

    // Crea il context menu
    const menu = document.createElement('div');
    menu.className = 'message-context-menu';
    menu.style.position = 'fixed';
    
    // Posizionamento del menu
    const rect = messageEl.getBoundingClientRect();
    menu.style.top = (rect.top - 10) + 'px';
    menu.style.left = (rect.left + rect.width / 2 - 60) + 'px';

    // Bottone Segnala (solo se non è mio messaggio)
    if (senderId !== ChatConfig.myId) {
        const reportBtn = document.createElement('button');
        reportBtn.className = 'message-context-btn';
        reportBtn.innerHTML = '<i class="fas fa-flag"></i> Segnala';
        reportBtn.addEventListener('click', () => reportMessage(messageId, recipientId, messageText, menu));
        menu.appendChild(reportBtn);
    }

    // Bottone Chiudi
    const closeBtn = document.createElement('button');
    closeBtn.className = 'message-context-btn';
    closeBtn.innerHTML = '<i class="fas fa-times"></i> Chiudi';
    closeBtn.addEventListener('click', () => {
        menu.remove();
        messageEl.classList.remove('long-pressed');
        longPressMessage = null;
    });
    menu.appendChild(closeBtn);

    document.body.appendChild(menu);

    // Chiudi il menu se clicchi altrove
    const closeOnClickOutside = (e) => {
        if (!menu.contains(e.target) && !messageEl.contains(e.target)) {
            menu.remove();
            messageEl.classList.remove('long-pressed');
            document.removeEventListener('click', closeOnClickOutside);
            longPressMessage = null;
        }
    };

    setTimeout(() => {
        document.addEventListener('click', closeOnClickOutside);
    }, 0);
}

function reportMessage(messageId, recipientId, messageText, menu) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

    console.log('Reporting message:', { messageId, recipientId, messageText: messageText?.substring(0, 50) });

    const formData = new URLSearchParams({
        message_id: messageId,
        recipient_id: recipientId,
        message_content: messageText
    });

    console.log('FormData:', formData.toString());

    fetch('/report_message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': csrfToken
        },
        body: formData.toString()
    }).then(r => r.json())
      .then(data => {
        if (data.success) {
            showCustomNotification('Messaggio segnalato correttamente', 'success');
            menu.remove();
            longPressMessage?.classList.remove('long-pressed');
            longPressMessage = null;
        } else {
            showCustomNotification('Errore nella segnalazione: ' + (data.error || 'Sconosciuto'), 'error');
        }
      })
      .catch(err => {
        console.error('Errore segnalazione:', err);
        showCustomNotification('Errore nella segnalazione', 'error');
      });
}
