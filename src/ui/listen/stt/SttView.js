import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../../mixins/ThemeMixin.js';

export class SttView extends ThemeMixin(LitElement) {
    static styles = css`
        :host {
            display: block;
            width: 100%;
        }

        /* Inherit font styles from parent */

        .transcription-container {
            overflow-y: auto;
            padding: 16px 20px 20px 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-height: 150px;
            max-height: 600px;
            position: relative;
            z-index: 1;
            flex: 1;
            background: var(--surface-elevated, #ffffff);
        }

        /* Visibility handled by parent component */

        .transcription-container::-webkit-scrollbar {
            width: 6px;
        }
        .transcription-container::-webkit-scrollbar-track {
            background: var(--background-secondary, #f8f9fa);
            border-radius: 3px;
        }
        .transcription-container::-webkit-scrollbar-thumb {
            background: var(--border-medium, #d1d5db);
            border-radius: 3px;
        }
        .transcription-container::-webkit-scrollbar-thumb:hover {
            background: var(--border-strong, #9ca3af);
        }

        .stt-message {
            padding: 10px 16px;
            border-radius: 16px;
            max-width: 85%;
            word-wrap: break-word;
            word-break: break-word;
            line-height: 1.6;
            font-size: 14px;
            margin-bottom: 6px;
            box-sizing: border-box;
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
            border: 1px solid transparent;
        }

        .stt-message.them {
            background: var(--background-secondary, #f8f9fa);
            color: var(--text-primary, #1f2937);
            align-self: flex-start;
            border-bottom-left-radius: 6px;
            margin-right: auto;
            border-color: var(--border-light, #e5e7eb);
        }

        .stt-message.me {
            background: var(--interactive-primary, #2563eb);
            color: var(--text-inverse, #ffffff);
            align-self: flex-end;
            border-bottom-right-radius: 6px;
            margin-left: auto;
            border-color: var(--interactive-primary, #2563eb);
        }

        .stt-message.agent {
            background: rgba(139, 92, 246, 0.15); /* Simple purple background */
            color: var(--text-primary, #1f2937);
            align-self: flex-start;
            border-bottom-left-radius: 6px;
            margin-right: auto;
            border-left: 3px solid #8b5cf6; /* Purple left border for distinction */
        }

        .agent-label {
            font-size: 11px;
            font-weight: 600;
            color: #8b5cf6;
            margin-bottom: 4px;
            margin-left: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 1;
            min-height: 200px;
            color: var(--text-tertiary, #9ca3af);
            font-size: 14px;
            font-style: italic;
            background: var(--background-secondary, #f8f9fa);
            border-radius: 8px;
            border: 2px dashed var(--border-light, #e5e7eb);
        }
    `;

    static properties = {
        sttMessages: { type: Array },
        isVisible: { type: Boolean },
    };

    constructor() {
        super();
        this.sttMessages = [];
        this.isVisible = true;
        this.messageIdCounter = 0;
        this._shouldScrollAfterUpdate = false;

        this.handleSttUpdate = this.handleSttUpdate.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api) {
            window.api.sttView.onSttUpdate(this.handleSttUpdate);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api) {
            window.api.sttView.removeOnSttUpdate(this.handleSttUpdate);
        }
    }

    // Handle session reset from parent
    resetTranscript() {
        this.sttMessages = [];
        this.requestUpdate();
    }

    handleSttUpdate(event, { speaker, text, isFinal, isPartial }) {
        if (text === undefined) return;

        // Debug: Log ALL incoming messages to see speaker classification
        console.log('[TOOL] [DEBUG] STT message received:');
        console.log('  speaker:', JSON.stringify(speaker));
        console.log('  text:', text.substring(0, 50) + '...');
        console.log('  isFinal:', isFinal);
        console.log('  isPartial:', isPartial);
        console.log('  speakerClass:', this.getSpeakerClass(speaker));
        console.log('  isAgent:', this.isAgentMessage({speaker}));

        const container = this.shadowRoot.querySelector('.transcription-container');
        this._shouldScrollAfterUpdate = container ? container.scrollTop + container.clientHeight >= container.scrollHeight - 10 : false;

        const findLastPartialIdx = spk => {
            for (let i = this.sttMessages.length - 1; i >= 0; i--) {
                const m = this.sttMessages[i];
                if (m.speaker === spk && m.isPartial) return i;
            }
            return -1;
        };

        const newMessages = [...this.sttMessages];
        const targetIdx = findLastPartialIdx(speaker);

        if (isPartial) {
            if (targetIdx !== -1) {
                newMessages[targetIdx] = {
                    ...newMessages[targetIdx],
                    text,
                    isPartial: true,
                    isFinal: false,
                };
            } else {
                newMessages.push({
                    id: this.messageIdCounter++,
                    speaker,
                    text,
                    isPartial: true,
                    isFinal: false,
                });
            }
        } else if (isFinal) {
            if (targetIdx !== -1) {
                newMessages[targetIdx] = {
                    ...newMessages[targetIdx],
                    text,
                    isPartial: false,
                    isFinal: true,
                };
            } else {
                newMessages.push({
                    id: this.messageIdCounter++,
                    speaker,
                    text,
                    isPartial: false,
                    isFinal: true,
                });
            }
        }

        this.sttMessages = newMessages;
        
        // Notify parent component about message updates
        this.dispatchEvent(new CustomEvent('stt-messages-updated', {
            detail: { messages: this.sttMessages },
            bubbles: true
        }));
    }

    scrollToBottom() {
        setTimeout(() => {
            const container = this.shadowRoot.querySelector('.transcription-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 0);
    }

    getSpeakerClass(speaker) {
        const speakerLower = speaker.toLowerCase();
        if (speakerLower === 'me') return 'me';
        if (speakerLower === 'agent' || speakerLower === 'assistant') return 'agent';
        return 'them';
    }

    shouldShowAgentLabel(msg, index) {
        // Show agent label if this is an agent message and either:
        // 1. It's the first message, or
        // 2. The previous message is not from an agent
        if (!this.isAgentMessage(msg)) return false;
        if (index === 0) return true;
        const prevMsg = this.sttMessages[index - 1];
        return !this.isAgentMessage(prevMsg);
    }

    isAgentMessage(msg) {
        const speakerLower = msg.speaker.toLowerCase();
        return speakerLower === 'agent' || speakerLower === 'assistant';
    }

    getTranscriptText() {
        return this.sttMessages.map(msg => `${msg.speaker}: ${msg.text}`).join('\n');
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has('sttMessages')) {
            if (this._shouldScrollAfterUpdate) {
                this.scrollToBottom();
                this._shouldScrollAfterUpdate = false;
            }
        }
    }

    render() {
        if (!this.isVisible) {
            return html`<div style="display: none;"></div>`;
        }

        return html`
            <div class="transcription-container">
                ${this.sttMessages.length === 0
                    ? html`<div class="empty-state">Waiting for speech...</div>`
                    : this.sttMessages.map((msg, index) => html`
                        <div>
                            ${this.shouldShowAgentLabel(msg, index) 
                                ? html`<div class="agent-label">Agent</div>` 
                                : ''
                            }
                            <div class="stt-message ${this.getSpeakerClass(msg.speaker)}">
                                ${msg.text}
                            </div>
                        </div>
                    `)
                }
            </div>
        `;
    }
}

customElements.define('stt-view', SttView); 