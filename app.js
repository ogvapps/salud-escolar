import { initFirebase, onAuthStateChanged, onSnapshot, checkAndSeedDatabase } from "./firebase-service.js?v=2.4";
import { UIManager } from "./ui-service.js?v=2.4";

async function startApp() {
    try {
        const { db, auth, studentsCollectionRef } = await initFirebase();
        const ui = new UIManager(db, studentsCollectionRef, auth);
        window.app = ui;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("User logged in:", user.email);
                document.getElementById('initial-pin-lock').style.display = 'none';
                document.getElementById('loading-overlay').classList.remove('hidden');
                document.getElementById('app').classList.remove('hidden');

                await checkAndSeedDatabase(studentsCollectionRef);
                listenForUpdates(ui, studentsCollectionRef);
            } else {
                console.log("No user session.");
                document.getElementById('initial-pin-lock').style.display = 'flex';
                document.getElementById('app').classList.add('hidden');
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
        navigator.serviceWorker.register('./service-worker.js').catch(err => console.log('SW failed', err));
    });
}

startApp();
