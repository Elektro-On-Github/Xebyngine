(function() {
    if (!window.matchMedia('(prefers-color-scheme: dark)').matches) return;

    document.head.innerHTML += `
    <style>
        html { filter: invert(1) hue-rotate(180deg); }

        img, video, iframe, svg,
        .post-content img,
        .comment-send-btn,
        .like-btn-modern *,
        .show-likers-btn *,
        .comment-count-modern *,
        .view-count-modern,
        .overlay-search-input

        { 
            filter: invert(1) hue-rotate(180deg); 
        }
    </style>
    `;
})();
