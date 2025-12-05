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

    loadDataFromJSON() {
        const dataElement = document.getElementById('my-pins-data');
        if (dataElement) {
            try {
                this.urls = JSON.parse(dataElement.textContent).urls || {};
            } catch (e) {
                console.error('Error parsing my_pins data:', e);
            }
        }
    },

    init() {
        this.loadDataFromJSON();

        const el = this.elements;
        el.userList = document.querySelectorAll('li.user-item');
        el.searchInput = document.getElementById('my-pins-comment-input');
        el.confirmOverlay = document.getElementById('confirmOverlay');
        el.confirmMessage = el.confirmOverlay?.querySelector('.confirm-message');
        el.confirmOk = document.getElementById('confirmOk');
        el.confirmCancel = document.getElementById('confirmCancel');
    }
};