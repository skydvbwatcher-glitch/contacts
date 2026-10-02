import { auth, db } from './firebase.js';
import { onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const chatButton = document.getElementById('chatNavBtn');
const chatTopButton = document.getElementById('chatTopBtn');
const appShell = document.querySelector('.app-shell');
const joinForm = document.getElementById('chatJoin');
const nameInput = document.getElementById('chatName');
const joinButton = document.getElementById('chatJoinBtn');
const feed = document.getElementById('chatFeed');
const form = document.getElementById('chatForm');
const messageInput = document.getElementById('chatMessage');
const sendButton = document.getElementById('chatSendBtn');
const identity = document.getElementById('chatIdentity');
const chatNameKey = 'contacts-chat-display-name-v1';
let displayName = '';
let stopListening = null;

function showChat() {
  appShell.classList.remove('bookmarks-open');
  appShell.classList.add('chat-open');
  document.querySelectorAll('.sidebar .nav-item').forEach(item => item.classList.toggle('active', item === chatButton));
  if (!displayName) nameInput.focus();
}

function showStatus(message) {
  feed.replaceChildren();
  const status = document.createElement('p');
  status.className = 'chat-status';
  status.textContent = message;
  feed.append(status);
}

function renderMessages(snapshot, uid) {
  const messages = snapshot.docs.map(doc => doc.data()).reverse();
  feed.replaceChildren();
  if (!messages.length) {
    showStatus('Još nema poruka. Započnite razgovor.');
    return;
  }
  messages.forEach(message => {
    const item = document.createElement('article');
    item.className = `chat-message${message.senderId === uid ? ' mine' : ''}`;
    const meta = document.createElement('div');
    meta.className = 'chat-message-meta';
    const sender = document.createElement('strong');
    sender.textContent = message.senderName || 'Nepoznato';
    const time = document.createElement('time');
    if (message.createdAt?.toDate) {
      time.dateTime = message.createdAt.toDate().toISOString();
      time.textContent = message.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      time.textContent = 'upravo';
    }
    const text = document.createElement('p');
    text.textContent = message.text || '';
    meta.append(sender, time);
    item.append(meta, text);
    feed.append(item);
  });
  feed.scrollTop = feed.scrollHeight;
}

function getJoinErrorMessage(error) {
  const guidance = {
    'auth/operation-not-allowed': 'U Firebase Console uključite Anonymous sign-in.',
    'auth/invalid-api-key': 'Proverite Firebase Web API ključ.',
    'auth/unauthorized-domain': 'Dodajte skydvbwatcher-glitch.github.io u Firebase Authorized domains.',
    'auth/network-request-failed': 'Proverite internet vezu ili blokadu Firebase zahteva u pregledaču.'
  };
  return guidance[error.code] || `Firebase greška: ${error.code || error.message || error.name || 'nepoznata greška'}`;
}

async function joinChat() {
  const requestedName = nameInput.value.trim().replace(/\s+/g, ' ');
  if (requestedName.length < 2 || requestedName.length > 40) {
    feed.hidden = false;
    showStatus('Ime mora sadržavati 2 do 40 znakova.');
    return;
  }
  displayName = requestedName;
  try {
    localStorage.setItem(chatNameKey, displayName);
    joinButton.disabled = true;
    joinButton.textContent = 'Povezivanje...';
    const user = auth.currentUser || (await signInAnonymously(auth)).user;
    identity.textContent = `Prijavljeni kao ${displayName}`;
    joinForm.hidden = true;
    feed.hidden = false;
    form.hidden = false;
    if (stopListening) stopListening();
    const messagesQuery = query(collection(db, 'publicChatMessages'), orderBy('createdAt', 'desc'), limit(100));
    stopListening = onSnapshot(messagesQuery, snapshot => renderMessages(snapshot, user.uid), error => {
      console.error('Chat subscription failed:', error);
      showStatus('Chat nije dostupan. Provjerite Firebase prijavu i Firestore pravila.');
    });
  } catch (error) {
    console.error('Could not join public chat:', error);
    feed.hidden = false;
    showStatus(`Povezivanje nije uspjelo. ${getJoinErrorMessage(error)}`);
    displayName = '';
  } finally {
    joinButton.disabled = false;
    joinButton.textContent = 'Uđi u chat';
  }
}

chatButton.addEventListener('click', showChat);
chatTopButton.addEventListener('click', showChat);
joinButton.addEventListener('click', joinChat);
nameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') joinChat();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const text = messageInput.value.trim();
  const user = auth.currentUser;
  if (!text || !user || !displayName) return;
  sendButton.disabled = true;
  try {
    await addDoc(collection(db, 'publicChatMessages'), {
      senderId: user.uid,
      senderName: displayName,
      text,
      createdAt: serverTimestamp()
    });
    messageInput.value = '';
  } catch (error) {
    console.error('Could not send chat message:', error);
    showStatus('Poruka nije poslana. Provjerite Firestore pravila i vezu.');
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
});

try {
  const savedName = localStorage.getItem(chatNameKey) || '';
  if (savedName) nameInput.value = savedName;
} catch (error) {}

onAuthStateChanged(auth, user => {
  if (!user && stopListening) {
    stopListening();
    stopListening = null;
  }
});
