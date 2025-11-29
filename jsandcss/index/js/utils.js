// Utility Functions

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function chooseAvatar(objOrUrl) {
    return typeof objOrUrl === 'string' && objOrUrl ? objOrUrl
        : objOrUrl?.avatar_url ? objOrUrl.avatar_url
        : typeof window.LOGGED_AVATAR === 'string' && window.LOGGED_AVATAR ? window.LOGGED_AVATAR
        : findAvatarInDOM() || '/uploads/avatars/default.png';
}

function findAvatarInDOM() {
    try {
        return document.querySelector('img.avatar[src*="/uploads/avatars/"]')?.src || null;
    } catch {
        return null;
    }
}

function postMatchesIndexQuery(post) {
    if (!INDEX_SEARCH_MODE) return true;
    if (!post) return false;

    const txt = post.content?.toLowerCase();
    if (txt && txt.includes(INDEX_QUERY)) return true;

    const comments = post.comments;
    if (!Array.isArray(comments)) return false;

    for (const c of comments) {
        const cc = c?.content?.toLowerCase();
        const cu = c?.username?.toLowerCase();
        if ((cc && cc.includes(INDEX_QUERY)) || (cu && cu.includes(INDEX_QUERY))) {
            return true;
        }
    }

    return false;
}
