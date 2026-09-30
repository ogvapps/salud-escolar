import { initFirebase, onAuthStateChanged, onSnapshot, checkAndSeedDatabase, loginAnonymously } from "./firebase-service.js";
import { UIManager } from "./ui-service.js";
import { schoolData } from "./data.js";

let unsubscribeSnapshot = null;

async function startApp() {
    try {
        const { db, auth, studentsCollectionRef } = await initFirebase();
        const ui = new UIManager(db, studentsCollectionRef, auth);
        window.app = ui;
        await ui.initCourses();

        function loadLocalData() {
            const flatStudents = [];
            for (const stage in schoolData) {
                for (const course in schoolData[stage]) {
                    schoolData[stage][course].forEach(student => {
                        flatStudents.push({ ...student, stage, course });
                    });
                }
            }
            if (flatStudents.length > 0) {
                ui.setStudents(flatStudents);
            }
            document.getElementById('loading-overlay').classList.add('hidden');
        }

        function unlockWithPin() {
            console.log("Acceso concedido con PIN de Centro");
            document.getElementById('initial-pin-lock').style.display = 'none';
            document.getElementById('loading-overlay').classList.remove('hidden');
            document.getElementById('app').classList.remove('hidden');

            loginAnonymously().catch((err) => {
                console.warn("Inicio anónimo no disponible, cargando datos locales:", err);
                loadLocalData();
            });
        }
        window.unlockWithPin = unlockWithPin;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("User logged in:", user.email || 'Acceso autenticado (PIN)');
                document.getElementById('initial-pin-lock').style.display = 'none';
                document.getElementById('loading-overlay').classList.remove('hidden');
                document.getElementById('app').classList.remove('hidden');

                try {
                    await checkAndSeedDatabase(studentsCollectionRef);
                    listenForUpdates(ui, studentsCollectionRef);
                } catch (e) {
                    console.warn("Firestore inaccesible o en modo offline:", e);
                    listenForUpdates(ui, studentsCollectionRef);
                }
            } else {
                console.log("No user session.");
                if (unsubscribeSnapshot) {
                    unsubscribeSnapshot();
                    unsubscribeSnapshot = null;
                }
                if (document.getElementById('app').classList.contains('hidden')) {
                    document.getElementById('initial-pin-lock').style.display = 'flex';
                }
            }
        });

    } catch (error) {
        console.error("App startup failed:", error);
    }
}

function listenForUpdates(ui, studentsCollectionRef) {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }

    unsubscribeSnapshot = onSnapshot(studentsCollectionRef,
        (snapshot) => {
            const allStudents = snapshot.docs
                .filter(doc => !doc.id.startsWith('_') && !doc.data()?.isMetadata)
                .map(doc => ({ id: doc.id, ...doc.data() }));

            const coursesDoc = snapshot.docs.find(doc => doc.id === '_metadata_courses');
            if (coursesDoc && coursesDoc.data()?.courses) {
                ui.setCustomCourses(coursesDoc.data().courses);
            }

            ui.setStudents(allStudents);
            document.getElementById('loading-overlay').classList.add('hidden');
        },
        (error) => {
            console.error("Snapshot error:", error);
            document.getElementById('loading-overlay').classList.add('hidden');
        }
    );
}

// Global PWA logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.onclick = async () => {
            installBtn.classList.add('hidden');
            deferredPrompt.prompt();
            deferredPrompt = null;
        };
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').then(reg => {
            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                if (installingWorker) {
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log("Nueva versión disponible en caché.");
                        }
                    };
                }
            };
        }).catch(err => console.log('SW registration failed:', err));
    });
}

startApp();
