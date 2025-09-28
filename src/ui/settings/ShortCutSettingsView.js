import { html, css, LitElement } from '../../ui/assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../mixins/ThemeMixin.js';

const commonSystemShortcuts = new Set([
    'Cmd+Q', 'Cmd+W', 'Cmd+A', 'Cmd+S', 'Cmd+Z', 'Cmd+X', 'Cmd+C', 'Cmd+V', 'Cmd+P', 'Cmd+F', 'Cmd+G', 'Cmd+H', 'Cmd+M', 'Cmd+N', 'Cmd+O', 'Cmd+T',
    'Ctrl+Q', 'Ctrl+W', 'Ctrl+A', 'Ctrl+S', 'Ctrl+Z', 'Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+P', 'Ctrl+F', 'Ctrl+G', 'Ctrl+H', 'Ctrl+M', 'Ctrl+N', 'Ctrl+O', 'Ctrl+T'
]);

const displayNameMap = {
    nextStep: 'Ask Anything',
    moveUp: 'Move Up Window',
    moveDown: 'Move Down Window',
    scrollUp: 'Scroll Up Response',
    scrollDown: 'Scroll Down Response',
  };

export class ShortcutSettingsView extends ThemeMixin(LitElement) {
    static styles = css`
        * { font-family:'Helvetica Neue',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            cursor:default; user-select:none; box-sizing:border-box; }

        :host { display:flex; width:100%; height:100%; color:var(--text-primary, #1f2937); }

        .container { display:flex; flex-direction:column; height:100%;
            background:var(--surface-elevated, #ffffff); border-radius:12px;
            border: 1px solid var(--border-light, #e5e7eb);
            box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
            position:relative; overflow:hidden; padding:12px; }

        .close-button{position:absolute;top:10px;right:10px;inline-size:14px;block-size:14px;
            background:var(--background-secondary, #f8f9fa);border:none;border-radius:3px;
            color:var(--text-secondary, #6b7280);display:grid;place-items:center;
            font-size:14px;line-height:0;cursor:pointer;transition:.15s;z-index:10;}
        .close-button:hover{background:var(--background-tertiary, #f1f3f4);color:var(--text-primary, #1f2937);}

        .title{font-size:14px;font-weight:500;margin:0 0 8px;padding-bottom:8px;
            border-bottom:1px solid var(--border-light, #e5e7eb);text-align:center;}

        .scroll-area{flex:1 1 auto;overflow-y:auto;margin:0 -4px;padding:4px;}

        .shortcut-entry{display:flex;align-items:center;width:100%;gap:8px;
            margin-bottom:8px;font-size:12px;padding:4px;}
        .shortcut-name{flex:1 1 auto;color:var(--text-primary, #1f2937);font-weight:400;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        .action-btn{background:none;border:none;color:var(--interactive-primary, #2563eb);
            font-size:11px;padding:0 4px;cursor:pointer;transition:.15s;}
        .action-btn:hover{color:var(--interactive-primary-hover, #1d4ed8);text-decoration:underline;}

        .shortcut-input{inline-size:120px;background:var(--background-secondary, #f8f9fa);
            border:1px solid var(--border-medium, #d1d5db);border-radius:4px;
            padding:4px 6px;font:11px 'SF Mono','Menlo',monospace;
            color:var(--text-primary, #1f2937);text-align:right;cursor:text;margin-left:auto;}
        .shortcut-input:focus,.shortcut-input.capturing{
            outline:none;border-color:var(--interactive-primary, #2563eb);
            box-shadow:0 0 0 1px var(--interactive-primary-light, #dbeafe);}

        .feedback{font-size:10px;margin-top:2px;min-height:12px;}
        .feedback.error{color:#ef4444;}
        .feedback.success{color:#22c55e;}

        .actions{display:flex;gap:4px;padding-top:8px;border-top:1px solid var(--border-light, #e5e7eb);}
        .settings-button{flex:1;background:var(--background-secondary, #f8f9fa);
            border:1px solid var(--border-medium, #d1d5db);border-radius:4px;
            color:var(--text-primary, #1f2937);padding:5px 10px;font-size:11px;cursor:pointer;transition:.15s;}
        .settings-button:hover{background:var(--background-tertiary, #f1f3f4);}
        .settings-button.primary{background:var(--interactive-primary, #2563eb);border-color:var(--interactive-primary, #2563eb);color:white;}
        .settings-button.primary:hover{background:var(--interactive-primary-hover, #1d4ed8);}
        .settings-button.danger{background:var(--danger-light, #fee2e2);border-color:var(--danger, #dc2626);
            color:var(--danger, #dc2626);}
        .settings-button.danger:hover{background:var(--danger-lighter, #fef2f2);
        }

    `;

    static properties = {
        shortcuts: { type: Object, state: true },
        isLoading: { type: Boolean, state: true },
        capturingKey: { type: String, state: true },
        feedback:   { type:Object, state:true }
    };

    constructor() {
        super();
        this.shortcuts = {};
        this.feedback = {};
        this.isLoading = true;
        this.capturingKey = null;
    }

    connectedCallback() {
        super.connectedCallback();
        if (!window.api) return;
        this.loadShortcutsHandler = (event, keybinds) => {
            this.shortcuts = keybinds;
            this.isLoading = false;
        };
        window.api.shortcutSettingsView.onLoadShortcuts(this.loadShortcutsHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api && this.loadShortcutsHandler) {
            window.api.shortcutSettingsView.removeOnLoadShortcuts(this.loadShortcutsHandler);
        }
    }

    handleKeydown(e, shortcutKey){
        e.preventDefault(); e.stopPropagation();
        const result = this._parseAccelerator(e);
        if(!result) return;          // modifier[Korean comment translated] [Korean comment translated] Status
    
        const {accel, error} = result;
        if(error){
          this.feedback = {...this.feedback, [shortcutKey]:{type:'error',msg:error}};
          return;
        }
        // Success
        this.shortcuts = {...this.shortcuts, [shortcutKey]:accel};
        this.feedback = {...this.feedback, [shortcutKey]:{type:'success',msg:'Shortcut set'}};
        this.stopCapture();
      }
    
      _parseAccelerator(e){
        /* returns {accel?, error?} */
        const parts=[]; if(e.metaKey) parts.push('Cmd');
        if(e.ctrlKey) parts.push('Ctrl');
        if(e.altKey) parts.push('Alt');
        if(e.shiftKey) parts.push('Shift');
    
        const isModifier=['Meta','Control','Alt','Shift'].includes(e.key);
        if(isModifier) return null;
    
        const map={ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',' ':'Space'};
        parts.push(e.key.length===1? e.key.toUpperCase() : (map[e.key]||e.key));
        const accel=parts.join('+');
    
        /* ---- validation ---- */
        if(parts.length===1)   return {error:'Invalid shortcut: needs a modifier'};
        if(parts.length>4)     return {error:'Invalid shortcut: max 4 keys'};
        if(commonSystemShortcuts.has(accel)) return {error:'Invalid shortcut: system reserved'};
        return {accel};
      }

    startCapture(key){ this.capturingKey = key; this.feedback = {...this.feedback, [key]:undefined}; }

    disableShortcut(key){
        this.shortcuts = {...this.shortcuts, [key]:''};         // [Korean comment translated] => [Korean comment translated] X
        this.feedback   = {...this.feedback, [key]:{type:'success',msg:'Shortcut disabled'}};
      }

    stopCapture() {
        this.capturingKey = null;
    }

    async handleSave() {
        if (!window.api) return;
        this.feedback = {};
        const result = await window.api.shortcutSettingsView.saveShortcuts(this.shortcuts);
        if (!result.success) {
            alert('Failed to save shortcuts: ' + result.error);
        }
    }

    handleClose() {
        if (!window.api) return;
        this.feedback = {};
        window.api.shortcutSettingsView.closeShortcutSettingsWindow();
    }

    async handleResetToDefault() {
        if (!window.api) return;
        const confirmation = confirm("Are you sure you want to reset all shortcuts to their default values?");
        if (!confirmation) return;
    
        try {
            const defaultShortcuts = await window.api.shortcutSettingsView.getDefaultShortcuts();
            this.shortcuts = defaultShortcuts;
        } catch (error) {
            alert('Failed to load default settings.');
        }
    }

    formatShortcutName(name) {
        if (displayNameMap[name]) {
            return displayNameMap[name];
        }
        const result = name.replace(/([A-Z])/g, " $1");
        return result.charAt(0).toUpperCase() + result.slice(1);
    }

    render(){
        if(this.isLoading){
          return html`<div class="container"><div class="loading-state">Loading Shortcuts...</div></div>`;
        }
        return html`
          <div class="container">
            <button class="close-button" @click=${this.handleClose} title="Close">&times;</button>
            <h1 class="title">Edit Shortcuts</h1>
    
            <div class="scroll-area">
              ${Object.keys(this.shortcuts).map(key=>html`
                <div>
                  <div class="shortcut-entry">
                    <span class="shortcut-name">${this.formatShortcutName(key)}</span>
    
                    <!-- Edit & Disable [KR] -->
                    <button class="action-btn" @click=${()=>this.startCapture(key)}>Edit</button>
                    <button class="action-btn" @click=${()=>this.disableShortcut(key)}>Disable</button>
    
                    <input readonly
                      class="shortcut-input ${this.capturingKey===key?'capturing':''}"
                      .value=${this.shortcuts[key]||''}
                      placeholder=${this.capturingKey===key?'Press new shortcut…':'Click to edit'}
                      @click=${()=>this.startCapture(key)}
                      @keydown=${e=>this.handleKeydown(e,key)}
                      @blur=${()=>this.stopCapture()}
                    />
                  </div>
    
                  ${this.feedback[key] ? html`
                    <div class="feedback ${this.feedback[key].type}">
                      ${this.feedback[key].msg}
                    </div>` : html`<div class="feedback"></div>`
                  }
                </div>
              `)}
            </div>
    
            <div class="actions">
              <button class="settings-button" @click=${this.handleClose}>Cancel</button>
              <button class="settings-button danger" @click=${this.handleResetToDefault}>Reset to Default</button>
              <button class="settings-button primary" @click=${this.handleSave}>Save</button>
            </div>
          </div>
        `;
      }
    }

customElements.define('shortcut-settings-view', ShortcutSettingsView);