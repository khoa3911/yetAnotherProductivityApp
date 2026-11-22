const express = require("express");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize Firebase Admin
initializeApp({
  credential: cert(require("./serviceAccountKey.json")),
});

const db = getFirestore();
const app = express();
app.use(express.json());

// Serve the frontend
app.use(express.static(path.join(__dirname, "public")));

// Auth middleware
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    req.user = await getAuth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Protected route
app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const doc = await db.collection("users").doc(req.user.uid).get();
    const data = doc.exists ? doc.data() : {};
    res.json({ uid: req.user.uid, email: req.user.email, username: data.username ?? null });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.listen(3000, () => console.log("http://localhost:3000"));