import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { FirestoreErrorInfo } from '../types';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const googleProvider = new GoogleAuthProvider();

// Browsers that block third-party cookies (Safari, Brave, Firefox strict) break
// signInWithPopup. Fall back to the redirect flow so auth still works there.
const POPUP_FAILURE_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
]);

export async function signIn() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (POPUP_FAILURE_CODES.has(error?.code)) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    console.error('Auth error:', error);
    throw error;
  }
}

// Complete a redirect-based sign-in if we're returning from the Google auth page.
getRedirectResult(auth).catch((error) => {
  console.error('Redirect sign-in failed:', error);
});

export function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null) {
  const authInfo = auth.currentUser ? {
    userId: auth.currentUser.uid,
    email: auth.currentUser.email || '',
    emailVerified: auth.currentUser.emailVerified,
    isAnonymous: auth.currentUser.isAnonymous,
    providerInfo: auth.currentUser.providerData.map(p => ({
      providerId: p.providerId,
      displayName: p.displayName || '',
      email: p.email || '',
    })),
  } : {
    userId: 'anonymous',
    email: '',
    emailVerified: false,
    isAnonymous: true,
    providerInfo: [],
  };

  const errorInfo: FirestoreErrorInfo = {
    error: error.message || 'Unknown Firestore error',
    operationType,
    path,
    authInfo,
  };

  console.error("Firestore error detail:", JSON.stringify(errorInfo, null, 2));
  throw new Error(JSON.stringify(errorInfo));
}

// Connectivity check is gated on sign-in because the Firestore rule requires auth.
// Firing it before login produces a noisy permission-denied error in the console.
auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  try {
    await getDocFromServer(doc(db, '_internal_system_', 'connectivity_check'));
  } catch (error: any) {
    if (error?.message?.includes('offline')) {
      console.error('BioDex: System is offline. Check Firebase configuration.');
    }
  }
});
