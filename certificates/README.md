# Code Signing Certificates

This directory stores your code signing certificates for Windows and macOS.

## 📁 Expected Files

### Windows Code Signing:
- `xerus-codesign.pfx` - Your purchased code signing certificate
- `xerus-dev.pfx` - Development self-signed certificate (optional)

### macOS Code Signing:
- Certificates are managed through Xcode/Keychain
- API keys for notarization go in `AuthKey_XXXXXXXXXX.p8`

## 🔒 Security Notes

**IMPORTANT**: Never commit certificates to git!

The `.gitignore` file excludes:
- `*.pfx`
- `*.p12` 
- `*.p8`
- `*.cer`

## 🛠️ Setup Instructions

### 1. Purchase Certificate
See `CODE-SIGNING-GUIDE.md` for provider recommendations.

### 2. Download Certificate
- Use Internet Explorer to download
- Export as PFX format with password
- Save as `xerus-codesign.pfx`

### 3. Configure Environment
Create `.env` file in project root:
```bash
CSC_KEY_PASSWORD=your_pfx_password_here
CSC_LINK=certificates/xerus-codesign.pfx
```

### 4. Test Signing
```bash
npm run build:signed
```

## 🧪 Development Certificate (Self-Signed)

For testing purposes, create a self-signed certificate:

```powershell
# Run as Administrator
$cert = New-SelfSignedCertificate -Subject "CN=Xerus Development" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My
$password = ConvertTo-SecureString -String "dev123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "certificates/xerus-dev.pfx" -Password $password
```

Then use in `.env`:
```bash
CSC_LINK=certificates/xerus-dev.pfx
CSC_KEY_PASSWORD=dev123
```

## 📋 Certificate Verification

### Check certificate details:
```bash
# Windows
certutil -dump certificates/xerus-codesign.pfx

# View certificate in Windows
certlm.msc
```

### Verify signed executable:
```bash
signtool verify /pa "dist/Xerus Setup 0.2.4.exe"
``` 