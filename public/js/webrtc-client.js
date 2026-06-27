class WebRTCClient {
  constructor({ onRemoteStream, onConnectionStateChange }) {
    this.pc = null;
    this.localStream = null;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionStateChange = onConnectionStateChange;
  }

  async initLocalStream(mode) {
    if (mode === 'chat') return null;

    const constraints = mode === 'voice'
      ? { audio: true, video: false }
      : { audio: true, video: true };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return this.localStream;
  }

  createPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.pc.addTrack(track, this.localStream);
      });
    }

    this.pc.ontrack = (event) => {
      if (this.onRemoteStream) this.onRemoteStream(event.streams[0]);
    };

    this.pc.onconnectionstatechange = () => {
      if (this.onConnectionStateChange) this.onConnectionStateChange(this.pc.connectionState);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    return this.pc;
  }

  async createOffer() {
    if (!this.pc) this.createPeerConnection();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer) {
    if (!this.pc) this.createPeerConnection();
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate) {
    if (this.pc && candidate) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  stop() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.localStream = null;
    this.pc = null;
  }
}
