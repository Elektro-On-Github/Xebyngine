/**
 * E2EE Chat Integration
 * Integra la crittografia E2EE nel flusso di chat esistente
 */

const E2EEChat = {
    enabled: false,
    
    /**
     * Inizializza l'integrazione E2EE con la chat
     */
    async init() {
        console.log('🔐 Inizializzando E2EE Chat...');
        
        // Aspetta che E2EE sia inizializzato
        let attempts = 0;
        while (!E2EE.initialized && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        
        if (!E2EE.initialized) {
            console.warn('⚠ E2EE non è stato inizializzato, chat senza crittografia');
            return;
        }
        
        this.enabled = true;
        
        // Modifica la funzione sendMessage per usare E2EE
        this.patchSendMessage();
        
        // Modifica appendMessage per mostrare indicatore E2EE
        this.patchAppendMessage();
        
        // Modifica loadHistory per decrittare i messaggi
        this.patchLoadHistory();
        
        console.log('✓ E2EE Chat integrato');
    },
    
    /**
     * Patch sendMessage per crittografare
     */
    patchSendMessage() {
        const originalSendMessage = window.sendMessage;
        
        window.sendMessage = async function() {
            if (!ChatConfig.activeChatId) {
                showCustomNotification('Seleziona un contatto', 'info');
                return;
            }
            
            const content = ChatConfig.elements.input.value.trim();
            if (!content) return;
            
            // Mostra un indicatore di caricamento
            ChatConfig.elements.input.disabled = true;
            ChatConfig.elements.sendBtn.disabled = true;
            ChatConfig.elements.sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            try {
                // Critta il messaggio
                const encryptedContent = await E2EE.encryptMessage(content, ChatConfig.activeChatId);
                
                // Invia il messaggio crittografato
                const response = await fetch('/api/e2ee/send-encrypted', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''
                    },
                    body: JSON.stringify({
                        receiver_id: ChatConfig.activeChatId,
                        encrypted_content: encryptedContent
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.status !== 'success') {
                    throw new Error(data.error || 'Errore invio');
                }
                
                // Salva il messaggio in chiaro nel browser (per il refresh)
                if (data.message_id && E2EE && E2EE.saveSentMessage) {
                    await E2EE.saveSentMessage(ChatConfig.activeChatId, data.message_id, content);
                }
                
                // Mostra il messaggio in chiaro (solo il nostro client lo sa leggere)
                E2EEChat.appendEncryptedMessage(ChatConfig.myId, content, true);
                
                ChatConfig.elements.input.value = '';
                ChatConfig.elements.input.focus();
                sendTypingStatus(false);
            } catch (error) {
                console.error('✗ Errore invio messaggio crittografato:', error);
                showCustomNotification(`Errore: ${error.message}`, 'error');
            } finally {
                ChatConfig.elements.input.disabled = false;
                ChatConfig.elements.sendBtn.disabled = false;
                ChatConfig.elements.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
        };
    },
    
    /**
     * Append messaggio crittografato con indicatore 🔒
     */
    appendEncryptedMessage(sender, plainText, isMine = false) {
        const empty = ChatConfig.elements.chatContainer.querySelector('.empty-chat');
        if (empty) empty.remove();
        
        const msg = document.createElement('div');
        msg.className = `message ${isMine ? 'me' : 'other'}`;
        
        if (!isMine) {
            const img = document.createElement('img');
            img.className = 'message-avatar';
            img.src = ChatConfig.activeChatAvatar || '/uploads/avatars/default.png';
            msg.appendChild(img);
        }
        
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '6px';
        
        const span = document.createElement('span');
        span.textContent = plainText;
        container.appendChild(span);
        
        // Indicatore E2EE
        const lockIcon = document.createElement('span');
        lockIcon.innerHTML = '🔒';
        lockIcon.title = 'Messaggio crittografato end-to-end';
        lockIcon.style.fontSize = '0.8em';
        lockIcon.style.opacity = '0.7';
        container.appendChild(lockIcon);
        
        msg.appendChild(container);
        
        ChatConfig.elements.chatContainer.appendChild(msg);
        ChatConfig.elements.chatContainer.scrollTop = ChatConfig.elements.chatContainer.scrollHeight;
    },
    
    /**
     * Patch appendMessage per mostrare E2EE icon
     */
    patchAppendMessage() {
        const originalAppendMessage = window.appendMessage;
        
        window.appendMessage = function(sender, text, avatar = null, messageId = null, recipientId = null, isEncrypted = false) {
            if (E2EEChat.enabled && isEncrypted) {
                E2EEChat.appendEncryptedMessage(sender, text, sender === ChatConfig.myId);
            } else {
                originalAppendMessage.call(this, sender, text, avatar, messageId, recipientId);
            }
        };
    },
    
    /**
     * Patch loadHistory per decrittare i messaggi
     */
    patchLoadHistory() {
        const originalLoadHistory = window.loadHistory;
        
        window.loadHistory = async function() {
            if (!ChatConfig.activeChatId) return;
            
            try {
                // ATTENDI che E2EE sia inizializzato prima di proseguire
                let attempts = 0;
                while (!E2EE.initialized && attempts < 50) {
                    await new Promise(r => setTimeout(r, 100));
                    attempts++;
                }
                
                if (!E2EE.initialized) {
                    console.warn('⚠ E2EE non inizializzato, usando fallback');
                    return originalLoadHistory.call(this);
                }
                
                // Carica la cronologia da E2EE API
                const response = await fetch(`/api/e2ee/history/${ChatConfig.activeChatId}`);
                
                if (!response.ok) {
                    // Fallback al metodo originale se E2EE non è disponibile
                    return originalLoadHistory.call(this);
                }
                
                const data = await response.json();
                
                if (data.status !== 'success' || !data.messages) {
                    return originalLoadHistory.call(this);
                }
                
                // Pulisci la chat
                ChatConfig.elements.chatContainer.innerHTML = '';
                
                // Decritto e mostra i messaggi
                for (const msg of data.messages) {
                    try {
                        let plainText = msg.content;
                        const isMine = msg.sender_id === ChatConfig.myId;
                        
                        if (isMine) {
                            // Se è un messaggio che ho inviato, caricalo dalla cache locale
                            const cachedMessage = await E2EE.loadSentMessage(msg.id);
                            if (cachedMessage) {
                                plainText = cachedMessage;
                            } else if (msg.is_encrypted) {
                                // Se non è in cache e è crittato, mostra errore
                                plainText = '[Messaggio non disponibile]';
                            }
                        } else if (msg.is_encrypted && E2EE.myPrivateKey) {
                            // Se è un messaggio ricevuto e crittato, decrittalo
                            plainText = await E2EE.decryptMessage(msg.content);
                        }
                        
                        const avatar = !isMine ? ChatConfig.activeChatAvatar : null;
                        
                        E2EEChat.appendEncryptedMessage(msg.sender_id, plainText, isMine);
                    } catch (error) {
                        console.error('Errore elaborazione messaggio:', error);
                        // Mostra un placeholder se qualcosa fallisce
                        const msg_placeholder = document.createElement('div');
                        msg_placeholder.className = 'message other';
                        msg_placeholder.innerHTML = '<span style="color: #999; font-style: italic;">Errore nel caricamento del messaggio</span>';
                        ChatConfig.elements.chatContainer.appendChild(msg_placeholder);
                    }
                }
                
                ChatConfig.elements.chatContainer.scrollTop = ChatConfig.elements.chatContainer.scrollHeight;
                
                // Aggiungi event listener ai messaggi
                attachMessageListeners();
            } catch (error) {
                console.error('Errore caricamento cronologia E2EE:', error);
                // Fallback al metodo originale
                return originalLoadHistory.call(this);
            }
        };
    }
};

// Inizializza E2EE Chat quando la pagina è carica
document.addEventListener('DOMContentLoaded', () => {
    E2EEChat.init().catch(err => console.error('Errore init E2EE Chat:', err));
});
