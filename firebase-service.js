import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, getDocs, writeBatch, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { schoolData } from "./data.js";

let db, auth;
let studentsCollectionRef, logsCollectionRef;
const googleProvider = new GoogleAuthProvider();

export async function initFirebase() {
    try {
        const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';
        const firebaseConfig = JSON.parse(typeof window.__firebase_config !== 'undefined' ? window.__firebase_config : '{}');

        const firebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(firebaseApp);
        auth = getAuth(firebaseApp);

        studentsCollectionRef = collection(db, `artifacts/${appId}/public/data/students`);
        logsCollectionRef = collection(db, `artifacts/${appId}/public/data/logs`);

        return { db, auth, studentsCollectionRef };
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        throw error;
    }
}

export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const email = result.user.email;
        if (!email.endsWith('@educarex.es')) {
            await logout();
            throw new Error('Solo se permiten cuentas de @educarex.es');
        }
        return result.user;
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
}

export async function logout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed:", error);
        throw error;
    }
}

export async function logAction(action, details) {
    try {
        if (!auth.currentUser) return;
        await addDoc(logsCollectionRef, {
            user: auth.currentUser.email,
            action,
            details,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error("Logging failed:", error);
    }
}

export async function checkAndSeedDatabase(studentsCollectionRef) {
    try {
        const querySnapshot = await getDocs(studentsCollectionRef);
        if (querySnapshot.empty) {
            console.log("Database is empty. Seeding initial data...");
            const batch = writeBatch(db);
            for (const stage in schoolData) {
                for (const course in schoolData[stage]) {
                    schoolData[stage][course].forEach(student => {
                        const studentDoc = { ...student, stage, course };
                        const newDocRef = doc(studentsCollectionRef);
                        batch.set(newDocRef, studentDoc);
                    });
                }
            }
            await batch.commit();
            console.log("Seeding complete.");
        }
    } catch (error) {
        console.error("Error during initial data check/seed:", error);
        throw error;
    }
}

export { onAuthStateChanged, onSnapshot };
