import { initFirebase, onAuthStateChanged, onSnapshot, checkAndSeedDatabase, loginAnonymously } from "./firebase-service.js?v=2.5";
import { UIManager } from "./ui-service.js?v=2.5";
import { schoolData } from "./data.js";

async function startApp() {
    try {
        const { db, auth, studentsCollectionRef } = await initFirebase();
        const ui = new UIManager(db, studentsCollectionRef, auth);
        window.app = ui;

        function loadLocalData() {
            const flatStudents = [];
            for (const stage in schoolData) {
                for (const course in schoolData[stage]) {
                    schoolData[stage][course].forEach(student => {
                        flatStudents.push({ ...student, stage, course });
                    });
                }
            }
            ui.setStudents(flatStudents);
            document.getElementById('loading-overlay').classList.add('hidden');
        }

        function unlockWithPin() {
            console.log("Acceso concedido con PIN de Centro");
            document.getElementById('initial-pin-lock').style.display = 'none';
            document.getElementById('app').classList.remove('hidden');
            loadLocalData();

            loginAnonymously().then(user => {
                if (user && studentsCollectionRef) {
                    try {
                        listenForUpdates(ui, studentsCollectionRef);
                    } catch (e) {}
                }
            }).catch(() => {});
        }
        window.unlockWithPin = unlockWithPin;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("User logged in:", user.email || 'Acceso autenticado');
                document.getElementById('initial-pin-lock').style.display = 'none';
                document.getElementById('loading-overlay').classList.remove('hidden');
                document.getElementById('app').classList.remove('hidden');

                try {
                    await checkAndSeedDatabase(studentsCollectionRef);
                    listenForUpdates(ui, studentsCollectionRef);
                } catch (e) {
                    console.warn("Firestore inaccesible, cargando datos locales:", e);
                    loadLocalData();
                }
            } else {
                console.log("No user session.");
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
    onSnapshot(studentsCollectionRef,
        (snapshot) => {
            const allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            ui.setStudents(allStudents);
            document.getElementById('loading-overlay').classList.add('hidden');
        },
        (error) => console.error("Snapshot error:", error)
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
                            console.log("Nueva versión detectada, recargando para aplicar cambios...");
                            window.location.reload();
                        }
                    };
                }
            };
        }).catch(err => console.log('SW failed', err));
    });
}

startApp();
