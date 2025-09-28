import { html, css, LitElement } from '../../ui/assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../mixins/ThemeMixin.js';
import { parser, parser_write, parser_end, default_renderer } from '../../ui/assets/smd.js';

export class AskView extends ThemeMixin(LitElement) {
    static properties = {
        currentResponse: { type: String },
        currentQuestion: { type: String },
        isLoading: { type: Boolean },
        copyState: { type: String },
        isHovering: { type: Boolean },
        hoveredLineIndex: { type: Number },
        lineCopyState: { type: Object },
        showTextInput: { type: Boolean },
        headerText: { type: String },
        headerAnimating: { type: Boolean },
        isStreaming: { type: Boolean },
        windowOpacity: { type: Number },
        userFeedback: { type: String },
    };

    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            color: var(--text-primary, #1f2937);
            background: var(--background-primary, #ffffff);
            transform: translate3d(0, 0, 0);
            backface-visibility: hidden;
            transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease-out;
            will-change: transform, opacity;
        }

        :host(.hiding) {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }

        :host(.showing) {
            animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        :host(.hidden) {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            pointer-events: none;
        }

        @keyframes slideUp {
            0% {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0px);
            }
            30% {
                opacity: 0.7;
                transform: translateY(-20%) scale(0.98);
                filter: blur(0.5px);
            }
            70% {
                opacity: 0.3;
                transform: translateY(-80%) scale(0.92);
                filter: blur(1.5px);
            }
            100% {
                opacity: 0;
                transform: translateY(-150%) scale(0.85);
                filter: blur(2px);
            }
        }

        @keyframes slideDown {
            0% {
                opacity: 0;
                transform: translateY(-150%) scale(0.85);
                filter: blur(2px);
            }
            30% {
                opacity: 0.5;
                transform: translateY(-50%) scale(0.92);
                filter: blur(1px);
            }
            65% {
                opacity: 0.9;
                transform: translateY(-5%) scale(0.99);
                filter: blur(0.2px);
            }
            85% {
                opacity: 0.98;
                transform: translateY(2%) scale(1.005);
                filter: blur(0px);
            }
            100% {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0px);
            }
        }

        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        /* Allow text selection in assistant responses */
        .response-container, .response-container * {
            user-select: text !important;
            cursor: text !important;
        }

        .response-container pre {
            background: #f8f9fa !important;
            border-radius: 6px !important;
            padding: 16px !important;
            margin: 16px 0 !important;
            overflow-x: auto !important;
            border: 1px solid #e8eaed !important;
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
            color: #202124 !important;
        }

        .response-container code {
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
            font-size: 13px !important;
            background: transparent !important;
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
        }

        .response-container pre code {
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
            display: block !important;
            line-height: 1.5 !important;
        }

        .response-container p code {
            background: #f1f3f4 !important;
            padding: 2px 6px !important;
            border-radius: 3px !important;
            color: #174ea6 !important;
            font-size: 14px !important;
            border: none !important;
        }

        /* Light theme syntax highlighting */
        .hljs-keyword {
            color: #d73a49 !important;
        }
        .hljs-string {
            color: #032f62 !important;
        }
        .hljs-comment {
            color: #6a737d !important;
        }
        .hljs-number {
            color: #005cc5 !important;
        }
        .hljs-function {
            color: #6f42c1 !important;
        }
        .hljs-variable {
            color: #e36209 !important;
        }
        .hljs-built_in {
            color: #005cc5 !important;
        }
        .hljs-title {
            color: #6f42c1 !important;
        }
        .hljs-attr {
            color: #005cc5 !important;
        }
        .hljs-tag {
            color: #22863a !important;
        }

        .ask-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            background: transparent;
            border-radius: 12px;
            border: none;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            opacity: var(--window-opacity, 1.0);
        }

        .ask-container::before {
            display: none;
            border-radius: 12px;
            filter: blur(10px);
            z-index: -1;
        }

        .response-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            background: var(--background-secondary, #f8f9fa);
            border: 1px solid var(--border-light, #e5e7eb);
            border-bottom: 1px solid var(--border-light, #e5e7eb);
            border-radius: 12px 12px 0 0;
            flex-shrink: 0;
        }

        .response-header.hidden {
            display: none;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }

        .response-icon {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .response-icon img {
            width: 32px;
            height: 32px;
            object-fit: contain;
        }

        .response-label {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary, #1f2937);
            white-space: nowrap;
            position: relative;
            overflow: hidden;
        }

        .response-label.animating {
            animation: fadeInOut 0.3s ease-in-out;
        }

        @keyframes fadeInOut {
            0% {
                opacity: 1;
                transform: translateY(0);
            }
            50% {
                opacity: 0;
                transform: translateY(-10px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            justify-content: flex-end;
        }

        .question-text {
            font-size: 13px;
            color: var(--text-secondary, #6b7280);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 300px;
            margin-right: 8px;
        }

        .header-controls {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-shrink: 0;
        }

        .copy-button {
            background: var(--surface-elevated, #ffffff);
            color: var(--text-secondary, #6b7280);
            border: 1px solid var(--border-light, #e5e7eb);
            padding: 6px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 28px;
            height: 28px;
            flex-shrink: 0;
            position: relative;
            overflow: hidden;
        }

        .copy-button:hover {
            background: var(--background-secondary, #f8f9fa);
            border-color: var(--border-medium, #d1d5db);
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }

        .copy-button svg {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
        }

        .copy-button .check-icon {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }

        .copy-button.copied .copy-icon {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }

        .copy-button.copied .check-icon {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }

        .close-button {
            background: var(--surface-elevated, #ffffff);
            color: var(--text-secondary, #6b7280);
            border: 1px solid var(--border-light, #e5e7eb);
            padding: 4px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            transition: all 0.15s ease;
        }

        .close-button:hover {
            background: var(--background-secondary, #f8f9fa);
            border-color: var(--border-medium, #d1d5db);
            color: var(--text-primary, #1f2937);
        }

        .response-container {
            flex: 1;
            padding: 16px 20px;
            overflow-y: auto;
            font-size: 15px;
            line-height: 1.7;
            background: var(--background-primary, #ffffff);
            border: 1px solid var(--border-light, #e5e7eb);
            border-top: none;
            border-radius: 0 0 12px 12px;
            min-height: 0;
            max-height: 400px;
            position: relative;
            color: #5f6368;
            margin-bottom: 12px;
            box-sizing: border-box;
        }

        .response-container.hidden {
            display: none;
        }

        .response-container::-webkit-scrollbar {
            width: 6px;
        }

        .response-container::-webkit-scrollbar-track {
            background: var(--background-secondary, #f8f9fa);
            border-radius: 3px;
        }

        .response-container::-webkit-scrollbar-thumb {
            background: var(--border-medium, #d1d5db);
            border-radius: 3px;
        }

        .response-container::-webkit-scrollbar-thumb:hover {
            background: var(--border-strong, #9ca3af);
        }

        /* Content typography styles to match inspiration */
        .response-container h1,
        .response-container h2,
        .response-container h3,
        .response-container h4,
        .response-container h5,
        .response-container h6 {
            color: #3c4043;
            margin: 20px 0 12px 0;
            font-weight: 500;
            line-height: 1.3;
        }

        .response-container h1 { font-size: 24px; }
        .response-container h2 { font-size: 20px; }
        .response-container h3 { font-size: 18px; }
        .response-container h4 { font-size: 16px; }

        .response-container p {
            margin: 12px 0;
            color: #5f6368;
            line-height: 1.7;
        }

        .response-container ul,
        .response-container ol {
            margin: 12px 0;
            padding-left: 24px;
            color: #5f6368;
        }

        .response-container li {
            margin: 6px 0;
            line-height: 1.6;
        }

        .response-container strong {
            color: #3c4043;
            font-weight: 500;
        }

        .response-container em {
            font-style: italic;
        }

        .loading-dots {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 40px;
        }

        .loading-dot {
            width: 8px;
            height: 8px;
            background: var(--interactive-primary, #2563eb);
            border-radius: 50%;
            animation: pulse 1.5s ease-in-out infinite;
        }

        .loading-dot:nth-child(1) {
            animation-delay: 0s;
        }

        .loading-dot:nth-child(2) {
            animation-delay: 0.2s;
        }

        .loading-dot:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes pulse {
            0%,
            80%,
            100% {
                opacity: 0.3;
                transform: scale(0.8);
            }
            40% {
                opacity: 1;
                transform: scale(1.2);
            }
        }

        .response-line {
            position: relative;
            padding: 2px 0;
            margin: 0;
            transition: background-color 0.15s ease;
        }

        .response-line:hover {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }

        .line-copy-button {
            position: absolute;
            left: -32px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 3px;
            padding: 2px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.15s ease, background-color 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
        }

        .response-line:hover .line-copy-button {
            opacity: 1;
        }

        .line-copy-button:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .line-copy-button.copied {
            background: rgba(40, 167, 69, 0.3);
        }

        .line-copy-button svg {
            width: 12px;
            height: 12px;
            stroke: rgba(255, 255, 255, 0.9);
        }

        .text-input-container {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            background: var(--surface-elevated, #ffffff);
            border: 1px solid var(--border-light, #e5e7eb);
            border-radius: 12px;
            flex-shrink: 0;
            transition: opacity 0.1s ease-in-out, transform 0.1s ease-in-out;
            transform-origin: bottom;
            box-sizing: border-box;
        }

        .text-input-container.hidden {
            opacity: 0;
            transform: scaleY(0);
            padding: 0;
            height: 0;
            overflow: hidden;
        }

        .text-input-container.no-response {
            border: 1px solid var(--border-light, #e5e7eb);
        }

        #textInput {
            flex: 1;
            padding: 10px 14px;
            background: var(--background-secondary, #f8f9fa);
            border-radius: 20px;
            outline: none;
            border: none;
            color: var(--text-primary, #1f2937);
            font-size: 14px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 400;
        }

        #textInput::placeholder {
            color: var(--text-secondary, #6b7280);
        }

        #textInput:focus {
            outline: none;
        }

        .response-line h1,
        .response-line h2,
        .response-line h3,
        .response-line h4,
        .response-line h5,
        .response-line h6 {
            color: rgba(255, 255, 255, 0.95);
            margin: 16px 0 8px 0;
            font-weight: 600;
        }

        .response-line p {
            margin: 8px 0;
            color: rgba(255, 255, 255, 0.9);
        }

        .response-line ul,
        .response-line ol {
            margin: 8px 0;
            padding-left: 20px;
        }

        .response-line li {
            margin: 4px 0;
            color: rgba(255, 255, 255, 0.9);
        }

        .response-line code {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.95);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 13px;
        }

        .response-line pre {
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.95);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 12px 0;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .response-line pre code {
            background: none;
            padding: 0;
        }

        .response-line blockquote {
            border-left: 3px solid rgba(255, 255, 255, 0.3);
            margin: 12px 0;
            padding: 8px 16px;
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.8);
        }

        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: rgba(255, 255, 255, 0.5);
            font-size: 14px;
        }

        .btn-gap {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 4px;
        }

        .response-buttons {
            display: flex;
            align-items: center;
            height: 100%;
            gap: 4px;
        }

        .submit-btn, .clear-btn {
            display: flex;
            align-items: center;
            background: var(--background-secondary, #f8f9fa);
            color: var(--text-secondary, #6b7280);
            border: 1px solid var(--border-light, #e5e7eb);
            border-radius: 6px;
            margin-left: 8px;
            font-size: 13px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500;
            overflow: hidden;
            cursor: pointer;
            transition: background 0.15s;
            height: 32px;
            padding: 0 10px;
            box-shadow: none;
        }
        .submit-btn:hover, .clear-btn:hover {
            background: var(--background-tertiary, #e5e7eb);
            border-color: var(--border-medium, #d1d5db);
        }
        .btn-label {
            margin-right: 8px;
            display: flex;
            align-items: center;
            height: 100%;
        }
        .btn-icon {
            background: var(--background-tertiary, #e5e7eb);
            border-radius: 13%;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            color: var(--text-primary, #1f2937);
        }
        .btn-icon img, .btn-icon svg {
            width: 13px;
            height: 13px;
            display: block;
        }
        
        /* Tool Panel Styles */
        .tool-panel {
            background: rgba(0, 0, 0, 0.15);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            padding: 12px 16px;
            max-height: 200px;
            overflow-y: auto;
            transition: all 0.2s ease;
        }
        
        .tool-panel.hidden {
            max-height: 0;
            padding: 0 16px;
            overflow: hidden;
        }
        
        .tool-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        
        .tool-panel-title {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.8);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .tool-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
        }
        
        .tool-button {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 8px 12px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 6px;
            min-height: 32px;
        }
        
        .tool-button:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-1px);
        }
        
        .tool-button.active {
            background: rgba(100, 150, 255, 0.2);
            border-color: rgba(100, 150, 255, 0.4);
        }
        
        .tool-icon {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        
        .tool-name {
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .quick-tools {
            display: flex;
            gap: 4px;
            align-items: center;
        }
        
        .quick-tool-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 4px;
            padding: 4px 8px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 10px;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        
        .quick-tool-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 1);
        }
        
        .tool-toggle-btn {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            padding: 4px;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
        }
        
        .tool-toggle-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 1);
        }
        
        .tool-toggle-btn.active {
            background: rgba(100, 150, 255, 0.2);
            border-color: rgba(100, 150, 255, 0.4);
            color: rgba(255, 255, 255, 1);
        }
        
        /* Personality Panel Styles */
        .personality-panel {
            background: rgba(0, 0, 0, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            padding: 12px;
            margin: 8px 12px;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        }
        
        .personality-panel.hidden {
            display: none;
        }
        
        .personality-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .personality-title {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .personality-icon {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        
        .adaptive-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.7);
        }
        
        .adaptive-switch {
            position: relative;
            width: 32px;
            height: 16px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s ease;
        }
        
        .adaptive-switch.active {
            background: rgba(100, 150, 255, 0.6);
        }
        
        .adaptive-switch::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 12px;
            height: 12px;
            background: white;
            border-radius: 50%;
            transition: transform 0.2s ease;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        
        .adaptive-switch.active::after {
            transform: translateX(16px);
        }
        
        .personality-selector {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .personality-option {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 8px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
            position: relative;
        }
        
        .personality-option:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-1px);
        }
        
        .personality-option.active {
            background: rgba(100, 150, 255, 0.15);
            border-color: rgba(100, 150, 255, 0.3);
            box-shadow: 0 0 0 1px rgba(100, 150, 255, 0.2);
        }
        
        .personality-option.recommended {
            border-color: rgba(255, 200, 100, 0.4);
            box-shadow: 0 0 0 1px rgba(255, 200, 100, 0.1);
        }
        
        .personality-option.recommended::before {
            content: '★';
            position: absolute;
            top: 4px;
            right: 6px;
            color: rgba(255, 200, 100, 0.8);
            font-size: 10px;
        }
        
        .personality-name {
            font-size: 11px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 2px;
        }
        
        .personality-description {
            font-size: 9px;
            color: rgba(255, 255, 255, 0.6);
            line-height: 1.3;
        }
        
        .personality-toggle-btn {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            padding: 4px;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
        }
        
        .personality-toggle-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 1);
        }
        
        .personality-toggle-btn.active {
            background: rgba(100, 150, 255, 0.2);
            border-color: rgba(100, 150, 255, 0.4);
            color: rgba(255, 255, 255, 1);
        }
        
        /* Tutorial Overlay Styles */
        .tutorial-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(2px);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 12px;
        }
        
        .tutorial-overlay.hidden {
            display: none;
        }
        
        .tutorial-content {
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 20px;
            max-width: 400px;
            text-align: center;
        }
        
        .tutorial-title {
            font-size: 16px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.95);
            margin-bottom: 12px;
        }
        
        .tutorial-description {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
            line-height: 1.5;
            margin-bottom: 16px;
        }
        
        .tutorial-actions {
            display: flex;
            gap: 8px;
            justify-content: center;
        }
        
        .tutorial-btn {
            background: rgba(100, 150, 255, 0.2);
            border: 1px solid rgba(100, 150, 255, 0.4);
            border-radius: 6px;
            padding: 8px 16px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        
        .tutorial-btn:hover {
            background: rgba(100, 150, 255, 0.3);
        }
        
        .tutorial-btn.secondary {
            background: rgba(255, 255, 255, 0.05);
            border-color: rgba(255, 255, 255, 0.2);
        }
        
        .tutorial-btn.secondary:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        
        /* Dark mode text color fixes */
        :host-context(html.dark) .response-container {
            color: var(--text-primary, #f9fafb) !important;
        }
        
        :host-context(html.dark) .response-container h1,
        :host-context(html.dark) .response-container h2,
        :host-context(html.dark) .response-container h3,
        :host-context(html.dark) .response-container h4,
        :host-context(html.dark) .response-container h5,
        :host-context(html.dark) .response-container h6 {
            color: var(--text-primary, #f9fafb) !important;
        }
        
        :host-context(html.dark) .response-container p {
            color: var(--text-secondary, #d1d5db) !important;
        }
        
        :host-context(html.dark) .response-container ul,
        :host-context(html.dark) .response-container ol,
        :host-context(html.dark) .response-container li {
            color: var(--text-secondary, #d1d5db) !important;
        }
        
        :host-context(html.dark) .response-container strong {
            color: var(--text-primary, #f9fafb) !important;
        }
        
        /* Dark mode code block styling */
        :host-context(html.dark) .response-container pre {
            background: rgba(0, 0, 0, 0.3) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            color: var(--text-primary, #f9fafb) !important;
        }
        
        :host-context(html.dark) .response-container code {
            background: rgba(0, 0, 0, 0.2) !important;
            color: var(--text-primary, #f9fafb) !important;
        }
        
        :host-context(html.dark) .response-container p code {
            background: rgba(0, 0, 0, 0.3) !important;
            color: var(--interactive-primary, #60a5fa) !important;
        }
        
        /* Dark mode syntax highlighting */
        :host-context(html.dark) .hljs-keyword {
            color: #ff7b72 !important;
        }
        :host-context(html.dark) .hljs-string {
            color: #a5d6ff !important;
        }
        :host-context(html.dark) .hljs-comment {
            color: #8b949e !important;
        }
        :host-context(html.dark) .hljs-number {
            color: #79c0ff !important;
        }
        :host-context(html.dark) .hljs-function {
            color: #d2a8ff !important;
        }
        :host-context(html.dark) .hljs-variable {
            color: #ffa657 !important;
        }
        :host-context(html.dark) .hljs-built_in {
            color: #79c0ff !important;
        }
        :host-context(html.dark) .hljs-title {
            color: #d2a8ff !important;
        }
        :host-context(html.dark) .hljs-attr {
            color: #79c0ff !important;
        }
        :host-context(html.dark) .hljs-tag {
            color: #7ee787 !important;
        }
        
        /* Dark mode feedback button fixes */
        :host-context(html.dark) .feedback-buttons-inline span {
            color: var(--text-secondary, #d1d5db) !important;
        }
        
        :host-context(html.dark) .feedback-btn-inline {
            color: var(--text-secondary, #d1d5db) !important;
        }
        
        .header-clear-btn {
            background: transparent;
            border: none;
            display: flex;
            align-items: center;
            gap: 2px;
            cursor: pointer;
            padding: 0 2px;
        }
        .header-clear-btn .icon-box {
            color: white;
            font-size: 12px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 13%;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .header-clear-btn:hover .icon-box {
            background-color: rgba(255,255,255,0.18);
        }
        
        /* ────────────────[ GLASS BYPASS FOR ASK BAR ]─────────────── */
        :host-context(body.has-glass) .text-input-container {
            background: rgba(0, 0, 0, 0.3) !important;
            border-top: 1px solid rgba(255, 255, 255, 0.2) !important;
            backdrop-filter: blur(10px) !important;
        }
        
        :host-context(body.has-glass) #textInput {
            background: rgba(0, 0, 0, 0.4) !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
        }
        
        :host-context(body.has-glass) .submit-btn,
        :host-context(body.has-glass) .tool-toggle-btn,
        :host-context(body.has-glass) .personality-toggle-btn {
            background: rgba(0, 0, 0, 0.3) !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
        }
        
        :host-context(body.has-glass) .submit-btn:hover,
        :host-context(body.has-glass) .tool-toggle-btn:hover,
        :host-context(body.has-glass) .personality-toggle-btn:hover {
            background: rgba(0, 0, 0, 0.5) !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
        }

        
        
    `;


    constructor() {
        super();
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.copyState = 'idle';
        this.showTextInput = true;
        this.headerText = 'AI Response';
        this.headerAnimating = false;
        this.isStreaming = false;
        this.windowOpacity = 1.0;
        this.userFeedback = null; // null, 'positive', or 'negative'
        
        

        this.marked = null;
        this.hljs = null;
        this.DOMPurify = null;
        this.isLibrariesLoaded = false;

        // SMD.js streaming markdown parser
        this.smdParser = null;
        this.smdContainer = null;
        this.lastProcessedLength = 0;

        this.handleSendText = this.handleSendText.bind(this);
        this.handleTextKeydown = this.handleTextKeydown.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
        this.clearResponseContent = this.clearResponseContent.bind(this);
        this.handleEscKey = this.handleEscKey.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
        this.handleFeedback = this.handleFeedback.bind(this);
        this.handleCloseAskWindow = this.handleCloseAskWindow.bind(this);
        this.handleCloseIfNoContent = this.handleCloseIfNoContent.bind(this);

        this.loadLibraries();

        // --- Resize helpers ---
        this.isThrottled = false;
    }

    connectedCallback() {
        super.connectedCallback();


        document.addEventListener('keydown', this.handleEscKey);

        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const needed = entry.contentRect.height;
                const current = window.innerHeight;

                if (needed > current - 4) {
                    this.requestWindowResize(Math.ceil(needed));
                }
            }
        });

        const container = this.shadowRoot?.querySelector('.ask-container');
        if (container) this.resizeObserver.observe(container);

        this.handleQuestionFromAssistant = (event, question) => {
            this.handleSendText(null, question);
        };

        if (window.api) {
            window.api.askView.onShowTextInput(() => {
                if (!this.showTextInput) {
                    this.showTextInput = true;
                    this.updateComplete.then(() => this.focusTextInput());
                  } else {
                    this.focusTextInput();
                  }
            });

            window.api.askView.onScrollResponseUp(() => this.handleScroll('up'));
            window.api.askView.onScrollResponseDown(() => this.handleScroll('down'));

            // Listen for opacity changes
            window.api.on('window-opacity-changed', (event, opacity) => {
                this.windowOpacity = opacity;
                this.updateOpacityStyle();
            });

            // Handle screen capture context from area selection
            window.api.on('screen-capture-context', (event, contextMessage) => {
                console.log('📸 AskView: Received screen capture context:', contextMessage);
                this.handleScreenCaptureContext(contextMessage);
            });
            window.api.askView.onAskStateUpdate((event, newState) => {
                this.currentResponse = newState.currentResponse;
                this.currentQuestion = newState.currentQuestion;
                this.isLoading       = newState.isLoading;
                this.isStreaming     = newState.isStreaming;
              
                const wasHidden = !this.showTextInput;
                this.showTextInput = newState.showTextInput;
              
                if (newState.showTextInput) {
                  if (wasHidden) {
                    this.updateComplete.then(() => this.focusTextInput());
                  } else {
                    this.focusTextInput();
                  }
                }
              });
              
        }

        // Development helpers
        if (typeof window !== 'undefined') {
            window.testIPC = () => {
                console.log('[START] Testing IPC bridge...');
                if (window.api && window.api.common && window.api.common.getPlatformInfo) {
                    window.api.common.getPlatformInfo().then(info => {
                        console.log('[START] IPC test successful:', info);
                    }).catch(error => {
                        console.error('[START] IPC test failed:', error);
                    });
                } else {
                    console.log('[ERROR] IPC bridge not available');
                }
            };
            window.testResize = () => {
                console.log('[START] Testing window resize to 600px');
                console.log('[START] window.api available:', !!window.api);
                console.log('[START] window.api.askView available:', !!(window.api && window.api.askView));
                console.log('[START] window.api.askView.adjustWindowHeight available:', !!(window.api && window.api.askView && window.api.askView.adjustWindowHeight));
                
                if (window.api && window.api.askView && window.api.askView.adjustWindowHeight) {
                    console.log('[START] Calling window.api.askView.adjustWindowHeight(600)');
                    window.api.askView.adjustWindowHeight(600).then(result => {
                        console.log('[START] Resize result:', result);
                    }).catch(error => {
                        console.error('[START] Resize error:', error);
                    });
                } else {
                    console.log('[ERROR] Window API not available for resize test');
                }
            };
            window.forceResize = () => {
                console.log('[START] Force resize - trying multiple approaches...');
                
                // Try direct API call
                if (window.api && window.api.askView && window.api.askView.adjustWindowHeight) {
                    console.log('[START] Approach 1: Direct API call');
                    window.api.askView.adjustWindowHeight(600);
                }
                
                // Try through AskView method
                setTimeout(() => {
                    console.log('[START] Approach 2: Through AskView method');
                    this.adjustWindowHeight();
                }, 100);
                
                // Try multiple times with delays
                setTimeout(() => {
                    if (window.api && window.api.askView && window.api.askView.adjustWindowHeight) {
                        console.log('[START] Approach 3: Delayed API call');
                        window.api.askView.adjustWindowHeight(600);
                    }
                }, 500);
                
                setTimeout(() => {
                    if (window.api && window.api.askView && window.api.askView.adjustWindowHeight) {
                        console.log('[START] Approach 4: Final delayed API call');
                        window.api.askView.adjustWindowHeight(600);
                    }
                }, 1000);
            };
            console.log('[START] Development helpers: Use testResize(), testIPC(), or forceResize() to test');
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.resizeObserver?.disconnect();


        document.removeEventListener('keydown', this.handleEscKey);

        if (this.copyTimeout) {
            clearTimeout(this.copyTimeout);
        }

        if (this.headerAnimationTimeout) {
            clearTimeout(this.headerAnimationTimeout);
        }

        if (this.streamingTimeout) {
            clearTimeout(this.streamingTimeout);
        }

        Object.values(this.lineCopyTimeouts).forEach(timeout => clearTimeout(timeout));

        if (window.api) {
            window.api.askView.removeOnAskStateUpdate(this.handleAskStateUpdate);
            window.api.askView.removeOnShowTextInput(this.handleShowTextInput);
            window.api.askView.removeOnScrollResponseUp(this.handleScroll);
            window.api.askView.removeOnScrollResponseDown(this.handleScroll);
        }
    }


    async loadLibraries() {
        try {
            if (!window.marked) {
                await this.loadScript('../assets/marked-4.3.0.min.js');
            }

            if (!window.hljs) {
                await this.loadScript('../assets/highlight-11.9.0.min.js');
            }

            if (!window.DOMPurify) {
                await this.loadScript('../assets/dompurify-3.0.7.min.js');
            }

            this.marked = window.marked;
            this.hljs = window.hljs;
            this.DOMPurify = window.DOMPurify;

            if (this.marked && this.hljs) {
                this.marked.setOptions({
                    highlight: (code, lang) => {
                        if (lang && this.hljs.getLanguage(lang)) {
                            try {
                                return this.hljs.highlight(code, { language: lang }).value;
                            } catch (err) {
                                console.warn('Highlight error:', err);
                            }
                        }
                        try {
                            return this.hljs.highlightAuto(code).value;
                        } catch (err) {
                            console.warn('Auto highlight error:', err);
                        }
                        return code;
                    },
                    breaks: true,
                    gfm: true,
                    pedantic: false,
                    smartypants: false,
                    xhtml: false,
                });

                this.isLibrariesLoaded = true;
                this.renderContent();
            }

            if (this.DOMPurify) {
                this.isDOMPurifyLoaded = true;
            }
        } catch (error) {
            console.error('Failed to load libraries in AskView:', error);
        }
    }

    handleCloseAskWindow() {
        // this.clearResponseContent();
        window.api.askView.closeAskWindow();
    }

    handleCloseIfNoContent() {
        if (!this.currentResponse && !this.isLoading && !this.isStreaming) {
            this.handleCloseAskWindow();
        }
    }

    handleEscKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.handleCloseIfNoContent();
        }
    }

    clearResponseContent() {
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.isStreaming = false;
        this.headerText = 'AI Response';
        this.showTextInput = true;
        this.lastProcessedLength = 0;
        this.userFeedback = null;
        this.smdParser = null;
        this.smdContainer = null;
        
        // Clear any existing feedback buttons
        this.hideFeedbackButtons();
    }

    updateOpacityStyle() {
        this.style.setProperty('--window-opacity', this.windowOpacity);
        this.requestUpdate();
    }
    

    handleInputFocus() {
        this.isInputFocused = true;
    }

    focusTextInput() {
        requestAnimationFrame(() => {
            const textInput = this.shadowRoot?.getElementById('textInput');
            if (textInput) {
                textInput.focus();
            }
        });
    }


    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    parseMarkdown(text) {
        if (!text) return '';

        if (!this.isLibrariesLoaded || !this.marked) {
            return text;
        }

        try {
            return this.marked(text);
        } catch (error) {
            console.error('Markdown parsing error in AskView:', error);
            return text;
        }
    }

    fixIncompleteCodeBlocks(text) {
        if (!text) return text;

        const codeBlockMarkers = text.match(/```/g) || [];
        const markerCount = codeBlockMarkers.length;

        if (markerCount % 2 === 1) {
            return text + '\n```';
        }

        return text;
    }

    handleScroll(direction) {
        const scrollableElement = this.shadowRoot.querySelector('#responseContainer');
        if (scrollableElement) {
            const scrollAmount = 100; // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] (px)
            if (direction === 'up') {
                scrollableElement.scrollTop -= scrollAmount;
            } else {
                scrollableElement.scrollTop += scrollAmount;
            }
        }
    }

    /**
     * Handle screen capture context from area selection
     */
    async handleScreenCaptureContext(contextMessage) {
        try {
            // Set the input text with the provided prompt
            const textInput = this.shadowRoot.querySelector('.text-input');
            if (textInput) {
                textInput.textContent = contextMessage.prompt;
            }

            // Make the text input visible if it's hidden
            if (!this.showTextInput) {
                this.showTextInput = true;
                await this.updateComplete;
            }

            // Send the question with the image data
            await this.handleSendText(null, contextMessage.prompt, contextMessage.imageData);

        } catch (error) {
            console.error('📸 AskView: Error handling screen capture context:', error);
        }
    }


    renderContent() {
        const responseContainer = this.shadowRoot.getElementById('responseContainer');
        if (!responseContainer) return;
    
        // Check loading state
        if (this.isLoading) {
            responseContainer.innerHTML = `
              <div class="loading-dots">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
              </div>`;
            this.resetStreamingParser();
            return;
        }
        
        // If there is no response, show empty state
        if (!this.currentResponse) {
            responseContainer.innerHTML = `<div class="empty-state">...</div>`;
            this.resetStreamingParser();
            return;
        }
        
        // Set streaming markdown parser
        this.renderStreamingMarkdown(responseContainer);

        // After updating content, recalculate window height
        this.adjustWindowHeightThrottled();
    }

    resetStreamingParser() {
        this.smdParser = null;
        this.smdContainer = null;
        this.lastProcessedLength = 0;
    }

    renderStreamingMarkdown(responseContainer) {
        try {
            // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            if (!this.smdParser || this.smdContainer !== responseContainer) {
                this.smdContainer = responseContainer;
                this.smdContainer.innerHTML = '';
                
                // smd.js[Korean comment translated] default_renderer [Korean comment translated]
                const renderer = default_renderer(this.smdContainer);
                this.smdParser = parser(renderer);
                this.lastProcessedLength = 0;
            }

            // [Korean comment translated] [Korean comment translated] Process ([Korean comment translated] [Korean comment translated])
            const currentText = this.currentResponse;
            const newText = currentText.slice(this.lastProcessedLength);
            
            if (newText.length > 0) {
                // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
                parser_write(this.smdParser, newText);
                this.lastProcessedLength = currentText.length;
            }

            // [Korean comment translated] Complete[Korean comment translated] [Korean comment translated] Shutdown
            if (!this.isStreaming && !this.isLoading) {
                parser_end(this.smdParser);
                // Add feedback buttons after streaming completes
                this.addFeedbackButtons(responseContainer);
            }

            // [Korean comment translated] [Korean comment translated] [Korean comment translated]
            if (this.hljs) {
                responseContainer.querySelectorAll('pre code').forEach(block => {
                    if (!block.hasAttribute('data-highlighted')) {
                        this.hljs.highlightElement(block);
                        block.setAttribute('data-highlighted', 'true');
                    }
                });
            }

            // [Korean comment translated] [Korean comment translated] [Korean comment translated]
            responseContainer.scrollTop = responseContainer.scrollHeight;
            
        } catch (error) {
            console.error('Error rendering streaming markdown:', error);
            // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            this.renderFallbackContent(responseContainer);
        }
    }

    renderFallbackContent(responseContainer) {
        const textToRender = this.currentResponse || '';
        
        if (this.isLibrariesLoaded && this.marked && this.DOMPurify) {
            try {
                // [Korean comment translated] [Korean comment translated]
                const parsedHtml = this.marked.parse(textToRender);

                // DOMPurify[Korean comment translated] [Korean comment translated]
                const cleanHtml = this.DOMPurify.sanitize(parsedHtml, {
                    ALLOWED_TAGS: [
                        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i',
                        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'table', 'thead',
                        'tbody', 'tr', 'th', 'td', 'hr', 'sup', 'sub', 'del', 'ins',
                    ],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
                });

                responseContainer.innerHTML = cleanHtml;

                // [Korean comment translated] [Korean comment translated] [Korean comment translated]
                if (this.hljs) {
                    responseContainer.querySelectorAll('pre code').forEach(block => {
                        this.hljs.highlightElement(block);
                    });
                }

                // Add feedback buttons after content
                this.addFeedbackButtons(responseContainer);
            } catch (error) {
                console.error('Error in fallback rendering:', error);
                responseContainer.textContent = textToRender;
            }
        } else {
            // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            const basicHtml = textToRender
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');

            responseContainer.innerHTML = `<p>${basicHtml}</p>`;
        }
    }


    requestWindowResize(targetHeight) {
        if (window.api) {
            window.api.askView.adjustWindowHeight(targetHeight);
        }
    }

    animateHeaderText(text) {
        this.headerAnimating = true;
        this.requestUpdate();

        setTimeout(() => {
            this.headerText = text;
            this.headerAnimating = false;
            this.requestUpdate();
        }, 150);
    }

    startHeaderAnimation() {
        this.animateHeaderText('analyzing screen...');

        if (this.headerAnimationTimeout) {
            clearTimeout(this.headerAnimationTimeout);
        }

        this.headerAnimationTimeout = setTimeout(() => {
            this.animateHeaderText('thinking...');
        }, 1500);
    }

    renderMarkdown(content) {
        if (!content) return '';

        if (this.isLibrariesLoaded && this.marked) {
            return this.parseMarkdown(content);
        }

        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }

    fixIncompleteMarkdown(text) {
        if (!text) return text;

        // [Korean comment translated] [Korean comment translated] Process
        const boldCount = (text.match(/\*\*/g) || []).length;
        if (boldCount % 2 === 1) {
            text += '**';
        }

        // [Korean comment translated] [Korean comment translated] Process
        const italicCount = (text.match(/(?<!\*)\*(?!\*)/g) || []).length;
        if (italicCount % 2 === 1) {
            text += '*';
        }

        // [Korean comment translated] [Korean comment translated] [Korean comment translated] Process
        const inlineCodeCount = (text.match(/`/g) || []).length;
        if (inlineCodeCount % 2 === 1) {
            text += '`';
        }

        // [Korean comment translated] [Korean comment translated] Process
        const openBrackets = (text.match(/\[/g) || []).length;
        const closeBrackets = (text.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
            text += ']';
        }

        const openParens = (text.match(/\]\(/g) || []).length;
        const closeParens = (text.match(/\)\s*$/g) || []).length;
        if (openParens > closeParens && text.endsWith('(')) {
            text += ')';
        }

        return text;
    }


    async handleCopy() {
        if (this.copyState === 'copied') return;

        let responseToCopy = this.currentResponse;

        if (this.isDOMPurifyLoaded && this.DOMPurify) {
            const testHtml = this.renderMarkdown(responseToCopy);
            const sanitized = this.DOMPurify.sanitize(testHtml);

            if (this.DOMPurify.removed && this.DOMPurify.removed.length > 0) {
                console.warn('Unsafe content detected, copy blocked');
                return;
            }
        }

        const textToCopy = `Question: ${this.currentQuestion}\n\nAnswer: ${responseToCopy}`;

        try {
            await navigator.clipboard.writeText(textToCopy);

            this.copyState = 'copied';
            this.requestUpdate();

            if (this.copyTimeout) {
                clearTimeout(this.copyTimeout);
            }

            this.copyTimeout = setTimeout(() => {
                this.copyState = 'idle';
                this.requestUpdate();
            }, 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    async handleLineCopy(lineIndex) {
        const originalLines = this.currentResponse.split('\n');
        const lineToCopy = originalLines[lineIndex];

        if (!lineToCopy) return;

        try {
            await navigator.clipboard.writeText(lineToCopy);

            // '[Korean comment translated]' Status[Korean comment translated] UI [Korean comment translated] Update
            this.lineCopyState = { ...this.lineCopyState, [lineIndex]: true };
            this.requestUpdate(); // LitElement[Korean comment translated] UI Update Request

            // [Korean comment translated] [Korean comment translated] [Korean comment translated] Initialize
            if (this.lineCopyTimeouts && this.lineCopyTimeouts[lineIndex]) {
                clearTimeout(this.lineCopyTimeouts[lineIndex]);
            }

            // ✨ [Korean comment translated] [Korean comment translated]: 1.5[Korean comment translated] [Korean comment translated] '[Korean comment translated]' Status [Korean comment translated]
            this.lineCopyTimeouts[lineIndex] = setTimeout(() => {
                const updatedState = { ...this.lineCopyState };
                delete updatedState[lineIndex];
                this.lineCopyState = updatedState;
                this.requestUpdate(); // UI Update Request
            }, 1500);
        } catch (err) {
            console.error('Failed to copy line:', err);
        }
    }

    async handleFeedback(feedbackType) {
        try {
            console.log(`[AskView] User feedback: ${feedbackType}`);
            
            // Update UI state
            this.userFeedback = feedbackType;
            this.requestUpdate();

            // Store feedback to memory system if we have a current response
            if (this.currentResponse && this.currentQuestion && window.api?.invoke) {
                try {
                    console.log(`[AskView] [START] Starting feedback submission process for: ${feedbackType}`);
                    
                    // Get current agent and user info (fallback to defaults)
                    const agentId = 'default'; // TODO: Get from current agent
                    const userId = 'guest';    // TODO: Get from current user
                    
                    // Convert feedback to satisfaction score
                    const satisfactionScore = feedbackType === 'positive' ? 0.9 : 
                                            feedbackType === 'negative' ? 0.1 : null;
                    
                    // Use IPC to store feedback in Episodic Memory
                    const feedbackData = {
                        agentId: agentId,
                        userId: userId,
                        content: {
                            type: 'user_feedback',
                            question: this.currentQuestion,
                            response: this.currentResponse.substring(0, 500) + '...', // Truncated for storage
                            feedback: feedbackType,
                            satisfaction_score: satisfactionScore
                        },
                        context: {
                            userFeedback: satisfactionScore,
                            feedbackType: feedbackType,
                            sessionId: 'feedback_session'
                        },
                        importance: 0.7 // Medium importance for feedback
                    };

                    console.log(`[AskView] 📤 Sending feedback data via IPC:`, feedbackData);
                    console.log(`[AskView] [LINK] window.api.invoke available:`, typeof window.api?.invoke);

                    // Invoke via IPC (returns a promise)
                    const result = await window.api.invoke('memory:store-episodic', feedbackData);
                    console.log(`[AskView] [OK] Feedback stored in memory system: ${feedbackType} (satisfaction: ${satisfactionScore})`, result);

                    // Hide feedback buttons after successful submission
                    setTimeout(() => {
                        this.hideFeedbackButtons();
                    }, 1000); // Show the selection for 1 second, then hide

                } catch (error) {
                    console.error('[AskView] [ERROR] Failed to send feedback to memory system:', error);
                    console.error('[AskView] [ERROR] Error details:', {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    });
                }
            } else {
                console.log(`[AskView] [WARNING] Skipping backend storage - Missing requirements:`, {
                    hasResponse: !!this.currentResponse,
                    hasQuestion: !!this.currentQuestion,
                    hasApiInvoke: !!(window.api?.invoke)
                });
                // Even without backend, hide buttons after feedback
                setTimeout(() => {
                    this.hideFeedbackButtons();
                }, 1000);
            }
        } catch (error) {
            console.error('[AskView] Failed to handle feedback:', error);
        }
    }

    addFeedbackButtons(responseContainer) {
        // Check if feedback buttons already exist
        if (responseContainer.querySelector('.feedback-buttons-inline')) {
            return;
        }

        // Only show if we have a complete response and user hasn't given feedback yet
        if (!this.currentResponse || this.isStreaming || this.isLoading || this.userFeedback) {
            return;
        }

        // Create feedback container
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'feedback-buttons-inline';
        feedbackDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; margin-top: 12px;">
                <span style="font-size: 12px; color: var(--text-secondary, #9ca3af); font-weight: 400;">Was this helpful?</span>
                <div style="display: flex; gap: 4px;">
                    <button class="feedback-btn-inline thumbs-up" style="
                        display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
                        border: none; background: transparent; border-radius: 50%; cursor: pointer;
                        transition: all 0.2s ease; color: var(--text-secondary, #9ca3af); padding: 0;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7 10v12H4a2 2 0 01-2-2V10a2 2 0 012-2h3zm0 0l6-6c.7-.7 1.5-1 2.5-1 1.1 0 2 .9 2 2v4h6c1.1 0 2 .9 2 2l-1 8c-.2 1-.9 2-2 2H7V10z"/>
                        </svg>
                    </button>
                    <button class="feedback-btn-inline thumbs-down" style="
                        display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
                        border: none; background: transparent; border-radius: 50%; cursor: pointer;
                        transition: all 0.2s ease; color: var(--text-secondary, #9ca3af); padding: 0;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7 14V2H4a2 2 0 00-2 2v10a2 2 0 002 2h3zm0 0l6 6c.7.7 1.5 1 2.5 1 1.1 0 2-.9 2-2v-4h6c1.1 0 2-.9 2-2l-1-8c-.2-1-.9-2-2-2H7v10z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <style>
                .feedback-btn-inline:hover {
                    background: #f3f4f6 !important;
                    color: #4b5563 !important;
                    transform: scale(1.1);
                }
                .feedback-btn-inline:active {
                    transform: scale(0.95);
                    background: #e5e7eb !important;
                }
                .thumbs-up:hover {
                    color: #10b981 !important;
                    background: #ecfdf5 !important;
                }
                .thumbs-down:hover {
                    color: #ef4444 !important;
                    background: #fef2f2 !important;
                }
            </style>
        `;

        // Add event listeners
        const thumbsUpBtn = feedbackDiv.querySelector('.thumbs-up');
        const thumbsDownBtn = feedbackDiv.querySelector('.thumbs-down');

        thumbsUpBtn.addEventListener('click', () => this.handleFeedback('positive'));
        thumbsDownBtn.addEventListener('click', () => this.handleFeedback('negative'));

        // Add hover effects
        [thumbsUpBtn, thumbsDownBtn].forEach(btn => {
            btn.addEventListener('mouseenter', function() {
                this.style.background = '#f3f4f6';
                this.style.borderColor = '#d1d5db';
                this.style.transform = 'translateY(-1px)';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = '#ffffff';
                this.style.borderColor = '#e5e7eb';
                this.style.transform = 'translateY(0)';
            });
        });

        // Append to response container
        responseContainer.appendChild(feedbackDiv);
    }

    hideFeedbackButtons() {
        // Hide inline feedback buttons (in response container)
        const responseContainer = this.shadowRoot?.querySelector('#responseContainer');
        if (responseContainer) {
            const inlineButtons = responseContainer.querySelectorAll('.feedback-buttons-inline');
            inlineButtons.forEach(btn => btn.remove());
        }
    }

    async handleSendText(e, overridingText = '', imageData = null) {
        const textInput = this.shadowRoot?.getElementById('textInput');
        const text = (overridingText || textInput?.value || '').trim();
        // if (!text) return;

        if (textInput) {
            textInput.value = '';
        }

        if (window.api) {
            // If image data is provided, send it along with the text
            if (imageData) {
                // Create a message with both text and image
                const messageWithImage = {
                    text: text,
                    image: imageData,
                    type: 'text-with-image'
                };
                window.api.askView.sendMessage(JSON.stringify(messageWithImage)).catch(error => {
                    console.error('Error sending text with image:', error);
                });
            } else {
                // Send text only (original behavior)
                window.api.askView.sendMessage(text).catch(error => {
                    console.error('Error sending text:', error);
                });
            }
        }
    }

    handleTextKeydown(e) {
        // Fix for IME composition issue: Ignore Enter key presses while composing.
        if (e.isComposing) {
            return;
        }

        const isPlainEnter = e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey;
        const isModifierEnter = e.key === 'Enter' && (e.metaKey || e.ctrlKey);

        if (isPlainEnter || isModifierEnter) {
            e.preventDefault();
            this.handleSendText();
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);
    
        // ✨ isLoading [Korean comment translated] currentResponse[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated].
        if (changedProperties.has('isLoading') || changedProperties.has('currentResponse')) {
            this.renderContent();
        }
    
        if (changedProperties.has('showTextInput') || changedProperties.has('isLoading') || changedProperties.has('currentResponse')) {
            this.adjustWindowHeightThrottled();
        }
    
        if (changedProperties.has('showTextInput') && this.showTextInput) {
            this.focusTextInput();
        }
    }

    firstUpdated() {
        setTimeout(() => {
            this.adjustWindowHeight();
        }, 200);
    }


    getTruncatedQuestion(question, maxLength = 30) {
        if (!question) return '';
        if (question.length <= maxLength) return question;
        return question.substring(0, maxLength) + '...';
    }



    render() {
        
        const hasResponse = this.isLoading || this.currentResponse || this.isStreaming;
        const headerText = this.isLoading ? 'Thinking...' : 'AI Response';

        return html`
            <div class="ask-container">
                <!-- Response Header -->
                <div class="response-header ${!hasResponse ? 'hidden' : ''}">
                    <div class="header-left">
                        <div class="response-icon">
                            <img src="../assets/xerus.svg" width="32" height="32" alt="Xerus" />
                        </div>
                        <span class="response-label">${headerText}</span>
                    </div>
                    <div class="header-right">
                        <span class="question-text">${this.getTruncatedQuestion(this.currentQuestion)}</span>
                        <div class="header-controls">
                            <button class="copy-button ${this.copyState === 'copied' ? 'copied' : ''}" @click=${this.handleCopy}>
                                <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                                <svg
                                    class="check-icon"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.5"
                                >
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            </button>
                            <button class="close-button" @click=${this.handleCloseAskWindow}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Response Container -->
                <div class="response-container ${!hasResponse ? 'hidden' : ''}" id="responseContainer">
                    <!-- Content is dynamically generated in updateResponseContent() -->
                </div>


                <!-- Text Input Container -->
                <div class="text-input-container ${!hasResponse ? 'no-response' : ''} ${!this.showTextInput ? 'hidden' : ''}">
                    <input
                        type="text"
                        id="textInput"
                        placeholder="Ask your AI assistant anything..."
                        @keydown=${this.handleTextKeydown}
                        @focus=${this.handleInputFocus}
                    />
                    <button
                        class="submit-btn"
                        @click=${this.handleSendText}
                    >
                        <span class="btn-label">Submit</span>
                        <span class="btn-icon">
                            ↵
                        </span>
                    </button>
                </div>
                
            </div>
        `;
    }

    // Dynamically resize the BrowserWindow to fit current content
    adjustWindowHeight() {
        if (!window.api) {
            return;
        }

        this.updateComplete.then(() => {
            const headerEl = this.shadowRoot.querySelector('.response-header');
            const responseEl = this.shadowRoot.querySelector('.response-container');
            const inputEl = this.shadowRoot.querySelector('.text-input-container');

            if (!headerEl || !responseEl) return;

            const headerHeight = headerEl.classList.contains('hidden') ? 0 : headerEl.offsetHeight;
            const responseHeight = responseEl.scrollHeight;
            const inputHeight = (inputEl && !inputEl.classList.contains('hidden')) ? inputEl.offsetHeight : 0;

            // Add extra padding to prevent cropping
            const padding = 20;
            const idealHeight = headerHeight + responseHeight + inputHeight + padding;
            const targetHeight = Math.min(700, idealHeight);

            window.api.askView.adjustWindowHeight(targetHeight);

        }).catch(err => console.error('AskView adjustWindowHeight error:', err));
    }

    // Throttled wrapper to avoid excessive IPC spam (executes at most once per animation frame)
    adjustWindowHeightThrottled() {
        if (this.isThrottled) return;

        this.isThrottled = true;
        requestAnimationFrame(() => {
            this.adjustWindowHeight();
            this.isThrottled = false;
        });
    }
    
}

customElements.define('ask-view', AskView);
