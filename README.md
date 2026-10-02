# contacts
Contact Address Book

## Public chat setup

The chat uses Firebase Authentication's anonymous provider and a public Firestore room. Anyone who can open the site can join; display names are not verified identities, and messages are visible to every chat visitor.

1. In Firebase Console for `contacts-7ed77`, enable Authentication > Sign-in method > Anonymous.
2. Create a Firestore database if the project does not already have one.
3. Sign in to the Firebase CLI and run `firebase deploy --only firestore:rules` to publish `firestore.rules`.

The room permits reading and adding validated messages only. It does not permit editing or deleting messages.
