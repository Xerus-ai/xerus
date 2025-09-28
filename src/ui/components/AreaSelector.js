/**
 * XERUS AREA SELECTOR COMPONENT
 * React component for area selection controls and management
 * 
 * Features:
 * - Area selection trigger button
 * - Selected area display
 * - Privacy controls integration
 * - Glass morphism effects
 */

import { LitElement, html, css } from '../assets/lit-core-2.7.4.min.js';

class AreaSelector extends LitElement {
    static styles = css`
        :host {
            display: block;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .area-selector {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 16px;
            margin: 8px 0;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
        }

        .area-selector:hover {
            background: rgba(255, 255, 255, 0.15);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        }

        .selector-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .selector-title {
            font-size: 14px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
            margin: 0;
        }

        .privacy-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
        }

        .toggle-switch {
            position: relative;
            width: 36px;
            height: 20px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .toggle-switch.active {
            background: rgba(52, 199, 89, 0.8);
        }

        .toggle-slider {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 16px;
            height: 16px;
            background: white;
            border-radius: 50%;
            transition: transform 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .toggle-switch.active .toggle-slider {
            transform: translateX(16px);
        }

        .selector-controls {
            display: flex;
            gap: 12px;
            margin-bottom: 12px;
        }

        .control-button {
            flex: 1;
            background: rgba(0, 122, 255, 0.8);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 10px 16px;
            color: white;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .control-button:hover {
            background: rgba(0, 122, 255, 0.9);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
        }

        .control-button:active {
            transform: translateY(0);
        }

        .control-button:disabled {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.5);
            cursor: not-allowed;
            transform: none;
        }

        .control-button:disabled:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: none;
            box-shadow: none;
        }

        .control-button.secondary {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.9);
        }

        .control-button.secondary:hover {
            background: rgba(255, 255, 255, 0.2);
            box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
        }

        .control-button.danger {
            background: rgba(255, 59, 48, 0.8);
        }

        .control-button.danger:hover {
            background: rgba(255, 59, 48, 0.9);
            box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3);
        }

        .selection-preview {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 12px;
            margin-top: 8px;
            display: none;
        }

        .selection-preview.has-selection {
            display: block;
        }

        .preview-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
        }

        .preview-dimensions {
            font-family: 'SF Mono', Menlo, Monaco, monospace;
            color: rgba(52, 199, 89, 0.9);
        }

        .preview-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }

        .preview-button {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            padding: 6px 12px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .preview-button:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
            margin-top: 8px;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.4);
        }

        .status-dot.active {
            background: rgba(52, 199, 89, 0.9);
            animation: pulse 2s infinite;
        }

        .status-dot.selecting {
            background: rgba(255, 149, 0, 0.9);
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .keyboard-shortcuts {
            margin-top: 12px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            line-height: 1.4;
        }

        .keyboard-shortcuts kbd {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 3px;
            padding: 2px 6px;
            font-family: inherit;
            font-size: 10px;
        }
    `;

    static properties = {
        isSelecting: { type: Boolean },
        selectedArea: { type: Object },
        contentProtection: { type: Boolean },
        status: { type: String }
    };

    constructor() {
        super();
        this.isSelecting = false;
        this.selectedArea = null;
        this.contentProtection = false;
        this.status = 'ready';
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen for area selection events
        window.api?.common?.onAreaSelected?.((event, area) => {
            this.selectedArea = area;
            this.isSelecting = false;
            this.status = 'selected';
            this.requestUpdate();
        });

        // Listen for selection cancellation
        window.api?.common?.onSelectionCancelled?.(() => {
            this.isSelecting = false;
            this.status = 'ready';
            this.requestUpdate();
        });

        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'a':
                        if (e.shiftKey) {
                            e.preventDefault();
                            this.startAreaSelection();
                        }
                        break;
                    case 's':
                        if (e.shiftKey) {
                            e.preventDefault();
                            this.captureSelectedArea();
                        }
                        break;
                    case 'Escape':
                        this.cancelSelection();
                        break;
                }
            }
        });
    }

    async startAreaSelection() {
        if (this.isSelecting) return;
        
        this.isSelecting = true;
        this.status = 'selecting';
        this.requestUpdate();
        
        try {
            const result = await window.api?.common?.startAreaSelection();
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to start area selection');
            }
        } catch (error) {
            console.error('Area selection failed:', error);
            this.isSelecting = false;
            this.status = 'error';
            this.requestUpdate();
        }
    }

    cancelSelection() {
        if (this.isSelecting) {
            window.api?.common?.cancelAreaSelection();
        }
        this.isSelecting = false;
        this.status = 'ready';
        this.requestUpdate();
    }

    clearSelection() {
        this.selectedArea = null;
        this.status = 'ready';
        this.requestUpdate();
    }

    async captureSelectedArea() {
        if (!this.selectedArea) return;
        
        try {
            const result = await window.api?.common?.captureSelectedArea();
            if (result?.success) {
                this.dispatchEvent(new CustomEvent('area-captured', { 
                    detail: result 
                }));
            }
        } catch (error) {
            console.error('Capture failed:', error);
        }
    }

    async captureFullScreen() {
        try {
            const result = await window.api?.common?.captureFullScreen();
            if (result?.success) {
                this.dispatchEvent(new CustomEvent('screen-captured', { 
                    detail: result 
                }));
            }
        } catch (error) {
            console.error('Screen capture failed:', error);
        }
    }

    async toggleContentProtection() {
        this.contentProtection = !this.contentProtection;
        
        try {
            const result = await window.api?.common?.toggleContentProtection(this.contentProtection);
            if (result?.success) {
                this.contentProtection = result.contentProtection;
            }
        } catch (error) {
            console.error('Content protection toggle failed:', error);
        }
        
        this.requestUpdate();
    }

    formatDimensions(area) {
        if (!area) return '';
        return `${area.width} × ${area.height}`;
    }

    getStatusText() {
        switch (this.status) {
            case 'selecting':
                return 'Selecting area...';
            case 'selected':
                return 'Area selected';
            case 'error':
                return 'Selection failed';
            default:
                return 'Ready to select';
        }
    }

    getStatusDotClass() {
        switch (this.status) {
            case 'selecting':
                return 'selecting';
            case 'selected':
                return 'active';
            default:
                return '';
        }
    }

    render() {
        return html`
            <div class="area-selector">
                <div class="selector-header">
                    <h3 class="selector-title">Area Selection</h3>
                    <div class="privacy-toggle">
                        <span>Privacy</span>
                        <div class="toggle-switch ${this.contentProtection ? 'active' : ''}" 
                             @click="${this.toggleContentProtection}">
                            <div class="toggle-slider"></div>
                        </div>
                    </div>
                </div>

                <div class="selector-controls">
                    <button class="control-button" 
                            ?disabled="${this.isSelecting}"
                            @click="${this.startAreaSelection}">
                        ${this.isSelecting ? '[WAIT]' : '[TARGET]'} Select Area
                    </button>
                    
                    <button class="control-button secondary"
                            @click="${this.captureFullScreen}">
                        [MOBILE] Full Screen
                    </button>
                    
                    ${this.isSelecting ? html`
                        <button class="control-button danger"
                                @click="${this.cancelSelection}">
                            [ERROR] Cancel
                        </button>
                    ` : ''}
                </div>

                <div class="selection-preview ${this.selectedArea ? 'has-selection' : ''}">
                    <div class="preview-info">
                        <span>Selected Area:</span>
                        <span class="preview-dimensions">
                            ${this.formatDimensions(this.selectedArea)}
                        </span>
                    </div>
                    
                    <div class="preview-actions">
                        <button class="preview-button" 
                                @click="${this.captureSelectedArea}">
                            📸 Capture
                        </button>
                        <button class="preview-button" 
                                @click="${this.clearSelection}">
                            🗑️ Clear
                        </button>
                    </div>
                </div>

                <div class="status-indicator">
                    <div class="status-dot ${this.getStatusDotClass()}"></div>
                    <span>${this.getStatusText()}</span>
                </div>

                <div class="keyboard-shortcuts">
                    <kbd>⌘⇧A</kbd> Select Area • 
                    <kbd>⌘⇧S</kbd> Capture • 
                    <kbd>Esc</kbd> Cancel
                </div>
            </div>
        `;
    }
}

customElements.define('area-selector', AreaSelector);

export { AreaSelector };