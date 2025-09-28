# Xerus Windows Packaging Guide

## Quick Start

To create a Windows installer for Xerus:

```bash
npm run build:nosign
```

This will create `dist/Xerus Setup 0.2.4.exe` - ready for distribution!

## Available Build Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `npm run build:nosign` | Unsigned installer (for testing) | `Xerus Setup 0.2.4.exe` |
| `npm run package` | Directory build only | `dist/win-unpacked/` |
| `npm run build` | Signed installer (requires certificate) | `Xerus Setup 0.2.4.exe` |

## File Structure

```
dist/
├── Xerus Setup 0.2.4.exe        # Main installer (75MB)
├── Xerus Setup 0.2.4.exe.blockmap  # Update metadata
├── win-unpacked/                 # Unpacked app directory
│   ├── Xerus.exe                # Main executable (169MB)
│   ├── resources/               # App resources (asar bundle)
│   └── [electron runtime files]
└── builder-effective-config.yaml # Build configuration used
```

## Distribution

### For Testing/Development:
- Use the **unsigned installer** (`npm run build:nosign`)
- Users will see "Unknown publisher" warning
- Installer works normally after "More info" → "Run anyway"

### For Production:
1. **Get a Code Signing Certificate:**
   - Purchase from a trusted CA (Sectigo, DigiCert, etc.)
   - Cost: ~$200-400/year for standard cert
   - ~$800-1200/year for EV cert (no SmartScreen warnings)

2. **Configure Signing:**
   ```yaml
   # In electron-builder.yml
   win:
     certificateFile: "path/to/certificate.pfx"
     certificatePassword: "${env.CSC_KEY_PASSWORD}"
     signtoolOptions:
       certificateSubjectName: "Your Company Name"
   ```

3. **Build Signed Installer:**
   ```bash
   npm run build
   ```

## Troubleshooting

### Common Issues:

1. **"EPERM: operation not permitted"**
   - Close any running Xerus instances
   - Disable antivirus temporarily
   - Run PowerShell as Administrator

2. **"Cannot find certificate"**
   - Use `npm run build:nosign` for unsigned builds
   - Verify certificate is installed in Windows cert store

3. **Build hangs or fails**
   - Check Windows Defender exclusions
   - Clear `dist/` folder and rebuild
   - Ensure Node.js modules are compiled for Windows

### PowerShell Execution Policy Issues:
```bash
# If npm commands fail, use:
powershell -ExecutionPolicy Bypass -Command "npm run build:nosign"
```

## File Size Optimization

Current sizes:
- Installer: 75MB
- Unpacked app: ~200MB

To reduce size:
1. **Exclude unnecessary files:**
   ```yaml
   files:
     - "!docs/**/*"
     - "!aec/**/*"  
     - "!*.md"
   ```

2. **Enable ASAR compression:**
   ```yaml
   asar: true
   asarUnpack: ["**/node_modules/native-module/**/*"]
   ```

3. **Optimize dependencies:**
   - Remove dev dependencies from production build
   - Use webpack bundling for renderer code

## Microsoft Store Distribution

To publish on Microsoft Store:
1. Create Microsoft Partner Center account ($19)
2. Use APPX target instead of NSIS:
   ```yaml
   win:
     target: appx
   ```
3. Submit .appx file through Partner Center

## Auto-Updates

For auto-update functionality:
1. Configure publish settings:
   ```yaml
   publish:
     provider: github
     owner: your-org
     repo: xerus
   ```

2. Enable update checking in app:
   ```javascript
   const { autoUpdater } = require('electron-updater');
   autoUpdater.checkForUpdatesAndNotify();
   ```

## Security Notes

- **Unsigned apps** trigger SmartScreen warnings
- **Signed apps** show publisher name
- **EV certificates** provide immediate trust
- Consider using **Windows Package Manager** for distribution

## Support

For packaging issues:
1. Check Electron Builder docs: https://www.electron.build/
2. Review logs in `dist/builder-debug.yml`
3. Test on clean Windows VM
4. Verify all dependencies are Windows-compatible 