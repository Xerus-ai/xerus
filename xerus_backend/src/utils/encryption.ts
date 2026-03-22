import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const KEY_LENGTH = 32; // 256-bit key

const HKDF_SALT = Buffer.from('xerus-platform-api-key-salt-v1-2025', 'utf8');

const MIN_KEY_BYTES = 32;

function getEncryptionKey(): Buffer {
    const key = process.env.API_KEY_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('API_KEY_ENCRYPTION_KEY environment variable is not set');
    }
    if (Buffer.byteLength(key, 'utf8') < MIN_KEY_BYTES) {
        throw new Error(`API_KEY_ENCRYPTION_KEY must be at least ${MIN_KEY_BYTES} bytes`);
    }
    // Derive a proper 256-bit key using HKDF with application-specific salt
    return Buffer.from(crypto.hkdfSync('sha256', key, HKDF_SALT, 'xerus-api-key-encryption', KEY_LENGTH));
}

const VERSION_PREFIX = 'v2';

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Format: v2:iv:authTag:ciphertext (all hex)
    return `${VERSION_PREFIX}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
        throw new Error('Invalid encrypted text format or unsupported version');
    }

    const iv = Buffer.from(parts[1], 'hex');
    if (iv.length !== IV_LENGTH) {
        throw new Error('Invalid IV length');
    }

    const authTag = Buffer.from(parts[2], 'hex');
    if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('Invalid auth tag length');
    }

    const encryptedData = parts[3];
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export function maskApiKey(apiKey: string): string {
    if (apiKey.length <= 12) {
        return '********';
    }
    return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
}
