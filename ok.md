Here are the questions I'd expect, grouped by topic, with answers based on what your code actually does. Two of them point at things you should check before presenting.

## Firebase basics

**Why Firebase instead of building your own backend?**
Firebase is a backend-as-a-service. Auth and the database are hosted for you, so the browser talks to them directly with no server code. That let you focus on the app itself.

**Why Firestore and not Realtime Database?**
Firestore stores data as documents in collections, which fits structured data like users and their boards. It also has better querying and scales better.

**What's with the `import ... from "https://www.gstatic.com/..."` lines?**
You're loading the Firebase v9+ modular SDK straight from Google's CDN as ES modules, so there's no bundler or npm. You import only the functions you use (`getAuth`, `setDoc`, and so on).

## Authentication

**Walk me through registration.**
`createUserWithEmailAndPassword` creates the account in Firebase Auth. Then `updateProfile` stores the username as the display name, and `setDoc` writes a profile document at `users/{uid}`. The profile writes are in their own try/catch so a failed profile save doesn't strand a user whose account already exists.

**Where are passwords stored? Do you hash them?**
You never see or store passwords. Firebase Auth hashes and stores them on Google's side. Your code only sends the password over HTTPS to Firebase.

**How does the user stay logged in?**
Firebase persists the session in the browser (IndexedDB) and refreshes the ID token automatically. `onAuthStateChanged` in `dashboard.js` fires on load, and if there's no user it redirects to `index.html`.

**Can't someone just skip the login page and open `dashboard.html`?**
They can load the page, but the redirect only protects the UI. Without a logged-in user they can't read or write any data, and that's enforced by Firestore Security Rules (see below).

**How do you validate input?**
The username is checked client-side with a regex (3–20 characters: letters, digits, `_`, `-`). Firebase validates email format and enforces a minimum 6-character password. Be honest that client-side validation can be bypassed. The strongest answer is "the real enforcement would be in Security Rules."

## Database design

**How is the data structured?**
There are two documents per user: `users/{uid}` for the profile and `users/{uid}/data/kanban` for all boards and todo lists, stored together in one document. Each user's data is isolated by their uid.

**Why one big document instead of a collection of tasks?**
It's simple: one read on login and one write to save. The trade-offs are the 1 MiB document size limit, no real-time sync, and last-write-wins if the app is open in two tabs. A better design would use subcollections plus `onSnapshot` listeners. Say this proactively, because it shows you understand the limits.

**What does the 500ms debounce do?**
Every edit calls `save()`, but the write only happens 500ms after the last change. Dragging a card or typing a description would otherwise fire dozens of writes, which wastes quota and cost.

**What happens on a user's first login?**
`getDoc` finds no document, so the app saves the starter boards and lists. For older accounts with no `lists` field, the `data.lists || lists` fallback keeps them from breaking.

## Security (the big one)

**Your API key is visible in `firebase.js`. Isn't that a leak?**
No. A Firebase web API key identifies your project and isn't a secret. Security comes from Auth plus Firestore Security Rules. You can also restrict the key to your domain in Google Cloud Console and limit the authorized domains in Firebase Auth.

**So what do your Security Rules say?**
This is the one to check tonight. Open Firebase Console → Firestore → Rules. If you see `allow read, write: if true`, or a "test mode" rule with an expiry date, anyone with your public config could read or wipe your database. For your data layout, you want this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
This means a user can only touch documents under their own uid.

**You use `innerHTML` a lot. What about XSS?**
User-entered text goes through your `esc()` function (escapes `& < > "`) before it's inserted. Places like the username display use `textContent`, which is safe by default.

## Things judges may notice

**Does the login error handling work?**
Probably not, and you should fix it. `errorMessages` is an array of code strings, but you look it up with `errorMessages[err.code]`. An array indexed by a string returns `undefined`, so users always see the generic "Something went wrong." Newer Firebase projects also return `auth/invalid-credential` for bad logins instead of `wrong-password` or `user-not-found`. Use an object instead:

```js
const errorMessages = {
  'auth/email-already-in-use': 'That email is already registered.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};
```

**Are usernames unique?**
No. Two people can register with the same username, since it's only stored in a profile document. You can answer that it's a known limitation, and the fix would be a `usernames/{name}` lookup document checked in a transaction.

**What if I forget my password?**
There's no reset flow yet. Firebase supports it with `sendPasswordResetEmail`, so you can call it planned future work, along with email verification.

**What if saving fails?**
Right now it only logs to the console. The user isn't told, so a UI notice would be an easy improvement.

## If they ask about the vibe-coded parts

Don't bluff. Something like "I used AI assistance for parts of it, but I can walk through the flow: register → Auth creates the account → profile saved to Firestore → dashboard checks login → loads and saves data by uid" is stronger than pretending you wrote every line. Being able to explain the data flow and name your own limitations (single-document design, no password reset, unique usernames) will impress judges more than a flawless-sounding answer.