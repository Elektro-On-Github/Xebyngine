// Global configuration for my_pins page
const MyPinsConfig = {
    urls: {
        profile: null,
        pinToggle: null,
        uploadedAvatar: null
    },
    
    elements: {
        userList: null,
        searchInput: null,
        confirmOverlay: null,
        confirmMessage: null,
        confirmOk: null,
        confirmCancel: null
    },
    
    loadDataFromJSON: function() {
        // Load URLs from JSON script tag
        const dataElement = document.getElementById('my-pins-data');
        if (dataElement) {
            try {
                const data = JSON.parse(dataElement.textContent);
                this.urls = data.urls || {};
            } catch (e) {
                console.error('Error parsing my_pins data:', e);
            }
        }
    },
    
    init: function() {
        // Load data from JSON
        this.loadDataFromJSON();
        
        // Initialize DOM elements
        this.elements.userList = document.querySelectorAll('li.user-item');
        this.elements.searchInput = document.getElementById('my-pins-comment-input');
        this.elements.confirmOverlay = document.getElementById('confirmOverlay');
        this.elements.confirmMessage = this.elements.confirmOverlay?.querySelector('.confirm-message');
        this.elements.confirmOk = document.getElementById('confirmOk');
        this.elements.confirmCancel = document.getElementById('confirmCancel');
    }
};
