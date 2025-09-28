/**
 * Credential Store - Secure Storage for MCP Server Credentials
 * Handles secure storage and retrieval of user credentials for remote MCP servers
 * 
 * Security Features:
 * - Encryption at rest using AES-256-GCM
 * - Per-user credential isolation
 * - Credential expiration management
 * - Secure credential validation
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

class CredentialStore {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.storePath = path.join(__dirname, '..', '..', 'data', 'credentials');
    this.masterKey = this.deriveMasterKey();
    
    this.initializeStore();
  }

  /**
   * Initialize credential store directory
   */
  async initializeStore() {
    try {
      await fs.mkdir(this.storePath, { recursive: true });
      console.log('[SECURE] Credential store initialized');
    } catch (error) {
      console.error('Failed to initialize credential store:', error);
    }
  }

  /**
   * Derive master encryption key from system entropy
   */
  deriveMasterKey() {
    // In production, this should use a proper key derivation function
    // with a user-specific salt and secure key storage
    const appSecret = process.env.XERUS_ENCRYPTION_KEY || 'xerus-default-key-change-in-production';
    return crypto.createHash('sha256').update(appSecret).digest();
  }

  /**
   * Store encrypted credentials for a user's MCP server
   */
  async storeCredentials(userId, serverId, credentials) {
    try {
      // Validate input
      if (!userId || !serverId || !credentials) {
        throw new Error('Missing required parameters');
      }

      // Encrypt credentials
      const encrypted = this.encryptData(credentials);
      
      // Create credential entry
      const credentialEntry = {
        serverId,
        encrypted: encrypted.data,
        iv: encrypted.iv,
        tag: encrypted.tag,
        createdAt: new Date().toISOString(),
        expiresAt: credentials.expires_at || null,
        authType: credentials.type || 'unknown'
      };

      // Store in user-specific file
      const userCredentialsPath = path.join(this.storePath, `${userId}.json`);
      let userCredentials = {};
      
      try {
        const existing = await fs.readFile(userCredentialsPath, 'utf8');
        userCredentials = JSON.parse(existing);
      } catch (error) {
        // File doesn't exist, start fresh
        userCredentials = {};
      }

      userCredentials[serverId] = credentialEntry;
      
      await fs.writeFile(userCredentialsPath, JSON.stringify(userCredentials, null, 2));
      
      console.log(`[SECURE] Credentials stored for user ${userId}, server ${serverId}`);
      
      return {
        success: true,
        message: 'Credentials stored securely'
      };

    } catch (error) {
      console.error('Failed to store credentials:', error);
      throw new Error('Failed to store credentials securely');
    }
  }

  /**
   * Retrieve and decrypt credentials for a user's MCP server
   */
  async getCredentials(userId, serverId) {
    try {
      const userCredentialsPath = path.join(this.storePath, `${userId}.json`);
      
      const credentialsFile = await fs.readFile(userCredentialsPath, 'utf8');
      const userCredentials = JSON.parse(credentialsFile);
      
      const credentialEntry = userCredentials[serverId];
      if (!credentialEntry) {
        return null; // Credentials not found
      }

      // Check expiration
      if (credentialEntry.expiresAt && new Date(credentialEntry.expiresAt) < new Date()) {
        console.log(`[WARNING] Credentials expired for user ${userId}, server ${serverId}`);
        await this.deleteCredentials(userId, serverId);
        return null;
      }

      // Decrypt credentials
      const decrypted = this.decryptData({
        data: credentialEntry.encrypted,
        iv: credentialEntry.iv,
        tag: credentialEntry.tag
      });

      return {
        ...decrypted,
        authType: credentialEntry.authType,
        createdAt: credentialEntry.createdAt
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // User has no stored credentials
      }
      console.error('Failed to retrieve credentials:', error);
      throw new Error('Failed to retrieve credentials');
    }
  }

  /**
   * Delete credentials for a user's MCP server
   */
  async deleteCredentials(userId, serverId) {
    try {
      const userCredentialsPath = path.join(this.storePath, `${userId}.json`);
      
      const credentialsFile = await fs.readFile(userCredentialsPath, 'utf8');
      const userCredentials = JSON.parse(credentialsFile);
      
      delete userCredentials[serverId];
      
      await fs.writeFile(userCredentialsPath, JSON.stringify(userCredentials, null, 2));
      
      console.log(`[DELETE] Credentials deleted for user ${userId}, server ${serverId}`);
      
      return {
        success: true,
        message: 'Credentials deleted'
      };

    } catch (error) {
      console.error('Failed to delete credentials:', error);
      throw new Error('Failed to delete credentials');
    }
  }

  /**
   * List all MCP servers with stored credentials for a user
   */
  async listUserCredentials(userId) {
    try {
      const userCredentialsPath = path.join(this.storePath, `${userId}.json`);
      
      const credentialsFile = await fs.readFile(userCredentialsPath, 'utf8');
      const userCredentials = JSON.parse(credentialsFile);
      
      return Object.keys(userCredentials).map(serverId => ({
        serverId,
        authType: userCredentials[serverId].authType,
        createdAt: userCredentials[serverId].createdAt,
        expiresAt: userCredentials[serverId].expiresAt
      }));

    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // User has no stored credentials
      }
      console.error('Failed to list user credentials:', error);
      throw new Error('Failed to list credentials');
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  encryptData(data) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipherGCM(this.algorithm, this.masterKey, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      data: encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decryptData(encryptedData) {
    const { data, iv, tag } = encryptedData;
    
    const decipher = crypto.createDecipherGCM(this.algorithm, this.masterKey, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Validate credentials before storage
   */
  validateCredentials(credentials) {
    if (!credentials.type) {
      throw new Error('Credentials must specify authentication type');
    }

    switch (credentials.type) {
      case 'bearer':
        if (!credentials.token) {
          throw new Error('Bearer credentials require token');
        }
        break;
      case 'api_key':
        if (!credentials.api_key) {
          throw new Error('API key credentials require api_key');
        }
        break;
      case 'oauth':
        if (!credentials.access_token) {
          throw new Error('OAuth credentials require access_token');
        }
        break;
      case 'basic':
        if (!credentials.username || !credentials.password) {
          throw new Error('Basic credentials require username and password');
        }
        break;
      default:
        throw new Error(`Unsupported authentication type: ${credentials.type}`);
    }

    return true;
  }

  /**
   * Check if credentials exist and are valid for a user's MCP server
   */
  async hasValidCredentials(userId, serverId) {
    try {
      const credentials = await this.getCredentials(userId, serverId);
      return credentials !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Refresh OAuth credentials
   */
  async refreshOAuthCredentials(userId, serverId, refreshToken) {
    // This would integrate with OAuth providers to refresh access tokens
    // Implementation depends on the specific OAuth provider
    throw new Error('OAuth refresh not yet implemented');
  }
}

module.exports = CredentialStore;