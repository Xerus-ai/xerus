import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserProfile, setUserInfo, findOrCreateUser } from './api'
import { auth as firebaseAuth } from './firebase'
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth'

const defaultLocalUser: UserProfile = {
  uid: 'assistant@xerus',
  display_name: 'Assistant Xerus',
  email: 'assistant@xerus.com',
};

// Guest user type
export interface GuestUser {
  id: string;
  displayName: string;
  email: null;
  isGuest: true;
  guestSession: string;
}

// Combined user type
export type AppUser = UserProfile | GuestUser;

// Generate guest session ID
const generateGuestSession = (): string => {
  return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Get or create guest session
const getGuestSession = (): string => {
  if (typeof window === 'undefined') return '';
  
  let guestSession = localStorage.getItem('guest_session');
  if (!guestSession) {
    guestSession = generateGuestSession();
    localStorage.setItem('guest_session', guestSession);
  }
  return guestSession;
};

export const useAuth = () => {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [mode, setMode] = useState<'local' | 'firebase' | 'guest' | null>(null)
  const [isGuest, setIsGuest] = useState(false)
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        console.log('Firebase mode activated:', firebaseUser.uid);
        setMode('firebase');
        setIsGuest(false);
        
        let profile: UserProfile = {
          uid: firebaseUser.uid,
          display_name: firebaseUser.displayName || 'User',
          email: firebaseUser.email || 'no-email@example.com',
        };
        
        try {
          profile = await findOrCreateUser(profile);
          console.log('Firestore user created/verified:', profile);
        } catch (error) {
          console.error('Firestore user creation/verification failed:', error);
        }

        setUser(profile);
        setUserInfo(profile);
      } else {
        // Check for guest mode preference
        const preferGuest = localStorage.getItem('prefer_guest_mode') === 'true';
        
        if (preferGuest) {
          console.log('Guest mode activated');
          setMode('guest');
          setIsGuest(true);
          
          const guestSession = getGuestSession();
          const guestUser: GuestUser = {
            id: guestSession,
            displayName: 'Guest User',
            email: null,
            isGuest: true,
            guestSession
          };
          
          setUser(guestUser);
        } else {
          console.log('[SYSTEM] Local mode activated');
          setMode('local');
          setIsGuest(false);
          
          setUser(defaultLocalUser);
          setUserInfo(defaultLocalUser);
        }
      }
      setIsLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, [])

  return { user, isLoading, isAuthReady, mode, isGuest }
}

export const useRedirectIfNotAuth = () => {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // This hook is now simplified. It doesn't redirect for local mode.
    // If you want to force login for hosting mode, you'd add logic here.
    // For example: if (!isLoading && !user) router.push('/login');
    // But for now, we allow both modes.
  }, [user, isLoading, router])

  return user
}

// Utility functions for guest mode management
export const enableGuestMode = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('prefer_guest_mode', 'true');
    window.location.reload(); // Reload to activate guest mode
  }
};

export const disableGuestMode = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('prefer_guest_mode');
    localStorage.removeItem('guest_session');
    window.location.reload(); // Reload to deactivate guest mode
  }
};

export const isGuestUser = (user: AppUser | null): user is GuestUser => {
  return user !== null && 'isGuest' in user && user.isGuest === true;
};

export const getGuestSessionToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('guest_session');
}; 