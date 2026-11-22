import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBe5j5HtZbgi0a9krNJW8i-fcGiJIRqIsc",
  authDomain: "spck-jsi-d8416.firebaseapp.com",
  projectId: "spck-jsi-d8416",
  storageBucket: "spck-jsi-d8416.firebasestorage.app",
  messagingSenderId: "641047074433",
  appId: "1:641047074433:web:5fb9aeff72261c4b05df80",
  measurementId: "G-XLZ9MZS25B", // unused, safe to delete
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);