import { auth, db } from "./firebase.js";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const ownerEmail = "skydvbwatcher@gmail.com";
const fuelTypes = ["REGULAR_UNLEADED", "MIDGRADE", "PREMIUM", "DIESEL"];

export const isOwner = user => user?.emailVerified === true && user.email?.toLowerCase() === ownerEmail;

function settingsReference(user) {
  if (!isOwner(user)) throw new Error(`Only ${ownerEmail} can sync the gas settings.`);
  return doc(db, "users", user.uid, "privateData", "gasSettings");
}

export function observeUser(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signIn() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function loadGasSettings(user) {
  const snapshot = await getDoc(settingsReference(user));
  if (!snapshot.exists()) return null;
  const { googleApiKey, fuel } = snapshot.data();
  return {
    googleApiKey: typeof googleApiKey === "string" ? googleApiKey : "",
    fuel: fuelTypes.includes(fuel) ? fuel : "REGULAR_UNLEADED",
  };
}

export async function saveGasSettings(user, { googleApiKey, fuel }) {
  if (typeof googleApiKey !== "string" || googleApiKey.length > 200) throw new Error("The API key is not valid.");
  await setDoc(settingsReference(user), {
    googleApiKey,
    fuel: fuelTypes.includes(fuel) ? fuel : "REGULAR_UNLEADED",
    updatedAt: serverTimestamp(),
  });
}
