import { auth, db } from "./firebase.js";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const allowedEmail = "skydvbwatcher@gmail.com";

let resolveInitialAuth;
export const authReady = new Promise(resolve => {
  resolveInitialAuth = resolve;
});

onAuthStateChanged(auth, user => {
  if (resolveInitialAuth) {
    resolveInitialAuth(user);
    resolveInitialAuth = null;
  }
});

function assertOwner(user) {
  if (!user || !user.emailVerified || user.email?.toLowerCase() !== allowedEmail) {
    throw new Error(`Sign in with ${allowedEmail} to access contacts.`);
  }
}

export function signIn() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser() {
  return signOut(auth);
}

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function loadContacts(user) {
  assertOwner(user);
  const reference = doc(db, "users", user.uid, "privateData", "contacts");
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return null;
  const contacts = snapshot.data().contacts;
  if (!Array.isArray(contacts)) throw new Error("Private contacts data has an invalid format.");
  return contacts;
}

export async function saveContacts(user, contacts) {
  assertOwner(user);
  if (!Array.isArray(contacts)) throw new Error("Contacts must be an array.");
  const reference = doc(db, "users", user.uid, "privateData", "contacts");
  await setDoc(reference, { contacts, updatedAt: serverTimestamp() });
}
