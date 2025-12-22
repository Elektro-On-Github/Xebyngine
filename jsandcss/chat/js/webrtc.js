// WebRTC Call Manager
const CallManager = {
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    isCallActive: false,
    isVideoCall: false,
    isMuted: false,
    isVideoOff: false,
    isAudioMuted: false,
    callType: null, // 'voice' or 'video'
    remoteUserId: null,
    
    // ICE servers (STUN/TURN)
    iceServers: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    },

    elements: {
        overlay: null,
        localVideo: null,
        remoteVideo: null,
        callInfo: null,
        callAvatar: null,
        callUsername: null,
        callStatus: null,
        muteBtn: null,
        hangupBtn: null,
        videoToggleBtn: null,
        incomingCall: null,
        incomingAvatar: null,
        incomingUsername: null,
        incomingType: null,
        acceptBtn: null,
        rejectBtn: null,
        voiceCallBtn: null,
        videoCallBtn: null,
        callButtons: null
    },

    init() {
        // Get DOM elements
        this.elements.overlay = document.getElementById('call-overlay');
        this.elements.localVideo = document.getElementById('local-video');
        this.elements.remoteVideo = document.getElementById('remote-video');
        this.elements.callInfo = document.getElementById('call-info');
        this.elements.callAvatar = document.getElementById('call-avatar');
        this.elements.callUsername = document.getElementById('call-username');
        this.elements.callStatus = document.getElementById('call-status');
        this.elements.muteBtn = document.getElementById('mute-btn');
        this.elements.hangupBtn = document.getElementById('hangup-btn');
        this.elements.videoToggleBtn = document.getElementById('video-toggle-btn');
        this.elements.incomingCall = document.getElementById('incoming-call');
        this.elements.incomingAvatar = document.getElementById('incoming-avatar');
        this.elements.incomingUsername = document.getElementById('incoming-username');
        this.elements.incomingType = document.getElementById('incoming-type');
        this.elements.acceptBtn = document.getElementById('accept-call-btn');
        this.elements.rejectBtn = document.getElementById('reject-call-btn');
        this.elements.voiceCallBtn = document.getElementById('voice-call-btn');
        this.elements.videoCallBtn = document.getElementById('video-call-btn');
        this.elements.callButtons = document.getElementById('call-buttons');

        // Event listeners
        this.elements.voiceCallBtn?.addEventListener('click', () => this.startCall('voice'));
        this.elements.videoCallBtn?.addEventListener('click', () => this.startCall('video'));
        this.elements.hangupBtn?.addEventListener('click', () => this.endCall());
        this.elements.muteBtn?.addEventListener('click', () => this.toggleMute());
        this.elements.videoToggleBtn?.addEventListener('click', () => this.toggleVideo());
        this.elements.acceptBtn?.addEventListener('click', () => this.acceptCall());
        this.elements.rejectBtn?.addEventListener('click', () => this.rejectCall());
        document.getElementById('audio-indicator')?.addEventListener('click', () => this.toggleAudio());

        console.log('CallManager initialized');
    },

    // Start outgoing call
    async startCall(type) {
        if (!ChatConfig.activeChatId) {
            showCustomNotification('Seleziona un contatto prima di chiamare', 'info');
            return;
        }

        this.callType = type;
        this.isVideoCall = (type === 'video');
        this.remoteUserId = ChatConfig.activeChatId;

        try {
            // Get user media
            await this.getUserMedia();
            
            // Create peer connection
            this.createPeerConnection();

            // Add local stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Send offer via signaling
            this.sendSignal('offer', {
                to: this.remoteUserId,
                from: ChatConfig.myId,
                type: this.callType,
                sdp: offer
            });

            // Show call UI
            this.showCallUI('outgoing');

        } catch (error) {
            console.error('Error starting call:', error);
            showCustomNotification('Impossibile avviare la chiamata: ' + error.message, 'error');
            this.endCall();
        }
    },

    // Get user media (camera/microphone)
    async getUserMedia() {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: this.isVideoCall ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } : false
        };

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // IMPORTANTE: Assegna lo stream al video locale
            if (this.elements.localVideo) {
                this.elements.localVideo.srcObject = this.localStream;
            }
            
            // Log per debug
            console.log('Local stream tracks:', this.localStream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                label: t.label
            })));
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            
            // Messaggio di errore più specifico
            if (error.name === 'NotAllowedError') {
                throw new Error('Permesso negato per microfono/camera');
            } else if (error.name === 'NotFoundError') {
                throw new Error('Nessun microfono/camera trovato');
            } else {
                throw new Error('Impossibile accedere a microfono/camera: ' + error.message);
            }
        }
    },

    // Create WebRTC peer connection
    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.iceServers);

        // ICE candidate event
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal('ice-candidate', {
                    to: this.remoteUserId,
                    candidate: event.candidate
                });
            }
        };

        // Track event (receive remote stream)
        this.peerConnection.ontrack = (event) => {
            // DEBUG AGGIUNTO
            console.log('Track received:', event.track.kind, event.track.enabled);
            
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
                this.elements.remoteVideo.srcObject = this.remoteStream;
            }
            this.remoteStream.addTrack(event.track);
            
            // VERIFICA AUDIO AGGIUNTA
            const audioTracks = this.remoteStream.getAudioTracks();
            console.log('Remote audio tracks:', audioTracks.length);
            audioTracks.forEach(track => {
                console.log('Audio track:', track.label, 'enabled:', track.enabled);
            });
            
            // Hide call info, show video
            this.elements.callInfo.style.display = 'none';
            this.elements.callStatus.textContent = 'Connesso';
        };

        // Connection state change
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'disconnected' || 
                this.peerConnection.connectionState === 'failed') {
                this.endCall();
            }
        };
        
        //  NUOVO: Monitora stato ICE (era mancante!)
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE state:', this.peerConnection.iceConnectionState);
        };
    },

    // Show call UI
    showCallUI(mode) {
        this.isCallActive = true;
        
        // Set user info
        this.elements.callAvatar.src = ChatConfig.activeChatAvatar || '/uploads/avatars/default.png';
        this.elements.callUsername.textContent = ChatConfig.activeChatUsername || 'Unknown';
        
        if (mode === 'outgoing') {
            this.elements.callStatus.textContent = 'Chiamata in corso...';
        } else if (mode === 'incoming') {
            this.elements.callStatus.textContent = 'Risposta...';
        }

        // Show/hide video elements based on call type
        if (this.isVideoCall) {
            this.elements.overlay.classList.remove('audio-only');
            this.elements.videoToggleBtn.style.display = 'flex';
            document.getElementById('audio-indicator').style.display = 'none';
        } else {
            this.elements.overlay.classList.add('audio-only');
            this.elements.videoToggleBtn.style.display = 'none';
            document.getElementById('audio-indicator').style.display = 'flex'; // MOSTRA INDICATORE
        }

        this.elements.overlay.classList.add('active');
        this.elements.callInfo.style.display = 'flex';
    },

    // Handle incoming call
    handleIncomingCall(data) {
        this.remoteUserId = data.from;
        this.callType = data.type;
        this.isVideoCall = (data.type === 'video');

        // Get caller info
        const caller = ChatConfig.pinnedUsers.find(u => String(u.id) === String(data.from));
        
        this.elements.incomingAvatar.src = caller?.avatar_url || '/uploads/avatars/default.png';
        this.elements.incomingUsername.textContent = caller?.username || 'Unknown';
        this.elements.incomingType.textContent = this.isVideoCall ? 'Videochiamata in arrivo...' : 'Chiamata vocale in arrivo...';

        // Show incoming call notification
        this.elements.incomingCall.classList.add('show');

        // Store offer for later
        this.pendingOffer = data.sdp;

        // Play ringtone (optional)
        this.playRingtone();
    },

    // Accept incoming call
    async acceptCall() {
        this.elements.incomingCall.classList.remove('show');
        this.stopRingtone();

        try {
            // Get user media
            await this.getUserMedia();

            // Create peer connection
            this.createPeerConnection();

            // Add local stream
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Set remote description (offer)
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));

            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // Send answer
            this.sendSignal('answer', {
                to: this.remoteUserId,
                from: ChatConfig.myId,
                sdp: answer
            });

            // Show call UI
            this.showCallUI('incoming');

        } catch (error) {
            console.error('Error accepting call:', error);
            showCustomNotification('Errore nell\'accettare la chiamata', 'error');
            this.rejectCall();
        }
    },

    // Reject incoming call
    rejectCall() {
        this.elements.incomingCall.classList.remove('show');
        this.stopRingtone();

        this.sendSignal('reject', {
            to: this.remoteUserId,
            from: ChatConfig.myId
        });

        this.remoteUserId = null;
        this.pendingOffer = null;
    },

    // Handle answer
    async handleAnswer(data) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            this.elements.callStatus.textContent = 'Connessione...';
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    },

    // Handle ICE candidate
    async handleIceCandidate(data) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    },

    // End call
    endCall() {
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Clear remote stream
        this.remoteStream = null;

        // Reset UI
        this.elements.overlay.classList.remove('active');
        this.elements.localVideo.srcObject = null;
        this.elements.remoteVideo.srcObject = null;
        this.elements.incomingCall.classList.remove('show');

        // Reset state
        this.isCallActive = false;
        this.isMuted = false;
        this.isVideoOff = false;
        this.isAudioMuted = false;
        this.elements.muteBtn.classList.remove('active');
        this.elements.videoToggleBtn.classList.remove('off');
        const audioIndicator = document.getElementById('audio-indicator');
        if (audioIndicator) {
            audioIndicator.classList.remove('muted');
            audioIndicator.querySelector('i').className = 'fas fa-volume-up';
        }

        // Send hangup signal
        if (this.remoteUserId) {
            this.sendSignal('hangup', {
                to: this.remoteUserId,
                from: ChatConfig.myId
            });
        }

        this.remoteUserId = null;
        this.stopRingtone();
    },

    // Toggle mute (microphone)
    toggleMute() {
        if (!this.localStream) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.isMuted = !audioTrack.enabled;
            this.elements.muteBtn.classList.toggle('active', this.isMuted);
            this.elements.muteBtn.querySelector('i').className = 
                this.isMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
        }
    },

    // Toggle audio (mute received audio)
    toggleAudio() {
        if (!this.remoteStream) return;

        const audioTracks = this.remoteStream.getAudioTracks();
        audioTracks.forEach(track => {
            track.enabled = !track.enabled;
        });

        this.isAudioMuted = !audioTracks[0]?.enabled || false;
        const audioIndicator = document.getElementById('audio-indicator');
        if (audioIndicator) {
            audioIndicator.classList.toggle('muted', this.isAudioMuted);
            audioIndicator.querySelector('i').className = 
                this.isAudioMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        }
    },

    // Toggle video
    toggleVideo() {
        if (!this.localStream || !this.isVideoCall) return;

        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.isVideoOff = !videoTrack.enabled;
            this.elements.videoToggleBtn.classList.toggle('off', this.isVideoOff);
            this.elements.videoToggleBtn.querySelector('i').className = 
                this.isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
        }
    },

    // Send signaling message
    sendSignal(type, data) {
        fetch('/call/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, data })
        }).catch(error => console.error('Signal error:', error));
    },

    // Play ringtone
    playRingtone() {
        // Implement ringtone audio if needed
        console.log('Playing ringtone...');
    },

    // Stop ringtone
    stopRingtone() {
        // Stop ringtone audio if needed
        console.log('Stopping ringtone...');
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CallManager.init());
} else {
    CallManager.init();
}



