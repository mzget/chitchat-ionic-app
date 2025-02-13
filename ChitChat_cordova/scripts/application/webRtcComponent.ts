class WebRtcComponent implements absSpartan.IRTCListener {
    webRtcCallState: WebRtcCallState;
    lineBusyEvent: (contactId: string) => void;
    videoCallEvent: (contactId : string, callerId : string) => void;
    voiceCallEvent: (contactId: string, callerId: string) => void;
    hangUpCallEvent: () => void;
    contactLineBusyEvent: () => void;

    constructor() {
        console.log("starting.. webRtcComponent.");
        
        this.webRtcCallState = new WebRtcCallState();
    }

    public setCallState(state: CallState) {
        this.webRtcCallState.callState = state;
    }

    public onVideoCall(dataEvent: any): void {
        let body = dataEvent.body;
        let contactId: string = body.from;
        let peerId: string = body.peerId;

        if (this.webRtcCallState.callState === CallState.idle) {
            if (this.videoCallEvent != null) {
                this.videoCallEvent(contactId, peerId);
            }
        }
        else {
            console.warn("Call status is not idle. " + this.webRtcCallState.callState.toString())
            if (this.lineBusyEvent != null) {
                this.lineBusyEvent(contactId);
            }
        }
    }

    public onVoiceCall(dataEvent: any): void {
        let body = dataEvent.body;
        let contactId = body.from;
        let peerId = body.peerId;

        if (this.webRtcCallState.callState === CallState.idle) {
            if (this.voiceCallEvent != null) {
                this.voiceCallEvent(contactId, peerId);
            }
        }
        else {
            console.warn("Call status is not idle. " + this.webRtcCallState.callState.toString())
            if (this.lineBusyEvent != null) {
                this.lineBusyEvent(contactId);
            }
        }
    }

    public onHangupCall(dataEvent: any): void {
        if (this.hangUpCallEvent != null) {
            this.hangUpCallEvent();
        }
    }
    
    public onTheLineIsBusy(dataEvent: any): void {
        if (this.contactLineBusyEvent != null) {
            this.contactLineBusyEvent();
        }
    }
}