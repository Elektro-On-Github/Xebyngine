// Global configuration for profile page
const ProfileConfig = {
    username: null,
    
    urls: {
        profile: null,
        uploadedAvatar: null,
        userPage: null
    },
    
    elements: {
        form: null,
        submitBtn: null,
        fileInput: null,
        fileNameText: null,
        addSocialBtn: null,
        socialEntries: null
    },
    
    loadDataFromJSON: function() {
        // Load data from JSON script tag
        const dataElement = document.getElementById('profile-data');
        if (dataElement) {
            try {
                const data = JSON.parse(dataElement.textContent);
                this.username = data.username;
                this.urls = data.urls || {};
            } catch (e) {
                console.error('Error parsing profile data:', e);
            }
        }
    },
    
    init: function() {
        // Load data from JSON
        this.loadDataFromJSON();
        
        // Initialize DOM elements
        this.elements.form = document.getElementById('profile-form');
        this.elements.submitBtn = document.getElementById('submit-btn');
        this.elements.fileInput = document.getElementById('avatar-upload');
        this.elements.fileNameText = document.getElementById('file-name');
        this.elements.addSocialBtn = document.getElementById('add-social-btn');
        this.elements.socialEntries = document.querySelectorAll('.social-entry');
    }
};
