# Xerus Code Signing - Complete Guide

> **Professional code signing for Windows and macOS distribution**

This guide covers how to properly sign your Xerus application for Windows and macOS distribution.

## 🪟 Windows Code Signing

### Step 1: Choose Certificate Type

#### Standard Code Signing Certificate
- **Cost**: $200-400/year
- **Validation**: 2-7 days
- **Result**: Shows publisher name, but may trigger SmartScreen initially
- **Best for**: Indie developers, small teams

#### Extended Validation (EV) Certificate
- **Cost**: $800-1200/year  
- **Validation**: 3-10 days (stricter)
- **Result**: Immediate trust, no SmartScreen warnings
- **Best for**: Commercial applications, enterprises

### Step 2: Purchase Certificate

#### Recommended Providers:
1. **Sectigo** (sectigo.com) - Most popular
   - Standard: ~$250/year
   - EV: ~$800/year
   
2. **DigiCert** (digicert.com) - Premium option
   - Standard: ~$350/year
   - EV: ~$1000/year

3. **SSL.com** (ssl.com) - Good value
   - Standard: ~$200/year
   - EV: ~$700/year

## 🔒 Self-Signing Implementation (Development)

For development/testing, you can create self-signed certificates:

### PowerShell Script for Self-Signed Certificates
Create `create-dev-cert.ps1` that automatically:
- Generates a self-signed certificate
- Exports it as a PFX file with password protection
- Imports it to the Trusted Root store to avoid security warnings

### Environment Variables for Self-Signed
```bash
# For self-signed certificates
CSC_LINK=certificates/xerus-dev.pfx
CSC_KEY_PASSWORD=xerus-dev-123

# OR for commercial certificates
CSC_LINK=certificates/xerus-commercial.pfx
CSC_KEY_PASSWORD=your-commercial-password
```

### Build Commands for Self-Signing
```json
{
  "build:signed": "electron-builder --config electron-builder-signed.yml",
  "create-cert": "powershell -ExecutionPolicy Bypass -File create-dev-cert.ps1"
}
```

### Benefits of Self-Signing Setup
- ✅ **No SmartScreen warnings** (certificate installed to Trusted Root)
- ✅ **Shows "Xerus Development" as publisher**
- ✅ **Free alternative** to commercial certificates
- ✅ **Perfect for development/testing**
- ✅ **Easy to regenerate** when needed

---

### Step 3: Validation Process

You'll need to provide:
- **Business registration documents**
- **Phone number** (must be publicly listed in business directories)
- **Domain ownership** (if applicable)
- **Physical address verification**
- **Identity documents**

**Tip**: Update your business listing on D&B (dnb.com) before applying to speed up validation.

### Step 4: Download Certificate

1. **Use Internet Explorer** to download (required for proper private key inclusion)
2. **Export as PFX format** with password protection
3. **Save to** `certificates/xerus-codesign.pfx`

### Step 5: Configure Environment

Create `.env` file in project root:
```bash
# Windows Code Signing
CSC_KEY_PASSWORD=your_pfx_password_here
CSC_LINK=certificates/xerus-codesign.pfx

# Optional: Use Windows Certificate Store instead
# CSC_FINGERPRINT=certificate_sha1_fingerprint
```

### Step 6: Update Package Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "build:signed": "npm run build:all && electron-builder --config electron-builder-signed.yml --publish never",
    "build:release": "npm run build:all && electron-builder --config electron-builder-signed.yml --publish always"
  }
}
```

### Step 7: Build Signed Installer

```bash
npm run build:signed
```

## 🍎 macOS Code Signing

### Step 1: Apple Developer Account

1. **Join Apple Developer Program**: $99/year
2. **Get your Team ID** from developer.apple.com
3. **Create certificates** in Xcode or developer portal

### Step 2: Create Certificates

#### Required Certificates:
1. **Developer ID Application** - For direct distribution
2. **Developer ID Installer** - For pkg installers
3. **Mac App Store** - If submitting to Mac App Store

#### In Xcode:
1. Open Xcode → Preferences → Accounts
2. Add your Apple ID
3. Select your team → Manage Certificates
4. Click "+" → Create certificates

### Step 3: Configure Environment

Add to `.env` file:
```bash
# macOS Code Signing
APPLE_ID=your-apple-id@email.com
APPLE_ID_PASSWORD=app-specific-password
APPLE_TEAM_ID=YOUR_TEAM_ID

# Notarization (for macOS 10.15+)
APPLE_API_KEY=path/to/AuthKey_XXXXXXXXXX.p8
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

### Step 4: Update Configuration

Edit `electron-builder-signed.yml`:
```yaml
mac:
  identity: "Developer ID Application: Your Company Name (TEAM_ID)"
  notarize:
    teamId: "${env.APPLE_TEAM_ID}"
```

### Step 5: Build and Notarize

```bash
npm run build:signed
```

## 🔒 Alternative: Self-Signed Certificate (Development Only)

For development/testing, you can create a self-signed certificate:

### Windows (PowerShell as Administrator):
```powershell
# Create self-signed certificate
$cert = New-SelfSignedCertificate -Subject "CN=Xerus Development" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My

# Export to PFX
$password = ConvertTo-SecureString -String "dev123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "certificates/xerus-dev.pfx" -Password $password

# Import to Trusted Root (to avoid warnings)
Import-Certificate -FilePath "certificates/xerus-dev.pfx" -CertStoreLocation Cert:\LocalMachine\Root
```

Then use in `.env`:
```bash
CSC_LINK=certificates/xerus-dev.pfx
CSC_KEY_PASSWORD=dev123
```

## 📋 Build Commands Summary

| Command | Purpose | Certificate Required |
|---------|---------|---------------------|
| `npm run build:nosign` | Development/testing | No |
| `npm run build:signed` | Production release | Yes |
| `npm run build:release` | Release with auto-publish | Yes |

## 🔍 Verification

### Check Windows Signature:
```bash
# Verify signature
signtool verify /pa "dist/Xerus Setup 0.2.4.exe"

# View certificate details
signtool verify /pa /v "dist/Xerus Setup 0.2.4.exe"
```

### Check macOS Signature:
```bash
# Verify code signature
codesign -dv --verbose=4 "dist/mac/Xerus.app"

# Check notarization
spctl -a -vv "dist/mac/Xerus.app"
```

## 🚨 Troubleshooting

### Common Windows Issues:

1. **"Cannot find certificate"**
   ```bash
   # List available certificates
   certlm.msc
   # Or use PowerShell
   Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert
   ```

2. **"SignTool Error: No certificates were found"**
   - Ensure certificate is in correct store location
   - Check password is correct
   - Verify certificate hasn't expired

3. **"The specified timestamp server either could not be reached"**
   - Add timestamp server configuration:
   ```yaml
   win:
     signtoolOptions:
       timestampServer: "http://timestamp.sectigo.com"
   ```

### Common macOS Issues:

1. **"Code object is not signed at all"**
   - Ensure Apple Developer certificates are installed
   - Check identity name matches exactly

2. **"Notarization failed"**
   - Verify Apple ID app-specific password
   - Check Team ID is correct
   - Ensure hardened runtime is enabled

## 📈 Monitoring

### SmartScreen Reputation:
- **New certificates** may trigger warnings initially
- **Download volume** builds reputation over time
- **EV certificates** get immediate trust
- Monitor through Microsoft Partner Center

### Certificate Expiration:
- Set calendar reminders 30 days before expiration
- Renew early to avoid distribution interruption
- Test new certificates before old ones expire

## 💰 Cost Summary

### Annual Costs:
- **Standard Certificate**: $200-400
- **EV Certificate**: $800-1200
- **Apple Developer**: $99
- **Total (both platforms)**: $300-1300/year

### Return on Investment:
- ✅ Professional appearance
- ✅ User trust and confidence  
- ✅ Reduced support tickets
- ✅ Better download rates
- ✅ Microsoft Store compatibility 