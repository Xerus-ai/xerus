import { auth as firebaseAuth } from './firebase';
import { 
  FirestoreUserService, 
  FirestoreSessionService, 
  FirestoreTranscriptService, 
  FirestoreAiMessageService, 
  FirestoreSummaryService, 
  FirestorePromptPresetService,
  FirestoreSession,
  FirestoreTranscript,
  FirestoreAiMessage,
  FirestoreSummary,
  FirestorePromptPreset
} from './firestore';
import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  display_name: string;
  email: string;
}

export interface Session {
  id: string;
  uid: string;
  title: string;
  session_type: string;
  started_at: number;
  ended_at?: number;
  sync_state: 'clean' | 'dirty';
  updated_at: number;
}

export interface Transcript {
  id: string;
  session_id: string;
  start_at: number;
  end_at?: number;
  speaker?: string;
  text: string;
  lang?: string;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface AiMessage {
  id: string;
  session_id: string;
  sent_at: number;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  model?: string;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface Summary {
  session_id: string;
  generated_at: number;
  model?: string;
  text: string;
  tldr: string;
  bullet_json: string;
  action_json: string;
  tokens_used?: number;
  updated_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface PromptPreset {
  id: string;
  uid: string;
  title: string;
  prompt: string;
  is_default: 0 | 1;
  created_at: number;
  sync_state: 'clean' | 'dirty';
}

export interface SessionDetails {
    session: Session;
    transcripts: Transcript[];
    ai_messages: AiMessage[];
    summary: Summary | null;
}


const isFirebaseMode = (): boolean => {
  // Use Firebase mode when:
  // 1. In production environment
  // 2. Firebase auth is available and user is authenticated
  const isProduction = process.env.NODE_ENV === 'production' || 
                      (typeof window !== 'undefined' && !window.location.hostname.includes('localhost'));
  
  if (isProduction && typeof window !== 'undefined' && (window as any).firebaseAuth?.currentUser) {
    return true;
  }
  
  // For development, still use backend API mode by default
  return false;
};

const timestampToUnix = (timestamp: Timestamp): number => {
  return timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000);
};

const unixToTimestamp = (unix: number): Timestamp => {
  return Timestamp.fromMillis(unix);
};

const convertFirestoreSession = (session: { id: string } & FirestoreSession, uid: string): Session => {
  return {
    id: session.id,
    uid,
    title: session.title,
    session_type: session.session_type,
    started_at: timestampToUnix(session.startedAt),
    ended_at: session.endedAt ? timestampToUnix(session.endedAt) : undefined,
    sync_state: 'clean',
    updated_at: timestampToUnix(session.startedAt)
  };
};

const convertFirestoreTranscript = (transcript: { id: string } & FirestoreTranscript): Transcript => {
  return {
    id: transcript.id,
    session_id: '',
    start_at: timestampToUnix(transcript.startAt),
    end_at: transcript.endAt ? timestampToUnix(transcript.endAt) : undefined,
    speaker: transcript.speaker,
    text: transcript.text,
    lang: transcript.lang,
    created_at: timestampToUnix(transcript.createdAt),
    sync_state: 'clean'
  };
};

const convertFirestoreAiMessage = (message: { id: string } & FirestoreAiMessage): AiMessage => {
  return {
    id: message.id,
    session_id: '',
    sent_at: timestampToUnix(message.sentAt),
    role: message.role,
    content: message.content,
    tokens: message.tokens,
    model: message.model,
    created_at: timestampToUnix(message.createdAt),
    sync_state: 'clean'
  };
};

const convertFirestoreSummary = (summary: FirestoreSummary, sessionId: string): Summary => {
  return {
    session_id: sessionId,
    generated_at: timestampToUnix(summary.generatedAt),
    model: summary.model,
    text: summary.text,
    tldr: summary.tldr,
    bullet_json: JSON.stringify(summary.bulletPoints),
    action_json: JSON.stringify(summary.actionItems),
    tokens_used: summary.tokensUsed,
    updated_at: timestampToUnix(summary.generatedAt),
    sync_state: 'clean'
  };
};

const convertFirestorePreset = (preset: { id: string } & FirestorePromptPreset, uid: string): PromptPreset => {
  return {
    id: preset.id,
    uid,
    title: preset.title,
    prompt: preset.prompt,
    is_default: preset.isDefault ? 1 : 0,
    created_at: timestampToUnix(preset.createdAt),
    sync_state: 'clean'
  };
};


// Runtime configuration fetched from Electron app
let runtimeConfig: { API_URL: string; WEB_URL: string } | null = null;
let configFetchPromise: Promise<{ API_URL: string; WEB_URL: string }> | null = null;

// Fetch runtime configuration from Electron app with race condition protection
const fetchRuntimeConfig = async (): Promise<{ API_URL: string; WEB_URL: string }> => {
  // Return cached config if available
  if (runtimeConfig) return runtimeConfig;
  
  // Return existing promise to prevent concurrent fetches
  if (configFetchPromise) return configFetchPromise;
  
  // Create new fetch promise with race condition protection
  configFetchPromise = (async () => {
    // Default configuration accessible in both try and catch blocks
    const defaultConfig = {
      API_URL: 'http://localhost:5001/api/v1',
      WEB_URL: 'http://localhost:3000'
    };
    
    try {
      // Try to fetch from limited, known sources only
      const sources = [
        '/runtime-config.json', // Served by current server (dynamic port)
        `http://localhost:${window.location.port}/runtime-config.json`, // Current port explicitly
        'http://localhost:3000/runtime-config.json', // Default Next.js port
        'http://localhost:3001/runtime-config.json', // Alternative port
      ];
      
      for (const source of sources) {
        try {
          const response = await fetch(source, {
            cache: 'no-cache',
            headers: { 'Cache-Control': 'no-cache' }
          });
          if (response.ok) {
            const config = await response.json() as { API_URL: string; WEB_URL: string };
            runtimeConfig = config;
            return config;
          }
        } catch (e) {
          // Continue to next source
        }
      }
      
      // Fallback to default configuration if runtime config not available
      runtimeConfig = defaultConfig;
      return defaultConfig;
      
    } catch (error) {
      runtimeConfig = defaultConfig;
      return defaultConfig;
    } finally {
      // Clear promise after completion
      configFetchPromise = null;
    }
  })();
  
  return configFetchPromise;
};

// Updated API base URL function
export const getApiBaseUrl = async (): Promise<string> => {
  try {
    const response = await fetch('/runtime-config.json');
    if (response.ok) {
      const config = await response.json();
      return config.API_URL;
    }
  } catch (error) {
    // Use fallback
  }
  
  const fallbackUrl = 'http://localhost:5001/api/v1';
  return fallbackUrl;
};

// User management functions
const userInfoListeners: Array<(userInfo: UserProfile | null) => void> = [];

export const getUserInfo = (): UserProfile | null => {
  if (typeof window === 'undefined') return null;
  
  const storedUserInfo = localStorage.getItem('xerus_user');
  if (storedUserInfo) {
    try {
      return JSON.parse(storedUserInfo);
    } catch (error) {
      console.error('Failed to parse user info:', error);
      localStorage.removeItem('xerus_user');
    }
  }
  return null;
};

export const setUserInfo = (userInfo: UserProfile | null, skipEvents: boolean = false) => {
  if (typeof window === 'undefined') return;
  
  if (userInfo) {
    localStorage.setItem('xerus_user', JSON.stringify(userInfo));
  } else {
    localStorage.removeItem('xerus_user');
  }
  
  if (!skipEvents) {
    userInfoListeners.forEach(listener => listener(userInfo));
    window.dispatchEvent(new Event('userInfoChanged'));
  }
};

export const onUserInfoChange = (listener: (userInfo: UserProfile | null) => void) => {
  userInfoListeners.push(listener);
  
  return () => {
    const index = userInfoListeners.indexOf(listener);
    if (index > -1) {
      userInfoListeners.splice(index, 1);
    }
  };
};

export const getApiHeaders = async (excludeContentType: boolean = false): Promise<HeadersInit> => {
  const headers: HeadersInit = {};
  
  // Only add Content-Type if not excluded (needed for FormData uploads)
  if (!excludeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  
  const userInfo = getUserInfo();
  
  // Environment detection
  const isDev = process.env.NODE_ENV === 'development' || 
                (typeof window !== 'undefined' && (
                  window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1'
                ));
  
  // Priority 1: Firebase authenticated users should ALWAYS use Firebase tokens
  // This takes precedence over guest mode preferences
  if (typeof window !== 'undefined' && firebaseAuth?.currentUser) {
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-User-ID'] = userInfo?.uid || firebaseAuth.currentUser.uid;
      
      return headers;
    } catch (error) {
      // In development, fall back to development token if Firebase fails
      if (isDev) {
        headers['Authorization'] = 'Bearer development_token';
        headers['X-User-ID'] = userInfo?.uid || 'admin_user';
        return headers;
      }
      
      // In production, never fall back - throw error
      throw new Error('Authentication failed. Please sign out and sign back in.');
    }
  }
  
  // Priority 2: Development mode fallback for non-authenticated users
  if (isDev) {
    headers['Authorization'] = 'Bearer development_token';
    headers['X-User-ID'] = userInfo?.uid || 'admin_user';
    return headers;
  }
  
  // Priority 3: Guest mode (lowest priority - only when no Firebase user and not dev mode)
  const isGuestMode = localStorage.getItem('prefer_guest_mode') === 'true';
  const guestSession = localStorage.getItem('guest_session');
  
  if (isGuestMode && guestSession) {
    // Guest mode - use guest session
    headers['Authorization'] = 'guest';
    headers['X-Guest-Session'] = guestSession;
    return headers;
  }
  
  // Production without any authentication
  throw new Error('Authentication required. Please sign in.');
  
  return headers;
};


// Updated apiCall function with enhanced error handling
const apiCall = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const baseUrl = await getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  
  // API call logging removed
  
  const apiHeaders = await getApiHeaders();
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...apiHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
      
      if (!response.ok) {
        let errorMessage = `API call failed: ${response.status} ${response.statusText}`;
        
        // Try to get more detailed error message from response
        try {
          const errorData = await response.clone().json();
          if (errorData.error || errorData.message) {
            errorMessage = errorData.error || errorData.message;
          }
        } catch (parseError) {
          // If JSON parsing fails, keep the original error message
        }
        
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        throw error;
      }
      
      return response;
    } catch (error) {
      // Enhance error with more context
      if (error instanceof Error) {
        if (error.message === 'Failed to fetch') {
          error.message = 'Network error: Unable to reach the server. Please check if the backend is running.';
        } else if (error.message === 'Request timeout') {
          error.message = 'Request timeout: The server took too long to respond.';
        }
      }
      
      throw error;
    }
};


export const searchConversations = async (query: string): Promise<Session[]> => {
  if (!query.trim()) {
    return [];
  }

  if (isFirebaseMode()) {
    const sessions = await getSessions();
    return sessions.filter(session => 
      session.title.toLowerCase().includes(query.toLowerCase())
    );
  } else {
    const response = await apiCall(`/conversations/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error('Failed to search conversations');
    }
    return response.json();
  }
};

export const getSessions = async (): Promise<Session[]> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    const firestoreSessions = await FirestoreSessionService.getSessions(uid);
    return firestoreSessions.map(session => convertFirestoreSession(session, uid));
  } else {
    const response = await apiCall(`/conversations`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch sessions');
    return response.json();
  }
};

export const getSessionDetails = async (sessionId: string): Promise<SessionDetails> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    
    const [session, transcripts, aiMessages, summary] = await Promise.all([
      FirestoreSessionService.getSession(uid, sessionId),
      FirestoreTranscriptService.getTranscripts(uid, sessionId),
      FirestoreAiMessageService.getAiMessages(uid, sessionId),
      FirestoreSummaryService.getSummary(uid, sessionId)
    ]);

    if (!session) {
      throw new Error('Session not found');
    }

    return {
      session: convertFirestoreSession({ id: sessionId, ...session }, uid),
      transcripts: transcripts.map(t => ({ ...convertFirestoreTranscript(t), session_id: sessionId })),
      ai_messages: aiMessages.map(m => ({ ...convertFirestoreAiMessage(m), session_id: sessionId })),
      summary: summary ? convertFirestoreSummary(summary, sessionId) : null
    };
  } else {
    const response = await apiCall(`/conversations/${sessionId}`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch session details');
    return response.json();
  }
};

export const createSession = async (title?: string): Promise<{ id: string }> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    const sessionId = await FirestoreSessionService.createSession(uid, {
      title: title || 'New Session',
      session_type: 'ask',
      endedAt: undefined
    });
    return { id: sessionId };
  } else {
    const response = await apiCall(`/conversations`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    if (!response.ok) throw new Error('Failed to create session');
    return response.json();
  }
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    await FirestoreSessionService.deleteSession(uid, sessionId);
  } else {
    const response = await apiCall(`/conversations/${sessionId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete session');
  }
};

export const getUserProfile = async (): Promise<UserProfile> => {
  if (isFirebaseMode()) {
    const user = firebaseAuth.currentUser!;
    const firestoreProfile = await FirestoreUserService.getUser(user.uid);
    
    return {
      uid: user.uid,
      display_name: firestoreProfile?.displayName || user.displayName || 'User',
      email: firestoreProfile?.email || user.email || 'no-email@example.com'
    };
  } else {
    const response = await apiCall(`/user/profile`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return response.json();
  }
};

export const updateUserProfile = async (data: { displayName: string }): Promise<void> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    await FirestoreUserService.updateUser(uid, { displayName: data.displayName });
  } else {
    const response = await apiCall(`/user/profile`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update user profile');
  }
};

export const findOrCreateUser = async (user: UserProfile): Promise<UserProfile> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    const existingUser = await FirestoreUserService.getUser(uid);
    
    if (!existingUser) {
      await FirestoreUserService.createUser(uid, {
        displayName: user.display_name,
        email: user.email
      });
    }
    
    return user;
  } else {
    const response = await apiCall(`/user/find-or-create`, {
        method: 'POST',
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          display_name: user.display_name
        }),
    });
    if (!response.ok) throw new Error('Failed to find or create user');
    return response.json();
  }
};

export const saveApiKey = async (apiKey: string, provider: string): Promise<void> => {
  if (isFirebaseMode()) {
    return;
  } else {
    const response = await apiCall(`/user/api-key`, {
        method: 'POST',
        body: JSON.stringify({ apiKey, provider }),
    });
    if (!response.ok) throw new Error('Failed to save API key');
  }
};

export const checkApiKeyStatus = async (): Promise<{ [provider: string]: boolean }> => {
  if (isFirebaseMode()) {
    return { openai: true, gemini: true, anthropic: true, ollama: true, whisper: true };
  } else {
    const response = await apiCall(`/user/api-key-status`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to check API key status');
    const data = await response.json();
    // Return just the status object, not the entire response
    return data.status || data;
  }
};

export const deleteApiKey = async (provider: string): Promise<void> => {
  if (isFirebaseMode()) {
    return;
  } else {
    const response = await apiCall(`/user/api-key`, {
      method: 'DELETE',
      body: JSON.stringify({ provider }),
    });
    if (!response.ok) throw new Error('Failed to delete API key');
  }
};

export const getAllApiKeys = async (): Promise<{ [provider: string]: string | null }> => {
  if (isFirebaseMode()) {
    return {};
  } else {
    const response = await apiCall(`/user/api-keys`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to get API keys');
    return response.json();
  }
};

export const deleteAccount = async (): Promise<void> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    
    await FirestoreUserService.deleteUser(uid);
    
    await firebaseAuth.currentUser!.delete();
  } else {
    const response = await apiCall(`/user/profile`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete account');
  }
};

export const getPresets = async (): Promise<PromptPreset[]> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    const firestorePresets = await FirestorePromptPresetService.getPresets(uid);
    return firestorePresets.map(preset => convertFirestorePreset(preset, uid));
  } else {
    const response = await apiCall(`/presets`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch presets');
    return response.json();
  }
};

export const createPreset = async (data: { title: string, prompt: string }): Promise<{ id: string }> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    const presetId = await FirestorePromptPresetService.createPreset(uid, {
      title: data.title,
      prompt: data.prompt,
      isDefault: false
    });
    return { id: presetId };
  } else {
    const response = await apiCall(`/presets`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create preset');
    return response.json();
  }
};

export const updatePreset = async (id: string, data: { title: string, prompt: string }): Promise<void> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    await FirestorePromptPresetService.updatePreset(uid, id, {
      title: data.title,
      prompt: data.prompt
    });
  } else {
    const response = await apiCall(`/presets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update preset: ${response.status} ${errorText}`);
    }
  }
};

export const deletePreset = async (id: string): Promise<void> => {
  if (isFirebaseMode()) {
    const uid = firebaseAuth.currentUser!.uid;
    await FirestorePromptPresetService.deletePreset(uid, id);
  } else {
    const response = await apiCall(`/presets/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete preset');
  }
};

export interface BatchData {
    profile?: UserProfile;
    presets?: PromptPreset[];
    sessions?: Session[];
}

export const getBatchData = async (includes: ('profile' | 'presets' | 'sessions')[]): Promise<BatchData> => {
  if (isFirebaseMode()) {
    const result: BatchData = {};
    
    const promises: Promise<any>[] = [];
    
    if (includes.includes('profile')) {
      promises.push(getUserProfile().then(profile => ({ type: 'profile', data: profile })));
    }
    if (includes.includes('presets')) {
      promises.push(getPresets().then(presets => ({ type: 'presets', data: presets })));
    }
    if (includes.includes('sessions')) {
      promises.push(getSessions().then(sessions => ({ type: 'sessions', data: sessions })));
    }
    
    const results = await Promise.all(promises);
    
    results.forEach(({ type, data }) => {
      result[type as keyof BatchData] = data;
    });
    
    return result;
  } else {
    const response = await apiCall(`/user/batch?include=${includes.join(',')}`, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to fetch batch data');
    return response.json();
  }
};

export const logout = async () => {
  if (isFirebaseMode()) {
    const { signOut } = await import('firebase/auth');
    await signOut(firebaseAuth);
  }
  
  setUserInfo(null);
  
  localStorage.removeItem('openai_api_key');
  localStorage.removeItem('xerus_user');
  
  window.location.href = '/login';
}; 

// Add assistant-related types and functions
export interface Assistant {
  id: string
  name: string
  description: string
  avatar: string
  category: string
  status: 'active' | 'inactive'
  usageCount: number
  lastUsed: string
  capabilities: string[]
  knowledgeBase: string[]
  tools: string[]
  prompt: string
  isDefault: boolean
  createdAt: string
  model?: string // AI model being used (e.g., "GPT-4", "Claude-3", "Gemini-Pro")
}

// Get all assistants
export const getAssistants = async (): Promise<Assistant[]> => {
  const response = await apiCall('/agents', { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch assistants');
  
  const agents = await response.json();
  
  // Map backend agent data to frontend Assistant format
  return agents.map((agent: any) => ({
    id: agent.id.toString(),
    name: agent.name || 'Unnamed Agent',
    description: agent.description || '',
    avatar: agent.name ? agent.name.charAt(0).toUpperCase() : 'A',
    category: agent.personality_type || 'general',
    status: agent.is_active ? 'active' : 'inactive',
    usageCount: agent.usage_count || 0,
    lastUsed: agent.updated_at || agent.created_at || new Date().toISOString(),
    capabilities: agent.capabilities || [],
    knowledgeBase: agent.search_all_knowledge ? ['all'] : [],
    tools: agent.web_search_enabled ? ['web_search'] : [],
    prompt: agent.system_prompt || '',
    isDefault: agent.is_default || false,
    createdAt: agent.created_at || new Date().toISOString(),
    model: agent.ai_model
  }));
};

// Get single assistant by ID
export const getAssistant = async (id: string): Promise<Assistant | null> => {
  try {
    // Fetch agent data, assigned documents, and assigned tools in parallel
    const [agentResponse, documentsResponse, toolsResponse] = await Promise.allSettled([
      apiCall(`/agents/${id}`, { method: 'GET' }),
      apiCall(`/agents/${id}/documents`, { method: 'GET' }),
      apiCall(`/agents/${id}/tools`, { method: 'GET' })
    ]);
    
    // Check if agent request failed
    if (agentResponse.status === 'rejected') {
      throw new Error('Failed to fetch assistant');
    }
    
    if (!agentResponse.value.ok) {
      if (agentResponse.value.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch assistant');
    }
    
    const agent = await agentResponse.value.json();
    
    // Determine knowledgeBase based on search_all_knowledge flag and assigned documents
    let knowledgeBase: string[] = [];
    
    if (agent.search_all_knowledge) {
      // If search_all_knowledge is enabled, agent has access to all documents
      knowledgeBase = ['all'];
    } else {
      // Otherwise, get assigned document IDs (fallback to empty array if documents request failed)
      if (documentsResponse.status === 'fulfilled' && documentsResponse.value.ok) {
        try {
          const documentsData = await documentsResponse.value.json();
          knowledgeBase = documentsData.documents?.map((doc: any) => doc.id.toString()) || [];
        } catch (error) {
          // Failed to parse assigned documents
        }
      } else {
        // Failed to fetch assigned documents for agent
      }
    }

    // Get assigned tools (fallback to empty array if tools request failed)
    let assignedTools: string[] = [];
    if (toolsResponse.status === 'fulfilled' && toolsResponse.value.ok) {
      try {
        const toolsData = await toolsResponse.value.json();
        assignedTools = toolsData.tools || [];
      } catch (error) {
        console.warn('Failed to parse assigned tools for agent', id);
        // Failed to parse assigned tools - fallback to empty array
      }
    }
    
    // Include web_search in tools if it's enabled and not already in assigned tools
    if (agent.web_search_enabled && !assignedTools.includes('web_search')) {
      assignedTools.push('web_search');
    }
    
    // Map backend agent data to frontend Assistant format
    return {
      id: agent.id.toString(),
      name: agent.name || 'Unnamed Agent',
      description: agent.description || '',
      avatar: agent.name ? agent.name.charAt(0).toUpperCase() : 'A',
      category: agent.personality_type || 'general',
      status: agent.is_active ? 'active' : 'inactive',
      usageCount: agent.usage_count || 0,
      lastUsed: agent.updated_at || agent.created_at || new Date().toISOString(),
      capabilities: agent.capabilities || [],
      knowledgeBase: knowledgeBase, // Properly handle both search_all_knowledge and assigned documents
      tools: assignedTools,
      prompt: agent.system_prompt || '',
      isDefault: agent.is_default || false,
      createdAt: agent.created_at || new Date().toISOString(),
      model: agent.ai_model
    };
  } catch (error) {
    console.error(`Failed to fetch assistant ${id}:`, error);
    return null;
  }
};

// Create new assistant
export const createAssistant = async (assistant: Omit<Assistant, 'id' | 'createdAt' | 'usageCount' | 'lastUsed'>): Promise<Assistant> => {
  // Map frontend Assistant to backend agent format
  const agentData = {
    name: assistant.name,
    description: assistant.description,
    system_prompt: assistant.prompt,
    personality_type: assistant.category,
    is_active: assistant.status === 'active',
    web_search_enabled: assistant.tools.includes('web_search'),
    search_all_knowledge: assistant.knowledgeBase.includes('all'),
    capabilities: assistant.capabilities,
    is_default: assistant.isDefault,
    ai_model: assistant.model || 'GPT-4'
  };
  
  const response = await apiCall('/agents', {
    method: 'POST',
    body: JSON.stringify(agentData)
  });
  
  if (!response.ok) throw new Error('Failed to create assistant');
  
  const agent = await response.json();
  
  // Map backend agent data to frontend Assistant format
  return {
    id: agent.id.toString(),
    name: agent.name || 'Unnamed Agent',
    description: agent.description || '',
    avatar: agent.name ? agent.name.charAt(0).toUpperCase() : 'A',
    category: agent.personality_type || 'general',
    status: agent.is_active ? 'active' : 'inactive',
    usageCount: agent.usage_count || 0,
    lastUsed: agent.updated_at || agent.created_at || new Date().toISOString(),
    capabilities: agent.capabilities || [],
    knowledgeBase: agent.search_all_knowledge ? ['all'] : [],
    tools: agent.web_search_enabled ? ['web_search'] : [],
    prompt: agent.system_prompt || '',
    isDefault: agent.is_default || false,
    createdAt: agent.created_at || new Date().toISOString(),
    model: agent.ai_model
  };
};

// Update assistant
export const updateAssistant = async (id: string, updates: Partial<Assistant>): Promise<void> => {
  // Map frontend Assistant updates to backend agent format
  const agentUpdates: any = {};
  
  if (updates.name !== undefined) agentUpdates.name = updates.name;
  if (updates.description !== undefined) agentUpdates.description = updates.description;
  if (updates.prompt !== undefined) agentUpdates.system_prompt = updates.prompt;
  if (updates.category !== undefined) agentUpdates.personality_type = updates.category;
  if (updates.status !== undefined) agentUpdates.is_active = updates.status === 'active';
  if (updates.tools !== undefined) agentUpdates.web_search_enabled = updates.tools.includes('web_search');
  if (updates.knowledgeBase !== undefined) agentUpdates.search_all_knowledge = updates.knowledgeBase.includes('all');
  if (updates.capabilities !== undefined) agentUpdates.capabilities = updates.capabilities;
  if (updates.isDefault !== undefined) agentUpdates.is_default = updates.isDefault;
  if (updates.model !== undefined) agentUpdates.ai_model = updates.model;
  
  const response = await apiCall(`/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(agentUpdates)
  });
  
  if (!response.ok) throw new Error('Failed to update assistant');
};

// Update agent (using backend agents API)
export const updateAgent = async (id: string, updates: Partial<{
  name: string;
  description: string;
  system_prompt: string;
  capabilities: string[];
  personality_type: string;
  is_active: boolean;
  ai_model: string;
  web_search_enabled: boolean;
  search_all_knowledge: boolean;
  knowledgeBase: string[]; // Frontend field that needs mapping
}>): Promise<Assistant> => {
  // Map frontend fields to backend fields
  const backendUpdates: any = { ...updates };
  
  // Map knowledgeBase to both search_all_knowledge and document assignments
  if ('knowledgeBase' in updates) {
    const knowledgeBase = updates.knowledgeBase || [];
    
    // Ensure all IDs are strings to prevent mixed type arrays
    const normalizedKnowledgeBase = knowledgeBase.map((id: any) => String(id));
    
    if (normalizedKnowledgeBase.includes('all')) {
      // User enabled "Add all workspace content"
      backendUpdates.search_all_knowledge = true;
      // Don't send knowledgeBase field to backend (let search_all_knowledge take precedence)
      delete backendUpdates.knowledgeBase;
    } else {
      // User selected specific documents
      backendUpdates.search_all_knowledge = false;
      backendUpdates.knowledgeBase = normalizedKnowledgeBase; // Keep the field for backend processing
    }
    
    // Knowledge base normalized for backend
  }
  
  const response = await apiCall(`/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(backendUpdates)
  });
  
  if (!response.ok) throw new Error('Failed to update agent');
  
  const agent = await response.json();
  
  // Fetch assigned documents to get the complete knowledgeBase
  let knowledgeBase: string[] = [];
  try {
    if (agent.search_all_knowledge) {
      knowledgeBase = ['all'];
      // Agent has search_all_knowledge enabled
    } else {
      // Fetch assigned documents for this agent
      const documentsResponse = await apiCall(`/agents/${id}/documents`, { method: 'GET' });
      
      if (documentsResponse.ok) {
        const documentsData = await documentsResponse.json();
        knowledgeBase = documentsData.documents?.map((doc: any) => doc.id.toString()) || [];
      } else {
        knowledgeBase = [];
      }
    }
  } catch (error) {
    // Fallback to search_all_knowledge only
    knowledgeBase = agent.search_all_knowledge ? ['all'] : [];
  }
  
  // Map backend agent data to frontend Assistant format
  return {
    id: agent.id.toString(),
    name: agent.name || 'Unnamed Agent',
    description: agent.description || '',
    avatar: agent.name ? agent.name.charAt(0).toUpperCase() : 'A',
    category: agent.personality_type || 'general',
    status: agent.is_active ? 'active' : 'inactive',
    usageCount: agent.usage_count || 0,
    lastUsed: agent.updated_at || agent.created_at || new Date().toISOString(),
    capabilities: agent.capabilities || [],
    knowledgeBase: knowledgeBase,
    tools: agent.web_search_enabled ? ['web_search'] : [],
    prompt: agent.system_prompt || '',
    isDefault: agent.is_default || false,
    createdAt: agent.created_at || new Date().toISOString(),
    model: agent.ai_model
  };
};

// Delete assistant
export const deleteAssistant = async (id: string): Promise<void> => {
  const response = await apiCall(`/agents/${id}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) throw new Error('Failed to delete assistant');
};

// Knowledge Base Interfaces
export interface KnowledgeDocument {
  id: string;
  title: string;
  content_type: string;
  file_path: string;
  file_size: number;
  is_indexed: boolean;
  folder_id?: string;
  folder_name?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface KnowledgeFolder {
  id: string;
  name: string;
  parent_id?: string;
  color: string;
  icon_emoji: string;
  description?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

// Knowledge Base API Functions

// Get user's knowledge documents
export const getKnowledgeDocuments = async (filters: {
  search?: string;
  folder_id?: string;
  content_type?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<KnowledgeDocument[]> => {
  const params = new URLSearchParams();
  
  if (filters.search) params.append('search', filters.search);
  if (filters.folder_id) params.append('folder_id', filters.folder_id);
  if (filters.content_type) params.append('content_type', filters.content_type);
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());

  const response = await apiCall(`/knowledge?${params.toString()}`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch knowledge documents');
  
  return await response.json();
};

// Get user's knowledge folders
export const getKnowledgeFolders = async (filters: {
  parent_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<KnowledgeFolder[]> => {
  const params = new URLSearchParams();
  
  if (filters.parent_id) params.append('parent_id', filters.parent_id);
  if (filters.search) params.append('search', filters.search);
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());

  const response = await apiCall(`/knowledge/folders?${params.toString()}`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch knowledge folders');
  
  return await response.json();
};

// Search knowledge documents
export const searchKnowledgeDocuments = async (query: string, filters: {
  folder_id?: string;
  content_type?: string;
  limit?: number;
} = {}): Promise<KnowledgeDocument[]> => {
  const params = new URLSearchParams();
  params.append('search', query);
  
  if (filters.folder_id) params.append('folder_id', filters.folder_id);
  if (filters.content_type) params.append('content_type', filters.content_type);
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await apiCall(`/knowledge/search?${params.toString()}`, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to search knowledge documents');
  
  const result = await response.json();
  return result.results || result; // Handle different response formats
};

// Create knowledge folder
export const createKnowledgeFolder = async (folderData: {
  name: string;
  parent_id?: string;
  color?: string;
  icon_emoji?: string;
  description?: string;
}): Promise<KnowledgeFolder> => {
  const response = await apiCall('/knowledge/folders', {
    method: 'POST',
    body: JSON.stringify(folderData)
  });
  
  if (!response.ok) throw new Error('Failed to create folder');
  
  return await response.json();
};

// Tool interface for consistent typing
export interface Tool {
  id: string;
  name: string;
  tool_name?: string;
  description: string;
  icon: string;
  category: string;
  status: 'active' | 'inactive';
  is_enabled: boolean;
  usage_count: number;
  execution_count?: number;
  last_used: string | null;
  last_executed_at?: string;
  execution_time_avg: number;
  avg_execution_time?: number;
  success_rate: number;
  parameters: any;
  configuration?: any;
  provider: string;
  version: string;
  requires_auth?: boolean;
  auth_type?: 'oauth' | 'api_key' | null | string;
  is_configured?: boolean;
  token_info?: {
    expires_at?: string | null;
    has_refresh_token?: boolean;
  } | null;
  auth_status_checked?: boolean;
  mcp_server?: boolean;
  mcp_server_id?: string;
  server_status?: 'running' | 'stopped';
  capabilities?: string[];
  tool_count?: number;
  docker_image?: string;
  api_endpoint?: string;
  oauth_configured?: boolean;
  oauth_token_expires?: string;
  oauth_token_valid?: boolean;
  authentication_status?: 'authenticated' | 'not_configured';
}

// Fetch all available tools from API
export const getTools = async (): Promise<Tool[]> => {
  const response = await apiCall('/tools', { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch tools');
  
  const toolsData = await response.json();
  
  // Map backend tool_configurations data to frontend Tool format
  const mappedTools = await Promise.all(toolsData.map(async (tool: any): Promise<Tool> => {
    const baseToolData: Tool = {
      id: tool.id?.toString() || tool.tool_name,
      name: tool.display_name || tool.tool_name || tool.name || 'Unnamed Tool',
      tool_name: tool.tool_name,
      description: tool.description || '',
      icon: tool.icon || '🔧',
      category: tool.category || 'utility',
      status: tool.is_enabled ? 'active' : 'inactive',
      is_enabled: tool.is_enabled || false,
      usage_count: tool.execution_count || 0,
      execution_count: tool.execution_count,
      last_used: tool.last_executed_at || null,
      last_executed_at: tool.last_executed_at,
      execution_time_avg: tool.avg_execution_time || 0,
      avg_execution_time: tool.avg_execution_time,
      success_rate: tool.success_rate || 0,
      configuration: tool.configuration || {},
      parameters: tool.parameters || [],
      provider: tool.provider || 'unknown',
      version: tool.version || '1.0.0',
      requires_auth: tool.requires_auth || false,
      auth_type: tool.auth_type || null,
      is_configured: tool.is_configured || false,
      api_endpoint: tool.api_endpoint || null,
      mcp_server: tool.mcp_server || false,
      mcp_server_id: tool.mcp_server_id || null,
      server_status: tool.server_status || null,
      capabilities: tool.capabilities || [],
      tool_count: tool.tool_count || 0,
      oauth_configured: tool.oauth_configured || false,
      oauth_token_expires: tool.oauth_token_expires || null,
      oauth_token_valid: tool.oauth_token_valid || false,
      authentication_status: tool.authentication_status || 'not_configured',
      token_info: null,
      auth_status_checked: false
    };

    // Fetch detailed per-user authentication status for tools that require auth
    if (baseToolData.requires_auth) {
      try {
        const authToolName = baseToolData.mcp_server ? baseToolData.mcp_server_id : (baseToolData.tool_name || baseToolData.name);
        const authResponse = await apiCall(`/tools/${authToolName}/auth/status`, { method: 'GET' });
        
        if (authResponse.ok) {
          const authStatus = await authResponse.json();
          baseToolData.is_configured = authStatus.is_authenticated || false;
          baseToolData.token_info = authStatus.token_info || null;
          baseToolData.auth_status_checked = true;
        }
      } catch (authErr) {
        console.warn(`Failed to fetch auth status for ${baseToolData.name}:`, authErr);
      }
    }

    return baseToolData;
  }));
  
  return mappedTools;
};

// Get assigned tools for an agent
export const getAgentTools = async (agentId: string): Promise<string[]> => {
  const response = await apiCall(`/agents/${agentId}/tools`);
  if (!response.ok) throw new Error('Failed to fetch agent tools');
  
  const data = await response.json();
  return data.tools || [];
};

// Assign/unassign tools to an agent
export const updateAgentTools = async (agentId: string, toolIds: string[]): Promise<void> => {
  const response = await apiCall(`/agents/${agentId}/tools`, {
    method: 'PUT',
    body: JSON.stringify({ tool_ids: toolIds })
  });
  
  if (!response.ok) throw new Error('Failed to update agent tools');
}; 