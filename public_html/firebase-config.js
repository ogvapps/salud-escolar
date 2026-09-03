// Firebase Configuration
// This file contains the Firebase configuration for the Salud Escolar app

const firebaseConfig = {
  apiKey: "AIzaSyAKz9J3a3xwh0a8Xd5LQPcDt8WsoBhSZg8",
  authDomain: "salud-escolar.firebaseapp.com",
  projectId: "salud-escolar",
  storageBucket: "salud-escolar.firebasestorage.app",
  messagingSenderId: "431082250496",
  appId: "1:431082250496:web:8e76a15b0886196448d3e5"
};

// App ID for Firestore collection path
const appId = "salud-escolar";

// Make variables available globally
window.__firebase_config = JSON.stringify(firebaseConfig);
window.__app_id = appId;
window.__initial_auth_token = null;
