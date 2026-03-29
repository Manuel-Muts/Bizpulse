import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* 🔐 FIREBASE CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyBIGqZLYcDg3CR5VamDwBhtOOfl2Y0NYeI",
  authDomain: "timotech-films.firebaseapp.com",
  databaseURL: "https://timotech-films-default-rtdb.firebaseio.com",
  projectId: "timotech-films",
  storageBucket: "timotech-films.firebasestorage.app",
  messagingSenderId: "563809562931",
  appId: "1:563809562931:web:750ff7e819f2d57e9dce46"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================
   DOM ELEMENTS
   ========================= */
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginMessage = document.getElementById("loginMessage");
const loginBtn = document.getElementById("loginBtn");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const forgotSpinner = document.getElementById("forgotSpinner");

/* =========================
   LOGIN LOGIC
   ========================= */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  loginMessage.textContent = "";
  loginMessage.style.color = "";

  loginBtn.disabled = true;
  loginBtn.classList.add("loading");

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );

    // Fetch user role to determine redirect path
    const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
    const userData = userDoc.data();

    loginMessage.style.color = "green";
    loginMessage.textContent = "Login successful! Redirecting...";

    setTimeout(() => {
      if (userData && userData.role === "admin") {
        window.location.href = "/admin.html";
      } else {
        // Regular clients now go to clients.html
        window.location.href = "/clients.html";
      }
    }, 1000);

  } catch (err) {
    loginMessage.style.color = "red";
    loginMessage.textContent = "Login failed: " + err.message;
    loginBtn.disabled = false;
    loginBtn.classList.remove("loading");
  }
});

/* =========================
   FORGOT PASSWORD
   ========================= */
forgotPasswordLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();

  if (!email) {
    loginMessage.style.color = "red";
    loginMessage.textContent = "⚠️ Please enter your email address in the Email field above, then click 'Forgot Password' again.";
    return;
  }

  try {
    // Show indicator and disable link
    forgotSpinner.style.display = "inline-block";
    forgotPasswordLink.style.opacity = "0.5";
    forgotPasswordLink.style.pointerEvents = "none";

    await sendPasswordResetEmail(auth, email);
    loginMessage.style.color = "green";
    loginMessage.textContent = "Password reset email sent! Check your inbox.";
  } catch (err) {
    loginMessage.style.color = "red";
    loginMessage.textContent = "Error: " + err.message;
  } finally {
    forgotSpinner.style.display = "none";
    forgotPasswordLink.style.opacity = "1";
    forgotPasswordLink.style.pointerEvents = "auto";
  }
});