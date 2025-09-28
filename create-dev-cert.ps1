# Create Development Code Signing Certificate for Xerus
# Run this script as Administrator to create a self-signed certificate for testing

Write-Host "Creating development code signing certificate for Xerus..." -ForegroundColor Green

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges. Please run as Administrator." -ForegroundColor Red
    exit 1
}

# Create certificates directory if it doesn't exist
if (!(Test-Path "certificates")) {
    New-Item -ItemType Directory -Path "certificates"
    Write-Host "Created certificates directory" -ForegroundColor Yellow
}

# Generate self-signed certificate
Write-Host "Generating self-signed certificate..." -ForegroundColor Yellow
$cert = New-SelfSignedCertificate -Subject "CN=Xerus Development" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My -KeyUsage DigitalSignature -KeySpec Signature -KeyLength 2048 -KeyAlgorithm RSA -HashAlgorithm SHA256

if ($cert) {
    Write-Host "Certificate created successfully!" -ForegroundColor Green
    Write-Host "Certificate Thumbprint: $($cert.Thumbprint)" -ForegroundColor Cyan
    
    # Export to PFX file
    $password = ConvertTo-SecureString -String "xerus-dev-123" -Force -AsPlainText
    $pfxPath = "certificates\xerus-dev.pfx"
    
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password
    Write-Host "Certificate exported to: $pfxPath" -ForegroundColor Green
    
    # Import to Trusted Root to avoid warnings during development
    Write-Host "Installing certificate to Trusted Root Certification Authorities..." -ForegroundColor Yellow
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
    $store.Open("ReadWrite")
    $store.Add($cert)
    $store.Close()
    Write-Host "Certificate installed to Trusted Root!" -ForegroundColor Green
    
    # Create .env file with certificate configuration
    $envContent = @"
# Development Code Signing Configuration
CSC_LINK=certificates/xerus-dev.pfx
CSC_KEY_PASSWORD=xerus-dev-123

# Uncomment for debugging
# DEBUG=electron-builder
"@
    
    $envPath = ".env"
    if (!(Test-Path $envPath)) {
        $envContent | Out-File -FilePath $envPath -Encoding UTF8
        Write-Host "Created .env file with certificate configuration" -ForegroundColor Green
    } else {
        Write-Host ".env file already exists. Add these lines manually:" -ForegroundColor Yellow
        Write-Host $envContent -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "=== SETUP COMPLETE ===" -ForegroundColor Green
    Write-Host "You can now build signed installers with:" -ForegroundColor White
    Write-Host "  npm run build:signed" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Note: This is a DEVELOPMENT certificate only!" -ForegroundColor Red
    Write-Host "For production, purchase a real certificate from a trusted CA." -ForegroundColor Red
    
} else {
    Write-Host "Failed to create certificate!" -ForegroundColor Red
    exit 1
} 