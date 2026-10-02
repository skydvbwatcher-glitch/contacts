import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC_rbXTEZo5EJgvH09z-Ay8uHKfYydW_tk",
  authDomain: "contacts-7ed77.firebaseapp.com",
  projectId: "contacts-7ed77",
  storageBucket: "contacts-7ed77.firebasestorage.app",
  messagingSenderId: "1034739984638",
  appId: "1:1034739984638:web:5f03fd8581607bcf025daf",
  measurementId: "G-SWCR951NKX"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);