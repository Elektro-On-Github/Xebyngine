// Global configuration for create post page
const CreateConfig = {
    urls: {
        index: null,
        createPost: null
    },
    
    elements: {
        form: null,
        photosInput: null,
        photosBrowse: null,
        photosPreview: null,
        pollOverlay: null,
        pollQuestion: null,
        pollOptions: null,
        timelineRange: null,
        timelineThumb: null,
        timelineFill: null,
        timelineTooltip: null,
        timelineTrack: null
    },
    
    loadDataFromJSON: function() {
        // Load URLs from JSON script tag
        const dataElement = document.getElementById('create-data');
        if (dataElement) {
            try {
                const data = JSON.parse(dataElement.textContent);
                this.urls = data.urls || {};
            } catch (e) {
                console.error('Error parsing create data:', e);
            }
        }
    },
    
    init: function() {
        // Load data from JSON
        this.loadDataFromJSON();
        
        // Initialize DOM elements
        this.elements.form = document.querySelector('form[enctype="multipart/form-data"]');
        this.elements.photosInput = document.getElementById('photos-input');
        this.elements.photosBrowse = document.getElementById('photos-browse');
        this.elements.photosPreview = document.getElementById('photos-preview');
        this.elements.pollOverlay = document.getElementById('poll-overlay');
        this.elements.pollQuestion = document.getElementById('modal-poll-question');
        this.elements.pollOptions = document.getElementById('modal-poll-options');
        this.elements.timelineRange = document.getElementById('timeline-range');
        this.elements.timelineThumb = document.getElementById('timeline-thumb');
        this.elements.timelineFill = document.getElementById('timeline-fill');
        this.elements.timelineTooltip = document.getElementById('timeline-tooltip');
        this.elements.timelineTrack = document.querySelector('.timeline-track');
    }
};
