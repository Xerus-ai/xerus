const { collection, addDoc, query, getDocs, orderBy, Timestamp } = require('firebase/firestore');
const { getFirestoreInstance } = require('../../../common/services/firebaseClient');
const { createEncryptedConverter } = require('../../../common/repositories/firestoreConverter');

const aiMessageConverter = createEncryptedConverter(['content']);

function aiMessagesCol(sessionId) {
    if (!sessionId) throw new Error("Session ID is required to access AI messages.");
    const db = getFirestoreInstance();
    return collection(db, `sessions/${sessionId}/ai_messages`).withConverter(aiMessageConverter);
}

async function addAiMessage({ uid, sessionId, role, content, model = 'unknown' }) {
    console.log('[SEARCH] [DEBUG] addAiMessage called with:', {
        uid,
        sessionId,
        role,
        model,
        contentLength: content?.length || 0
    });

    const now = Timestamp.now();
    const newMessage = {
        uid, // To identify the author of the message
        session_id: sessionId,
        sent_at: now,
        role,
        content,
        model,
        created_at: now,
    };
    
    console.log('[SEARCH] [DEBUG] Attempting to save message to Firebase with uid:', uid);
    
    try {
        const docRef = await addDoc(aiMessagesCol(sessionId), newMessage);
        console.log('[OK] [DEBUG] Successfully saved message to Firebase with ID:', docRef.id);
        return { id: docRef.id };
    } catch (error) {
        console.log('[ERROR] [DEBUG] Firebase save failed, checking error type:', {
            error: error.message,
            code: error.code,
            name: error.name
        });
        
        // If it's a permissions error and we're in an authenticated state but Firebase client isn't ready
        if (error.code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')) {
            console.log('[LOADING] [DEBUG] Permission denied - Firebase client authentication issue detected');
            console.log('[WARNING] [DEBUG] This indicates user is authenticated but Firebase client is not');
            
            // Re-throw the original error since user rejected workarounds
            // The error will bubble up and inform user of the authentication issue
            throw new Error(`Firebase client authentication required: ${error.message}`);
        }
        
        // For other errors, just re-throw
        throw error;
    }
}

async function getAllAiMessagesBySessionId(sessionId) {
    const q = query(aiMessagesCol(sessionId), orderBy('sent_at', 'asc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data());
}

module.exports = {
    addAiMessage,
    getAllAiMessagesBySessionId,
}; 