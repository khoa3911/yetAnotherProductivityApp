import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
    doc,
    setDoc,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { auth, db } from "../js/firebase.js";

// Array of common client-side authentication errors
const errorMessages = [
  'auth/app-deleted',
  'auth/app-not-authorized',
  'auth/argument-error',
  'auth/invalid-api-key',
  'auth/email-already-in-use',
  'auth/invalid-email',
  'auth/operation-not-allowed',
  'auth/weak-password',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/too-many-requests',
  'auth/network-request-failed'
];


const authMessage = document.querySelector(".authMessage");
const usernameField = document.getElementById("username");
const usernameLabel = document.getElementById("lblUsername");
const emailField = document.getElementById("email");
const passwordField = document.getElementById("password");
const errorMessage = document.querySelector(".errorMessage");
const submitButton = document.querySelector(".btnSubmit");
const title = document.querySelector("h1");
const form = document.querySelector(".form");
let mode = "login";

const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

function showError(message) {
    errorMessage.textContent = message || "Something went wrong. Please try again.";
}
function clearError() {
    errorMessage.textContent = "";
}

function render() {
    const isLogin = mode === "login";
    title.textContent = isLogin ? "Login" : "Register";
    submitButton.textContent = isLogin ? "Login" : "Create account";
    usernameField.hidden = isLogin;
    usernameLabel.hidden = isLogin;
    usernameField.required = !isLogin;
    passwordField.autocomplete = isLogin ? "current-password" : "new-password";
    authMessage.innerHTML = isLogin
        ? `Don't have an account? <a class="toggleAuth" href="#register">Register</a>`
        : `Already have an account? <a class="toggleAuth" href="#login">Login</a>`;
}

authMessage.addEventListener("click", (e) => {
    const link = e.target.closest(".toggleAuth");
    if (!link) return;
    e.preventDefault();
    mode = mode === "login" ? "register" : "login";
    clearError();
    render();
});

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const email = emailField.value.trim();
    const password = passwordField.value;
    const username = usernameField.value.trim();

    if (mode === "register" && !USERNAME_RE.test(username)) {
        return showError("Username must be 3–20 characters: letters, digits, hyphens, underscores.");
    }

    submitButton.disabled = true;
    try {
        if (mode === "login") {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            try {
                await updateProfile(cred.user, { displayName: username });
                await setDoc(doc(db, "users", cred.user.uid), {
                    username,
                    email,
                    createdAt: serverTimestamp(),
                });
            } catch (profileErr) {
                // Account exists; don't strand the user. Log it and continue,
                // or retry the profile write on the next page.
                console.error("Profile save failed:", profileErr);
            }
        }
        window.location.href = "dashboard.html";
    } catch (err) {
        console.error(err);
        showError(errorMessages[err.code]);
    } finally {
        submitButton.disabled = false;
    }
});

render(); // set initial state (hides username in login mode)