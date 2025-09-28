import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../../mixins/ThemeMixin.js';

export class SummaryView extends ThemeMixin(LitElement) {
    static styles = css`
        :host {
            display: block;
            width: 100%;
        }

        /* Inherit font styles from parent */

        /* highlight.js [Korean comment translated] [Korean comment translated] */
        .insights-container pre {
            background: var(--background-secondary, #f8f9fa) !important;
            border-radius: 8px !important;
            padding: 12px !important;
            margin: 8px 0 !important;
            overflow-x: auto !important;
            border: 1px solid var(--border-light, #e5e7eb) !important;
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05)) !important;
        }

        .insights-container code {
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
            font-size: 12px !important;
            background: transparent !important;
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
            color: var(--text-primary, #1f2937) !important;
        }

        .insights-container pre code {
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
            display: block !important;
        }

        .insights-container p code {
            background: var(--background-tertiary, #f1f3f4) !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            color: var(--interactive-primary, #2563eb) !important;
            border: 1px solid var(--border-light, #e5e7eb) !important;
        }

        /* Light theme syntax highlighting */
        .hljs-keyword {
            color: #7c3aed !important;
        }
        .hljs-string {
            color: #059669 !important;
        }
        .hljs-comment {
            color: #6b7280 !important;
        }
        .hljs-number {
            color: #dc2626 !important;
        }
        .hljs-function {
            color: #2563eb !important;
        }
        .hljs-variable {
            color: #0891b2 !important;
        }
        .hljs-built_in {
            color: #ea580c !important;
        }
        .hljs-title {
            color: #2563eb !important;
        }
        .hljs-attr {
            color: #2563eb !important;
        }
        .hljs-tag {
            color: #7c3aed !important;
        }

        .insights-container {
            overflow-y: auto;
            padding: 16px 20px 20px 20px;
            position: relative;
            z-index: 1;
            min-height: 150px;
            max-height: 600px;
            flex: 1;
            background: var(--surface-elevated, #ffffff);
            border-radius: 12px;
            border: 1px solid var(--border-light, #e5e7eb);
            box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
            opacity: var(--window-opacity, 1.0);
        }

        /* Visibility handled by parent component */

        .insights-container::-webkit-scrollbar {
            width: 6px;
        }
        .insights-container::-webkit-scrollbar-track {
            background: var(--background-secondary, #f8f9fa);
            border-radius: 3px;
        }
        .insights-container::-webkit-scrollbar-thumb {
            background: var(--border-medium, #d1d5db);
            border-radius: 3px;
        }
        .insights-container::-webkit-scrollbar-thumb:hover {
            background: var(--border-strong, #9ca3af);
        }

        insights-title {
            color: var(--text-primary, #1f2937);
            font-size: 16px;
            font-weight: 600;
            font-family: 'Helvetica Neue', sans-serif;
            margin: 16px 0 12px 0;
            display: block;
            border-bottom: 2px solid var(--interactive-primary, #2563eb);
            padding-bottom: 4px;
        }

        .insights-container h4 {
            color: var(--text-primary, #1f2937);
            font-size: 14px;
            font-weight: 600;
            margin: 16px 0 10px 0;
            padding: 6px 12px;
            border-radius: 6px;
            background: var(--background-secondary, #f8f9fa);
            cursor: default;
            border-left: 3px solid var(--interactive-primary, #2563eb);
        }

        .insights-container h4:hover {
            background: var(--background-tertiary, #f1f3f4);
        }

        .insights-container h4:first-child {
            margin-top: 0;
        }

        .outline-item {
            color: var(--text-primary, #1f2937);
            font-size: 13px;
            line-height: 1.5;
            margin: 6px 0;
            padding: 8px 12px;
            border-radius: 6px;
            background: var(--background-secondary, #f8f9fa);
            transition: all 0.15s ease;
            cursor: pointer;
            word-wrap: break-word;
            border: 1px solid var(--border-light, #e5e7eb);
        }

        .outline-item:hover {
            background: var(--background-tertiary, #f1f3f4);
            border-color: var(--border-medium, #d1d5db);
            transform: translateX(2px);
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }

        .request-item {
            color: var(--text-primary, #1f2937);
            font-size: 13px;
            line-height: 1.4;
            margin: 6px 0;
            padding: 8px 12px;
            border-radius: 6px;
            background: var(--background-secondary, #f8f9fa);
            cursor: default;
            word-wrap: break-word;
            transition: all 0.15s ease;
            border: 1px solid var(--border-light, #e5e7eb);
        }

        .request-item.clickable {
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .request-item.clickable:hover {
            background: var(--background-tertiary, #f1f3f4);
            border-color: var(--border-medium, #d1d5db);
            transform: translateX(2px);
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }

        /* [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] */
        .markdown-content {
            color: var(--text-primary, #1f2937);
            font-size: 13px;
            line-height: 1.6;
            margin: 6px 0;
            padding: 10px 14px;
            border-radius: 8px;
            background: var(--background-secondary, #f8f9fa);
            cursor: pointer;
            word-wrap: break-word;
            transition: all 0.15s ease;
            border: 1px solid var(--border-light, #e5e7eb);
        }

        .markdown-content:hover {
            background: var(--background-tertiary, #f1f3f4);
            border-color: var(--interactive-primary, #2563eb);
            transform: translateX(3px);
            box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }

        .markdown-content p {
            margin: 6px 0;
            color: var(--text-primary, #1f2937);
        }

        .markdown-content ul,
        .markdown-content ol {
            margin: 8px 0;
            padding-left: 20px;
        }

        .markdown-content li {
            margin: 4px 0;
            color: var(--text-primary, #1f2937);
        }

        .markdown-content a {
            color: var(--interactive-primary, #2563eb);
            text-decoration: none;
            font-weight: 500;
        }

        .markdown-content a:hover {
            text-decoration: underline;
            color: var(--interactive-primary-hover, #1d4ed8);
        }

        .markdown-content strong {
            font-weight: 600;
            color: var(--text-primary, #1f2937);
        }

        .markdown-content em {
            font-style: italic;
            color: var(--text-secondary, #6b7280);
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
        structuredData: { type: Object },
        isVisible: { type: Boolean },
        hasCompletedRecording: { type: Boolean },
        windowOpacity: { type: Number },
    };

    constructor() {
        super();
        this.structuredData = {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
            followUps: [],
        };
        this.isVisible = true;
        this.hasCompletedRecording = false;
        this.windowOpacity = 1.0;

        // [Korean comment translated] [Korean comment translated] Initialize
        this.marked = null;
        this.hljs = null;
        this.isLibrariesLoaded = false;
        this.DOMPurify = null;
        this.isDOMPurifyLoaded = false;

        this.loadLibraries();
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api) {
            window.api.summaryView.onSummaryUpdate((event, data) => {
                this.structuredData = data;
                this.requestUpdate();
            });

            // Listen for opacity changes
            window.api.on('window-opacity-changed', (event, opacity) => {
                this.windowOpacity = opacity;
                this.updateOpacityStyle();
            });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api) {
            window.api.summaryView.removeAllSummaryUpdateListeners();
        }
    }

    // Handle session reset from parent
    resetAnalysis() {
        this.structuredData = {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
            followUps: [],
        };
        this.requestUpdate();
    }

    updateOpacityStyle() {
        this.style.setProperty('--window-opacity', this.windowOpacity);
        this.requestUpdate();
    }

    async loadLibraries() {
        try {
            if (!window.marked) {
                await this.loadScript('../../assets/marked-4.3.0.min.js');
            }

            if (!window.hljs) {
                await this.loadScript('../../ui/assets/highlight-11.9.0.min.js');
            }

            if (!window.DOMPurify) {
                await this.loadScript('../../ui/assets/dompurify-3.0.7.min.js');
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
                console.log('Markdown libraries loaded successfully');
            }

            if (this.DOMPurify) {
                this.isDOMPurifyLoaded = true;
                console.log('DOMPurify loaded successfully in SummaryView');
            }
        } catch (error) {
            console.error('Failed to load libraries:', error);
        }
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
            console.error('Markdown parsing error:', error);
            return text;
        }
    }

    handleMarkdownClick(originalText) {
        this.handleRequestClick(originalText);
    }

    renderMarkdownContent() {
        if (!this.isLibrariesLoaded || !this.marked) {
            return;
        }

        const markdownElements = this.shadowRoot.querySelectorAll('[data-markdown-id]');
        markdownElements.forEach(element => {
            const originalText = element.getAttribute('data-original-text');
            if (originalText) {
                try {
                    let parsedHTML = this.parseMarkdown(originalText);

                    if (this.isDOMPurifyLoaded && this.DOMPurify) {
                        parsedHTML = this.DOMPurify.sanitize(parsedHTML);

                        if (this.DOMPurify.removed && this.DOMPurify.removed.length > 0) {
                            console.warn('Unsafe content detected in insights, showing plain text');
                            element.textContent = '[WARNING] ' + originalText;
                            return;
                        }
                    }

                    element.innerHTML = parsedHTML;
                } catch (error) {
                    console.error('Error rendering markdown for element:', error);
                    element.textContent = originalText;
                }
            }
        });
    }

    async handleRequestClick(requestText) {
        console.log('[FIRE] Analysis request clicked:', requestText);

        if (window.api) {
            try {
                const result = await window.api.summaryView.sendQuestionFromSummary(requestText);

                if (result.success) {
                    console.log('[OK] Question sent to AskView successfully');
                } else {
                    console.error('[ERROR] Failed to send question to AskView:', result.error);
                }
            } catch (error) {
                console.error('[ERROR] Error in handleRequestClick:', error);
            }
        }
    }

    getSummaryText() {
        const data = this.structuredData || { summary: [], topic: { header: '', bullets: [] }, actions: [] };
        let sections = [];

        if (data.summary && data.summary.length > 0) {
            sections.push(`Current Summary:\n${data.summary.map(s => `• ${s}`).join('\n')}`);
        }

        if (data.topic && data.topic.header && data.topic.bullets.length > 0) {
            sections.push(`\n${data.topic.header}:\n${data.topic.bullets.map(b => `• ${b}`).join('\n')}`);
        }

        if (data.actions && data.actions.length > 0) {
            sections.push(`\nActions:\n${data.actions.map(a => `▸ ${a}`).join('\n')}`);
        }

        if (data.followUps && data.followUps.length > 0) {
            sections.push(`\nFollow-Ups:\n${data.followUps.map(f => `▸ ${f}`).join('\n')}`);
        }

        return sections.join('\n\n').trim();
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        this.renderMarkdownContent();
    }

    render() {
        if (!this.isVisible) {
            return html`<div style="display: none;"></div>`;
        }

        const data = this.structuredData || {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
        };

        const hasAnyContent = data.summary.length > 0 || data.topic.bullets.length > 0 || data.actions.length > 0;

        return html`
            <div class="insights-container">
                ${!hasAnyContent
                    ? html`<div class="empty-state">No insights yet...</div>`
                    : html`
                        <insights-title>Current Summary</insights-title>
                        ${data.summary.length > 0
                            ? data.summary
                                  .slice(0, 5)
                                  .map(
                                      (bullet, index) => html`
                                          <div
                                              class="markdown-content"
                                              data-markdown-id="summary-${index}"
                                              data-original-text="${bullet}"
                                              @click=${() => this.handleMarkdownClick(bullet)}
                                          >
                                              ${bullet}
                                          </div>
                                      `
                                  )
                            : html` <div class="request-item">No content yet...</div> `}
                        ${data.topic.header
                            ? html`
                                  <insights-title>${data.topic.header}</insights-title>
                                  ${data.topic.bullets
                                      .slice(0, 3)
                                      .map(
                                          (bullet, index) => html`
                                              <div
                                                  class="markdown-content"
                                                  data-markdown-id="topic-${index}"
                                                  data-original-text="${bullet}"
                                                  @click=${() => this.handleMarkdownClick(bullet)}
                                              >
                                                  ${bullet}
                                              </div>
                                          `
                                      )}
                              `
                            : ''}
                        ${data.actions.length > 0
                            ? html`
                                  <insights-title>Actions</insights-title>
                                  ${data.actions
                                      .slice(0, 5)
                                      .map(
                                          (action, index) => html`
                                              <div
                                                  class="markdown-content"
                                                  data-markdown-id="action-${index}"
                                                  data-original-text="${action}"
                                                  @click=${() => this.handleMarkdownClick(action)}
                                              >
                                                  ${action}
                                              </div>
                                          `
                                      )}
                              `
                            : ''}
                        ${this.hasCompletedRecording && data.followUps && data.followUps.length > 0
                            ? html`
                                  <insights-title>Follow-Ups</insights-title>
                                  ${data.followUps.map(
                                      (followUp, index) => html`
                                          <div
                                              class="markdown-content"
                                              data-markdown-id="followup-${index}"
                                              data-original-text="${followUp}"
                                              @click=${() => this.handleMarkdownClick(followUp)}
                                          >
                                              ${followUp}
                                          </div>
                                      `
                                  )}
                              `
                            : ''}
                    `}
            </div>
        `;
    }
}

customElements.define('summary-view', SummaryView); 