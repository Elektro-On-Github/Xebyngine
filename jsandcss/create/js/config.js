const CreateConfig = {
    urls: {
        index: null,
        createPost: null
    },

    elements: {
        form: null,
        photosInput: null,
        photosBrowse: null,
        videosInput: null,
        videosBrowse: null,
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

    loadDataFromJSON() {
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

    init() {
        this.loadDataFromJSON();

        const $ = id => document.getElementById(id);
        const el = this.elements;

        el.form = document.querySelector('form[enctype="multipart/form-data"]');
        el.photosInput = $('photos-input');
        el.photosBrowse = $('photos-browse');
        el.videosInput = $('videos-input');
        el.videosBrowse = $('videos-browse');
        el.photosPreview = $('photos-preview');
        el.pollOverlay = $('poll-overlay');
        el.pollQuestion = $('modal-poll-question');
        el.pollOptions = $('modal-poll-options');
        el.timelineRange = $('timeline-range');
        el.timelineThumb = $('timeline-thumb');
        el.timelineFill = $('timeline-fill');
        el.timelineTooltip = $('timeline-tooltip');
        el.timelineTrack = document.querySelector('.timeline-track');
    }
};