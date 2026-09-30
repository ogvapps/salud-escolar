import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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

export async function loginAnonymously() {
    try {
        if (!auth) {
            await initFirebase();
        }
        if (!auth) return null;
        const result = await signInAnonymously(auth);
        return result.user;
    } catch (error) {
        console.warn("Anonymous sign-in not available:", error);
        return null;
    }
}

export async function loginWithGoogle() {
    try {
        if (!auth) {
            console.log("Auth not initialized, calling initFirebase...");
            await initFirebase();
        }
        const result = await signInWithPopup(auth, googleProvider);
        const email = (result.user.email || '').toLowerCase().trim();
        const isEducarex = email.endsWith('@educarex.es');
        const isAuthorizedAdmin = ['ogonzalezv01@educarex.es', 'orestesgv@gmail.com'].includes(email);

        if (!isEducarex && !isAuthorizedAdmin) {
            await logout();
            throw new Error(`Cuenta no autorizada (${email}). Solo se permiten cuentas de @educarex.es o administradores del sistema.`);
        }
        return result.user;
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
}

export async function logout() {
    try {
        if (!auth) {
            await initFirebase();
        }
        if (auth) {
            await signOut(auth);
        }
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

import { getPromotedCourse } from "./diff-service.js";

export async function checkAndSeedDatabase(studentsCollectionRef) {
    try {
        if (localStorage.getItem('salud_escolar_cleared') === 'true') {
            console.log("Database was cleared for new school year; auto-seed skipped.");
            return;
        }
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

export async function deleteAllStudents(studentsCollectionRef) {
    try {
        const querySnapshot = await getDocs(studentsCollectionRef);
        const docs = querySnapshot.docs;
        const total = docs.length;

        if (total === 0) {
            localStorage.setItem('salud_escolar_cleared', 'true');
            return 0;
        }

        // Firestore batches admiten hasta 500 operaciones por lote
        const BATCH_SIZE = 500;
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = docs.slice(i, i + BATCH_SIZE);
            chunk.forEach(docSnap => batch.delete(docSnap.ref));
            await batch.commit();
        }

        // Marcar que el administrador ha vaciado la base de datos deliberadamente
        localStorage.setItem('salud_escolar_cleared', 'true');

        await logAction('CLEAR_ALL_STUDENTS', {
            totalDeleted: total,
            date: new Date().toISOString()
        });

        return total;
    } catch (error) {
        console.error("Error clearing students:", error);
        throw error;
    }
}

/**
 * Promociona todos los alumnos al siguiente curso escolar.
 */
export async function promoteAllStudents(studentsCollectionRef, options = {}) {
    try {
        const querySnapshot = await getDocs(studentsCollectionRef);
        const docs = querySnapshot.docs;
        const total = docs.length;

        if (total === 0) {
            return { promotedCount: 0, graduatedCount: 0, keptCount: 0, total: 0 };
        }

        const repeaterIds = new Set(options.repeaterIds || []);
        const deleteGraduates = options.deleteGraduates !== false;

        let promotedCount = 0;
        let graduatedCount = 0;
        let keptCount = 0;

        const operations = [];

        docs.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;

            if (repeaterIds.has(id)) {
                keptCount++;
                return;
            }

            const promoted = getPromotedCourse(data.stage, data.course);

            if (promoted.isGraduate) {
                graduatedCount++;
                if (deleteGraduates) {
                    operations.push({ type: 'delete', ref: docSnap.ref });
                } else {
                    operations.push({
                        type: 'update',
                        ref: docSnap.ref,
                        data: {
                            stage: 'Graduado',
                            course: 'Egresado',
                            graduated: true,
                            updatedAt: serverTimestamp()
                        }
                    });
                }
            } else {
                promotedCount++;
                operations.push({
                    type: 'update',
                    ref: docSnap.ref,
                    data: {
                        stage: promoted.stage,
                        course: promoted.course,
                        updatedAt: serverTimestamp()
                    }
                });
            }
        });

        const BATCH_SIZE = 500;
        for (let i = 0; i < operations.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = operations.slice(i, i + BATCH_SIZE);
            chunk.forEach(op => {
                if (op.type === 'delete') {
                    batch.delete(op.ref);
                } else if (op.type === 'update') {
                    batch.update(op.ref, op.data);
                }
            });
            await batch.commit();
        }

        await logAction('PROMOTE_COURSES', {
            promotedCount,
            graduatedCount,
            keptCount,
            total,
            date: new Date().toISOString()
        });

        return { promotedCount, graduatedCount, keptCount, total };
    } catch (error) {
        console.error("Error promoting students:", error);
        throw error;
    }
}

/**
 * Aplica la sincronización resultante del diff.
 */
export async function applyDiffSync(studentsCollectionRef, diffResult, options = {}) {
    try {
        const { newStudents = [], modifiedStudents = [], removedStudents = [] } = diffResult;
        const importNew = options.importNew !== false;
        const updateModified = options.updateModified !== false;
        const deleteRemoved = !!options.deleteRemoved;

        const operations = [];

        if (importNew && newStudents.length > 0) {
            newStudents.forEach(st => {
                const newDocRef = doc(studentsCollectionRef);
                operations.push({
                    type: 'set',
                    ref: newDocRef,
                    data: {
                        name: st.name,
                        stage: st.stage,
                        course: st.course,
                        severity: st.severity,
                        info: st.info,
                        createdAt: serverTimestamp()
                    }
                });
            });
        }

        if (updateModified && modifiedStudents.length > 0) {
            modifiedStudents.forEach(st => {
                const docRef = doc(studentsCollectionRef, st.id);
                operations.push({
                    type: 'update',
                    ref: docRef,
                    data: {
                        stage: st.incoming.stage,
                        course: st.incoming.course,
                        severity: st.incoming.severity,
                        info: st.incoming.info,
                        updatedAt: serverTimestamp()
                    }
                });
            });
        }

        if (deleteRemoved && removedStudents.length > 0) {
            removedStudents.forEach(st => {
                const docRef = doc(studentsCollectionRef, st.id);
                operations.push({
                    type: 'delete',
                    ref: docRef
                });
            });
        }

        const BATCH_SIZE = 500;
        for (let i = 0; i < operations.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = operations.slice(i, i + BATCH_SIZE);
            chunk.forEach(op => {
                if (op.type === 'set') {
                    batch.set(op.ref, op.data);
                } else if (op.type === 'update') {
                    batch.update(op.ref, op.data);
                } else if (op.type === 'delete') {
                    batch.delete(op.ref);
                }
            });
            await batch.commit();
        }

        localStorage.removeItem('salud_escolar_cleared');

        await logAction('DIFF_SYNC', {
            added: importNew ? newStudents.length : 0,
            updated: updateModified ? modifiedStudents.length : 0,
            deleted: deleteRemoved ? removedStudents.length : 0,
            date: new Date().toISOString()
        });

        return {
            addedCount: importNew ? newStudents.length : 0,
            updatedCount: updateModified ? modifiedStudents.length : 0,
            deletedCount: deleteRemoved ? removedStudents.length : 0
        };
    } catch (error) {
        console.error("Error applying diff sync:", error);
        throw error;
    }
}

export { onAuthStateChanged, onSnapshot };

