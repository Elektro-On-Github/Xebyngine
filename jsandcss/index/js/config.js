// Global Configuration - Legge JSON dal DOM (CSP-safe)
(function() {
    const serverDataEl = document.getElementById('server-data');
    
    if (!serverDataEl) {
        console.error('Server data element not found');
        return;
    }

    let serverData;
    try {
        serverData = JSON.parse(serverDataEl.textContent);
    } catch (e) {
        console.error('Failed to parse server data:', e);
        serverData = {};
    }

    // Global variables
    window.PROFILE_MODE = serverData.profileMode || false;
    window.LOGGED_USERNAME = serverData.loggedUsername || null;
    window.LOGGED_AVATAR = serverData.loggedAvatar || null;
    window.PROFILE_CONTACTS = serverData.profileContacts || [];
    window.SERVER_PROFILE_POSTS = serverData.serverProfilePosts || [];

    // Global state
    window.POSTS_BY_ID = {};
    window.loading = false;
    window.lastExpiresAt = 0;
    window.lastId = 0;

    // Search mode
    const params = new URLSearchParams(window.location.search || '');
    window.INDEX_QUERY_RAW = (params.get('q') || '').trim();
    window.INDEX_QUERY = window.INDEX_QUERY_RAW.toLowerCase();
    window.INDEX_SEARCH_MODE = window.INDEX_QUERY.length > 0;
    window.INDEX_SEARCH_FOUND = 0;

    // Filtered feed
    window.FILTERING = false;
    window.FILTER_QUERY = null;
    window.FILTERED_RESULTS = [];
    window.FILTER_INDEX = 0;
    window.FILTER_EXHAUSTED = false;

    // Math.clamp polyfill
    if (!Math.clamp) {
        Math.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    }
})();