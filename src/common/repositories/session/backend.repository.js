/**
 * Backend API Session Repository
 * Uses backend conversation API instead of Firebase
 */

const fetch = require('node-fetch');
const { createLogger } = require('../../services/logger.js');

const logger = createLogger('Backend.SessionRepository');

const BACKEND_URL = 'http://localhost:5001/api/v1';

async function getById(id) {
    console.log('[SEARCH] [DEBUG] Backend getById called with:', { id });
    
    try {
        const response = await fetch(`${BACKEND_URL}/conversations/${id}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log('[SEARCH] [DEBUG] Conversation not found:', id);
                return null;
            }
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('[OK] [DEBUG] Retrieved conversation from backend:', result.id);
        
        // Convert backend conversation format to session format
        return {
            id: result.id,
            uid: result.user_id,
            members: [result.user_id],
            title: result.title,
            session_type: result.agentType || 'ask',
            started_at: result.created_at,
            updated_at: result.updated_at,
            ended_at: null, // Backend doesn't track ended sessions yet
            metadata: result.metadata || {}
        };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend getById failed:', { error: error.message, id });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function create(uid, type = 'ask') {
    console.log('[SEARCH] [DEBUG] Backend create called with:', { uid, type });
    
    try {
        const response = await fetch(`${BACKEND_URL}/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
                'X-User-ID': uid,
            },
            body: JSON.stringify({
                title: `Session @ ${new Date().toLocaleTimeString()}`,
                agentType: type,
                metadata: {}
            })
        });

        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('[OK] [DEBUG] Successfully created conversation with ID:', result.id);
        logger.info(`Backend: Created session ${result.id} for user ${uid}`);
        
        return result.id;
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend create failed:', { error: error.message, uid, type });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function getAllByUserId(uid) {
    console.log('[SEARCH] [DEBUG] Backend getAllByUserId called with:', { uid });
    
    try {
        const response = await fetch(`${BACKEND_URL}/conversations?limit=50`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
                'X-User-ID': uid,
            }
        });

        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        const conversations = await response.json();
        console.log('[OK] [DEBUG] Retrieved conversations from backend:', conversations.length);
        
        // Convert backend conversation format to session format
        return conversations.map(conv => ({
            id: conv.id,
            uid: conv.user_id,
            members: [conv.user_id],
            title: conv.title,
            session_type: conv.agentType || 'ask',
            started_at: conv.created_at,
            updated_at: conv.updated_at,
            ended_at: null,
            metadata: conv.metadata || {}
        }));
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend getAllByUserId failed:', { error: error.message, uid });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function updateTitle(id, title) {
    console.log('[SEARCH] [DEBUG] Backend updateTitle called with:', { id, title });
    
    try {
        const response = await fetch(`${BACKEND_URL}/conversations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
            },
            body: JSON.stringify({ title })
        });

        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        console.log('[OK] [DEBUG] Successfully updated conversation title');
        return { changes: 1 };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend updateTitle failed:', { error: error.message, id, title });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function deleteWithRelatedData(id) {
    console.log('[SEARCH] [DEBUG] Backend deleteWithRelatedData called with:', { id });
    
    try {
        const response = await fetch(`${BACKEND_URL}/conversations/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log('[SEARCH] [DEBUG] Conversation not found for deletion:', id);
                return { success: true };
            }
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        console.log('[OK] [DEBUG] Successfully deleted conversation and related data');
        return { success: true };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend deleteWithRelatedData failed:', { error: error.message, id });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function end(id) {
    console.log('[SEARCH] [DEBUG] Backend end called with:', { id });
    
    try {
        // Backend doesn't currently support ending sessions, but we can update metadata
        const response = await fetch(`${BACKEND_URL}/conversations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
            },
            body: JSON.stringify({ 
                metadata: { ended_at: Math.floor(Date.now() / 1000) }
            })
        });

        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        console.log('[OK] [DEBUG] Successfully ended session');
        return { changes: 1 };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend end failed:', { error: error.message, id });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function updateType(id, type) {
    console.log('[SEARCH] [DEBUG] Backend updateType called with:', { id, type });
    
    try {
        const response = await fetch(`${BACKEND_URL}/conversations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
            },
            body: JSON.stringify({ 
                metadata: { session_type: type }
            })
        });

        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        console.log('[OK] [DEBUG] Successfully updated session type');
        return { changes: 1 };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend updateType failed:', { error: error.message, id, type });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function touch(id) {
    console.log('[SEARCH] [DEBUG] Backend touch called with:', { id });
    
    try {
        // Touch by updating metadata with current timestamp
        const response = await fetch(`${BACKEND_URL}/conversations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer development_token',
            },
            body: JSON.stringify({ 
                metadata: { last_touched: Math.floor(Date.now() / 1000) }
            })
        });

        if (!response.ok) {
            // If session doesn't exist (404), silently ignore - it will be created when needed
            if (response.status === 404) {
                console.log('[WARNING] [DEBUG] Session does not exist - will be created when needed:', { id });
                return { changes: 0 };
            }
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        console.log('[OK] [DEBUG] Successfully touched session');
        return { changes: 1 };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend touch failed:', { error: error.message, id });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function getOrCreateActive(uid, requestedType = 'ask') {
    console.log('[SEARCH] [DEBUG] Backend getOrCreateActive called with:', { uid, requestedType });
    
    try {
        // Get all conversations for the user
        const conversations = await getAllByUserId(uid);
        
        // Find active session (one without ended_at or with recent activity)
        const activeSession = conversations.find(session => {
            return !session.ended_at || !session.metadata?.ended_at;
        });

        if (activeSession) {
            console.log('[OK] [DEBUG] Found active backend session:', activeSession.id);
            logger.info('Found active Backend session');
            
            // Update session type if needed and touch it
            if (activeSession.session_type === 'ask' && requestedType === 'listen') {
                await updateType(activeSession.id, 'listen');
                logger.info(`Promoted Backend session ${activeSession.id} to 'listen' type.`);
            }
            
            try {
                await touch(activeSession.id);
                return activeSession.id;
            } catch (touchError) {
                // If touch fails (session doesn't exist), create a new session instead
                console.log('[WARNING] [DEBUG] Active session not found in backend, creating new session');
                logger.warn('Active session not found in backend, creating new session');
                return await create(uid, requestedType);
            }
        } else {
            console.log('[OK] [DEBUG] No active backend session for user. Creating new.');
            logger.info('No active Backend session for user. Creating new.');
            return await create(uid, requestedType);
        }
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend getOrCreateActive failed:', { error: error.message, uid, requestedType });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

async function endAllActiveSessions(uid) {
    console.log('[SEARCH] [DEBUG] Backend endAllActiveSessions called with:', { uid });
    
    try {
        const conversations = await getAllByUserId(uid);
        
        // Find active sessions
        const activeSessions = conversations.filter(session => {
            return !session.ended_at && !session.metadata?.ended_at;
        });

        if (activeSessions.length === 0) {
            return { changes: 0 };
        }

        // End all active sessions
        await Promise.all(
            activeSessions.map(session => end(session.id))
        );

        console.log('[OK] [DEBUG] Ended all active sessions for user');
        logger.info(`Ended ${activeSessions.length} active session(s) for user.`);
        return { changes: activeSessions.length };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Backend endAllActiveSessions failed:', { error: error.message, uid });
        throw new Error(`Backend session repository: ${error.message}`);
    }
}

module.exports = {
    getById,
    create,
    getAllByUserId,
    updateTitle,
    deleteWithRelatedData,
    end,
    updateType,
    touch,
    getOrCreateActive,
    endAllActiveSessions,
};