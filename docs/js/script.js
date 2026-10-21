/* =========================
   FIREBASE SETUP
   ========================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDocsFromCache,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
  getDoc,
  setDoc,
  onSnapshot,
  writeBatch,
  enableIndexedDbPersistence,
  limit,
  startAfter,
  endBefore,
  orderBy,
  limitToLast,
  onSnapshotsInSync,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { initSalesModule, loadSales, updateSaleDropdown } from "./sales.js";
import {
  escapeQuantity,
  appendQuantityUnit,
  formatDisplayQuantity,
  formatNumber,
  isLiterUnit,
  isCrateItem,
  formatCrateStock,
  getCrateStockPieces,
  getPiecesPerCrate,
  PIECES_PER_CRATE,
  isPetrolName,
  parseQuantity,
  formatQuantity,
  adjustQuantity,
  adjustCrateStock,
  uppercaseInput
} from "./quantity.js";

import {
  getAuth,
  signOut,
  onAuthStateChanged,
  updatePassword // updatePassword is used for firstLogin password change, which is still in index.html
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

// 💾 Enable Firestore Offline Persistence (Data Caching)
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore Persistence Error:", err.code);
});

// Global Sync Listener
onSnapshotsInSync(db, () => {
  // This fires whenever the local cache and server are fully synchronized
  if (navigator.onLine && syncStatusIndicator) {
    console.log("All local changes have been synchronized with the server.");
    // You could update a "Last Synced" timestamp here
  }
});

const itemsRef = collection(db, "items");
const ordersRef = collection(db, "orders");
const stockAdditionsRef = collection(db, "stockAdditions");
const usersRef = collection(db, "users");
const paymentsRef = collection(db, "payments");

/* =========================
   DOM ELEMENTS
   ========================= */
const form = document.getElementById("itemForm");
const itemName = document.getElementById("itemName");
const incomingPrice = document.getElementById("incomingPrice");
const outgoingPrice = document.getElementById("outgoingPrice");
const quantityInput = document.getElementById("quantity");
const crateLoosePiecesField = document.getElementById("crateLoosePiecesField");
const crateLoosePiecesInput = document.getElementById("crateLoosePieces");
const piecesPerCrateField = document.getElementById("piecesPerCrateField");
const piecesPerCrateInput = document.getElementById("piecesPerCrate");
const buyingCostPerPieceField = document.getElementById("buyingCostPerPieceField");
const buyingCostPerPieceOutput = document.getElementById("buyingCostPerPiece");
const pieceSellingPriceField = document.getElementById("pieceSellingPriceField");
const pieceSellingPriceInput = document.getElementById("pieceSellingPrice");
const crateTypeSelect = document.getElementById("crateTypeSelect");
const includeInAllAnalyticsInput = document.getElementById("includeInAllAnalytics");
const saveItemBtn = document.getElementById("saveItemBtn");
const table = document.getElementById("itemTable");
const searchInput = document.getElementById("searchInput");
const totalProfitEl = document.getElementById("totalProfit");
const exportBtn = document.getElementById("exportBtn");
const searchMessage = document.getElementById("searchMessage");
const importCsvInput = document.getElementById("importCsvInput");
const importCsvBtn = document.getElementById("importCsvBtn");
const importProgressContainer = document.getElementById("importProgressContainer");
const importProgressBar = document.getElementById("importProgressBar");
const syncStatusIndicator = document.getElementById("syncStatusIndicator");
const dataLoadingBar = document.getElementById("dataLoadingBar");
const lowStockDetails = document.getElementById("lowStockDetails");
const lowStockTable = document.getElementById("lowStockTable");
const lowStockPrevBtn = document.getElementById("lowStockPrevBtn");
const lowStockNextBtn = document.getElementById("lowStockNextBtn");
const lowStockPageInfo = document.getElementById("lowStockPageInfo");
const paymentPayerName = document.getElementById("paymentPayerName");
const paymentMessage = document.getElementById("paymentMessage");
const paymentMethodSelect = document.getElementById("paymentMethod");
const paymentFirstBtn = document.getElementById("paymentFirstBtn");
const paymentAnnualBtn = document.getElementById("paymentAnnualBtn");
const openPaymentModalBtn = document.getElementById("openPaymentModalBtn");
const paymentModal = document.getElementById("paymentModal");
const viewPaymentHistoryBtn = document.getElementById("viewPaymentHistoryBtn");
const paymentHistoryModal = document.getElementById("paymentHistoryModal");
const closeHistoryModalBtn = document.getElementById("closeHistoryModalBtn");
const paymentHistoryTableBody = document.getElementById("paymentHistoryTableBody");
const paymentPrevBtn = document.getElementById("paymentPrevBtn");
const paymentNextBtn = document.getElementById("paymentNextBtn");
const paymentPageInfo = document.getElementById("paymentPageInfo");

const paymentConfirmModal = document.getElementById("paymentConfirmModal");
const paymentConfirmMessage = document.getElementById("paymentConfirmMessage");
const confirmPaymentBtn = document.getElementById("confirmPaymentBtn");
const cancelPaymentBtn = document.getElementById("cancelPaymentBtn");

const closePaymentModalBtn = document.getElementById("closePaymentModalBtn");
const stockHealthModal = document.getElementById("stockHealthModal");
const openStockHealthModalBtn = document.getElementById("openStockHealthModalBtn");
const closeStockHealthModalBtn = document.getElementById("closeStockHealthModalBtn");
const stockTopUpModal = document.getElementById("stockTopUpModal");
const stockTopUpForm = document.getElementById("stockTopUpForm");
const stockTopUpItemName = document.getElementById("stockTopUpItemName");
const stockTopUpDate = document.getElementById("stockTopUpDate");
const stockTopUpQuantity = document.getElementById("stockTopUpQuantity");
const stockTopUpUnitField = document.getElementById("stockTopUpUnitField");
const stockTopUpUnit = document.getElementById("stockTopUpUnit");
const stockTopUpUnitDescription = document.getElementById("stockTopUpUnitDescription");
const saveStockTopUpBtn = document.getElementById("saveStockTopUpBtn");
const cancelStockTopUpBtn = document.getElementById("cancelStockTopUpBtn");

// Inventory Pagination Elements
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

// Orders DOM Elements
const orderForm = document.getElementById("orderForm");
const customerName = document.getElementById("customerName");
const orderedItem = document.getElementById("orderedItem");
const orderedQuantity = document.getElementById("orderedQuantity");
const orderNotes = document.getElementById("orderNotes");
const registerOrderBtn = document.getElementById("registerOrderBtn");
const orderTable = document.getElementById("orderTable");
const orderSearchInput = document.getElementById("orderSearchInput");
const orderExportBtn = document.getElementById("orderExportBtn");
const orderSearchMessage = document.getElementById("orderSearchMessage");

let analyticsInclusionManuallySet = false;
includeInAllAnalyticsInput.addEventListener("change", () => {
  analyticsInclusionManuallySet = true;
});
itemName.addEventListener("input", () => {
  uppercaseInput(itemName);
  if (!editId && !analyticsInclusionManuallySet) {
    includeInAllAnalyticsInput.checked = !isPetrolName(itemName.value);
  }
  appendQuantityUnit(quantityInput, "L", isPetrolName(itemName.value));
  appendQuantityUnit(quantityInput, "CRATES", isCrateItem(itemName.value));
  updateCrateInventoryFields();
});
crateTypeSelect.addEventListener("change", () => {
  const crateTypes = {
    "soda-300ml": { name: "SODA 300ML CRATE", piecesPerCrate: 24 },
    "soda-500ml": { name: "SODA 500ML CRATE", piecesPerCrate: 24 },
    predator: { name: "PREDATOR CRATE", piecesPerCrate: 12 },
    "afia-500ml": { name: "AFIA 500ML CRATE", piecesPerCrate: 12 },
    "steam-300ml": { name: "STEAM 300ML CRATE", piecesPerCrate: 12 },
    "brava-300ml": { name: "BRAVA 300ML CRATE", piecesPerCrate: 12 },
    "minute-maid-400ml": { name: "MINUTE MAID 400ML CRATE", piecesPerCrate: 12 },
    "soda-1l": { name: "SODA 1L CRATE", piecesPerCrate: 12 },
    "soda-2l": { name: "SODA 2L CRATE", piecesPerCrate: 6 },
    "yoghurt-500ml": { name: "YOGHURT 500ML CRATE", piecesPerCrate: 10 },
    "yoghurt-250ml": { name: "YOGHURT 250ML CRATE", piecesPerCrate: 18 }
  };
  const crateType = crateTypes[crateTypeSelect.value];
  if (!crateType) return;

  itemName.value = crateType.name;
  itemName.dispatchEvent(new Event("input", { bubbles: true }));
  quantityInput.value = "0 CRATES";
  crateLoosePiecesInput.value = "0";
  piecesPerCrateInput.value = String(crateType.piecesPerCrate);
  updateCrateInventoryFields();
  crateLoosePiecesInput.max = String(crateType.piecesPerCrate - 1);
});
quantityInput.addEventListener("input", () => {
  appendQuantityUnit(quantityInput, "L", isPetrolName(itemName.value));
  appendQuantityUnit(quantityInput, "CRATES", isCrateItem(itemName.value));
  uppercaseInput(quantityInput);
});
piecesPerCrateInput.addEventListener("input", () => updateCrateInventoryFields());
incomingPrice.addEventListener("input", updateBuyingCostPerPiece);
orderedItem.addEventListener("input", () => {
  uppercaseInput(orderedItem);
  appendQuantityUnit(orderedQuantity, "L", isPetrolName(orderedItem.value));
});
orderedQuantity.addEventListener("input", () => {
  appendQuantityUnit(orderedQuantity, "L", isPetrolName(orderedItem.value));
  uppercaseInput(orderedQuantity);
});
customerName.addEventListener("input", () => uppercaseInput(customerName));
orderNotes.addEventListener("input", () => uppercaseInput(orderNotes));

// Password Change Modal Elements
const passwordChangeModal = document.getElementById("passwordChangeModal");
const newPasswordInput = document.getElementById("newPassword");
const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const passwordChangeMessage = document.getElementById("passwordChangeMessage");
const clientProfileModal = document.getElementById("clientProfileModal");
const clientProfileToggle = document.getElementById("clientProfileToggle");
const clientProfileMenu = document.getElementById("clientProfileMenu");
const viewClientProfileBtn = document.getElementById("viewClientProfileBtn");
const closeClientProfileBtn = document.getElementById("closeClientProfileBtn");
const clientProfileName = document.getElementById("clientProfileName");
const clientProfileEmail = document.getElementById("clientProfileEmail");
const clientProfilePhone = document.getElementById("clientProfilePhone");

const logoutBtn = document.getElementById("logoutBtn"); // Moved here as it's part of the dashboard
let currentClientProfile = null;

let items = [];
let orders = [];
let sales = [];
let editId = null;
let editOrderId = null;
let paymentReceipts = [];
let lastPaymentDoc = null;
let firstPaymentDoc = null;
let paymentPage = 1;
const paymentPageSize = 5;

let pendingPaymentData = null;

let lowStockPage = 1;
const lowStockPageSize = 5;
let itemsUnsubscribe = null;
let ordersUnsubscribe = null;
let stockTopUpItemId = null;

let isFirestoreOnline = navigator.onLine;
window.addEventListener('online', () => {
  isFirestoreOnline = true;
  showLoadingIndicator(false);
});
window.addEventListener('offline', () => {
  isFirestoreOnline = false;
  if (syncStatusIndicator) {
    syncStatusIndicator.textContent = "Offline";
    syncStatusIndicator.className = "offline";
    syncStatusIndicator.style.display = "inline";
  }
});

let lastVisibleDoc = null;
let firstVisibleDoc = null;

let lastOrderDoc = null;
let firstOrderDoc = null;
let orderPage = 1;

let currentPage = 1;
const pageSize = 20;

// 🛠️ UTILITY: Debounce function to limit database calls
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Event listener for when a sale is recorded/voided in sales.js
window.addEventListener('saleRecorded', async (e) => {
  const { uid } = e.detail;
  await loadItems(uid); // Reload items to update stock
  updateSaleDropdown(items); // Update dropdown with new stock levels
  renderLowStockAlerts();
});

lowStockPrevBtn?.addEventListener("click", () => renderLowStockAlerts(lowStockPage - 1));
lowStockNextBtn?.addEventListener("click", () => renderLowStockAlerts(lowStockPage + 1));

window.openStockTopUp = itemId => {
  const item = items.find(candidate => candidate.id === itemId);
  if (!item || !stockTopUpModal) return;

  stockTopUpItemId = item.id;
  stockTopUpItemName.textContent = item.name;
  const today = localDateKey(new Date());
  stockTopUpDate.value = today;
  stockTopUpDate.max = today;
  stockTopUpQuantity.value = "";
  const crateItem = isCrateItem(item.name);
  stockTopUpUnitField.hidden = !crateItem;
  stockTopUpUnit.hidden = !crateItem;
  stockTopUpUnitDescription.textContent = crateItem
    ? `${formatNumber(getPiecesPerCrate(item))} pieces per crate`
    : `Quantity will be added in ${parseQuantity(item.quantity)?.unit || "the item's current unit"}.`;
  stockTopUpModal.style.display = "flex";
  stockTopUpQuantity.focus();
};

cancelStockTopUpBtn?.addEventListener("click", () => {
  stockTopUpModal.style.display = "none";
  stockTopUpItemId = null;
});

stockTopUpModal?.addEventListener("click", event => {
  if (event.target === stockTopUpModal) {
    stockTopUpModal.style.display = "none";
    stockTopUpItemId = null;
  }
});

stockTopUpForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const user = auth.currentUser;
  const item = items.find(candidate => candidate.id === stockTopUpItemId);
  const amount = Number(stockTopUpQuantity.value);
  const selectedDate = stockTopUpDate.value;
  const today = localDateKey(new Date());
  if (!user || !item) {
    alert("Select an inventory item before adding stock.");
    return;
  }
  if (!selectedDate || selectedDate > today ||
      !Number.isFinite(new Date(`${selectedDate}T00:00:00`).getTime())) {
    alert("Choose today or an earlier date for the stock addition.");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter a stock quantity greater than zero.");
    return;
  }

  const crateItem = isCrateItem(item.name);
  const unit = crateItem ? stockTopUpUnit.value : parseQuantity(item.quantity)?.unit || "";
  if (crateItem && (!Number.isInteger(amount) ||
      (unit !== "crate" && unit !== "piece"))) {
    alert("Crate and piece stock additions must be whole numbers.");
    return;
  }

  saveStockTopUpBtn.disabled = true;
  try {
    const itemRef = doc(db, "items", item.id);
    const additionRef = doc(stockAdditionsRef);
    const createdAt = new Date().toISOString();
    await runTransaction(db, async transaction => {
      const latestItemSnapshot = await transaction.get(itemRef);
      if (!latestItemSnapshot.exists()) {
        throw new Error("This inventory item no longer exists.");
      }
      const latestItem = { id: latestItemSnapshot.id, ...latestItemSnapshot.data() };
      if (latestItem.uid !== user.uid) {
        throw new Error("You do not have permission to update this inventory item.");
      }

      const latestCrateItem = isCrateItem(latestItem.name);
      if (latestCrateItem !== crateItem) {
        throw new Error("The item's stock type changed. Close this form and try again.");
      }
      const latestPiecesPerCrate = latestCrateItem ? getPiecesPerCrate(latestItem) : null;
      const latestUnit = latestCrateItem
        ? unit
        : parseQuantity(latestItem.quantity)?.unit || "";
      const piecesAdded = latestCrateItem
        ? amount * (unit === "crate" ? latestPiecesPerCrate : 1)
        : null;
      const quantityUpdate = latestCrateItem
        ? adjustCrateStock(latestItem, piecesAdded)
        : { quantity: adjustQuantity(latestItem.quantity, amount) };
      const stockAddition = {
        uid: user.uid,
        itemId: latestItem.id,
        itemName: latestItem.name,
        quantity: amount,
        quantityUnit: latestCrateItem
          ? unit === "crate" ? "CRATES" : "PIECES"
          : latestUnit,
        stockDate: selectedDate,
        piecesPerCrate: latestPiecesPerCrate,
        piecesAdded,
        buyingPricePerUnit: Number(latestItem.incoming) || 0,
        createdAt
      };
      transaction.update(itemRef, quantityUpdate);
      transaction.set(additionRef, stockAddition);
    });

    stockTopUpModal.style.display = "none";
    stockTopUpForm.reset();
    stockTopUpItemId = null;
    alert(`Added stock to ${item.name}.`);
  } catch (error) {
    console.error("Unable to add inventory stock:", error);
    alert(`Unable to add stock: ${error.message}`);
  } finally {
    saveStockTopUpBtn.disabled = false;
  }
});

openPaymentModalBtn?.addEventListener('click', () => {
  if (paymentModal) paymentModal.style.display = 'flex';
});

closePaymentModalBtn?.addEventListener('click', () => {
  if (paymentModal) paymentModal.style.display = 'none';
});

paymentModal?.addEventListener('click', (event) => {
  if (event.target === paymentModal) {
    paymentModal.style.display = 'none';
  }
});

viewPaymentHistoryBtn?.addEventListener('click', () => {
  if (paymentHistoryModal) paymentHistoryModal.style.display = 'flex';
});

closeHistoryModalBtn?.addEventListener('click', () => {
  if (paymentHistoryModal) paymentHistoryModal.style.display = 'none';
});

paymentHistoryModal?.addEventListener('click', (event) => {
  if (event.target === paymentHistoryModal) {
    paymentHistoryModal.style.display = 'none';
  }
});

openStockHealthModalBtn?.addEventListener('click', () => {
  if (stockHealthModal) {
    renderLowStockAlerts(1);
    stockHealthModal.style.display = 'flex';
  }
});

closeStockHealthModalBtn?.addEventListener('click', () => {
  if (stockHealthModal) stockHealthModal.style.display = 'none';
});

stockHealthModal?.addEventListener('click', (event) => {
  if (event.target === stockHealthModal) {
    stockHealthModal.style.display = 'none';
  }
});

clientProfileToggle?.addEventListener("click", () => {
  const isOpen = clientProfileMenu && !clientProfileMenu.hidden;
  if (!clientProfileMenu) return;

  clientProfileMenu.hidden = isOpen;
  clientProfileToggle.setAttribute("aria-expanded", String(!isOpen));
  clientProfileToggle.setAttribute("aria-label", isOpen ? "Open profile menu" : "Close profile menu");
});

viewClientProfileBtn?.addEventListener("click", () => {
  if (!currentClientProfile || !clientProfileModal) return;

  clientProfileName.textContent = currentClientProfile.businessName || "N/A";
  clientProfileEmail.textContent = currentClientProfile.email || auth.currentUser?.email || "N/A";
  clientProfilePhone.textContent = currentClientProfile.phoneNumber || "N/A";
  clientProfileMenu.hidden = true;
  clientProfileToggle.setAttribute("aria-expanded", "false");
  clientProfileModal.style.display = "flex";
  closeClientProfileBtn?.focus();
});

function closeClientProfile() {
  if (clientProfileModal) clientProfileModal.style.display = "none";
  clientProfileToggle?.focus();
}

closeClientProfileBtn?.addEventListener("click", closeClientProfile);
clientProfileModal?.addEventListener("click", event => {
  if (event.target === clientProfileModal) closeClientProfile();
});

document.addEventListener("click", event => {
  if (clientProfileMenu && !clientProfileMenu.hidden &&
      !event.target.closest(".client-profile-menu")) {
    clientProfileMenu.hidden = true;
    clientProfileToggle?.setAttribute("aria-expanded", "false");
    clientProfileToggle?.setAttribute("aria-label", "Open profile menu");
  }
});

/* =========================
   AUTH STATE LISTENER
   ========================= */
onAuthStateChanged(auth, async (user) => {
  const bizContainer = document.querySelector(".container");
  const suspendedSection = document.getElementById("suspendedSection");

  if (user) {
    showLoadingIndicator(true);
    try {
      // Fetch user profile/status
      const userDocRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userDocRef);

      // If profile doesn't exist, the user wasn't registered by Admin
      if (!userSnap.exists()) {
        alert("Access Denied: Your account has not been set up in the database.");
        await signOut(auth);
        return;
      }

      const userData = userSnap.data();
      currentClientProfile = {
        businessName: userData.businessName,
        email: userData.email || user.email,
        phoneNumber: userData.phoneNumber
      };

      if (userData.firstLogin) {
        if (passwordChangeModal) passwordChangeModal.style.display = "flex";
        if (bizContainer) bizContainer.style.display = "none";
        if (suspendedSection) suspendedSection.style.display = "none";
      } else if (userData.suspended) {
        if (suspendedSection) suspendedSection.style.display = "block";
        if (bizContainer) bizContainer.style.display = "none";
      } else if (userData.role === "admin") {
        // Redirect Admin to the admin panel
        return;
      } else {
        if (bizContainer) bizContainer.style.display = "block";
        
        // Display Business Name in the title
        const bizTitle = document.getElementById("bizTitle");
        if (bizTitle && userData.businessName) {
          bizTitle.textContent = userData.businessName;
        }
        const welcomeMessage = document.getElementById("welcomeMessage");
        if (welcomeMessage) {
          welcomeMessage.textContent = userData.businessName
            ? `Welcome back, ${userData.businessName}!`
            : "Welcome back!";
        }
        
        if (suspendedSection) suspendedSection.style.display = "none";
        if (passwordChangeModal) passwordChangeModal.style.display = "none";

        // Initialize and Load Data sequentially
        initSalesModule(db, auth, items, itemsRef, ordersRef, userData.businessName);
        await loadItems(user.uid);
        await loadOrders(user.uid);
        await loadSales(user.uid);
        await loadPaymentReceipts(user.uid);
        
        // Setup Contract Download for Client
        renderContractDownloadButton(userData.businessName);
      }
    } catch (error) {
      console.error("Detailed Initialization Error:", error);

      // If we are offline, a 'unavailable' error is expected; don't sign out.
      if (error.code === 'unavailable' || !navigator.onLine) {
          console.warn("Initializing in offline mode...");
      } else if (error.code === 'failed-precondition' || error.message.includes('index')) {
          alert("Database Index Required: Look at the browser console (F12) now for the blue link to create it. Do NOT refresh yet.");
      } else {
          alert("Data Access Error: " + error.message);
          await signOut(auth);
      }
    } finally {
      showLoadingIndicator(false);
    }
  } else {
    if (bizContainer) bizContainer.style.display = "none";
    if (suspendedSection) suspendedSection.style.display = "none";
    if (passwordChangeModal) passwordChangeModal.style.display = "none";

    items = [];
    orders = [];
    if (table) table.innerHTML = "";
    if (orderTable) orderTable.innerHTML = "";
    if (totalProfitEl) totalProfitEl.textContent = "0";
  }
});

/* =========================
   CONTRACT PDF GENERATION (CLIENT SIDE)
   ========================= */
function renderContractDownloadButton(businessName) {
  const header = document.querySelector(".section-divider");
  if (!header || document.getElementById("clientContractBtn")) return;

  const btn = document.createElement("button");
  btn.id = "clientContractBtn";
  btn.className = "action-btn";
  btn.style.background = "#6366f1";
  btn.style.float = "right";
  btn.innerHTML = "📄 Download Service Agreement";
  
  btn.onclick = async () => {
    const date = new Date().toLocaleDateString();
    const clientName = businessName || "Valued Client";

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    try {
      doc.addImage(LOGO_PATH, 'PNG', 10, 10, 30, 30);
    } catch (e) {
      console.warn("Logo not found at images/logo.png, skipping image.");
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(PROVIDER_NAME, pageWidth / 2, 25, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Business Management Solutions & Software Development", pageWidth / 2, 32, { align: "center" });
    doc.line(20, 45, pageWidth - 20, 45);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("SOFTWARE SERVICE AGREEMENT", 20, 60);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Document Date: ${date}`, 20, 70);
    doc.text(`This agreement is entered between ${PROVIDER_NAME} (Provider) and ${clientName} (Client).`, 20, 80);

    const sections = [
      { title: "1. SCOPE OF SERVICE", body: "The Provider agrees to deploy and maintain the BizPulse Business Management System." },
      { title: "2. FEES AND PAYMENT TERMS", body: "- Initial Installation Fee: KES 10,000.00 (Due upon deployment)\n- Annual Renewal Fee: KES 7,000.00 (Due annually for cloud & support)" },
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

    // Important Notice Box
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

    cursorY += 35;
    doc.text("__________________________", 20, cursorY);
    doc.text("__________________________", pageWidth - 80, cursorY);
    doc.text(`${PROVIDER_NAME} (Provider)`, 20, cursorY + 7);
    doc.text(`${clientName} (Client)`, pageWidth - 80, cursorY + 7);

    doc.save(`Contract_${clientName.replace(/\s+/g, '_')}.pdf`);
  };

  header.prepend(btn);
}

/* =========================
   LOADING INDICATOR HELPER
   ========================= */
function showLoadingIndicator(show) {
  if (dataLoadingBar) dataLoadingBar.hidden = !show;
  if (syncStatusIndicator) {
    if (show) {
      syncStatusIndicator.textContent = "Loading...";
      syncStatusIndicator.className = "loading";
      syncStatusIndicator.style.display = "inline";
    } else if (isFirestoreOnline) { // Only hide if online, otherwise 'Offline' should persist
      syncStatusIndicator.style.display = "none";
      syncStatusIndicator.className = "";
    }
  }
}


// Expose auth for inline logout buttons
window.auth = auth;
window.showLoadingIndicator = showLoadingIndicator;

/* =========================
   TAB SWITCHING LOGIC
   ========================= */
function switchTab(tabId) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Update content sections
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  const activeSection = document.getElementById(`${tabId}Section`);
  if (activeSection) activeSection.style.display = 'block';

  const sectionLabel = document.getElementById("currentDashboardSection");
  if (sectionLabel && activeBtn) sectionLabel.textContent = activeBtn.textContent.trim();

  // Cache the selection in LocalStorage
  localStorage.setItem('bizPulse_activeTab', tabId);
  closeDashboardNavigation();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.getAttribute('data-tab'));
  });
});

const dashboardMenuToggle = document.getElementById("dashboardMenuToggle");
const dashboardNavigation = document.getElementById("dashboardNavigation");
const dashboardMenuBackdrop = document.getElementById("dashboardMenuBackdrop");
const dashboardMenuClose = document.getElementById("dashboardMenuClose");

function closeDashboardNavigation() {
  if (!dashboardNavigation || !dashboardMenuToggle || !dashboardMenuBackdrop) return;
  dashboardNavigation.classList.remove("open");
  dashboardNavigation.setAttribute("aria-hidden", "true");
  dashboardMenuToggle.setAttribute("aria-expanded", "false");
  dashboardMenuToggle.setAttribute("aria-label", "Open navigation menu");
  dashboardMenuBackdrop.hidden = true;
  document.body.classList.remove("dashboard-menu-open");
}

function openDashboardNavigation() {
  if (!dashboardNavigation || !dashboardMenuToggle || !dashboardMenuBackdrop) return;
  dashboardNavigation.classList.add("open");
  dashboardNavigation.setAttribute("aria-hidden", "false");
  dashboardMenuToggle.setAttribute("aria-expanded", "true");
  dashboardMenuToggle.setAttribute("aria-label", "Close navigation menu");
  dashboardMenuBackdrop.hidden = false;
  document.body.classList.add("dashboard-menu-open");
  dashboardMenuClose?.focus();
}

dashboardMenuToggle?.addEventListener("click", () => {
  if (dashboardNavigation?.classList.contains("open")) closeDashboardNavigation();
  else openDashboardNavigation();
});

dashboardMenuClose?.addEventListener("click", closeDashboardNavigation);
dashboardMenuBackdrop?.addEventListener("click", closeDashboardNavigation);
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;

  closeDashboardNavigation();
  if (clientProfileModal?.style.display === "flex") {
    closeClientProfile();
  } else if (clientProfileMenu && !clientProfileMenu.hidden) {
    clientProfileMenu.hidden = true;
    clientProfileToggle?.setAttribute("aria-expanded", "false");
    clientProfileToggle?.setAttribute("aria-label", "Open profile menu");
    clientProfileToggle?.focus();
  }
});

// Initialize/Restore tab
const savedDashboardTab = localStorage.getItem('bizPulse_activeTab');
switchTab(savedDashboardTab && savedDashboardTab !== "inventory" ? savedDashboardTab : "overview");

/* =========================
   LOGOUT LOGIC
   ========================= */
logoutBtn?.addEventListener("click", async () => {
  try {
    if (itemsUnsubscribe) itemsUnsubscribe();
    if (ordersUnsubscribe) ordersUnsubscribe();
    await signOut(auth);
    // Clear Firestore's local cache
    await db.clearPersistence();
    // Clear UI state from LocalStorage
    localStorage.removeItem('bizPulse_activeTab');
    localStorage.removeItem('bizPulse_salesDate');
    console.log("Firestore persistence and LocalStorage cleared on logout.");
  } catch (error) {
    console.error("Logout failed:", error);
  } finally {
    window.location.href = "login.html";
  }
});

/* =========================
   PASSWORD CHANGE LOGIC (FIRST LOGIN)
   ========================= */
changePasswordBtn.addEventListener("click", async () => {
  const newPass = newPasswordInput.value;
  const confirmNewPass = confirmNewPasswordInput.value;
  const user = auth.currentUser;

  passwordChangeMessage.textContent = "";
  changePasswordBtn.disabled = true;

  if (!user) {
    passwordChangeMessage.style.color = "red";
    passwordChangeMessage.textContent = "No user logged in.";
    changePasswordBtn.disabled = false;
    return;
  }

  if (newPass.length < 6) {
    passwordChangeMessage.style.color = "red";
    passwordChangeMessage.textContent = "Password must be at least 6 characters long.";
    changePasswordBtn.disabled = false;
    return;
  }

  if (newPass !== confirmNewPass) {
    passwordChangeMessage.style.color = "red";
    passwordChangeMessage.textContent = "Passwords do not match.";
    changePasswordBtn.disabled = false;
    return;
  }

  try {
    await updatePassword(user, newPass);
    await updateDoc(doc(db, "users", user.uid), { firstLogin: false });

    passwordChangeMessage.style.color = "green";
    passwordChangeMessage.textContent = "Password changed successfully! Redirecting...";
    
    // Reload the page to re-evaluate auth state and hide modal
    window.location.reload(); 
  } catch (error) {
    console.error("Error changing password:", error);
    passwordChangeMessage.style.color = "red";
    passwordChangeMessage.textContent = "Error changing password: " + error.message;
  } finally {
    changePasswordBtn.disabled = false;
  }
});

/* =========================
   BUSINESS LOGIC
   ========================= */
function calculateSingleItemProfit(item) {
  return item.outgoing - item.incoming;
}

function calculateProfit(item) {
  if (isCrateItem(item.name)) {
    const crates = parseQuantity(item.quantity)?.amount ?? 0;
    const loosePieces = Number(item.loosePieces) || 0;
    const pieceProfit = (Number(item.pieceSellingPrice) || 0) - item.incoming / getPiecesPerCrate(item);
    return crates * calculateSingleItemProfit(item) + loosePieces * pieceProfit;
  }
  return calculateSingleItemProfit(item) * (parseQuantity(item.quantity)?.amount || 0);
}

function updateCrateInventoryFields(item = null) {
  const showCrateFields = isCrateItem(item?.name || itemName.value);
  crateLoosePiecesField.hidden = !showCrateFields;
  piecesPerCrateField.hidden = !showCrateFields;
  buyingCostPerPieceField.hidden = !showCrateFields;
  pieceSellingPriceField.hidden = !showCrateFields;
  incomingPrice.placeholder = showCrateFields ? "Buying Price per Crate" : "Buying Price";
  outgoingPrice.placeholder = showCrateFields ? "Selling Price per Crate" : "Selling Price";
  quantityInput.placeholder = showCrateFields
    ? "Crates in stock (e.g. 5 crates)"
    : "Quantity (e.g. 5 L, 3 kg, 5 cartons)";
  crateLoosePiecesInput.required = showCrateFields;
  piecesPerCrateInput.required = showCrateFields;
  pieceSellingPriceInput.required = showCrateFields;
  if (!showCrateFields && !item) {
    crateLoosePiecesInput.value = "0";
    piecesPerCrateInput.value = String(PIECES_PER_CRATE);
    pieceSellingPriceInput.value = "";
    crateTypeSelect.value = "";
  }
  const piecesPerCrate = Number(piecesPerCrateInput.value);
  crateLoosePiecesInput.max = String(
    Number.isInteger(piecesPerCrate) && piecesPerCrate > 0
      ? piecesPerCrate - 1
      : PIECES_PER_CRATE - 1
  );
  updateBuyingCostPerPiece();
}

function updateBuyingCostPerPiece() {
  const crateBuyingPrice = Number(incomingPrice.value);
  const piecesPerCrate = Number(piecesPerCrateInput.value);
  if (!incomingPrice.value.trim() || !Number.isFinite(crateBuyingPrice) ||
      !Number.isInteger(piecesPerCrate) || piecesPerCrate < 1) {
    buyingCostPerPieceOutput.textContent = "Enter crate buying price";
    return;
  }
  buyingCostPerPieceOutput.textContent =
    `KES ${formatNumber(crateBuyingPrice / piecesPerCrate)} per piece`;
}

function formatInventoryStock(item) {
  return isCrateItem(item.name)
    ? formatCrateStock(item)
    : formatDisplayQuantity(item.quantity);
}

function getInventoryStockAmount(item) {
  return isCrateItem(item.name)
    ? getCrateStockPieces(item)
    : parseQuantity(item.quantity)?.amount ?? 0;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCratePiecePrice(item) {
  return item.pieceSellingPrice === null || item.pieceSellingPrice === undefined ||
      item.pieceSellingPrice === ""
    ? "Not set"
    : formatNumber(item.pieceSellingPrice);
}

async function loadItems(uid, direction = 'initial', search = '') {
    if (itemsUnsubscribe) itemsUnsubscribe();
    showLoadingIndicator(true);

    try {
    let q;
    let baseQuery = query(itemsRef, where("uid", "==", uid), orderBy("name_lowercase"));

    // Apply search filter if present
    if (search) {
      const searchLower = search.toLowerCase();
      baseQuery = query(baseQuery, where("name_lowercase", ">=", searchLower), where("name_lowercase", "<=", searchLower + '\uf8ff'));
    }

    if (direction === 'next' && lastVisibleDoc) {
      q = query(baseQuery, startAfter(lastVisibleDoc), limit(pageSize));
    } else if (direction === 'prev' && firstVisibleDoc) {
      q = query(baseQuery, endBefore(firstVisibleDoc), limitToLast(pageSize));
    } else {
      q = query(baseQuery, limit(pageSize));
      currentPage = 1;
    }

    // Using onSnapshot is the most cost-effective way to read data.
    // It only reads the "changes" after the initial load.
    itemsUnsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        if (direction === 'initial') {
          items.length = 0;
          renderItems();
        }
        showLoadingIndicator(false);
        return;
      }

      firstVisibleDoc = snapshot.docs[0];
      lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

      const fetchedItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    items.length = 0;
    items.push(...fetchedItems);

    // Only update page number if not an initial load or search
    if (direction === 'next') currentPage++; 
    else if (direction === 'prev') currentPage--; 
    else currentPage = 1; // Reset to page 1 for initial load or new search

    renderItems(searchInput.value);
    updateSaleDropdown(items);
    updatePaginationUI(snapshot.size, uid);
      showLoadingIndicator(false);
    }, (error) => {
      console.error("Listener error:", error);
      showLoadingIndicator(false);
    });

    } finally {
      // showLoadingIndicator(false); // Handled inside the listener callback
    }
}

function updatePaginationUI(currentCount, uid) {
  if (pageInfo) pageInfo.textContent = `Page ${currentPage}`;
  if (prevPageBtn) prevPageBtn.disabled = (currentPage === 1);
  // Note: For 'next' button, a more complex check (fetching n+1) is usually needed, 
  // but we'll disable it if the current page has fewer than pageSize items.
  if (nextPageBtn) nextPageBtn.disabled = (currentCount < pageSize);
}

prevPageBtn?.addEventListener("click", () => {
  loadItems(auth.currentUser.uid, 'prev', searchInput.value);
});

nextPageBtn?.addEventListener("click", () => {
  loadItems(auth.currentUser.uid, 'next', searchInput.value);
});

// Optimized: Debounce the search input to save Firestore reads
const debouncedSearch = debounce(() => {
  if (auth.currentUser) {
    loadItems(auth.currentUser.uid, 'initial', searchInput.value);
  }
}, 300); // Wait 300ms after last keystroke before querying

searchInput.addEventListener("input", debouncedSearch);

function renderItems(filter = "") {
  table.innerHTML = "";
  let totalProfit = 0;

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(filter.toLowerCase())); // Keep client-side filter for current page

  filtered.forEach(item => {
    const quantity = getInventoryStockAmount(item);
    const singleItemProfit = calculateSingleItemProfit(item);
    const profit = calculateProfit(item);
    totalProfit += profit;

    const row = document.createElement("tr");
    if (quantity <= 3) row.classList.add("low-stock-row");
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${isCrateItem(item.name)
        ? `KES ${formatNumber(item.incoming)} / crate`
        : formatNumber(item.incoming)}</td>
      <td>${isCrateItem(item.name)
        ? `KES ${formatNumber(item.outgoing)} / crate<br>KES ${formatCratePiecePrice(item)} / piece`
        : formatNumber(item.outgoing)}</td>
      <td>${escapeQuantity(formatInventoryStock(item))}</td>
      <td>${formatNumber(singleItemProfit)}</td>
      <td>${formatNumber(profit)}</td>
      <td>
        <button onclick="openStockTopUp('${item.id}')">Add stock</button>
        <button onclick="editItem('${item.id}')">Edit</button>
        <button onclick="deleteItem('${item.id}')">Delete</button>
      </td>
    `;
    table.appendChild(row);
  });

  if (totalProfitEl) totalProfitEl.textContent = formatNumber(totalProfit);
  renderLowStockAlerts();
}

function renderLowStockAlerts(page = 1) {
  if (!lowStockDetails || !lowStockTable || !lowStockPageInfo) return;

  const lowStockItems = items.filter(item => getInventoryStockAmount(item) <= 3);
  const totalItems = lowStockItems.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / lowStockPageSize);
  lowStockPage = Math.min(Math.max(page, 1), totalPages);

  if (totalItems === 0) {
    lowStockTable.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#475569;">No low-stock items.</td></tr>`;
    lowStockPageInfo.textContent = "Page 0";
    lowStockPrevBtn.disabled = true;
    lowStockNextBtn.disabled = true;
    return;
  }

  const startIndex = (lowStockPage - 1) * lowStockPageSize;
  const paginatedItems = lowStockItems.slice(startIndex, startIndex + lowStockPageSize);

  lowStockTable.innerHTML = paginatedItems.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>${isCrateItem(item.name)
        ? `KES ${formatNumber(item.incoming)} / crate`
        : formatNumber(item.incoming)}</td>
      <td>${isCrateItem(item.name)
        ? `KES ${formatNumber(item.outgoing)} / crate<br>KES ${formatCratePiecePrice(item)} / piece`
        : formatNumber(item.outgoing)}</td>
      <td>${escapeQuantity(formatInventoryStock(item))}</td>
    </tr>
  `).join("");

  lowStockPageInfo.textContent = `Page ${lowStockPage} of ${totalPages}`;
  lowStockPrevBtn.disabled = lowStockPage === 1;
  lowStockNextBtn.disabled = lowStockPage === totalPages;
}

async function loadPaymentReceipts(uid, direction = 'initial') {
  if (!uid) return;
  showLoadingIndicator(true);
  try {
    let q;
    const baseQuery = query(paymentsRef, where("uid", "==", uid), orderBy("timestamp", "desc"));

    if (direction === 'next' && lastPaymentDoc) {
      q = query(baseQuery, startAfter(lastPaymentDoc), limit(paymentPageSize));
    } else if (direction === 'prev' && firstPaymentDoc) {
      q = query(baseQuery, endBefore(firstPaymentDoc), limitToLast(paymentPageSize));
    } else {
      q = query(baseQuery, limit(paymentPageSize));
      paymentPage = 1;
    }

    const snap = await getDocs(q);
    
    if (snap.empty) {
      paymentReceipts = [];
      if (direction === 'initial' && paymentFirstBtn) paymentFirstBtn.style.display = "inline-block";
    } else {
      firstPaymentDoc = snap.docs[0];
      lastPaymentDoc = snap.docs[snap.docs.length - 1];

      paymentReceipts = snap.docs.map(d => ({
        ...d.data(),
        timestamp: new Date(d.data().timestamp).toLocaleString()
      }));

      if (direction === 'next') paymentPage++;
      else if (direction === 'prev') paymentPage--;

      // Lock the "First Payment" button if it has already been made (global check on init)
      if (direction === 'initial') {
        const checkQ = query(paymentsRef, where("uid", "==", uid), where("label", "==", "First payment"), limit(1));
        const checkSnap = await getDocs(checkQ);
        if (paymentFirstBtn) paymentFirstBtn.style.display = !checkSnap.empty ? "none" : "inline-block";
      }
    }

    updatePaymentPaginationUI(snap.size);
    renderPaymentReceipts();
  } catch (error) {
    console.error("Error loading payments:", error);
  } finally {
    showLoadingIndicator(false);
  }
}

function updatePaymentPaginationUI(currentCount) {
  if (paymentPageInfo) paymentPageInfo.textContent = `Page ${paymentPage}`;
  if (paymentPrevBtn) paymentPrevBtn.disabled = (paymentPage === 1);
  if (paymentNextBtn) paymentNextBtn.disabled = (currentCount < paymentPageSize);
}

function savePaymentReceipts() {
  try {
    sessionStorage.setItem("bizPulsePaymentReceipts", JSON.stringify(paymentReceipts));
  } catch (error) {
    console.warn("Unable to save payment receipts:", error);
  }
}

function renderPaymentReceipts() {
  if (!paymentHistoryTableBody) return;

  if (paymentReceipts.length === 0) {
    paymentHistoryTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#64748b;">No payment records found.</td></tr>`;
    return;
  }

  paymentHistoryTableBody.innerHTML = paymentReceipts.map(receipt => `
    <tr>
      <td>${receipt.label}</td>
      <td style="font-weight:bold; color:#059669;">KES ${formatNumber(receipt.amount)}</td>
      <td>${receipt.method}</td>
      <td>${receipt.timestamp}</td>
    </tr>
  `).join("");
}

function showPaymentMessage(text, type = "info") {
  if (!paymentMessage) return;
  paymentMessage.textContent = text;
  paymentMessage.style.color = type === "error" ? "#dc2626" : "#047857";
}

async function recordPayment(method, amount, label) {
  const payer = paymentPayerName?.value.trim();
  if (!payer) {
    showPaymentMessage("Enter payer name before recording payment.", "error");
    return;
  }

  const receipt = {
    uid: auth.currentUser.uid,
    businessName: document.getElementById("bizTitle")?.textContent || "Unknown Business",
    name: payer,
    method,
    amount,
    label,
    timestamp: new Date().toISOString()
  };

  try {
    await addDoc(paymentsRef, receipt);
    await loadPaymentReceipts(auth.currentUser.uid, 'initial');
    
    // Immediately hide the button if this was the first payment
    if (label === "First payment" && paymentFirstBtn) {
      paymentFirstBtn.style.display = "none";
    }
    showPaymentMessage(`Recorded ${label} for ${payer}.`);
  } catch (error) {
    console.error("Payment sync error:", error);
    showPaymentMessage("Error syncing payment to server.", "error");
  }
}

function handlePaymentClick(amount, label) {
  const payer = paymentPayerName?.value.trim();
  const method = paymentMethodSelect?.value || "Unknown";

  if (!payer) {
    showPaymentMessage("Enter payer name before recording payment.", "error");
    return;
  }

  pendingPaymentData = { method, amount, label };
  if (paymentConfirmMessage) {
    paymentConfirmMessage.textContent = `Are you sure you want to record a ${label} of KES ${formatNumber(amount)} for ${payer}?`;
  }
  if (paymentConfirmModal) paymentConfirmModal.style.display = "flex";
}

paymentFirstBtn?.addEventListener("click", () => handlePaymentClick(10000, "First payment"));
paymentAnnualBtn?.addEventListener("click", () => handlePaymentClick(7000, "Annual payment"));

paymentPrevBtn?.addEventListener("click", () => loadPaymentReceipts(auth.currentUser.uid, 'prev'));
paymentNextBtn?.addEventListener("click", () => loadPaymentReceipts(auth.currentUser.uid, 'next'));

confirmPaymentBtn?.addEventListener("click", async () => {
  if (pendingPaymentData) {
    if (paymentConfirmModal) paymentConfirmModal.style.display = "none";
    await recordPayment(pendingPaymentData.method, pendingPaymentData.amount, pendingPaymentData.label);
    pendingPaymentData = null;
  }
});

cancelPaymentBtn?.addEventListener("click", () => {
  if (paymentConfirmModal) paymentConfirmModal.style.display = "none";
  pendingPaymentData = null;
});

form.addEventListener("submit", async e => {
  showLoadingIndicator(true);
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) {
    alert("You must be logged in.");
    return;
  }

  const nameVal = itemName.value.trim();
  const quantity = parseQuantity(quantityInput.value);
  const crateItem = isCrateItem(nameVal);
  if (!quantity) {
    alert("Enter a valid quantity, such as 5, 3 kg, or 5 cartons.");
    showLoadingIndicator(false);
    return;
  }
  if (crateItem && (!Number.isInteger(quantity.amount) ||
      (quantity.unit && !/^crates?$/i.test(quantity.unit)))) {
    alert("Crate stock must be a whole number of crates.");
    showLoadingIndicator(false);
    return;
  }
  const loosePieces = Number(crateLoosePiecesInput.value);
  const piecesPerCrate = Number(piecesPerCrateInput.value);
  if (crateItem && (!Number.isInteger(piecesPerCrate) || piecesPerCrate < 1)) {
    alert("Pieces per crate must be a positive whole number.");
    showLoadingIndicator(false);
    return;
  }
  if (crateItem && (!Number.isInteger(loosePieces) || loosePieces < 0 ||
      loosePieces >= piecesPerCrate)) {
    alert(`Loose pieces must be a whole number between 0 and ${piecesPerCrate - 1}.`);
    showLoadingIndicator(false);
    return;
  }
  if (crateItem && (!Number.isFinite(Number(pieceSellingPriceInput.value)) ||
      Number(pieceSellingPriceInput.value) < 0)) {
    alert("Enter a valid selling price per piece.");
    showLoadingIndicator(false);
    return;
  }
  if (isPetrolName(nameVal) && quantity.unit && !isLiterUnit(quantity.unit)) {
    alert("Petrol inventory quantities must be recorded in liters (L).");
    showLoadingIndicator(false);
    return;
  }
  const quantityUnit = isPetrolName(nameVal) ? "L" : crateItem ? "CRATES" : quantity.unit;

  const data = {
    name: nameVal,
    name_lowercase: nameVal.toLowerCase(),
    incoming: Number(incomingPrice.value),
    outgoing: Number(outgoingPrice.value),
    quantity: formatQuantity(quantity.amount, quantityUnit),
    loosePieces: crateItem ? loosePieces : null,
    piecesPerCrate: crateItem ? piecesPerCrate : null,
    pieceSellingPrice: crateItem ? Number(pieceSellingPriceInput.value) : null,
    includeInAllAnalytics: includeInAllAnalyticsInput.checked,
    uid: user.uid, // ✅ REQUIRED
    createdAt: new Date().toISOString()
  };

  saveItemBtn.disabled = true;
  saveItemBtn.classList.add("loading");

  try {
    // 1. Global Case-Insensitive Check
    // Optimized: Only query for the specific item name to save reads
    const duplicateQuery = query(itemsRef, 
      where("uid", "==", user.uid), 
      where("name_lowercase", "==", nameVal.toLowerCase()),
      limit(1));
    const duplicateSnap = await getDocs(duplicateQuery);

    const isDuplicate = !duplicateSnap.empty && duplicateSnap.docs[0].id !== editId;

    if (isDuplicate) {
      alert(`Error: An item named "${nameVal}" already exists in your inventory.`);
      saveItemBtn.disabled = false;
      saveItemBtn.classList.remove("loading");
      return;
    }

    if (editId) {
      await updateDoc(doc(db, "items", editId), data);
      editId = null;
    } else {
      await addDoc(itemsRef, data);
    }

    form.reset();
    crateLoosePiecesInput.value = "0";
    piecesPerCrateInput.value = String(PIECES_PER_CRATE);
    updateCrateInventoryFields();
    analyticsInclusionManuallySet = false;
    loadItems(user.uid);
  } catch (err) {
    alert("Error saving item: " + err.message);
    console.error("Error saving item:", err);
  } finally {
    saveItemBtn.disabled = false;
    saveItemBtn.classList.remove("loading");
    showLoadingIndicator(false);
  }
});
/* =========================
   EDIT
   ========================= */
window.editItem = id => {
  const item = items.find(i => i.id === id);
  if (!item) return;

  itemName.value = item.name;
  includeInAllAnalyticsInput.checked = typeof item.includeInAllAnalytics === "boolean"
    ? item.includeInAllAnalytics
    : !isPetrolName(item.name);
  analyticsInclusionManuallySet = false;
  incomingPrice.value = item.incoming;
  outgoingPrice.value = item.outgoing;
  quantityInput.value = typeof item.quantity === "string"
    ? item.quantity
    : String(item.quantity);
  appendQuantityUnit(quantityInput, "L", isPetrolName(item.name));
  appendQuantityUnit(quantityInput, "CRATES", isCrateItem(item.name));
  crateLoosePiecesInput.value = String(Number(item.loosePieces) || 0);
  piecesPerCrateInput.value = String(getPiecesPerCrate(item));
  pieceSellingPriceInput.value = item.pieceSellingPrice ?? "";
  updateCrateInventoryFields(item);
  crateTypeSelect.value = "";
  editId = id;
};

/* =========================
   DELETE
   ========================= */
window.deleteItem = async (id) => {
  if (confirm("Delete this item?")) {
    showLoadingIndicator(true);
    try {
      await deleteDoc(doc(db, "items", id));
      await loadItems(auth.currentUser.uid);
    } finally {
      showLoadingIndicator(false);
    }
  }
};

/* =========================
   END OF INVENTORY LOGIC
   ========================= */

/* =========================
   EXPORT TO EXCEL
   ========================= */
exportBtn.addEventListener("click", () => {
  let csv = "Item,Buying Price,Selling Price,Selling Price Per Piece,Pieces Per Crate,Quantity,Single Item Profit,Profit\n";
  items.forEach(item => {
    const piecePrice = item.pieceSellingPrice === null || item.pieceSellingPrice === undefined ||
        item.pieceSellingPrice === ""
      ? ""
      : formatNumber(item.pieceSellingPrice);
    csv += `${item.name},${formatNumber(item.incoming)},${formatNumber(item.outgoing)},${piecePrice},${isCrateItem(item.name) ? getPiecesPerCrate(item) : ""},${formatInventoryStock(item)},${formatNumber(calculateSingleItemProfit(item))},${formatNumber(calculateProfit(item))}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "business_report.csv";
  a.click();
  URL.revokeObjectURL(url);
});

/* =========================
   IMPORT FROM CSV
   ========================= */
importCsvBtn.addEventListener("click", () => {
  importCsvInput.click(); // Trigger the hidden file input click
});

importCsvInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    // Remove BOM and split by any newline character
    const csv = e.target.result.replace(/^\uFEFF/, "");
    const lines = csv.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length === 0) {
      alert("The CSV file is empty.");
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const expectedHeaders = ["item", "buying price", "selling price", "quantity"];

    if (!expectedHeaders.every(h => headers.includes(h))) {
      alert(`CSV headers must include: ${expectedHeaders.join(', ')}`);
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to import items.");
      return;
    }

    // Optimized Global Check: Fetch all existing names ONCE before the loop
    // This avoids querying the database for every single row in the CSV.
    const allItemsSnap = await getDocs(query(itemsRef, where("uid", "==", user.uid)));
    const existingNames = new Set(allItemsSnap.docs.map(d => d.data().name.toLowerCase()));

    const newItems = [];
    let skippedCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, '')); // Remove surrounding quotes
      if (values.length < expectedHeaders.length) continue; // Skip malformed rows

      const itemData = {};
      headers.forEach((header, index) => {
        itemData[header] = values[index];
      });

      const itemNameFromCsv = itemData["item"] || "Unknown Item";

      if (existingNames.has(itemNameFromCsv.toLowerCase())) {
        skippedCount++;
        continue;
      }

      // Helper to clean numeric strings (removes commas, currency symbols, etc.)
      const cleanNum = (val) => Number(String(val).replace(/[^0-9.-]+/g, ""));

      const quantity = parseQuantity(itemData["quantity"]);
      if (!quantity) {
        skippedCount++;
        continue;
      }

      newItems.push({
        name: itemNameFromCsv,
        name_lowercase: itemNameFromCsv.toLowerCase(),
        incoming: cleanNum(itemData["buying price"]) || 0,
        outgoing: cleanNum(itemData["selling price"]) || 0,
        quantity: formatQuantity(quantity.amount, quantity.unit),
        includeInAllAnalytics: !isPetrolName(itemNameFromCsv),
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
    }

    if (newItems.length === 0) {
      if (skippedCount > 0) {
        alert(`Import skipped: All ${skippedCount} items already exist in your inventory.`);
      } else {
        alert("No valid item data found in CSV.");
      }
      return;
    }

    try {
      if (importProgressContainer) {
        importProgressContainer.style.display = "block";
        importProgressBar.style.width = "0%";
      }

      // Firestore batches are limited to 500 operations.
      // We process in chunks to show progress and handle large files safely.
      const batchSize = 500;
      for (let i = 0; i < newItems.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = newItems.slice(i, i + batchSize);

        chunk.forEach(item => {
          batch.set(doc(itemsRef), item);
        });

        await batch.commit();
        
        const progress = Math.round(((i + chunk.length) / newItems.length) * 100);
        if (importProgressBar) importProgressBar.style.width = `${progress}%`;
      }
      
      // Clear file input so the same file can be re-selected if needed
      importCsvInput.value = "";
      
      let successMsg = `Import Complete!\n- Successfully imported: ${newItems.length} items.`;
      if (skippedCount > 0) {
        successMsg += `\n- Skipped (already exists): ${skippedCount} items.`;
      }
      alert(successMsg);
      await loadItems(user.uid);
    } catch (error) {
      alert("Error importing items: " + error.message);
      console.error("Import error:", error);
    } finally {
      // Hide progress bar after a short delay so user sees completion
      setTimeout(() => {
        if (importProgressContainer) importProgressContainer.style.display = "none";
        if (importProgressBar) importProgressBar.style.width = "0%";
      }, 1500);
    }
    showLoadingIndicator(false); // Hide loading indicator after import attempt
  };
  reader.readAsText(file);
});

/* =========================
   ORDERS MANAGEMENT
   ========================= */

async function loadOrders(uid) {
  loadOrdersPaginated(uid, 'initial');
}

async function loadOrdersPaginated(uid, direction = 'initial') {
  if (ordersUnsubscribe) ordersUnsubscribe();
  showLoadingIndicator(true);
  
  let q;
  const baseQuery = query(ordersRef, where("uid", "==", uid), orderBy("createdAt", "desc"));

  if (direction === 'next' && lastOrderDoc) {
    q = query(baseQuery, startAfter(lastOrderDoc), limit(10));
  } else if (direction === 'prev' && firstOrderDoc) {
    q = query(baseQuery, endBefore(firstOrderDoc), limitToLast(10));
  } else {
    q = query(baseQuery, limit(10));
    orderPage = 1;
  }

  return new Promise((resolve) => {
    let isFirstLoad = true;
    ordersUnsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        firstOrderDoc = snapshot.docs[0];
        lastOrderDoc = snapshot.docs[snapshot.docs.length - 1];
      }

      orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (direction === 'next') orderPage++;
      else if (direction === 'prev') orderPage--;
      else orderPage = 1;

      renderOrders(orderSearchInput.value);
      updateOrdersPaginationUI(snapshot.size);
      showLoadingIndicator(false);
      if (isFirstLoad) { isFirstLoad = false; resolve(); }
    }, (error) => {
      console.error("Orders listener error:", error);
      showLoadingIndicator(false);
      if (isFirstLoad) resolve();
    });
  });
}

function updateOrdersPaginationUI(currentCount) {
  const ordersPageInfo = document.getElementById("ordersPageInfo");
  const ordersPrevBtn = document.getElementById("ordersPrevPageBtn");
  const ordersNextBtn = document.getElementById("ordersNextPageBtn");

  if (ordersPageInfo) ordersPageInfo.textContent = `Page ${orderPage}`;
  if (ordersPrevBtn) ordersPrevBtn.disabled = (orderPage === 1);
  if (ordersNextBtn) ordersNextBtn.disabled = (currentCount < 10);
}

// Sales Pagination Listeners
document.getElementById("salesPrevPageBtn")?.addEventListener("click", () => loadSales(auth.currentUser.uid, 'prev'));
document.getElementById("salesNextPageBtn")?.addEventListener("click", () => loadSales(auth.currentUser.uid, 'next'));

// Orders Pagination Listeners
document.getElementById("ordersPrevPageBtn")?.addEventListener("click", () => loadOrdersPaginated(auth.currentUser.uid, 'prev'));
document.getElementById("ordersNextPageBtn")?.addEventListener("click", () => loadOrdersPaginated(auth.currentUser.uid, 'next'));

function renderOrders(filter = "") {
  orderTable.innerHTML = "";

  const filtered = orders.filter(o =>
    o.customerName.toLowerCase().includes(filter.toLowerCase()) ||
    o.itemName.toLowerCase().includes(filter.toLowerCase())
  );

  if (orderSearchMessage) orderSearchMessage.textContent = filtered.length === 0 && filter ? "Order not found" : "";

  filtered.forEach(order => {
    const orderDate = order.date ? new Date(order.date).toLocaleDateString() : "N/A";
    
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${order.customerName}</td>
      <td>${order.itemName}</td>
      <td>${escapeQuantity(formatDisplayQuantity(order.quantity))}</td>
      <td>${order.notes || "-"}</td>
      <td>${orderDate}</td>
      <td>
        <button onclick="editOrder('${order.id}')">Edit</button>
        <button onclick="deleteOrder('${order.id}')">Delete</button>
      </td>
    `;
    orderTable.appendChild(row);
  });
  renderLowStockAlerts();
}

orderForm.addEventListener("submit", async e => {
  showLoadingIndicator(true);
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) {
    alert("You must be logged in.");
    return;
  }

  const orderQuantity = parseQuantity(orderedQuantity.value);
  if (!orderQuantity || orderQuantity.amount <= 0) {
    alert("Enter a valid order quantity greater than zero.");
    showLoadingIndicator(false);
    return;
  }
  if (isPetrolName(orderedItem.value) && orderQuantity.unit && !isLiterUnit(orderQuantity.unit)) {
    alert("Petrol order quantities must be recorded in liters (L).");
    showLoadingIndicator(false);
    return;
  }
  const orderQuantityUnit = isPetrolName(orderedItem.value) ? "L" : orderQuantity.unit;

  const data = {
    customerName: customerName.value,
    itemName: orderedItem.value,
    quantity: formatQuantity(orderQuantity.amount, orderQuantityUnit),
    notes: orderNotes.value,
    date: new Date().toISOString(),
    uid: user.uid, // ✅ REQUIRED
    createdAt: new Date().toISOString()
  };

  registerOrderBtn.disabled = true;
  registerOrderBtn.classList.add("loading");

  try {
    if (editOrderId) {
      await updateDoc(doc(db, "orders", editOrderId), data);
      editOrderId = null;
    } else {
      await addDoc(ordersRef, data);
    }

    orderForm.reset();
  } catch (err) {
    alert("Error saving order: " + err.message);
    console.error("Error saving order:", err);
  } finally {
    registerOrderBtn.disabled = false;
    registerOrderBtn.classList.remove("loading");
    showLoadingIndicator(false);
  }
});

window.editOrder = id => {
  const order = orders.find(o => o.id === id);
  if (!order) return;

  customerName.value = order.customerName;
  orderedItem.value = order.itemName;
  orderedQuantity.value = formatDisplayQuantity(order.quantity);
  appendQuantityUnit(orderedQuantity, "L", isPetrolName(order.itemName));
  orderNotes.value = order.notes || "";
  editOrderId = id;
};

window.deleteOrder = async id => {
  if (confirm("Delete this order?")) {
    showLoadingIndicator(true);
    try {
      await deleteDoc(doc(db, "orders", id));
    } finally {
      showLoadingIndicator(false);
    }
  }
};

orderSearchInput.addEventListener("input", () => {
  renderOrders(orderSearchInput.value);
});

/* =========================
   EXPORT ORDERS TO PDF
   ========================= */
orderExportBtn.addEventListener("click", () => {
  if (orders.length === 0) {
    alert("No orders to export");
    return;
  }

  let pdfContent = "%PDF-1.4\n";
  let objectCount = 1;
  let objects = [];

  // Object 1: Catalog
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // Object 2: Pages
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  // Object 3: Page
  objects.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");

  // Object 4: Stream (Content)
  let content = "BT\n";
  content += "/F1 20 Tf\n50 750 Td\n(Customer Orders & Out of Stock) Tj\n";
  content += "0 -30 Td\n/F1 12 Tf\n";

  let yPos = 700;
  const lineHeight = 15;

  orders.forEach((order, index) => {
    const orderDate = order.date ? new Date(order.date).toLocaleDateString() : "N/A";
    content += `(${index + 1}. ${order.customerName} - ${order.itemName} x${formatDisplayQuantity(order.quantity)} - ${orderDate}) Tj\nT*\n`;
    yPos -= lineHeight;
  });

  content += "ET\n";

  objects.push(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  // Object 5: Font
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  // Build PDF
  let pdf = "%PDF-1.4\n";
  let offset = 9;
  let xref = [];

  objects.forEach((obj, i) => {
    xref.push(offset);
    pdf += obj;
    offset += obj.length;
  });

  // XRef table
  let xrefOffset = offset;
  let xrefTable = "xref\n";
  xrefTable += `0 ${objects.length + 1}\n`;
  xrefTable += "0000000000 65535 f\n";
  xref.forEach(pos => {
    xrefTable += `${pos.toString().padStart(10, "0")} 00000 n\n`;
  });

  pdf += xrefTable;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "customer_orders.pdf";
  a.click();
  URL.revokeObjectURL(url);
});
