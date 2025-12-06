const ChatConfig = {
    myId: null,
    activeChatId: null,
    activeChatUsername: null,
    activeChatAvatar: null,
    pinnedUsers: [],
    initialChat: null,
    typingTimeout: null,
    
    elements: {
        chatContainer: null,
        chatContainerEl: null,
        inputContainer: null,
        input: null,
        sendBtn: null,
        usersList: null,
        usersMenu: null,
        chatUserInfo: null
    },
    
    init() {
        const dataEl = document.getElementById('chat-data');
        if (dataEl) {
            const data = JSON.parse(dataEl.textContent);
            this.myId = data.myId;
            this.pinnedUsers = data.pinnedUsers || [];
            this.initialChat = data.initialChat;
        }
        
        this.elements.chatContainer = document.getElementById('chat');
        this.elements.chatContainerEl = document.getElementById('chat-container');
        this.elements.inputContainer = document.getElementById('input-container');
        this.elements.input = document.getElementById('message-input');
        this.elements.sendBtn = document.getElementById('send-btn');
        this.elements.usersList = document.getElementById('users-list');
        this.elements.usersMenu = document.getElementById('users-menu');
        this.elements.chatUserInfo = document.getElementById('chat-user-info');
    }
};

// Enable call buttons when chat is active
function enableCallButtons() {
    if (ChatConfig.activeChatId) {
        document.getElementById('call-buttons').style.display = 'flex';
        document.getElementById('voice-call-btn').disabled = false;
        document.getElementById('video-call-btn').disabled = false;
    } else {
        document.getElementById('call-buttons').style.display = 'none';
        document.getElementById('voice-call-btn').disabled = true;
        document.getElementById('video-call-btn').disabled = true;
    }
}