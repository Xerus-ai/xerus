import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { ThemeMixin } from '../mixins/ThemeMixin.js';
// import { getOllamaProgressTracker } from '../../features/common/services/localProgressTracker.js'; // [Korean comment translated]

export class SettingsView extends ThemeMixin(LitElement) {
    static styles = css`
        * {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            cursor: default;
            user-select: none;
        }

        :host {
            display: block;
            width: 100%;
            height: 100%;
            color: var(--text-primary, #1f2937);
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
        }

        /* Dark mode CSS variables */
        html.dark {
            --background-primary: #1f2937;
            --background-secondary: #374151;
            --background-tertiary: #4b5563;
            --surface-elevated: #374151;
            --text-primary: #f9fafb;
            --text-secondary: #d1d5db;
            --text-tertiary: #9ca3af;
            --border-light: #4b5563;
            --border-medium: #6b7280;
            --border-strong: #9ca3af;
            --interactive-primary: #3b82f6;
            --interactive-primary-hover: #2563eb;
            --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
        }

        /* Light mode CSS variables (defaults) */
        html.light {
            --background-primary: #ffffff;
            --background-secondary: #f8f9fa;
            --background-tertiary: #f1f3f4;
            --surface-elevated: #ffffff;
            --text-primary: #1f2937;
            --text-secondary: #6b7280;
            --text-tertiary: #9ca3af;
            --border-light: #e5e7eb;
            --border-medium: #d1d5db;
            --border-strong: #9ca3af;
            --interactive-primary: #2563eb;
            --interactive-primary-hover: #1d4ed8;
            --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .settings-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            background: var(--surface-elevated, #ffffff);
            border-radius: 12px;
            outline: none;
            box-sizing: border-box;
            position: relative;
            overflow-y: auto;
            padding: 16px;
            z-index: 1;
            border: 1px solid var(--border-light, #e5e7eb);
            box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
        }

        .settings-container::-webkit-scrollbar {
            width: 6px;
        }

        .settings-container::-webkit-scrollbar-track {
            background: var(--background-secondary, #f8f9fa);
            border-radius: 3px;
        }

        .settings-container::-webkit-scrollbar-thumb {
            background: var(--border-medium, #d1d5db);
            border-radius: 3px;
        }

        .settings-container::-webkit-scrollbar-thumb:hover {
            background: var(--border-strong, #9ca3af);
        }

        .opacity-button:hover {
            background: var(--background-tertiary, #f1f3f4) !important;
            border-color: var(--border-strong, #9ca3af) !important;
        }

        .opacity-button:active {
            transform: scale(0.95);
        }

            
        .settings-button[disabled],
        .api-key-section input[disabled] {
            opacity: 0.4;
            cursor: not-allowed;
            pointer-events: none;
        }

        .header-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--border-light, #e5e7eb);
            position: relative;
            z-index: 1;
        }

        .title-line {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .app-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary, #1f2937);
            margin: 0 0 4px 0;
        }

        .account-info {
            font-size: 12px;
            color: var(--text-secondary, #6b7280);
            margin: 0;
        }

        .invisibility-icon {
            padding-top: 2px;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .invisibility-icon.visible {
            opacity: 1;
        }

        .invisibility-icon svg {
            width: 16px;
            height: 16px;
        }

        /* Ensure text colors work in both light and dark modes */
        :host-context(html.light) .invisibility-icon svg path {
            fill: #1f2937 !important;
        }

        :host-context(html.dark) .invisibility-icon svg path {
            fill: #f9fafb !important;
        }

        .shortcuts-section {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 4px 0;
            position: relative;
            z-index: 1;
        }

        .shortcut-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            color: var(--text-primary, #1f2937);
            font-size: 11px;
        }

        .shortcut-name {
            font-weight: 300;
        }

        .shortcut-keys {
            display: flex;
            align-items: center;
            gap: 3px;
        }

        .cmd-key, .shortcut-key {
            background: var(--background-tertiary, #f1f3f4);
            border: 1px solid var(--border-light, #e5e7eb);
            border-radius: 3px;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 500;
            color: var(--text-secondary, #6b7280);
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }

        /* Buttons Section */
        .buttons-section {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding-top: 6px;
            border-top: 1px solid var(--border-light, #e5e7eb);
            position: relative;
            z-index: 1;
            flex: 1;
        }

        .settings-button {
            background: var(--background-secondary, #f8f9fa);
            border: 1px solid var(--border-light, #e5e7eb);
            border-radius: 6px;
            color: var(--text-primary, #1f2937);
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            box-shadow: var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
        }

        .settings-button:hover {
            background: var(--background-tertiary, #f1f3f4);
            border-color: var(--border-medium, #d1d5db);
            box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
        }

        .settings-button:active {
            transform: translateY(1px);
        }

        .settings-button.full-width {
            width: 100%;
        }

        .settings-button.half-width {
            flex: 1;
        }

        .settings-button.danger {
            background: rgba(239, 68, 68, 0.1);
            border-color: rgba(239, 68, 68, 0.3);
            color: #dc2626;
        }

        .settings-button.danger:hover {
            background: rgba(239, 68, 68, 0.15);
            border-color: rgba(239, 68, 68, 0.4);
            color: #b91c1c;
        }

        .move-buttons, .bottom-buttons {
            display: flex;
            gap: 4px;
        }

        .api-key-section {
            padding: 6px 0;
            border-top: 1px solid var(--border-light, #e5e7eb);
        }

        .api-key-section input {
            width: 100%;
            background: var(--background-secondary, #f8f9fa);
            border: 1px solid var(--border-light, #e5e7eb);
            color: var(--text-primary, #1f2937);
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 12px;
            margin-bottom: 4px;
            box-sizing: border-box;
            transition: all 0.15s ease;
        }

        .api-key-section input::placeholder {
            color: var(--text-tertiary, #9ca3af);
        }
        
        .api-key-section input:focus {
            outline: none;
            border-color: var(--interactive-primary, #2563eb);
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        /* Preset Management Section */
        .preset-section {
            padding: 6px 0;
            border-top: 1px solid var(--border-light, #e5e7eb);
        }

        .preset-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .preset-title {
            font-size: 11px;
            font-weight: 500;
            color: var(--text-primary, #1f2937);
        }

        .preset-count {
            font-size: 9px;
            color: var(--text-tertiary, #9ca3af);
            margin-left: 4px;
        }

        .preset-toggle {
            font-size: 10px;
            color: var(--text-secondary, #6b7280);
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 2px;
            transition: background-color 0.15s ease;
        }

        .preset-toggle:hover {
            background: var(--background-tertiary, #f1f3f4);
        }

        .preset-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
            max-height: 120px;
            overflow-y: auto;
        }

        .preset-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 8px;
            background: var(--background-secondary, #f8f9fa);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
            font-size: 11px;
            border: 1px solid var(--border-light, #e5e7eb);
        }

        .preset-item:hover {
            background: var(--background-tertiary, #f1f3f4);
            border-color: var(--border-medium, #d1d5db);
        }

        .preset-item.selected {
            background: rgba(37, 99, 235, 0.1);
            border-color: var(--interactive-primary, #2563eb);
            box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.2);
        }

        .preset-name {
            color: var(--text-primary, #1f2937);
            flex: 1;
            text-overflow: ellipsis;
            overflow: hidden;
            white-space: nowrap;
            font-weight: 400;
        }

        .preset-item.selected .preset-name {
            font-weight: 500;
        }

        .preset-status {
            font-size: 9px;
            color: var(--interactive-primary, #2563eb);
            font-weight: 500;
            margin-left: 6px;
        }

        .no-presets-message {
            padding: 12px 8px;
            text-align: center;
            color: var(--text-tertiary, #9ca3af);
            font-size: 10px;
            line-height: 1.4;
        }

        .no-presets-message .web-link {
            color: var(--interactive-primary, #2563eb);
            text-decoration: underline;
            cursor: pointer;
        }

        .no-presets-message .web-link:hover {
            color: var(--interactive-primary-hover, #1d4ed8);
        }

        .loading-state {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: var(--text-secondary, #6b7280);
            font-size: 11px;
        }

        .loading-spinner {
            width: 12px;
            height: 12px;
            border: 1px solid var(--border-light, #e5e7eb);
            border-top: 1px solid var(--interactive-primary, #2563eb);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 6px;
        }

        .hidden {
            display: none;
        }

        .api-key-section, .model-selection-section {
            padding: 8px 0;
            border-top: 1px solid var(--border-light, #e5e7eb);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .provider-key-group, .model-select-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        label {
            font-size: 11px;
            font-weight: 500;
            color: var(--text-secondary, #6b7280);
            margin-left: 2px;
        }
        label > strong {
            color: var(--text-primary, #1f2937);
            font-weight: 600;
        }
        .provider-key-group input {
            width: 100%; background: var(--background-secondary, #f8f9fa); border: 1px solid var(--border-light, #e5e7eb);
            color: var(--text-primary, #1f2937); border-radius: 6px; padding: 8px 12px; font-size: 12px; box-sizing: border-box;
            transition: all 0.15s ease;
        }
        
        .provider-key-group input:focus {
            outline: none;
            border-color: var(--interactive-primary, #2563eb);
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .key-buttons { display: flex; gap: 4px; }
        .key-buttons .settings-button { flex: 1; padding: 4px; }
        .model-list {
            display: flex; flex-direction: column; gap: 2px; max-height: 120px;
            overflow-y: auto; background: var(--background-secondary, #f8f9fa); border: 1px solid var(--border-light, #e5e7eb);
            border-radius: 6px; padding: 6px; margin-top: 4px;
        }
        .model-item { 
            padding: 6px 10px; 
            font-size: 12px; 
            border-radius: 4px; 
            cursor: pointer; 
            transition: all 0.15s ease; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            color: var(--text-primary, #1f2937); 
        }
        .model-item:hover { background-color: var(--background-tertiary, #f1f3f4); }
        .model-item.selected { 
            background-color: rgba(37, 99, 235, 0.1); 
            border: 1px solid var(--interactive-primary, #2563eb);
            font-weight: 500;
            color: var(--interactive-primary, #2563eb);
        }
        .model-status { 
            font-size: 9px; 
            color: var(--text-tertiary, #9ca3af); 
            margin-left: 8px; 
        }
        .model-status.installed { color: #10b981; }
        .model-status.not-installed { color: #f59e0b; }
        .install-progress {
            flex: 1;
            height: 4px;
            background: var(--background-tertiary, #f1f3f4);
            border-radius: 2px;
            margin-left: 8px;
            overflow: hidden;
        }
        .install-progress-bar {
            height: 100%;
            background: var(--interactive-primary, #2563eb);
            transition: width 0.3s ease;
        }
        
        /* Dropdown styles */
        select.model-dropdown {
            background: var(--background-secondary, #f8f9fa);
            color: var(--text-primary, #1f2937);
            border: 1px solid var(--border-light, #e5e7eb);
            border-radius: 6px;
            padding: 8px 12px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        
        select.model-dropdown:focus {
            outline: none;
            border-color: var(--interactive-primary, #2563eb);
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        
        select.model-dropdown option {
            background: var(--surface-elevated, #ffffff);
            color: var(--text-primary, #1f2937);
        }
        
        select.model-dropdown option:disabled {
            color: var(--text-tertiary, #9ca3af);
        }
        
        /* Add spinner animation */
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Clean button hover effects */
        .opacity-button:hover,
        .theme-toggle-button:hover {
            opacity: 0.7;
            transform: scale(1.1);
        }
        
        /* Hide/show icons based on theme */
        :host-context(html.light) .sun-icon { display: block; }
        :host-context(html.light) .moon-icon { display: none; }
        :host-context(html.dark) .sun-icon { display: none; }
        :host-context(html.dark) .moon-icon { display: block; }

        /* Click-through toggle styles */
        .clickthrough-toggle {
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
            padding: 8px 12px;
            border-radius: 8px;
            transition: all 0.15s ease;
        }
        
        .clickthrough-toggle:hover {
            background: var(--background-secondary, #f8f9fa);
        }
        
        .toggle-switch {
            position: relative;
            width: 48px;
            height: 24px;
            background: var(--border-medium, #d1d5db);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .toggle-switch.enabled {
            background: var(--text-primary, #1f2937);
        }
        
        .toggle-slider {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            background: #ffffff;
            border-radius: 50%;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .toggle-switch.enabled .toggle-slider {
            transform: translateX(24px);
        }
        
        /* Small toggle switches for consistent sizing */
        .toggle-switch.small {
            width: 36px;
            height: 18px;
            border-radius: 9px;
        }
        
        .toggle-switch.small .toggle-slider {
            width: 14px;
            height: 14px;
            top: 2px;
            left: 2px;
        }
        
        .toggle-switch.small.enabled .toggle-slider {
            transform: translateX(18px);
        }
        
        /* Theme toggle button specific styling */
        .theme-toggle-button {
            color: var(--text-primary, #1f2937);
        }
        
        /* Theme icon color fixes */
        .theme-toggle-button svg {
            stroke: var(--text-primary, #1f2937);
        }
        
        /* Ensure proper colors in light and dark modes */
        :host-context(html.light) .theme-toggle-button {
            color: #1f2937;
        }
        
        :host-context(html.light) .theme-toggle-button svg {
            stroke: #1f2937;
        }
        
        :host-context(html.dark) .theme-toggle-button {
            color: #f9fafb;
        }
        
        :host-context(html.dark) .theme-toggle-button svg {
            stroke: #f9fafb;
        }
    `;


    //////// after_modelStateService ////////
    static properties = {
        shortcuts: { type: Object, state: true },
        firebaseUser: { type: Object, state: true },
        isLoading: { type: Boolean, state: true },
        isContentProtectionOn: { type: Boolean, state: true },
        saving: { type: Boolean, state: true },
        providerConfig: { type: Object, state: true },
        apiKeys: { type: Object, state: true },
        availableLlmModels: { type: Array, state: true },
        availableSttModels: { type: Array, state: true },
        selectedLlm: { type: String, state: true },
        windowOpacity: { type: Number, state: true },
        clickThroughEnabled: { type: Boolean, state: true },
        // theme property now handled by ThemeMixin
        selectedStt: { type: String, state: true },
        isLlmListVisible: { type: Boolean },
        isSttListVisible: { type: Boolean },
        presets: { type: Array, state: true },
        selectedPreset: { type: Object, state: true },
        showPresets: { type: Boolean, state: true },
        autoUpdateEnabled: { type: Boolean, state: true },
        autoUpdateLoading: { type: Boolean, state: true },
        // Ollama related properties
        ollamaStatus: { type: Object, state: true },
        ollamaModels: { type: Array, state: true },
        installingModels: { type: Object, state: true },
        // Whisper related properties
        whisperModels: { type: Array, state: true },
    };
    //////// after_modelStateService ////////

    constructor() {
        super();
        //////// after_modelStateService ////////
        this.shortcuts = {};
        this.firebaseUser = null;
        this.apiKeys = { openai: '', gemini: '', anthropic: '', whisper: '' };
        this.providerConfig = {};
        this.isLoading = true;
        this.isContentProtectionOn = true;
        this.saving = false;
        this.availableLlmModels = [];
        this.availableSttModels = [];
        this.selectedLlm = null;
        this.selectedStt = null;
        this.isLlmListVisible = false;
        this.isSttListVisible = false;
        this.presets = [];
        this.selectedPreset = null;
        this.showPresets = false;
        // Theme is now handled by ThemeMixin
        // Window management
        this.windowOpacity = 1.0; // Default 100% opacity
        this.clickThroughEnabled = false; // Default click-through disabled
        // Ollama related
        this.ollamaStatus = { installed: false, running: false };
        this.ollamaModels = [];
        this.installingModels = {}; // { modelName: progress }
        // Whisper related
        this.whisperModels = [];
        this.whisperProgressTracker = null; // Will be initialized when needed
        this.handleUsePicklesKey = this.handleUsePicklesKey.bind(this)
        this.autoUpdateEnabled = true;
        this.autoUpdateLoading = true;
        this.loadInitialData();
        //////// after_modelStateService ////////
    }

    async loadAutoUpdateSetting() {
        if (!window.api) return;
        this.autoUpdateLoading = true;
        try {
            const enabled = await window.api.settingsView.getAutoUpdate();
            this.autoUpdateEnabled = enabled;
            console.log('Auto-update setting loaded:', enabled);
        } catch (e) {
            console.error('Error loading auto-update setting:', e);
            this.autoUpdateEnabled = true; // fallback
        }
        this.autoUpdateLoading = false;
        this.requestUpdate();
    }

    async handleToggleAutoUpdate() {
        if (!window.api || this.autoUpdateLoading) return;
        this.autoUpdateLoading = true;
        this.requestUpdate();
        try {
            const newValue = !this.autoUpdateEnabled;
            const result = await window.api.settingsView.setAutoUpdate(newValue);
            if (result && result.success) {
                this.autoUpdateEnabled = newValue;
            } else {
                console.error('Failed to update auto-update setting');
            }
        } catch (e) {
            console.error('Error toggling auto-update:', e);
        }
        this.autoUpdateLoading = false;
        this.requestUpdate();
    }

    //////// after_modelStateService ////////
    async loadInitialData() {
        if (!window.api) return;
        this.isLoading = true;
        try {
            const [userState, modelSettings, presets, contentProtection, shortcuts, ollamaStatus, whisperModelsResult] = await Promise.all([
                window.api.settingsView.getCurrentUser(),
                window.api.settingsView.getModelSettings(), // Facade call
                window.api.settingsView.getPresets(),
                window.api.settingsView.getContentProtectionStatus(),
                window.api.settingsView.getCurrentShortcuts(),
                window.api.settingsView.getOllamaStatus(),
                window.api.settingsView.getWhisperInstalledModels()
            ]);
            
            if (userState && userState.isLoggedIn) this.firebaseUser = userState;
            
            if (modelSettings.success) {
                const { config, storedKeys, availableLlm, availableStt, selectedModels } = modelSettings.data;
                this.providerConfig = config;
                this.apiKeys = storedKeys;
                this.availableLlmModels = availableLlm;
                this.availableSttModels = availableStt;
                this.selectedLlm = selectedModels.llm;
                this.selectedStt = selectedModels.stt;
            }

            this.presets = presets || [];
            this.isContentProtectionOn = contentProtection;
            this.shortcuts = shortcuts || {};
            if (this.presets.length > 0) {
                const firstUserPreset = this.presets.find(p => p.is_default === 0);
                if (firstUserPreset) this.selectedPreset = firstUserPreset;
            }
            // Ollama status
            if (ollamaStatus?.success) {
                this.ollamaStatus = { installed: ollamaStatus.installed, running: ollamaStatus.running };
                this.ollamaModels = ollamaStatus.models || [];
            }
            // Whisper status
            if (whisperModelsResult?.success) {
                const installedWhisperModels = whisperModelsResult.models;
                if (this.providerConfig.whisper) {
                    this.providerConfig.whisper.sttModels.forEach(m => {
                        const installedInfo = installedWhisperModels.find(i => i.id === m.id);
                        if (installedInfo) {
                            m.installed = installedInfo.installed;
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error loading initial settings data:', error);
        } finally {
            this.isLoading = false;
        }
    }


    async handleSaveKey(provider) {
        const input = this.shadowRoot.querySelector(`#key-input-${provider}`);
        if (!input) return;
        const key = input.value;
        
        // For Ollama, we need to ensure it's ready first
        if (provider === 'ollama') {
        this.saving = true;
            
            // First ensure Ollama is installed and running
            const ensureResult = await window.api.settingsView.ensureOllamaReady();
            if (!ensureResult.success) {
                alert(`Failed to setup Ollama: ${ensureResult.error}`);
                this.saving = false;
                return;
            }
            
            // Now validate (which will check if service is running)
            const result = await window.api.settingsView.validateKey({ provider, key: 'local' });
            
            if (result.success) {
                await this.refreshModelData();
                await this.refreshOllamaStatus();
            } else {
                alert(`Failed to connect to Ollama: ${result.error}`);
            }
            this.saving = false;
            return;
        }
        
        // For Whisper, just enable it
        if (provider === 'whisper') {
            this.saving = true;
            const result = await window.api.settingsView.validateKey({ provider, key: 'local' });
            
            if (result.success) {
                await this.refreshModelData();
            } else {
                alert(`Failed to enable Whisper: ${result.error}`);
            }
            this.saving = false;
            return;
        }
        
        // For other providers, use the normal flow
        this.saving = true;
        const result = await window.api.settingsView.validateKey({ provider, key });
        
        if (result.success) {
            await this.refreshModelData();
        } else {
            alert(`Failed to save ${provider} key: ${result.error}`);
            input.value = this.apiKeys[provider] || '';
        }
        this.saving = false;
    }
    
    async handleClearKey(provider) {
        console.log(`[SettingsView] handleClearKey: ${provider}`);
        this.saving = true;
        await window.api.settingsView.removeApiKey(provider);
        this.apiKeys = { ...this.apiKeys, [provider]: '' };
        await this.refreshModelData();
        this.saving = false;
    }

    async refreshModelData() {
        const [availableLlm, availableStt, selected, storedKeys] = await Promise.all([
            window.api.settingsView.getAvailableModels({ type: 'llm' }),
            window.api.settingsView.getAvailableModels({ type: 'stt' }),
            window.api.settingsView.getSelectedModels(),
            window.api.settingsView.getAllKeys()
        ]);
        this.availableLlmModels = availableLlm;
        this.availableSttModels = availableStt;
        this.selectedLlm = selected.llm;
        this.selectedStt = selected.stt;
        this.apiKeys = storedKeys;
        this.requestUpdate();
    }
    
    async toggleModelList(type) {
        const visibilityProp = type === 'llm' ? 'isLlmListVisible' : 'isSttListVisible';

        if (!this[visibilityProp]) {
            this.saving = true;
            this.requestUpdate();
            
            await this.refreshModelData();

            this.saving = false;
        }

        // Data [Korean comment translated] [Korean comment translated], [Korean comment translated] [Korean comment translated] Status[Korean comment translated] [Korean comment translated].
        this[visibilityProp] = !this[visibilityProp];
        this.requestUpdate();
    }
    
    async selectModel(type, modelId) {
        // Check if this is an Ollama model that needs to be installed
        const provider = this.getProviderForModel(type, modelId);
        if (provider === 'ollama') {
            const ollamaModel = this.ollamaModels.find(m => m.name === modelId);
            if (ollamaModel && !ollamaModel.installed && !ollamaModel.installing) {
                // Need to install the model first
                await this.installOllamaModel(modelId);
                return;
            }
        }
        
        // Check if this is a Whisper model that needs to be downloaded
        if (provider === 'whisper' && type === 'stt') {
            const isInstalling = this.installingModels[modelId] !== undefined;
            const whisperModelInfo = this.providerConfig.whisper.sttModels.find(m => m.id === modelId);
            
            if (whisperModelInfo && !whisperModelInfo.installed && !isInstalling) {
                await this.downloadWhisperModel(modelId);
                return;
            }
        }
        
        this.saving = true;
        await window.api.settingsView.setSelectedModel({ type, modelId });
        if (type === 'llm') this.selectedLlm = modelId;
        if (type === 'stt') this.selectedStt = modelId;
        this.isLlmListVisible = false;
        this.isSttListVisible = false;
        this.saving = false;
        this.requestUpdate();
    }
    
    async refreshOllamaStatus() {
        const ollamaStatus = await window.api.settingsView.getOllamaStatus();
        if (ollamaStatus?.success) {
            this.ollamaStatus = { installed: ollamaStatus.installed, running: ollamaStatus.running };
            this.ollamaModels = ollamaStatus.models || [];
        }
    }
    
    async installOllamaModel(modelName) {
        try {
            // Ollama Model [Korean comment translated] Start
            this.installingModels = { ...this.installingModels, [modelName]: 0 };
            this.requestUpdate();

            // [Korean comment translated] [Korean comment translated] [Korean comment translated] Settings
            const progressHandler = (event, data) => {
                if (data.modelId === modelName) {
                    this.installingModels = { ...this.installingModels, [modelName]: data.progress };
                    this.requestUpdate();
                }
            };

            // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            window.api.settingsView.onOllamaPullProgress(progressHandler);

            try {
                const result = await window.api.settingsView.pullOllamaModel(modelName);
                
                if (result.success) {
                    console.log(`[SettingsView] Model ${modelName} installed successfully`);
                    delete this.installingModels[modelName];
                    this.requestUpdate();
                    
                    // Status [Korean comment translated]
                    await this.refreshOllamaStatus();
                    await this.refreshModelData();
                } else {
                    throw new Error(result.error || 'Installation failed');
                }
            } finally {
                // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
                window.api.settingsView.removeOnOllamaPullProgress(progressHandler);
            }
        } catch (error) {
            console.error(`[SettingsView] Error installing model ${modelName}:`, error);
            delete this.installingModels[modelName];
            this.requestUpdate();
        }
    }
    
    async downloadWhisperModel(modelId) {
        // Mark as installing
        this.installingModels = { ...this.installingModels, [modelId]: 0 };
        this.requestUpdate();
        
        try {
            // Set up progress listener
            const progressHandler = (event, { modelId: id, progress }) => {
                if (id === modelId) {
                    this.installingModels = { ...this.installingModels, [modelId]: progress };
                    this.requestUpdate();
                }
            };
            
            window.api.settingsView.onWhisperDownloadProgress(progressHandler);
            
            // Start download
            const result = await window.api.settingsView.downloadWhisperModel(modelId);
            
            if (result.success) {
                // Auto-select the model after download
                await this.selectModel('stt', modelId);
            } else {
                alert(`Failed to download Whisper model: ${result.error}`);
            }
            
            // Cleanup
            window.api.settingsView.removeOnWhisperDownloadProgress(progressHandler);
        } catch (error) {
            console.error(`[SettingsView] Error downloading Whisper model ${modelId}:`, error);
            alert(`Error downloading ${modelId}: ${error.message}`);
        } finally {
            delete this.installingModels[modelId];
            this.requestUpdate();
        }
    }
    
    getProviderForModel(type, modelId) {
        for (const [providerId, config] of Object.entries(this.providerConfig)) {
            const models = type === 'llm' ? config.llmModels : config.sttModels;
            if (models?.some(m => m.id === modelId)) {
                return providerId;
            }
        }
        return null;
    }

    async handleWhisperModelSelect(modelId) {
        if (!modelId) return;
        
        // Select the model (will trigger download if needed)
        await this.selectModel('stt', modelId);
    }

    handleUsePicklesKey(e) {
        e.preventDefault()
        if (this.wasJustDragged) return
    
        console.log("Requesting Firebase authentication from main process...")
        window.api.settingsView.startFirebaseAuth();
    }
    //////// after_modelStateService ////////

    openShortcutEditor() {
        window.api.settingsView.openShortcutSettingsWindow();
    }

    connectedCallback() {
        super.connectedCallback();
        
        // Theme initialization is now handled by ThemeMixin
        
        this.setupEventListeners();
        this.setupIpcListeners();
        this.setupWindowResize();
        this.loadAutoUpdateSetting();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.cleanupEventListeners();
        this.cleanupIpcListeners();
        this.cleanupWindowResize();
        
        // Cancel any ongoing Ollama installations when component is destroyed
        const installingModels = Object.keys(this.installingModels);
        if (installingModels.length > 0) {
            installingModels.forEach(modelName => {
                window.api.settingsView.cancelOllamaInstallation(modelName);
            });
        }
    }

    setupEventListeners() {
        this.addEventListener('mouseenter', this.handleMouseEnter);
        this.addEventListener('mouseleave', this.handleMouseLeave);
    }

    cleanupEventListeners() {
        this.removeEventListener('mouseenter', this.handleMouseEnter);
        this.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    setupIpcListeners() {
        if (!window.api) return;
        
        this._userStateListener = (event, userState) => {
            console.log('[SettingsView] Received user-state-changed:', userState);
            if (userState && userState.isLoggedIn) {
                this.firebaseUser = userState;
            } else {
                this.firebaseUser = null;
            }
            this.loadAutoUpdateSetting();
            this.requestUpdate();
        };
        
        this._settingsUpdatedListener = (event, settings) => {
            console.log('[SettingsView] Received settings-updated');
            this.settings = settings;
            this.requestUpdate();
        };

        // [Korean comment translated] Update [Korean comment translated] [Korean comment translated]
        this._presetsUpdatedListener = async (event) => {
            console.log('[SettingsView] Received presets-updated, refreshing presets');
            try {
                const presets = await window.api.settingsView.getPresets();
                this.presets = presets || [];
                
                // [Korean comment translated] [Korean comment translated] [Korean comment translated] Delete[Korean comment translated] Confirm (User [Korean comment translated] [Korean comment translated])
                const userPresets = this.presets.filter(p => p.is_default === 0);
                if (this.selectedPreset && !userPresets.find(p => p.id === this.selectedPreset.id)) {
                    this.selectedPreset = userPresets.length > 0 ? userPresets[0] : null;
                }
                
                this.requestUpdate();
            } catch (error) {
                console.error('[SettingsView] Failed to refresh presets:', error);
            }
        };
        this._shortcutListener = (event, keybinds) => {
            console.log('[SettingsView] Received updated shortcuts:', keybinds);
            this.shortcuts = keybinds;
        };
        
        this._clickThroughListener = (event, enabled) => {
            console.log('[SettingsView] Received click-through-changed:', enabled);
            this.clickThroughEnabled = enabled;
        };
        
        window.api.settingsView.onUserStateChanged(this._userStateListener);
        window.api.settingsView.onSettingsUpdated(this._settingsUpdatedListener);
        window.api.settingsView.onPresetsUpdated(this._presetsUpdatedListener);
        window.api.settingsView.onShortcutsUpdated(this._shortcutListener);
        window.api.settingsView.onClickThroughChanged(this._clickThroughListener);
    }

    cleanupIpcListeners() {
        if (!window.api) return;
        
        if (this._userStateListener) {
            window.api.settingsView.removeOnUserStateChanged(this._userStateListener);
        }
        if (this._settingsUpdatedListener) {
            window.api.settingsView.removeOnSettingsUpdated(this._settingsUpdatedListener);
        }
        if (this._presetsUpdatedListener) {
            window.api.settingsView.removeOnPresetsUpdated(this._presetsUpdatedListener);
        }
        if (this._shortcutListener) {
            window.api.settingsView.removeOnShortcutsUpdated(this._shortcutListener);
        }
        if (this._clickThroughListener) {
            window.api.settingsView.removeOnClickThroughChanged(this._clickThroughListener);
        }
    }

    setupWindowResize() {
        this.resizeHandler = () => {
            this.requestUpdate();
            this.updateScrollHeight();
        };
        window.addEventListener('resize', this.resizeHandler);
        
        // Initial setup
        setTimeout(() => this.updateScrollHeight(), 100);
    }

    cleanupWindowResize() {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
    }

    updateScrollHeight() {
        const windowHeight = window.innerHeight;
        const maxHeight = windowHeight;
        
        this.style.maxHeight = `${maxHeight}px`;
        
        const container = this.shadowRoot?.querySelector('.settings-container');
        if (container) {
            container.style.maxHeight = `${maxHeight}px`;
        }
    }

    handleMouseEnter = () => {
        window.api.settingsView.cancelHideSettingsWindow();
    }

    handleMouseLeave = () => {
        window.api.settingsView.hideSettingsWindow();
    }


    getMainShortcuts() {
        return [
            { name: 'Show / Hide', accelerator: this.shortcuts.toggleVisibility },
            { name: 'Ask Anything', accelerator: this.shortcuts.nextStep },
            { name: 'Scroll Up Response', accelerator: this.shortcuts.scrollUp },
            { name: 'Scroll Down Response', accelerator: this.shortcuts.scrollDown },
        ];
    }

    renderShortcutKeys(accelerator) {
        if (!accelerator) return html`N/A`;
        
        const keyMap = {
            'Cmd': '⌘', 'Command': '⌘', 'Ctrl': '⌃', 'Alt': '⌥', 'Shift': '⇧', 'Enter': '↵',
            'Up': '↑', 'Down': '↓', 'Left': '←', 'Right': '→'
        };

        // scrollDown/scrollUp[Korean comment translated] [Korean comment translated] Process
        if (accelerator.includes('↕')) {
            const keys = accelerator.replace('↕','').split('+');
            keys.push('↕');
             return html`${keys.map(key => html`<span class="shortcut-key">${keyMap[key] || key}</span>`)}`;
        }

        const keys = accelerator.split('+');
        return html`${keys.map(key => html`<span class="shortcut-key">${keyMap[key] || key}</span>`)}`;
    }

    togglePresets() {
        this.showPresets = !this.showPresets;
    }

    async handlePresetSelect(preset) {
        this.selectedPreset = preset;
        // Here you could implement preset application logic
        console.log('Selected preset:', preset);
    }

    handleMoveLeft() {
        console.log('Move Left clicked');
        window.api.settingsView.moveWindowStep('left');
    }

    handleMoveRight() {
        console.log('Move Right clicked');
        window.api.settingsView.moveWindowStep('right');
    }

    async handlePersonalize() {
        console.log('Personalize clicked');
        try {
            await window.api.settingsView.openPersonalizePage();
        } catch (error) {
            console.error('Failed to open personalize page:', error);
        }
    }

    async handleToggleInvisibility() {
        console.log('Toggle Invisibility clicked');
        this.isContentProtectionOn = await window.api.settingsView.toggleContentProtection();
        this.requestUpdate();
    }

    async handleSaveApiKey() {
        const input = this.shadowRoot.getElementById('api-key-input');
        if (!input || !input.value) return;

        const newApiKey = input.value;
        try {
            const result = await window.api.settingsView.saveApiKey(newApiKey);
            if (result.success) {
                console.log('API Key saved successfully via IPC.');
                this.apiKey = newApiKey;
                this.requestUpdate();
            } else {
                 console.error('Failed to save API Key via IPC:', result.error);
            }
        } catch(e) {
            console.error('Error invoking save-api-key IPC:', e);
        }
    }

    handleQuit() {
        console.log('Quit clicked');
        window.api.settingsView.quitApplication();
    }

    handleFirebaseLogout() {
        console.log('Firebase Logout clicked');
        window.api.settingsView.firebaseLogout();
    }

    async handleWebDashboardClick() {
        console.log('Web Dashboard clicked');
        try {
            const webUrl = await window.api.common.getWebUrl();
            if (this.firebaseUser) {
                // User is logged in - go directly to keys page
                window.api.common.openExternal(`${webUrl}/settings/models`);
            } else {
                // User is not logged in - go to login page with redirect to keys
                window.api.common.openExternal(`${webUrl}/login?redirect=settings/models`);
            }
        } catch (error) {
            console.error('Failed to get web URL:', error);
            // Fallback to default port
            const fallbackUrl = 'http://localhost:3000';
            if (this.firebaseUser) {
                window.api.common.openExternal(`${fallbackUrl}/settings/models`);
            } else {
                window.api.common.openExternal(`${fallbackUrl}/login?redirect=settings/models`);
            }
        }
    }

    async handleOllamaShutdown() {
        console.log('[SettingsView] Shutting down Ollama service...');
        
        if (!window.api) return;
        
        try {
            // Show loading state
            this.ollamaStatus = { ...this.ollamaStatus, running: false };
            this.requestUpdate();
            
            const result = await window.api.settingsView.shutdownOllama(false); // Graceful shutdown
            
            if (result.success) {
                console.log('[SettingsView] Ollama shut down successfully');
                // Refresh status to reflect the change
                await this.refreshOllamaStatus();
            } else {
                console.error('[SettingsView] Failed to shutdown Ollama:', result.error);
                // Restore previous state on error
                await this.refreshOllamaStatus();
            }
        } catch (error) {
            console.error('[SettingsView] Error during Ollama shutdown:', error);
            // Restore previous state on error
            await this.refreshOllamaStatus();
        }
    }

    async increaseOpacity() {
        const newOpacity = Math.min(1.0, this.windowOpacity + 0.1);
        await this.updateWindowOpacity(newOpacity);
    }

    async decreaseOpacity() {
        const newOpacity = Math.max(0.1, this.windowOpacity - 0.1);
        await this.updateWindowOpacity(newOpacity);
    }

    async updateWindowOpacity(opacity) {
        if (!window.api || !window.api.settingsView.setWindowOpacity) {
            console.warn('[SettingsView] Window opacity API not available');
            return;
        }
        
        try {
            const result = await window.api.settingsView.setWindowOpacity(opacity);
            if (result && result.success) {
                this.windowOpacity = result.opacity;
                console.log(`[SettingsView] Window opacity updated to: ${Math.round(this.windowOpacity * 100)}%`);
                this.requestUpdate();
            } else {
                console.error('[SettingsView] Failed to set window opacity:', result?.error);
            }
        } catch (error) {
            console.error('[SettingsView] Error setting window opacity:', error);
        }
    }

    async toggleTheme() {
        // Use the centralized theme system instead of local logic
        console.log(`[SettingsView] Toggling theme from ${this.currentTheme}`);
        
        try {
            const result = await super.toggleTheme(); // Call ThemeMixin method
            
            if (result.success) {
                console.log(`[SettingsView] Theme successfully toggled to ${result.theme}`);
            } else {
                console.error(`[SettingsView] Failed to toggle theme: ${result.error}`);
            }
        } catch (error) {
            console.error('[SettingsView] Error toggling theme:', error);
        }
    }

    async toggleClickThrough() {
        if (!window.api || !window.api.settingsView.toggleClickThrough) {
            console.warn('[SettingsView] Click-through API not available');
            return;
        }

        try {
            const result = await window.api.settingsView.toggleClickThrough();
            if (result && result.success) {
                this.clickThroughEnabled = result.enabled;
                console.log(`[SettingsView] Click-through ${this.clickThroughEnabled ? 'enabled' : 'disabled'}`);
                this.requestUpdate();
            } else {
                console.error('[SettingsView] Failed to toggle click-through:', result?.error);
            }
        } catch (error) {
            console.error('[SettingsView] Error toggling click-through:', error);
        }
    }

    //////// after_modelStateService ////////
    render() {
        if (this.isLoading) {
            return html`
                <div class="settings-container">
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <span>Loading...</span>
                    </div>
                </div>
            `;
        }

        const loggedIn = !!this.firebaseUser;

        return html`
            <div class="settings-container">
                <div class="header-section">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <img src="../assets/xerus.svg" alt="Xerus" style="width: 24px; height: 24px;">
                            <h1 class="app-title">Xerus</h1>
                        </div>
                        <div class="account-info">
                            ${this.firebaseUser
                                ? html`Account: ${this.firebaseUser.email || 'Logged In'}`
                                : `Account: Not Logged In`
                            }
                        </div>
                    </div>
                    <div class="invisibility-icon ${!this.isContentProtectionOn ? 'visible' : ''}" title="Content Protection is Off">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9.785 7.41787C8.7 7.41787 7.79 8.19371 7.55667 9.22621C7.0025 8.98704 6.495 9.05121 6.11 9.22037C5.87083 8.18204 4.96083 7.41787 3.88167 7.41787C2.61583 7.41787 1.58333 8.46204 1.58333 9.75121C1.58333 11.0404 2.61583 12.0845 3.88167 12.0845C5.08333 12.0845 6.06333 11.1395 6.15667 9.93787C6.355 9.79787 6.87417 9.53537 7.51 9.94954C7.615 11.1454 8.58333 12.0845 9.785 12.0845C11.0508 12.0845 12.0833 11.0404 12.0833 9.75121C12.0833 8.46204 11.0508 7.41787 9.785 7.41787ZM3.88167 11.4195C2.97167 11.4195 2.2425 10.6729 2.2425 9.75121C2.2425 8.82954 2.9775 8.08287 3.88167 8.08287C4.79167 8.08287 5.52083 8.82954 5.52083 9.75121C5.52083 10.6729 4.79167 11.4195 3.88167 11.4195ZM9.785 11.4195C8.875 11.4195 8.14583 10.6729 8.14583 9.75121C8.14583 8.82954 8.875 8.08287 9.785 8.08287C10.695 8.08287 11.43 8.82954 11.43 9.75121C11.43 10.6729 10.6892 11.4195 9.785 11.4195ZM12.6667 5.95954H1V6.83454H12.6667V5.95954ZM8.8925 1.36871C8.76417 1.08287 8.4375 0.931207 8.12833 1.03037L6.83333 1.46204L5.5325 1.03037L5.50333 1.02454C5.19417 0.93704 4.8675 1.10037 4.75083 1.39787L3.33333 5.08454H10.3333L8.91 1.39787L8.8925 1.36871Z"/>
                        </svg>
                    </div>
                </div>

                <div class="web-link" style="margin: 12px 0; text-align: center; color: var(--interactive-primary, #2563eb); cursor: pointer; font-size: 12px; text-decoration: underline;" @click=${this.handleWebDashboardClick}>
                    Manage API keys in your web dashboard
                </div>

                <div class="buttons-section" style="border-top: 1px solid var(--border-light, #e5e7eb); padding-top: 6px; margin-top: 6px;">
                    <button class="settings-button full-width" @click=${this.openShortcutEditor}>
                        Edit Shortcuts
                    </button>
                </div>

                <!-- Theme & Opacity Combined Controls -->
                <div class="theme-opacity-section" style="border-top: 1px solid var(--border-light, #e5e7eb); padding-top: 8px; margin-top: 8px;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 20px;">
                        <button class="opacity-button" @click=${this.decreaseOpacity} style="background: none; border: none; color: var(--text-primary, #1f2937); font-size: 20px; font-weight: 500; cursor: pointer; transition: all 0.15s; padding: 6px; display: flex; align-items: center; justify-content: center;">
                            −
                        </button>
                        
                        <button class="theme-toggle-button" @click=${this.toggleTheme} style="background: none; border: none; padding: 6px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center;">
                            <!-- Sun Icon (visible in light mode) -->
                            <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 20px; height: 20px; stroke-width: 2;">
                                <circle cx="12" cy="12" r="4" />
                                <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                            </svg>
                            <!-- Moon Icon (visible in dark mode) -->
                            <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 20px; height: 20px; stroke-width: 2;">
                                <path d="M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9" />
                            </svg>
                        </button>
                        
                        <button class="opacity-button" @click=${this.increaseOpacity} style="background: none; border: none; color: var(--text-primary, #1f2937); font-size: 20px; font-weight: 500; cursor: pointer; transition: all 0.15s; padding: 6px; display: flex; align-items: center; justify-content: center;">
                            +
                        </button>
                    </div>
                </div>

                <!-- Click-Through & Visibility Toggles -->
                <div class="toggles-section" style="border-top: 1px solid var(--border-light, #e5e7eb); padding-top: 12px; margin-top: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px;">
                        <!-- Click Through Toggle -->
                        <div class="toggle-item" @click=${this.toggleClickThrough} style="display: flex; align-items: center; gap: 6px; cursor: pointer; flex: 1;">
                            <span style="font-size: 13px; color: var(--text-primary, #1f2937); font-weight: 400;">Click Through</span>
                            <div class="toggle-switch small ${this.clickThroughEnabled ? 'enabled' : ''}">
                                <div class="toggle-slider"></div>
                            </div>
                        </div>
                        
                        <!-- Visibility Toggle -->
                        <div class="toggle-item" @click=${this.handleToggleInvisibility} style="display: flex; align-items: center; gap: 6px; cursor: pointer; flex: 1; justify-content: flex-end;">
                            <span style="font-size: 13px; color: var(--text-primary, #1f2937); font-weight: 400;">Visibility</span>
                            <div class="toggle-switch small ${this.isContentProtectionOn ? 'enabled' : ''}">
                                <div class="toggle-slider"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <hr style="border: none; border-top: 1px solid var(--border-light, #e5e7eb); margin: 12px 0;">

                <div class="shortcuts-section">
                    ${this.getMainShortcuts().map(shortcut => html`
                        <div class="shortcut-item">
                            <span class="shortcut-name">${shortcut.name}</span>
                            <div class="shortcut-keys">
                                ${this.renderShortcutKeys(shortcut.accelerator)}
                            </div>
                        </div>
                    `)}
                </div>

                <div class="buttons-section">
                    <div class="bottom-buttons">
                        ${this.firebaseUser
                            ? html`
                                <button class="settings-button half-width danger" @click=${this.handleFirebaseLogout}>
                                    <span>Logout</span>
                                </button>
                                `
                            : html`
                                <button class="settings-button half-width" @click=${this.handleUsePicklesKey}>
                                    <span>Login</span>
                                </button>
                                `
                        }
                        <button class="settings-button half-width danger" @click=${this.handleQuit}>
                            <span>Quit</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    //////// after_modelStateService ////////
}

customElements.define('settings-view', SettingsView);