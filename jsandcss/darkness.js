(function() {
    // chiede al browser se usa la darkmode
    if (!window.matchMedia('(prefers-color-scheme: dark)').matches) return;

    // doppia inversione (altrimenti immagini negative)
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
        .overlay-search-input,
        .profile-action-btn,
        .expand-btn,
        .footer-btn,
        .timeline-thumb,
        .timeline-fill,
        .bar-fill,
        .unpin-btn,
        .confirm-btn,
        .show-more-comments-btn,
        .me span,
        #send-btn,
        .clean-button,
        .tab-btn,
        .submitbtn,
        .close-menu-btn,
        .timeline-thumb,
        .header-btn,
        .fa-clock,
        .unread-dot,
        .custom-file-btn,
        .submit-btn,
        .form-label,
        .profile-username,
        .modal-add-opt,
        .back-btn,
        .header-back-btn,
        .back-btn-search,
        .ready,
        .header-call-btns,
        .audio-only,
        .call-info,
        .call-username,
        .qr-modal-link,
        .section-title,
        #likers-back-btn,
        .post-share-card

        
        { 
        filter: invert(1) hue-rotate(180deg); 
        }
    </style>
    `;
})();
