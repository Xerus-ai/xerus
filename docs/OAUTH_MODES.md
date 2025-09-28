# OAuth Authentication Modes for Xerus

## Overview

Xerus supports two OAuth authentication modes for external services like Atlassian, providing flexibility for different user needs and deployment scenarios.

## 🚀 **Mode 1: Xerus Managed OAuth (Recommended)**

### **What It Is**
- Uses a shared Xerus-managed Atlassian OAuth application
- One-click authentication with no technical setup required
- Suitable for most users who want simplicity

### **How It Works**
```
User → Xerus Frontend → Atlassian OAuth (Xerus App) 
     → User Authentication → Xerus Backend → Token Storage
     → MCP Server Authentication → Ready to Use
```

### **User Experience**
1. Click "Configure" on Atlassian tool
2. Select "Xerus Managed (Recommended)" mode
3. Click "Configure Authentication"
4. Complete OAuth in popup window
5. Automatically authenticated and ready

### **Benefits**
- ✅ **Zero Setup**: No OAuth app creation needed
- ✅ **Fast**: One-click authentication
- ✅ **Maintained**: Xerus handles OAuth app maintenance
- ✅ **Support**: Full Xerus support for issues

### **Current Status**
- ✅ **Development**: Works with localhost callback
- 🔄 **Production**: Requires production deployment with public callback URL

### **Production Requirements**
When Xerus is deployed publicly, the OAuth app will use:
```
Callback URL: https://your-xerus-backend.com/api/v1/tools/atlassian-remote/auth/callback
```

---

## 🔒 **Mode 2: Custom OAuth App (Maximum Privacy)**

### **What It Is**
- Users create their own Atlassian OAuth application
- Complete control over OAuth credentials and data
- Suitable for privacy-conscious users or enterprise deployments

### **How It Works**
```
User → Creates Atlassian OAuth App → Configures in Xerus
     → Xerus Uses User's OAuth App → Direct Authentication
     → User's Private Token Storage → MCP Server Access
```

### **User Experience**
1. Create Atlassian OAuth app (detailed guide provided)
2. Click "Configure" on Atlassian tool
3. Select "Custom OAuth App" mode
4. Enter OAuth app credentials (Client ID, Secret, etc.)
5. Complete authentication using your private OAuth app
6. Full privacy and control

### **Benefits**
- 🔒 **Maximum Privacy**: Your data, your OAuth app
- 🛡️ **Full Control**: Complete ownership of authentication flow
- 🏢 **Enterprise Ready**: Suitable for corporate environments
- 📊 **Audit Trail**: Direct visibility into OAuth usage

### **Requirements**
Users need to create their own Atlassian OAuth app with:
- **Client ID**: Your OAuth app identifier
- **Client Secret**: Your OAuth app secret key
- **Callback URL**: Points to your Xerus instance
- **Scopes**: Jira and Confluence permissions

### **Current Status**
- 🔄 **In Development**: UI framework implemented
- ⏳ **Coming Soon**: Full custom OAuth app configuration

---

## 🎯 **Mode Selection Guide**

### **Choose Xerus Managed If:**
- You want the fastest setup experience
- You trust Xerus to manage OAuth credentials securely
- You don't need custom OAuth app control
- You want full Xerus support and maintenance

### **Choose Custom OAuth App If:**
- Maximum privacy is critical for your use case
- You're in an enterprise environment with strict security policies
- You want complete control over OAuth application settings
- You need custom scopes or special Atlassian configurations

---

## 🛡️ **Security Considerations**

### **Xerus Managed Security**
- OAuth tokens are per-user encrypted storage
- No cross-user token access
- Xerus manages OAuth app security updates
- Standard OAuth 2.0 security practices

### **Custom OAuth App Security**
- You control all OAuth app security settings
- Direct responsibility for OAuth app maintenance
- Complete audit trail in your Atlassian admin
- Zero dependency on Xerus OAuth infrastructure

---

## 🔧 **Implementation Status**

### **✅ Completed**
- OAuth mode selection UI in frontend
- Xerus managed OAuth flow (development)
- MCP server token distribution
- Security and encryption for both modes
- Documentation and user guides

### **🔄 In Progress**
- Custom OAuth app configuration UI
- Production callback URL deployment
- Per-user OAuth app credential storage

### **⏳ Coming Soon**
- Custom OAuth app setup wizard
- OAuth app health monitoring
- Advanced OAuth app management features

---

## 🚀 **Getting Started**

### **For Development (Current)**
1. Use the existing localhost callback URL: `http://localhost:5001/api/v1/tools/atlassian-remote/auth/callback`
2. Register this callback in your Atlassian OAuth app
3. Choose "Xerus Managed" mode in the tool configuration
4. Complete OAuth flow

### **For Production (Future)**
1. Deploy Xerus with public backend
2. Update Atlassian OAuth app with production callback URL
3. All users can use "Xerus Managed" mode immediately
4. Custom OAuth app mode available for privacy-conscious users

The implementation provides a complete foundation for both authentication modes, giving users choice between convenience and privacy while maintaining security in both approaches.