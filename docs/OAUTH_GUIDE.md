# OAuth Authentication Guide - Atlassian MCP Integration

## Overview

This guide explains how to authenticate with Atlassian (Jira/Confluence) through the Xerus AI assistant for seamless integration with your Atlassian workspace.

## Automatic OAuth Flow

### How It Works

The Xerus web interface provides a **fully automated OAuth flow** that handles all the complexity behind the scenes:

1. **Click to Authenticate**: Click the "Configure" button on the Atlassian tool
2. **OAuth Popup**: A secure popup window opens with Atlassian's authentication page
3. **Authorize Access**: Log into Atlassian and grant permissions to your workspace
4. **Automatic Processing**: Xerus automatically detects the authorization and processes it
5. **Instant Feedback**: You'll see a success message and the tool status updates immediately
6. **Ready to Use**: The Atlassian tool is now connected and ready for AI assistance

### User Experience

- **One-Click Setup**: No manual copying of URLs or codes required
- **Real-time Status**: See authentication progress with loading indicators
- **Automatic Refresh**: Tool status updates immediately after successful authentication
- **Error Handling**: Clear error messages if something goes wrong
- **Secure Process**: All authentication data is encrypted and stored securely

## What Gets Connected

When you authenticate with Atlassian, Xerus gains access to:

### Jira Capabilities
- Create, read, update, and delete issues
- Search issues across projects
- Add comments and manage issue workflows
- Transition issues between statuses
- Assign issues and manage watchers
- Access project metadata (types, priorities, statuses)

### Confluence Capabilities  
- Create, read, update, and delete pages
- Search content across spaces
- Manage page comments
- Access space information
- Content organization and navigation

## Security & Privacy

### Data Protection
- **Encrypted Storage**: All OAuth tokens are encrypted and stored securely
- **User Isolation**: Your tokens are completely separate from other users
- **Secure Transmission**: All API calls use HTTPS encryption
- **Token Refresh**: Automatic token renewal prevents interruptions

### Permissions
- **Minimal Scope**: Only requests necessary permissions for AI assistance
- **User Control**: You can revoke access at any time through Atlassian settings
- **Audit Trail**: All API calls are logged for security and debugging

### Token Management
- **Automatic Refresh**: Tokens are automatically renewed before expiration
- **Expiry Monitoring**: System monitors token health and alerts on issues
- **Secure Storage**: Tokens stored in encrypted database with user isolation
- **Easy Revocation**: Remove authentication through the tools interface

## Troubleshooting

### Common Issues

**Authentication Window Doesn't Open**
- Check if popup blockers are enabled in your browser
- Allow popups for the Xerus web interface domain
- Try refreshing the page and clicking authenticate again

**OAuth Flow Gets Stuck**
- Close the authentication popup and try again
- Clear your browser cache and cookies for Atlassian
- Check your internet connection
- Verify your Atlassian account has appropriate permissions

**"Authentication Failed" Error**
- Ensure you're logging into the correct Atlassian workspace
- Verify your Atlassian account has admin/user permissions
- Check if your organization has OAuth restrictions enabled
- Try the process again after a few minutes

**Tool Shows as "Not Configured" After Authentication**
- Wait a few seconds for the status to refresh automatically
- Refresh the tools page manually
- Check browser console for any error messages
- Contact support if the issue persists

### Getting Help

If you encounter issues with OAuth authentication:

1. **Check Status**: Look at the tool status indicators for detailed information
2. **Browser Console**: Open browser developer tools to see any error messages
3. **Try Again**: Most temporary issues resolve by attempting authentication again
4. **Clear Data**: Clear browser cache/cookies for both Xerus and Atlassian
5. **Contact Support**: Reach out with specific error messages and steps you tried

## Technical Details

### OAuth 2.0 Flow
- **Authorization Code Grant**: Industry-standard OAuth 2.0 flow
- **PKCE Security**: Enhanced security for browser-based applications
- **Secure Redirect**: Callback processing through secure backend endpoints
- **Token Exchange**: Automatic code-to-token exchange with error handling

### API Integration
- **MCP Protocol**: Uses Model Context Protocol for tool communication
- **Multi-User Support**: Full isolation between different user accounts
- **Rate Limiting**: Respects Atlassian API rate limits automatically
- **Error Recovery**: Graceful handling of API errors and network issues

### Backend Architecture
- **Microservices**: Independent OAuth service for scalability
- **Database Storage**: Encrypted token storage in PostgreSQL
- **MCP Integration**: Automatic MCP server authentication with user tokens
- **Token Sharing**: Single OAuth flow authenticates both backend and MCP server
- **Monitoring**: Real-time token health and usage monitoring  
- **Logging**: Comprehensive audit logs for security and debugging

### MCP Server Authentication
- **Automatic Configuration**: MCP servers automatically receive user OAuth tokens
- **Single Callback URL**: Uses single Atlassian callback URL for both backend and MCP authentication
- **Token Synchronization**: User tokens are automatically synchronized with MCP credential store
- **Seamless Integration**: No additional authentication steps required for MCP server access

---

## Quick Start

1. Go to **Tools** page in Xerus web interface
2. Find **Atlassian** tool in the MCP Tools section
3. Click the **Configure** button (orange button with settings icon)
4. Complete authentication in the popup window
5. Wait for "Authentication Successful" message
6. Start using Atlassian integration with your AI assistant!

**That's it!** No technical setup, no manual configuration, no copying URLs. Just click and authenticate.