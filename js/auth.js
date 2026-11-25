// Import the functions you need from the SDKs you need
import {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    GithubAuthProvider,
    sendPasswordResetEmail,
    updateProfile,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
    doc,
    setDoc,
    deleteDoc,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

const REDIRECT_URL = "index.html";

// Initialize Firebase

//elements
const $ = (id) => document.getElementById(id);
const els = {
    title: $("auth-title"),
    logTab: $("log"),
    regTab: $("reg"),
    form: $("auth-form"),
    email: $("email"),
    pass: $("pass"),
    togglePass: $("toggle-pass"),
    forgot: $("forgot-pass"),
    submit: $("submit-btn"),
    submitText: $("submit-text"),
    message: $("auth-message"),
    google: $("google-btn"),
    github: $("github-btn"),
    userLbl: $("username-label"),
    userField: $("username-field"),
    user: $("username"),
};

let mode = "login"; //Login / Register
let isRegistering = false;

//Ui helpers
function showMessage(text, type = "error") {
    els.message.textContent = text;
    els.message.className = `auth-message ${type}`;
}
function clearMessage() {
    els.message.textContent = "";
    els.message.className = "auth-message";
}
function setLoading(isLoading) {
    [els.submit, els.google].forEach((b) => (b.disabled = isLoading));
}
function setMode(newMode) {
    mode = newMode;
    const isLogin = mode === "login";
    els.logTab.classList.toggle("active", isLogin);
    els.regTab.classList.toggle("active", !isLogin);
    els.title.textContent = isLogin ? "Sign in" : "Create your account.";
    els.submitText.textContent = isLogin ? "Sign in" : "Create account";
    els.forgot.style.display = isLogin ? "" : "none";
    els.pass.autocomplete = isLogin ? "current-password" : "new-password";
    els.userLbl.style.display = isLogin ? "none" : "";
    els.userField.style.display = isLogin ? "none" : "";
    clearMessage();
}

function friendlyError(err) {
    switch (err.code) {
        case "auth/invalid-email":
            return "That email address doesn't look right.";
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Incorrect email or password.";
        case "auth/email-already-in-use":
            return "An account with this email already exists. Try signing in.";
        case "auth/weak-password":
            return "Password should be at least 6 characters.";
        case "auth/too-many-requests":
            return "Too many attempts. Please wait a moment and try again.";
        case "auth/network-request-failed":
            return "Network error. Check your connection.";
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
            return ""; // user closed the popup, not an error worth showing
        case "auth/account-exists-with-different-credential":
            return "This email is already registered with a different sign-in method.";
        case "app/username-taken":
            return "That username is already taken.";
        default:
            return "Something went wrong. Please try again.";
    }
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

async function saveUser(user, username) {
    const key = username.toLowerCase();
    const nameRef = doc(db, "usernames", key);
    const userRef = doc(db, "users", user.uid);

    try {
        await setDoc(nameRef, {uid: user.uid});
    }catch (err) {
        if (err.code === "permission-denied") {
            const taken = new Error("Username taken");
            taken.code = "app/username-taken"
            throw taken;
        }
        throw err;
    }

    try {
        await setDoc(userRef, {
            username,
            usernameLower : key,
            email: user.email,
            createdAt: serverTimestamp(),
        });
    }catch (err) {
        await deleteDoc(nameRef).catch(console.error);
        throw err;
    }
}

async function run(action) {
    clearMessage();
    setLoading(true);
    try {
        await action();
        //onAuthStateChanged handles the redirect
    } catch (err) {
        console.error(err);
        const msg = friendlyError(err);
        if (msg) showMessage(msg);
    } finally {
        setLoading(false);
    }
}

els.logTab.addEventListener("click", () => setMode("login"));
els.regTab.addEventListener("click", () => setMode("register"));

els.togglePass.addEventListener("click", () => {
    const show = els.pass.type === "password";
    els.pass.type = show ? "text" : "password";
    els.togglePass.classList.toggle("ph-eye", !show);
    els.togglePass.classList.toggle("ph-eye-slash", show);
});

els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = els.email.value.trim();
    const password = els.pass.value;
    const username = els.user.value.trim();
    if (!email || !password) {
        return showMessage("Please enter your email and password.");
    }
    if (mode === "register") {
        if (!USERNAME_RE.test(username)) {
            return showMessage(
                "Username must be 3-20 characters: letters, numbers, underscore.",
            );
        }
        if (password.length < 6) {
            return showMessage("Password should be at least 6 characters.");
        }
    }

    run(async () => {
        if (mode === "login") {
            await signInWithEmailAndPassword(auth, email, password);
            return;
        }

        isRegistering = true;
        try {
            const cred = await createUserWithEmailAndPassword(
                auth,
                email,
                password,
            );
            try {
                await saveUser(cred.user, username)
            } catch (err) {
                await cred.user.delete().catch(console.error);
                throw err;
            }
            await updateProfile(cred.user, {displayName: username}).catch(
                console.error,
            );
        } finally {
            isRegistering = false;
        }
        window.location.replace(REDIRECT_URL);
    });
});

els.google.addEventListener("click", () =>
    run(() => signInWithPopup(auth, new GoogleAuthProvider())),
);
els.github.addEventListener("click", () =>
    run(() => signInWithPopup(auth, new GithubAuthProvider())),
);

els.forgot.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = els.email.value.trim();
    if (!email)
        return showMessage("Enter email first, the click Forgot Password?");
    clearMessage();
    try {
        await sendPasswordResetEmail(auth, email);
        showMessage("Password reset email sent. Check your inbox.", "success");
    } catch (err) {
        console.error(err);
        showMessage(friendlyError(err));
    }
});

onAuthStateChanged(auth, (user) => {
    if (user && !isRegistering) window.location.replace(REDIRECT_URL);
});
els.github.disabled = true; //Why is google's OAuth so easy to setup but github requires an offical domain and I dont have that kind of money man.
setMode("login");
