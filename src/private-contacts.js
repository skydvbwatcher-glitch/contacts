import { auth, db } from "./firebase.js";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const allowedEmail = "skydvbwatcher@gmail.com";
const accessCollection = "contactAccess";
const ownerConfigDocument = "config";
const editorEmailPattern = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

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

function assertVerifiedUser(user) {
  if (!user || !user.emailVerified || !user.email) {
    throw new Error("Sign in with a verified Google account to access contacts.");
  }
}

function isOwner(user) {
  return user?.emailVerified === true && user.email?.toLowerCase() === allowedEmail;
}

function normalizedEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!editorEmailPattern.test(value)) throw new Error("Enter a valid email address.");
  if (value === allowedEmail) throw new Error("The owner already has access.");
  return value;
}

async function getOwnerUid(user) {
  assertVerifiedUser(user);
  const configReference = doc(db, accessCollection, ownerConfigDocument);
  const snapshot = await getDoc(configReference);
  if (!snapshot.exists()) {
    if (!isOwner(user)) throw new Error("The contact owner has not initialized shared access yet.");
    await setDoc(configReference, { ownerUid: user.uid });
    return user.uid;
  }
  const ownerUid = snapshot.data().ownerUid;
  if (typeof ownerUid !== "string" || !ownerUid) {
    throw new Error("Shared contacts access is not configured correctly.");
  }
  if (isOwner(user) && ownerUid !== user.uid) {
    throw new Error("The shared contacts owner account does not match the configured owner.");
  }
  return ownerUid;
}

async function assertCanAccess(user) {
  const ownerUid = await getOwnerUid(user);
  if (isOwner(user)) return ownerUid;
  const email = user.email.toLowerCase();
  const snapshot = await getDoc(doc(db, accessCollection, email));
  if (!snapshot.exists() || snapshot.data().email !== email || snapshot.data().enabled !== true) {
    throw new Error("Your Google account has not been approved to access these contacts. Ask the owner to add your email.");
  }
  return ownerUid;
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
  const ownerUid = await assertCanAccess(user);
  const reference = doc(db, "users", ownerUid, "privateData", "contacts");
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return null;
  const contacts = snapshot.data().contacts;
  if (!Array.isArray(contacts)) throw new Error("Private contacts data has an invalid format.");
  return contacts;
}

export async function saveContacts(user, contacts) {
  const ownerUid = await assertCanAccess(user);
  if (!Array.isArray(contacts)) throw new Error("Contacts must be an array.");
  const reference = doc(db, "users", ownerUid, "privateData", "contacts");
  await setDoc(reference, { contacts, updatedAt: serverTimestamp() });
}

export async function listAuthorizedEditors(user) {
  if (!isOwner(user)) throw new Error("Only the contact owner can manage editor access.");
  await getOwnerUid(user);
  const snapshot = await getDocs(collection(db, accessCollection));
  return snapshot.docs
    .map(editor => editor.data())
    .filter(editor => editor.enabled === true && typeof editor.email === "string")
    .map(editor => editor.email)
    .sort((a, b) => a.localeCompare(b));
}

export async function authorizeEditor(user, email) {
  if (!isOwner(user)) throw new Error("Only the contact owner can manage editor access.");
  await getOwnerUid(user);
  const normalized = normalizedEmail(email);
  await setDoc(doc(db, accessCollection, normalized), {
    email: normalized,
    enabled: true,
    updatedAt: serverTimestamp()
  });
}

export async function revokeEditor(user, email) {
  if (!isOwner(user)) throw new Error("Only the contact owner can manage editor access.");
  await getOwnerUid(user);
  const normalized = normalizedEmail(email);
  await deleteDoc(doc(db, accessCollection, normalized));
}

export function setupEditorManager(user) {
  const button = document.querySelector("#manageEditors");
  const dialog = document.querySelector("#editorAccessDialog");
  const form = document.querySelector("#editorAccessForm");
  const emailInput = document.querySelector("#editorEmail");
  const list = document.querySelector("#editorAccessList");
  const status = document.querySelector("#editorAccessStatus");
  const closeButton = document.querySelector("#closeEditorAccess");
  if (!button || !dialog || !form || !emailInput || !list || !status || !closeButton) {
    throw new Error("The editor access controls are missing from this page.");
  }
  button.hidden = !isOwner(user);
  if (!isOwner(user) || button.dataset.bound === "true") return;
  button.dataset.bound = "true";

  const refresh = async () => {
    status.textContent = "Loading approved editors…";
    list.replaceChildren();
    const editors = await listAuthorizedEditors(user);
    if (!editors.length) {
      status.textContent = "No additional editors are approved.";
      return;
    }
    status.textContent = "";
    editors.forEach(email => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const remove = document.createElement("button");
      label.textContent = email;
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        status.textContent = `Removing ${email}…`;
        try {
          await revokeEditor(user, email);
          await refresh();
        } catch (error) {
          console.error("Editor access could not be revoked.", error);
          status.textContent = error.message || "Editor access could not be revoked.";
          remove.disabled = false;
        }
      });
      item.append(label, remove);
      list.append(item);
    });
  };

  button.addEventListener("click", async () => {
    status.textContent = "";
    list.replaceChildren();
    dialog.showModal();
    try {
      await refresh();
    } catch (error) {
      console.error("Approved editors could not be loaded.", error);
      status.textContent = error.message || "Approved editors could not be loaded.";
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = "Adding editor…";
    try {
      await authorizeEditor(user, emailInput.value);
      emailInput.value = "";
      await refresh();
    } catch (error) {
      console.error("Editor access could not be granted.", error);
      status.textContent = error.message || "Editor access could not be granted.";
    } finally {
      submit.disabled = false;
    }
  });
  closeButton.addEventListener("click", () => dialog.close());
}

export function observeEditorAccess(user, onRevoked, onError = console.error) {
  if (isOwner(user)) return () => {};
  const email = user.email?.toLowerCase();
  if (!email) throw new Error("A verified email address is required to monitor editor access.");
  return onSnapshot(doc(db, accessCollection, email), snapshot => {
    if (!snapshot.exists() || snapshot.data().email !== email || snapshot.data().enabled !== true) onRevoked();
  }, error => {
    if (error.code === "permission-denied") onRevoked();
    else onError(error);
  });
}
