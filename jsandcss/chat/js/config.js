// Global configuration and variables
const ChatConfig = {
    myId: null,
    activeChatId: null,
    activeChatUsername: null,
    activeChatAvatar: null,
    pinnedUsers: [],
    initialChat: null,
    
    // DOM Elements
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
    
    loadDataFromJSON: function() {
        // Load data from JSON script tag
        const dataElement = document.getElementById('chat-data');
        if (dataElement) {
            try {
                const data = JSON.parse(dataElement.textContent);
                this.myId = data.myId;
                this.pinnedUsers = data.pinnedUsers || [];
                this.initialChat = data.initialChat;
            } catch (e) {
                console.error('Error parsing chat data:', e);
            }
        }
    },
    
    init: function() {
        // Load data from JSON
        this.loadDataFromJSON();
        
        // Initialize DOM elements
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
