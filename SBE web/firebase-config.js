import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAaevQYtR22VXEfQNwRRTzF-PyfU_8g6xc",
    authDomain: "sbedsa-1210.firebaseapp.com",
    projectId: "sbedsa-1210",
    storageBucket: "sbedsa-1210.firebasestorage.app",
    messagingSenderId: "787969270627",
    appId: "1:787969270627:web:79b27546af9dd05804e956",
    measurementId: "G-TQGLLDG21H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { db, analytics };
