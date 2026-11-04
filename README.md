# Contacts

The main Contacts pages require verified Google sign-in and read/write contacts in Firestore.
Only the owner account (`skydvbwatcher@gmail.com`) can manage access. From either Contacts
page, use **Manage editors** to approve or remove another Google account by email. Approved
editors can view and edit the shared contacts and Notes library; only the owner can change
the approved list. Notes now require the same approved sign-in and are stored in Firestore.
Existing local Notes can be imported by the owner after sign-in. Firestore rules enforce
these permissions; do not make the database public.
Notes can also import Evernote `.enex` exports. Titles, tags, dates, and readable text are
preserved; embedded Evernote attachments are reported but not imported.

The Planes page searches worldwide airports by city or country and live aircraft by flight
callsign or registration, and includes a worldwide live aircraft map, airport traffic maps,
and a Belgrade Airport (LYBE) radio section with direct Ground 118.300 and Tower 118.100 links to
LiveATC's official player. LiveATC prohibits third-party use of its audio streams, so its feeds play
on LiveATC. The page also has airport-code and frequency searches for other LiveATC feeds. The
worldwide map is provided live by ADS-B Exchange; selected airport traffic uses nearby ADS-B data.
Airport locations are from the daily-updated OurAirports directory. Aircraft photos are representative,
type-matched images from Wikimedia Commons with image credits and license links. Arrival estimates use
live distance and speed; gate assignments, boarding times, and scheduled arrivals require a separate
flight schedule provider.

The initial contacts can be imported from the existing contacts JavaScript/JSON file
after signing in. The public contacts bundle is excluded from Hosting. Contacts
recovery snapshots and bookmarks remain local to the browser unless explicitly exported.

Deploy Hosting and the restrictive Firestore rules together:

```powershell
firebase deploy --only hosting,firestore:rules,functions:planes
```
