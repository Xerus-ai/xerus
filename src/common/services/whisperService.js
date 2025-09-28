const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { BrowserWindow } = require('electron');
const LocalAIServiceBase = require('./localAIServiceBase');
const { spawnAsync } = require('../utils/spawnHelper');
const { DOWNLOAD_CHECKSUMS } = require('../config/checksums');
const { createLogger } = require('./logger.js');

const logger = createLogger('WhisperService');

const fsPromises = fs.promises;

class WhisperService extends LocalAIServiceBase {
    constructor() {
        super('WhisperService');
        this.isInitialized = false;
        this.whisperPath = null;
        this.modelsDir = null;
        this.tempDir = null;
        this.availableModels = {
            'whisper-tiny': {
                name: 'Tiny',
                size: '39M',
                url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin'
            },
            'whisper-base': {
                name: 'Base',
                size: '74M',
                url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
            },
            'whisper-small': {
                name: 'Small',
                size: '244M',
                url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
            },
            'whisper-medium': {
                name: 'Medium',
                size: '769M',
                url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
            }
        };
    }

    // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
    _broadcastToAllWindows(eventName, data = null) {
        BrowserWindow.getAllWindows().forEach(win => {
            if (win && !win.isDestroyed()) {
                if (data !== null) {
                    win.webContents.send(eventName, data);
                } else {
                    win.webContents.send(eventName);
                }
            }
        });
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            const homeDir = os.homedir();
            const whisperDir = path.join(homeDir, '.glass', 'whisper');
            
            this.modelsDir = path.join(whisperDir, 'models');
            this.tempDir = path.join(whisperDir, 'temp');
            
            // Windows[Korean comment translated] .exe [Korean comment translated] [Korean comment translated]
            const platform = this.getPlatform();
            const whisperExecutable = platform === 'win32' ? 'whisper.exe' : 'whisper';
            this.whisperPath = path.join(whisperDir, 'bin', whisperExecutable);

            await this.ensureDirectories();
            await this.ensureWhisperBinary();
            
            this.isInitialized = true;
            logger.info('[WhisperService] Initialized successfully');
        } catch (error) {
            logger.error('Initialization failed:', { error });
            throw error;
        }
    }

    async ensureDirectories() {
        await fsPromises.mkdir(this.modelsDir, { recursive: true });
        await fsPromises.mkdir(this.tempDir, { recursive: true });
        await fsPromises.mkdir(path.dirname(this.whisperPath), { recursive: true });
    }

    async ensureWhisperBinary() {
        const whisperCliPath = await this.checkCommand('whisper-cli');
        if (whisperCliPath) {
            this.whisperPath = whisperCliPath;
            logger.info('Found whisper-cli at:');
            return;
        }

        const whisperPath = await this.checkCommand('whisper');
        if (whisperPath) {
            this.whisperPath = whisperPath;
            logger.info('Found whisper at:');
            return;
        }

        try {
            await fsPromises.access(this.whisperPath, fs.constants.X_OK);
            logger.info('[WhisperService] Custom whisper binary found');
            return;
        } catch (error) {
            // Continue to installation
        }

        const platform = this.getPlatform();
        if (platform === 'darwin') {
            logger.info('[WhisperService] Whisper not found, trying Homebrew installation...');
            try {
                await this.installViaHomebrew();
                return;
            } catch (error) {
                logger.info('[WhisperService] Homebrew installation failed:', error.message);
            }
        }

        await this.autoInstall();
    }

    async installViaHomebrew() {
        const brewPath = await this.checkCommand('brew');
        if (!brewPath) {
            throw new Error('Homebrew not found. Please install Homebrew first.');
        }

        logger.info('[WhisperService] Installing whisper-cpp via Homebrew...');
        await spawnAsync('brew', ['install', 'whisper-cpp']);
        
        const whisperCliPath = await this.checkCommand('whisper-cli');
        if (whisperCliPath) {
            this.whisperPath = whisperCliPath;
            logger.info('Whisper-cli installed via Homebrew at:');
        } else {
            const whisperPath = await this.checkCommand('whisper');
            if (whisperPath) {
                this.whisperPath = whisperPath;
                logger.info('Whisper installed via Homebrew at:');
            }
        }
    }


    async ensureModelAvailable(modelId) {
        if (!this.isInitialized) {
            logger.info('[WhisperService] Service not initialized, initializing now...');
            await this.initialize();
        }

        const modelInfo = this.availableModels[modelId];
        if (!modelInfo) {
            throw new Error(`Unknown model: ${modelId}. Available models: ${Object.keys(this.availableModels).join(', ')}`);
        }

        const modelPath = await this.getModelPath(modelId);
        try {
            await fsPromises.access(modelPath, fs.constants.R_OK);
            logger.info('Model  already available at:');
        } catch (error) {
            logger.info('Model  not found, downloading...');
            await this.downloadModel(modelId);
        }
    }

    async downloadModel(modelId) {
        const modelInfo = this.availableModels[modelId];
        const modelPath = await this.getModelPath(modelId);
        const checksumInfo = DOWNLOAD_CHECKSUMS.whisper.models[modelId];
        
        this._broadcastToAllWindows('whisper:download-progress', { modelId, progress: 0 });
        
        await this.downloadWithRetry(modelInfo.url, modelPath, {
            expectedChecksum: checksumInfo?.sha256,
            modelId, // modelId[Korean comment translated] [Korean comment translated] LocalAIServiceBase[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            onProgress: (progress) => {
                this._broadcastToAllWindows('whisper:download-progress', { modelId, progress });
            }
        });
        
        logger.info('Model  downloaded successfully');
        this._broadcastToAllWindows('whisper:download-complete', { modelId });
    }

    async handleDownloadModel(modelId) {
        try {
            logger.info('Handling download for model:');

            if (!this.isInitialized) {
                await this.initialize();
            }

            await this.ensureModelAvailable(modelId);
            
            return { success: true };
        } catch (error) {
            logger.error('Failed to handle download for model ${modelId}:', { error });
            return { success: false, error: error.message };
        }
    }

    async handleGetInstalledModels() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }
            const models = await this.getInstalledModels();
            return { success: true, models };
        } catch (error) {
            logger.error('Failed to get installed models:', { error });
            return { success: false, error: error.message };
        }
    }

    async getModelPath(modelId) {
        if (!this.isInitialized || !this.modelsDir) {
            throw new Error('WhisperService is not initialized. Call initialize() first.');
        }
        return path.join(this.modelsDir, `${modelId}.bin`);
    }

    async getWhisperPath() {
        return this.whisperPath;
    }

    async saveAudioToTemp(audioBuffer, sessionId = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 6);
        const sessionPrefix = sessionId ? `${sessionId}_` : '';
        const tempFile = path.join(this.tempDir, `audio_${sessionPrefix}${timestamp}_${random}.wav`);
        
        const wavHeader = this.createWavHeader(audioBuffer.length);
        const wavBuffer = Buffer.concat([wavHeader, audioBuffer]);
        
        await fsPromises.writeFile(tempFile, wavBuffer);
        return tempFile;
    }

    createWavHeader(dataSize) {
        const header = Buffer.alloc(44);
        const sampleRate = 24000;
        const numChannels = 1;
        const bitsPerSample = 16;
        
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + dataSize, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(numChannels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
        header.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write('data', 36);
        header.writeUInt32LE(dataSize, 40);
        
        return header;
    }

    async cleanupTempFile(filePath) {
        if (!filePath || typeof filePath !== 'string') {
            logger.warn('Invalid file path for cleanup:', { filePath });
            return;
        }

        const filesToCleanup = [
            filePath,
            filePath.replace('.wav', '.txt'),
            filePath.replace('.wav', '.json')
        ];

        for (const file of filesToCleanup) {
            try {
                // Check if file exists before attempting to delete
                await fsPromises.access(file, fs.constants.F_OK);
                await fsPromises.unlink(file);
                logger.info('Cleaned up:');
            } catch (error) {
                // File doesn't exist or already deleted - this is normal
                if (error.code !== 'ENOENT') {
                    logger.warn('Failed to cleanup ${file}:', { message: error.message });
                }
            }
        }
    }

    async getInstalledModels() {
        if (!this.isInitialized) {
            logger.info('[WhisperService] Service not initialized for getInstalledModels, initializing now...');
            await this.initialize();
        }

        const models = [];
        for (const [modelId, modelInfo] of Object.entries(this.availableModels)) {
            try {
                const modelPath = await this.getModelPath(modelId);
                await fsPromises.access(modelPath, fs.constants.R_OK);
                models.push({
                    id: modelId,
                    name: modelInfo.name,
                    size: modelInfo.size,
                    installed: true
                });
            } catch (error) {
                models.push({
                    id: modelId,
                    name: modelInfo.name,
                    size: modelInfo.size,
                    installed: false
                });
            }
        }
        return models;
    }

    async isServiceRunning() {
        return this.isInitialized;
    }

    async startService() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return true;
    }

    async stopService() {
        return true;
    }

    async isInstalled() {
        try {
            const whisperPath = await this.checkCommand('whisper-cli') || await this.checkCommand('whisper');
            return !!whisperPath;
        } catch (error) {
            return false;
        }
    }

    async installMacOS() {
        throw new Error('Binary installation not available for macOS. Please install Homebrew and run: brew install whisper-cpp');
    }

    async installWindows() {
        logger.info('[WhisperService] Installing Whisper on Windows...');
        const version = 'v1.7.6';
        const binaryUrl = `https://github.com/ggerganov/whisper.cpp/releases/download/${version}/whisper-cpp-${version}-win-x64.zip`;
        const tempFile = path.join(this.tempDir, 'whisper-binary.zip');
        
        try {
            logger.info('[WhisperService] Step 1: Downloading Whisper binary...');
            await this.downloadWithRetry(binaryUrl, tempFile);
            
            logger.info('[WhisperService] Step 2: Extracting archive...');
            const extractDir = path.join(this.tempDir, 'extracted');
            
            // [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            await fsPromises.mkdir(extractDir, { recursive: true });
            
            // PowerShell [Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            const expandCommand = `Expand-Archive -Path "${tempFile}" -DestinationPath "${extractDir}" -Force`;
            await spawnAsync('powershell', ['-command', expandCommand]);
            
            logger.info('[WhisperService] Step 3: Finding and moving whisper executable...');
            
            // [Korean comment translated] [Korean comment translated] [Korean comment translated] whisper.exe File [Korean comment translated]
            const whisperExecutables = await this.findWhisperExecutables(extractDir);
            
            if (whisperExecutables.length === 0) {
                throw new Error('whisper.exe not found in extracted files');
            }
            
            // [Korean comment translated] [Korean comment translated] [Korean comment translated] whisper.exe[Korean comment translated] [Korean comment translated] [Korean comment translated] [Korean comment translated]
            const sourceExecutable = whisperExecutables[0];
            const targetDir = path.dirname(this.whisperPath);
            await fsPromises.mkdir(targetDir, { recursive: true });
            await fsPromises.copyFile(sourceExecutable, this.whisperPath);
            
            logger.info('[WhisperService] Step 4: Verifying installation...');
            
            // [Korean comment translated] Validation
            await fsPromises.access(this.whisperPath, fs.constants.F_OK);
            
            // whisper.exe Execute [Korean comment translated]
            try {
                await spawnAsync(this.whisperPath, ['--help']);
                logger.info('[WhisperService] Whisper executable verified successfully');
            } catch (testError) {
                logger.warn('Whisper executable test failed, but file exists:', { message: testError.message });
            }
            
            logger.info('[WhisperService] Step 5: Cleanup...');
            
            // [Korean comment translated] File [Korean comment translated]
            await fsPromises.unlink(tempFile).catch(() => {});
            await this.removeDirectory(extractDir).catch(() => {});
            
            logger.info('[WhisperService] Whisper installed successfully on Windows');
            return true;
            
        } catch (error) {
            logger.error('Windows installation failed:', { error });
            
            // Failed [Korean comment translated] [Korean comment translated] File [Korean comment translated]
            await fsPromises.unlink(tempFile).catch(() => {});
            await this.removeDirectory(path.join(this.tempDir, 'extracted')).catch(() => {});
            
            throw new Error(`Failed to install Whisper on Windows: ${error.message}`);
        }
    }
    
    // [Korean comment translated] [Korean comment translated] [Korean comment translated] whisper.exe File[Korean comment translated] [Korean comment translated] [Korean comment translated]
    async findWhisperExecutables(dir) {
        const executables = [];
        
        try {
            const items = await fsPromises.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory()) {
                    const subExecutables = await this.findWhisperExecutables(fullPath);
                    executables.push(...subExecutables);
                } else if (item.isFile() && (item.name === 'whisper.exe' || item.name === 'main.exe')) {
                    // main.exe[Korean comment translated] [Korean comment translated] ([Korean comment translated] [Korean comment translated] whisper ExecuteFile[Korean comment translated] main.exe[Korean comment translated] [Korean comment translated])
                    executables.push(fullPath);
                }
            }
        } catch (error) {
            logger.warn('Error reading directory:', { dir, message: error.message });
        }
        
        return executables;
    }
    
    // [Korean comment translated] [Korean comment translated] Delete
    async removeDirectory(dir) {
        try {
            const items = await fsPromises.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory()) {
                    await this.removeDirectory(fullPath);
                } else {
                    await fsPromises.unlink(fullPath);
                }
            }
            
            await fsPromises.rmdir(dir);
        } catch (error) {
            logger.warn('Error removing directory:', { dir, message: error.message });
        }
    }

    async installLinux() {
        logger.info('[WhisperService] Installing Whisper on Linux...');
        const version = 'v1.7.6';
        const binaryUrl = `https://github.com/ggerganov/whisper.cpp/releases/download/${version}/whisper-cpp-${version}-linux-x64.tar.gz`;
        const tempFile = path.join(this.tempDir, 'whisper-binary.tar.gz');
        
        try {
            await this.downloadWithRetry(binaryUrl, tempFile);
            const extractDir = path.dirname(this.whisperPath);
            await spawnAsync('tar', ['-xzf', tempFile, '-C', extractDir, '--strip-components=1']);
            await spawnAsync('chmod', ['+x', this.whisperPath]);
            await fsPromises.unlink(tempFile);
            logger.info('[WhisperService] Whisper installed successfully on Linux');
            return true;
        } catch (error) {
            logger.error('Linux installation failed:', { error });
            throw new Error(`Failed to install Whisper on Linux: ${error.message}`);
        }
    }

    async shutdownMacOS(force) {
        return true;
    }

    async shutdownWindows(force) {
        return true;
    }

    async shutdownLinux(force) {
        return true;
    }
}

// Export singleton instance
const whisperService = new WhisperService();
module.exports = whisperService;