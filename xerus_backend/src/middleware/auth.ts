import { Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { userRepository } from '../domains/users/repository';

let firebaseInitialized = false;

function initializeFirebase(): void {
    if (firebaseInitialized) return;

    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccountPath) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: process.env.FIREBASE_PROJECT_ID,
    });

    firebaseInitialized = true;
}

export async function authenticateFirebaseToken(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
        // Extract token from Authorization header only
        // SSE uses dedicated sseAuth token exchange; query param is not supported
        let token: string | undefined;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split('Bearer ')[1];
        }

        if (!token) {
            throw new UnauthorizedError('No token provided');
        }

        initializeFirebase();
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Verify user exists in DB and is active
        const user = await userRepository.findByFirebaseUid(decodedToken.uid);
        if (!user) {
            throw new UnauthorizedError('User account not found');
        }
        if (!user.is_active) {
            throw new ForbiddenError('Account is deactivated');
        }

        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email || '',
            name: decodedToken.name,
            role: user.role,
        };

        next();
    } catch (error) {
        if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
            next(error);
        } else {
            next(new UnauthorizedError('Invalid or expired token'));
        }
    }
}

export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    if (!req.user) {
        next(new UnauthorizedError('Authentication required'));
        return;
    }
    next();
}

export function requireRole(allowedRoles: string[]) {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            next(new UnauthorizedError('Authentication required'));
            return;
        }

        const userRole = req.user.role || 'user';
        if (!allowedRoles.includes(userRole)) {
            next(new ForbiddenError('Insufficient permissions'));
            return;
        }

        next();
    };
}
