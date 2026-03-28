import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  getDoc,
  setDoc,
  enableIndexedDbPersistence, // For caching
  query,
  orderBy,
  limit,
  startAfter,
  endBefore,
  limitToLast,
  where // For search
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const db = getFirestore(app);
const auth = getAuth(app);

/* 🖼️ COMPANY ASSETS */
const LOGO_PATH = "images/logo.png"; 
const PROVIDER_NAME = "MUTSTECH LTD";

// 💾 Enable Firestore Offline Persistence (Data Caching) for Admin
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore Persistence Error (Admin):", err.code);
});

const usersRef = collection(db, "users");

// Secondary app to create users without logging out the admin
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

const adminPanel = document.getElementById("adminPanel");
const adminUserTable = document.getElementById("adminUserTable");
const logoutBtn = document.getElementById("logoutBtn");
const registerForm = document.getElementById("registerBusinessForm");
const newBusName = document.getElementById("newBusName");
const newBusEmail = document.getElementById("newBusEmail");
const newBusPassword = document.getElementById("newBusPassword");
const regMessage = document.getElementById("regMessage"); // For registration/update messages
const adminSearchInput = document.getElementById("adminSearchInput"); // For client search
const prevPageBtn = document.getElementById("adminPrevPageBtn"); // Pagination
const nextPageBtn = document.getElementById("adminNextPageBtn"); // Pagination
const pageInfo = document.getElementById("adminPageInfo"); // Pagination


let editUserId = null;
let users = [];

/* =========================
   AUTH PROTECTOR
   ========================= */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid)); // <--- LINE OF INTEREST
      const userData = userDoc.data();

      if (userData && userData.role === "admin") {
        adminPanel.style.display = "block";
        loadAdminDashboard();
      } else {
        // Not an admin? Send back to main page
        window.location.href = "index.html";
      }
    } catch (error) {
      console.error("Admin verification error:", error);
      window.location.href = "index.html";
    }
  } else {
    window.location.href = "index.html";
  }
});

/* =========================
   ADMIN DASHBOARD (PAGINATED & SEARCHABLE)
   ========================= */
let lastVisibleDoc = null;
let firstVisibleDoc = null;
let currentPage = 1;
const pageSize = 20; // 20 clients per page

async function loadAdminDashboard(direction = 'initial', search = '') {
  try {
    let q;
    let baseQuery = query(usersRef, orderBy("email")); // Always order by email for consistent pagination

    // Apply search filter if present
    if (search) {
      const searchLower = search.toLowerCase();
      baseQuery = query(baseQuery, where("email", ">=", searchLower), where("email", "<=", searchLower + '\uf8ff'));
    }

    if (direction === 'next' && lastVisibleDoc) {
      q = query(baseQuery, startAfter(lastVisibleDoc), limit(pageSize));
    } else if (direction === 'prev' && firstVisibleDoc) {
      q = query(baseQuery, endBefore(firstVisibleDoc), limitToLast(pageSize));
    } else {
      // Initial load or new search
      q = query(baseQuery, limit(pageSize));
      currentPage = 1;
    }

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      users = []; // Clear users if no results
      adminUserTable.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">No clients found.</td></tr>`;
      updatePaginationUI(0);
      return;
    }

    // Store snapshots for navigation
    firstVisibleDoc = snapshot.docs[0];
    lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

    // Filter out the admin's own account from the list
    users = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.role !== 'admin');
    
    adminUserTable.innerHTML = "";

    users.forEach(u => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${u.businessName || 'N/A'}</td>
        <td>${u.email}</td>
        <td class="${u.suspended ? 'status-red' : 'status-green'}">
            ${u.suspended ? 'Suspended' : 'Active'}
        </td>
        <td class="actions">
          <button class="action-btn" style="background: ${u.suspended ? '#16a34a' : '#f59e0b'};" onclick="toggleSuspension('${u.id}', ${u.suspended})">
            ${u.suspended ? 'Reactivate' : 'Suspend'}
          </button>
          <button class="action-btn" style="background: #10b981;" onclick="editUser('${u.id}')">
            Edit
          </button>
          <button class="action-btn" style="background: #6366f1;" onclick="downloadContract('${u.id}')">
            Contract
          </button>
          <button class="action-btn delete" onclick="deleteUser('${u.id}', '${u.email}')">
            Delete
          </button>
        </td>
      `;
      adminUserTable.appendChild(row);
    });

    // Update current page number
    if (direction === 'next') currentPage++;
    else if (direction === 'prev') currentPage--;

    updatePaginationUI(snapshot.size);
  } catch (error) {
    console.error("Error loading dashboard:", error);
    adminUserTable.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red; padding:20px;">Error loading clients: ${error.message}</td></tr>`;
  }
}

function updatePaginationUI(currentCount) {
  if (pageInfo) pageInfo.textContent = `Page ${currentPage}`;
  if (prevPageBtn) prevPageBtn.disabled = (currentPage === 1);
  // Disable next if current page has fewer than pageSize items, implying no more pages
  if (nextPageBtn) nextPageBtn.disabled = (currentCount < pageSize);
}

// Pagination Event Listeners
prevPageBtn?.addEventListener("click", () => {
  loadAdminDashboard('prev', adminSearchInput.value);
});

nextPageBtn?.addEventListener("click", () => {
  loadAdminDashboard('next', adminSearchInput.value);
});

// Search Event Listener
adminSearchInput?.addEventListener("input", () => {
  loadAdminDashboard('initial', adminSearchInput.value); // Reset to first page on new search
});

/* =========================
   DELETE USER
   ========================= */
window.deleteUser = async (userId, userEmail) => {
  if (confirm(`Are you sure you want to delete client ${userEmail}? This will also delete ALL their items, sales records, and orders. This action cannot be undone.`)) {
    try {
      // 1. Define collections that need cleaning
      const collectionsToClean = ["items", "sales", "orders"];
      const deletePromises = [];

      // 2. Gather all related documents across collections
      for (const colName of collectionsToClean) {
        const q = query(collection(db, colName), where("uid", "==", userId));
        const snap = await getDocs(q);
        snap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
      }

      // 3. Add the user profile deletion to the list
      deletePromises.push(deleteDoc(doc(db, "users", userId)));

      // 4. Execute all deletions in parallel
      await Promise.all(deletePromises);

      alert(`Client ${userEmail} and all associated data have been deleted.`);
      loadAdminDashboard('initial', adminSearchInput.value); // Reload dashboard
    } catch (error) {
      alert("Error deleting user: " + error.message);
      console.error("Delete user error:", error);
    }
  }
}

/* =========================
   REGISTRATION LOGIC
   ========================= */
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newBusName.value.trim();
  const email = newBusEmail.value.trim();
  const password = newBusPassword.value;
  const regBtn = document.getElementById("regBtn");

  regBtn.disabled = true;

  try {
    if (editUserId) {
      // UPDATE MODE
      regMessage.textContent = "Updating client details...";
      await updateDoc(doc(db, "users", editUserId), {
        businessName: name,
        email: email.toLowerCase()
      });
      
      regMessage.style.color = "green";
      regMessage.textContent = "Client updated successfully!";
      editUserId = null;
      regBtn.textContent = "Create Account";
      newBusPassword.required = true;
      newBusPassword.disabled = false;
    } else {
      // CREATE MODE
      regMessage.textContent = "Creating account...";
    // 1. Create the Auth account
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUser = userCredential.user;

    // 2. Create the user profile in the "users" collection
   await setDoc(doc(db, "users", newUser.uid), {
  businessName: name,
  email: email.toLowerCase(),
  role: "user",
  suspended: false,
  firstLogin: true,
  createdAt: new Date().toISOString(),
  uid: newUser.uid // ✅ ADD THIS
});
    await signOut(secondaryAuth); // Ensure the secondary instance is cleared

    regMessage.style.color = "green";
    regMessage.textContent = `Success! Account created for ${email}`;
    }

    registerForm.reset();
    loadAdminDashboard('initial', adminSearchInput.value); // Reload dashboard, reset pagination
  } catch (error) {
    regMessage.style.color = "red";
    regMessage.textContent = "Error: " + error.message;
  } finally {
    regBtn.disabled = false;
  }
});

/* =========================
   EDIT USER
   ========================= */
window.editUser = (id) => {
  const user = users.find(u => u.id === id);
  if (!user) return;

  editUserId = id;
  newBusName.value = user.businessName || "";
  newBusEmail.value = user.email;
  
  // When editing, we don't handle password changes through this form 
  // for security/technical limitations of the client SDK.
  newBusPassword.value = "";
  newBusPassword.required = false;
  newBusPassword.disabled = true;

  const regBtn = document.getElementById("regBtn");
  regBtn.textContent = "Update Client";
  regMessage.textContent = "Editing client: " + user.email;
  regMessage.style.color = "#2563eb";
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* =========================
   CONTRACT PDF GENERATION
   ========================= */
window.downloadContract = async (id) => {
  const user = users.find(u => u.id === id);
  if (!user) {
    alert("Client details not found.");
    return;
  }

  const clientName = user.businessName || "Valued Client";
  const date = new Date().toLocaleDateString();

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Logo and Header
  try {
    doc.addImage(LOGO_PATH, 'PNG', 10, 10, 30, 30);
  } catch (e) {
    console.warn("Logo not found at images/logo.png, skipping image.");
  }
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(PROVIDER_NAME, pageWidth / 2, 25, { align: "center" });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Business Management Solutions & Software Development", pageWidth / 2, 32, { align: "center" });

  doc.setLineWidth(0.5);
  doc.line(20, 45, pageWidth - 20, 45); // Horizontal divider

  // 2. Title and Intro
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("SOFTWARE SERVICE AGREEMENT", 20, 60);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Document Date: ${date}`, 20, 70);
  doc.text(`This agreement is entered between ${PROVIDER_NAME} (Provider) and ${clientName} (Client).`, 20, 80);

  // 3. Sections
  const sections = [
    { title: "1. SCOPE OF SERVICE", body: "The Provider agrees to deploy and maintain the BizPulse Business Management System." },
    { title: "2. FEES AND PAYMENT TERMS", body: "- Initial Installation Fee: KES 15,000.00 (Due upon deployment)\n- Annual Renewal Fee: KES 10,000.00 (Due annually for cloud & support)" },
    { title: "3. DATA PRIVACY & OWNERSHIP", body: "The Provider guarantees that all business data remains the exclusive property of the Client." },
    { title: "4. SERVICE SUSPENSION", body: "The Provider reserves the right to suspend access if renewal fees are not settled within 14 days." }
  ];

  let cursorY = 95;
  sections.forEach(s => {
    doc.setFont("helvetica", "bold");
    doc.text(s.title, 20, cursorY);
    doc.setFont("helvetica", "normal");
    doc.text(s.body, 20, cursorY + 7);
    cursorY += 25;
  });

  // 4. Important Notice Box
  cursorY += 5;
  doc.setDrawColor(99, 102, 241); // Indigo border
  doc.setLineWidth(0.5);
  doc.rect(20, cursorY, pageWidth - 40, 20); 
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("IMPORTANT NOTICE:", 25, cursorY + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Technical support is available Mon-Fri (8 AM - 5 PM). System maintenance and security", 25, cursorY + 14);
  doc.text("patches are included in the annual renewal fee to ensure business continuity.", 25, cursorY + 18);

  // 5. Signatures
  cursorY += 35;
  doc.text("__________________________", 20, cursorY);
  doc.text("__________________________", pageWidth - 80, cursorY);
  doc.text(`${PROVIDER_NAME} (Provider)`, 20, cursorY + 7);
  doc.text(`${clientName} (Client)`, pageWidth - 80, cursorY + 7);

  doc.save(`Contract_${clientName.replace(/\s+/g, '_')}.pdf`);
};

/* =========================
   ACTIONS
   ========================= */
window.toggleSuspension = async (userId, currentStatus) => {
  const action = currentStatus ? "reactivate" : "suspend";
  if (confirm(`Are you sure you want to ${action} this client?`)) {
    try {
      await updateDoc(doc(db, "users", userId), {
        suspended: !currentStatus
      });
      loadAdminDashboard('initial', adminSearchInput.value); // Reload dashboard, reset pagination
    } catch (error) {
      alert("Error updating user status: " + error.message);
    }
  }
};

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    // Clear Firestore's local cache for admin
    await db.clearPersistence();
    console.log("Admin Firestore persistence cleared on logout.");
  } catch (error) {
    console.error("Logout failed:", error);
  }
});