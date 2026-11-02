# Contacts

The main Contacts pages require Google sign-in and read/write contacts in Firestore.
Firestore rules restrict access to the approved account; do not make the database public.

The initial contacts can be imported from the existing contacts JavaScript/JSON file
after signing in. The public contacts bundle is excluded from Hosting. Backups and
bookmarks remain local to the browser unless explicitly exported.

Deploy Hosting and the restrictive Firestore rules together:

```powershell
firebase deploy --only hosting,firestore:rules
```
