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

    loadDataFromJSON() {
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

    init() {
        this.loadDataFromJSON();

        const $ = id => document.getElementById(id);
        const el = this.elements;

        el.form = $('profile-form');
        el.submitBtn = $('submit-btn');
        el.fileInput = $('avatar-upload');
        el.fileNameText = $('file-name');
        el.addSocialBtn = $('add-social-btn');
        el.socialEntries = document.querySelectorAll('.social-entry');
    }
};