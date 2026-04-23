import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { FirestoreErrorInfo } from '../types';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const googleProvider = new GoogleAuthProvider();

export async function signIn() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Auth error:", error);
    throw error;
  }
}

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

// Critical connection test
async function testConnection() {
  try {
    // Attempting a read to verify connection and region setup
    await getDocFromServer(doc(db, '_internal_system_', 'connectivity_check'));
  } catch (error: any) {
    if (error?.message?.includes('offline')) {
      console.error("BioDex: System is offline. Check Firebase configuration.");
    }
  }
}

testConnection();
