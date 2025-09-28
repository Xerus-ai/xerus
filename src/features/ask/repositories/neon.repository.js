/**
 * Neon PostgreSQL Repository for Ask Service
 * Uses backend API for authenticated users
 */

const fetch = require('node-fetch');

const BACKEND_URL = 'http://localhost:5001/api/v1';

async function addAiMessage({ uid, sessionId, role, content, model = 'unknown' }) {
    console.log('[SEARCH] [DEBUG] Neon addAiMessage called with:', {
        uid,
        sessionId,
        role,
        model,
        contentLength: content?.length || 0
    });

    try {
        console.log('[SEARCH] [DEBUG] Attempting to save message to Neon via backend API');
        
        const response = await fetch(`${BACKEND_URL}/conversations/${sessionId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
                'X-User-ID': uid,
            },
            body: JSON.stringify({
                role,
                content,
                model,
                uid,
                processingTime: null,
                tokenCount: null
            })
        });

        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('[OK] [DEBUG] Successfully saved message to Neon with ID:', result.id);
        
        return { id: result.id || result.messageId };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Neon save failed:', {
            error: error.message,
            sessionId,
            uid
        });
        
        // For now, throw a descriptive error
        // TODO: Implement authenticated user support in backend conversations API
        throw new Error(`Neon repository: Backend conversation API needs authenticated user support. ${error.message}`);
    }
}

async function getAllAiMessagesBySessionId(sessionId) {
    console.log('[SEARCH] [DEBUG] Getting all messages for session:', sessionId);
    
    try {
        const response = await fetch(`${BACKEND_URL}/conversations/${sessionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
            }
        });

        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('[OK] [DEBUG] Retrieved messages from Neon:', result.messages?.length || 0);
        
        return result.messages || [];
    } catch (error) {
        console.log('[ERROR] [DEBUG] Failed to get messages from Neon:', error.message);
        throw new Error(`Neon repository: ${error.message}`);
    }
}

module.exports = {
    addAiMessage,
    getAllAiMessagesBySessionId,
};