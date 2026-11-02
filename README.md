# Contacts

The main Contacts pages require verified Google sign-in and read/write contacts in Firestore.
Only the owner account (`skydvbwatcher@gmail.com`) can manage access. From either Contacts
page, use **Manage editors** to approve or remove another Google account by email. Approved
editors can view and edit the shared contacts; only the owner can change the approved list.
Firestore rules enforce these permissions; do not make the database public.

The initial contacts can be imported from the existing contacts JavaScript/JSON file
after signing in. The public contacts bundle is excluded from Hosting. Backups and
bookmarks remain local to the browser unless explicitly exported.

Deploy Hosting and the restrictive Firestore rules together:

```powershell
firebase deploy --only hosting,firestore:rules
```
