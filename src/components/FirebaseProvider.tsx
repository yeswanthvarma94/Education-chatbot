import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDocFromServer, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';

interface FirebaseContextType {
  user: User | null;
  userRole: 'admin' | 'user' | null;
  isAuthReady: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | null>(null);

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    // Test connection
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Create user doc if it doesn't exist
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDocFromServer(userRef);
          
          const adminEmails = ['yeswanthvarma94@gmail.com', 'vinodvarmak2@gmail.com'];
          const isHardcodedAdmin = currentUser.email && adminEmails.includes(currentUser.email.toLowerCase());
          
          if (!userSnap.exists()) {
            const role = isHardcodedAdmin ? 'admin' : 'user';
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              role: role,
              createdAt: serverTimestamp(),
            });
            setUserRole(role);
          } else {
            const currentRole = userSnap.data().role;
            if (isHardcodedAdmin && currentRole !== 'admin') {
              // Fix the role in the database if it's wrong for a hardcoded admin
              await updateDoc(userRef, { role: 'admin' });
              setUserRole('admin');
            } else {
              setUserRole(isHardcodedAdmin ? 'admin' : (currentRole || 'user'));
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      } else {
        setUserRole(null);
      }
      
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in", error);
    }
  };

  const logOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, userRole, isAuthReady, signIn, logOut }}>
      {children}
    </FirebaseContext.Provider>
  );
}
