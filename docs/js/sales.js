import {
  collection,
  onSnapshot,
  doc,
  query,
  where,
  writeBatch,
  limit,
  orderBy,
  startAfter,
  endBefore,
  limitToLast,
  getDocs,
  setDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements (Sales & Analytics)
const saleForm = document.getElementById("saleForm");
const saleItemSearch = document.getElementById("saleItemSearch");
const saleSearchResults = document.getElementById("saleSearchResults");
const salePriceInput = document.getElementById("salePrice");
const saleQuantityInput = document.getElementById("saleQuantity");
const recordSaleBtn = document.getElementById("recordSaleBtn");
const salesTableBody = document.getElementById("salesTable"); // Renamed to avoid conflict with global sales array
const dailyRevenueEl = document.getElementById("dailyRevenue");
const dailyProfitEl = document.getElementById("dailyProfit");
const dailyCountEl = document.getElementById("dailyCount");
const monthlyRevenueEl = document.getElementById("monthlyRevenue");
const monthlyProfitEl = document.getElementById("monthlyProfit");
const lifetimeProfitEl = document.getElementById("lifetimeProfit");
const saleDateFilter = document.getElementById("saleDateFilter");

let dbInstance;
let authInstance;
let itemsArray = []; // Reference to the items array from script.js
let salesArray = []; // Local sales array for this module
let salesRef;
let itemsRef; // Need itemsRef for batch updates
let ordersCollectionRef; // Reference to the orders collection
let salesSummaryRef = null;
let salesSummaryData = null;
let analyticsSummaryLoaded = false;
let clientBusinessName; // The business name of the logged-in client
let selectedItemId = null;
let editSaleId = null;
let salesUnsubscribe = null;
let allSalesForAnalytics = [];
let analyticsUnsubscribe = null;

// Pagination State
let lastSalesDoc = null;
let firstSalesDoc = null;
let salesPage = 1;
const salesPageSize = 10;

const salesPrevPageBtn = document.getElementById("salesPrevPageBtn");
const salesNextPageBtn = document.getElementById("salesNextPageBtn");
const salesPageInfo = document.getElementById("salesPageInfo");

/**
 * Initializes the sales module.
 * @param {Firestore} db - The Firestore database instance.
 * @param {Auth} auth - The Firebase Auth instance.
 * @param {Array} items - The current items array from script.js (for search).
 * @param {CollectionReference} itemsCollectionRef - Reference to the 'items' collection (for updates).
 * @param {CollectionReference} ordersRef - Reference to the 'orders' collection (for auto-reorder).
 * @param {string} businessName - The business name of the logged-in client.
 */
export function initSalesModule(db, auth, items, itemsCollectionRef, ordersRef, businessName) {
  dbInstance = db;
  authInstance = auth;
  itemsArray = items;
  itemsRef = itemsCollectionRef;
  salesRef = collection(dbInstance, "sales");
  ordersCollectionRef = ordersRef;
  salesSummaryRef = doc(dbInstance, "salesSummaries", authInstance.currentUser.uid);
  clientBusinessName = businessName;

  // Attach event listener for sale form
  saleForm.addEventListener("submit", handleSaleFormSubmit);

  // Attach search listener
  saleItemSearch.addEventListener("input", handleItemSearch);

  // Initialize/Restore Date Filter
  const savedDate = localStorage.getItem('bizPulse_salesDate');
  const today = new Date().toLocaleDateString('en-CA');
  saleDateFilter.value = savedDate || today;
  
  saleDateFilter.addEventListener("change", () => {
    localStorage.setItem('bizPulse_salesDate', saleDateFilter.value);
    renderSalesTable();
    updateAnalyticsUI();
  });

  // Close search results when clicking outside
  document.addEventListener("click", (e) => {
    if (!saleItemSearch.contains(e.target) && !saleSearchResults.contains(e.target)) {
      saleSearchResults.style.display = "none";
    }
  });
}

/**
 * Updates the local items reference.
 * @param {Array} currentItems - The latest items array.
 */
export function updateSaleDropdown(currentItems) {
  itemsArray = currentItems; // Update local reference
}

/**
 * Filters items based on search input and renders results.
 */
function handleItemSearch() {
  const term = saleItemSearch.value.toLowerCase().trim();
  selectedItemId = null;

  if (!term) {
    saleSearchResults.style.display = "none";
    return;
  }

  const matches = itemsArray.filter(i => i.name.toLowerCase().includes(term) && i.quantity > 0);

  if (matches.length === 0) {
    saleSearchResults.style.display = "none";
    return;
  }

  saleSearchResults.innerHTML = matches.map(item => `
    <div class="search-result-item" onclick="window.selectSaleItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')">
      <strong>${item.name}</strong> <br/>
      <small>Price: KES ${item.outgoing} | Stock: ${item.quantity}</small>
    </div>
  `).join("");
  saleSearchResults.style.display = "block";
}

/**
 * Selects an item from the search results.
 */
window.selectSaleItem = (id, name) => {
  selectedItemId = id;
  saleItemSearch.value = name;
  saleSearchResults.style.display = "none";

  // Auto-fill price if preferred
  const item = itemsArray.find(i => i.id === id);
  if (item) salePriceInput.value = item.outgoing;
  saleQuantityInput.focus();
}

/**
 * Loads sales data for the current user.
 * @param {string} uid - The user's UID.
 */
export function loadSales(uid, direction = 'initial') {
  // Start the global analytics listener once
  if (!analyticsUnsubscribe) listenToAnalytics(uid);

  // Cleanup existing listener if it exists to prevent memory leaks
  if (salesUnsubscribe) salesUnsubscribe();

  window.showLoadingIndicator(true); // Show loading indicator
  
  let q;
  const baseQuery = query(salesRef, where("uid", "==", uid), orderBy("createdAt", "desc"));

  if (direction === 'next' && lastSalesDoc) {
    q = query(baseQuery, startAfter(lastSalesDoc), limit(salesPageSize));
  } else if (direction === 'prev' && firstSalesDoc) {
    q = query(baseQuery, endBefore(firstSalesDoc), limitToLast(salesPageSize));
  } else {
    q = query(baseQuery, limit(salesPageSize));
    salesPage = 1;
  }

  // onSnapshot provides real-time updates and handles offline data automatically.
  // Returning a Promise allows the app initialization to wait for the first data emit.
  return new Promise((resolve) => {
    let isFirstLoad = true;
    salesUnsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        firstSalesDoc = snapshot.docs[0];
        lastSalesDoc = snapshot.docs[snapshot.docs.length - 1];
      }

      salesArray = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (direction === 'next') salesPage++;
      else if (direction === 'prev') salesPage--;
      else salesPage = 1;

      renderSalesTable();
      updateSalesPaginationUI(snapshot.size);
      window.showLoadingIndicator(false);
      if (isFirstLoad) { isFirstLoad = false; resolve(); }
    }, (error) => {
      console.error("Sales listener error:", error);
      window.showLoadingIndicator(false);
      if (isFirstLoad) resolve(); // Resolve anyway to not block the app
    });
  });
}

function updateSalesPaginationUI(currentCount) {
  if (salesPageInfo) salesPageInfo.textContent = `Page ${salesPage}`;
  if (salesPrevPageBtn) salesPrevPageBtn.disabled = (salesPage === 1);
  if (salesNextPageBtn) salesNextPageBtn.disabled = (currentCount < salesPageSize);
}

/**
 * Listens to all sales for real-time global analytics.
 */
function listenToAnalytics(uid) {
  const summaryDocRef = doc(dbInstance, "salesSummaries", uid);
  analyticsUnsubscribe = onSnapshot(summaryDocRef, async (snapshot) => {
    if (snapshot.exists()) {
      salesSummaryData = snapshot.data();
      updateAnalyticsUI();
      analyticsSummaryLoaded = true;
    } else {
      await buildSummaryFallback(uid, summaryDocRef);
    }
  }, async (error) => {
    console.error("Analytics listener error:", error);
    await buildSummaryFallback(uid, summaryDocRef);
  });
}

async function buildSummaryFallback(uid, summaryDocRef) {
  try {
    const allSalesSnap = await getDocs(query(salesRef, where("uid", "==", uid)));
    const existingSales = allSalesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allSalesForAnalytics = existingSales; // Store for immediate UI use
    salesSummaryData = buildSummaryFromSales(existingSales);
    updateAnalyticsUI();

    if (!analyticsSummaryLoaded) {
      try {
        await setDoc(summaryDocRef, salesSummaryData, { merge: true });
        analyticsSummaryLoaded = true;
      } catch (saveError) {
        console.warn("Unable to write sales summary doc:", saveError.message);
      }
    }
  } catch (fallbackError) {
    console.error("Analytics fallback failed:", fallbackError);
  }
}

function buildSummaryFromSales(sales) {
  const summary = {
    dailyTotals: {},
    monthlyTotals: {},
    lifetime: { revenue: 0, profit: 0 }
  };

  sales.forEach(sale => {
    const saleDate = new Date(sale.createdAt).toLocaleDateString('en-CA');
    const saleMonth = saleDate.slice(0, 7);
    if (!summary.dailyTotals[saleDate]) {
      summary.dailyTotals[saleDate] = { revenue: 0, profit: 0, count: 0 };
    }
    if (!summary.monthlyTotals[saleMonth]) {
      summary.monthlyTotals[saleMonth] = { revenue: 0, profit: 0 };
    }

    summary.dailyTotals[saleDate].revenue += sale.revenue;
    summary.dailyTotals[saleDate].profit += sale.profit;
    summary.dailyTotals[saleDate].count += sale.quantity;
    summary.monthlyTotals[saleMonth].revenue += sale.revenue;
    summary.monthlyTotals[saleMonth].profit += sale.profit;
    summary.lifetime.revenue += sale.revenue;
    summary.lifetime.profit += sale.profit;
  });

  return summary;
}

/**
 * Updates the analytics cards using the full sales dataset.
 */
function updateAnalyticsUI() {
  let dayRev = 0, dayProf = 0, dayCount = 0;
  let monthRev = 0, monthProf = 0;
  let lifeProf = 0;
  
  const targetDate = saleDateFilter.value;
  const targetMonth = targetDate.slice(0, 7); // YYYY-MM

  if (salesSummaryData) {
    // Helper to get values from either flat keys (legacy/polluted) or nested objects (standard)
    const getVal = (path, defaultVal = 0) => {
      if (salesSummaryData[path] !== undefined) return salesSummaryData[path]; // Handle literal flat keys
      return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, salesSummaryData) ?? defaultVal;
    };

    dayRev = getVal(`dailyTotals.${targetDate}.revenue`);
    dayProf = getVal(`dailyTotals.${targetDate}.profit`);
    dayCount = getVal(`dailyTotals.${targetDate}.count`);
    monthRev = getVal(`monthlyTotals.${targetMonth}.revenue`);
    monthProf = getVal(`monthlyTotals.${targetMonth}.profit`);
    lifeProf = getVal(`lifetime.profit`);
  } else {
    const targetDateObj = new Date(targetDate);
    const targetMonthIndex = targetDateObj.getMonth();
    const targetYear = targetDateObj.getFullYear();

    allSalesForAnalytics.forEach(sale => {
      const saleDateObj = new Date(sale.createdAt);
      const saleDateStr = saleDateObj.toLocaleDateString('en-CA');

      lifeProf += sale.profit;
      if (saleDateObj.getMonth() === targetMonthIndex && saleDateObj.getFullYear() === targetYear) {
        monthRev += sale.revenue;
        monthProf += sale.profit;
      }
      if (saleDateStr === targetDate) {
        dayRev += sale.revenue;
        dayProf += sale.profit;
        dayCount += sale.quantity;
      }
    });
  }

  if (dailyRevenueEl) dailyRevenueEl.textContent = dayRev.toFixed(2);
  if (dailyProfitEl) dailyProfitEl.textContent = dayProf.toFixed(2);
  if (dailyCountEl) dailyCountEl.textContent = dayCount;
  if (monthlyRevenueEl) monthlyRevenueEl.textContent = monthRev.toFixed(2);
  if (monthlyProfitEl) monthlyProfitEl.textContent = monthProf.toFixed(2);
  if (lifetimeProfitEl) lifetimeProfitEl.textContent = lifeProf.toFixed(2);

  window.dispatchEvent(new CustomEvent('salesSummaryUpdated', {
    detail: {
      dailyRevenue: dayRev,
      dailyProfit: dayProf,
      dailyCount: dayCount,
      monthlyRevenue: monthRev,
      monthlyProfit: monthProf,
      lifetimeProfit: lifeProf
    }
  }));

  // Update headings to reflect the selected date
  const dateLabel = targetDate === new Date().toLocaleDateString('en-CA') ? "Today" : targetDate;
  const sectionHeader = document.querySelector("#salesSection h2");
  if (sectionHeader) sectionHeader.textContent = `Sales Performance: ${dateLabel}`;
}

/**
 * Renders only the paginated sales table.
 */
function renderSalesTable() {
  salesTableBody.innerHTML = "";
  const targetDate = saleDateFilter.value;

  // Pagination returns a limited slice of data
  salesArray.forEach(sale => {
    const saleDate = new Date(sale.createdAt).toLocaleDateString('en-CA');

    // Note: This check only works if the 10 items in 'salesArray' include the targetDate.
    if (saleDate === targetDate) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${new Date(sale.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}</td>
        <td>${sale.itemName}</td>
        <td>${sale.quantity}</td>
        <td>${sale.unitPriceSold}</td>
        <td>${sale.revenue}</td>
        <td style="color: green; font-weight: bold;">${sale.profit}</td>
        <td><button onclick="window.editSale('${sale.id}')">Edit</button></td>
      `;
      salesTableBody.appendChild(row);
    }
  });

  if (salesTableBody.innerHTML === "") {
    salesTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: #6b7280; padding: 20px;">
      No sales visible for this date on this page.
    </td></tr>`;
  }
}

/**
 * Handles the submission of the sale form.
 * @param {Event} e - The form submission event.
 */
async function handleSaleFormSubmit(e) {
  window.showLoadingIndicator(true); // Show loading indicator
  e.preventDefault();
  const unitPriceSold = Number(salePriceInput.value);
  const qtySold = Number(saleQuantityInput.value);
  const item = itemsArray.find(i => i.id === selectedItemId);

  if (!selectedItemId || !item) {
    alert("Please search and select an item from the list.");
    return;
  }

  if (qtySold <= 0) {
    alert("Quantity sold must be greater than zero.");
    return;
  }

  // Stock check logic adjustment for Edit
  let availableStock = item.quantity;
  if (editSaleId) {
    const originalSale = salesArray.find(s => s.id === editSaleId);
    if (originalSale.itemId === selectedItemId) {
      availableStock += originalSale.quantity;
    }
  }

  if (qtySold > availableStock) {
    alert("Insufficient stock!");
    return;
  }

  const revenue = unitPriceSold * qtySold;
  const cost = item.incoming * qtySold;
  const profit = revenue - cost;

  const isOutOfStock = (availableStock - qtySold === 0);
  const saleData = {
    itemId: selectedItemId,
    itemName: item.name,
    unitPriceSold,
    quantity: qtySold,
    revenue,
    profit,
    uid: authInstance.currentUser.uid,
    createdAt: new Date().toISOString()
  };

  recordSaleBtn.disabled = true;
  recordSaleBtn.classList.add("loading");

  try {
    const batch = writeBatch(dbInstance);
    const newSaleRef = doc(salesRef);
    const itemRef = doc(dbInstance, "items", selectedItemId);

    if (editSaleId) {
      const originalSale = salesArray.find(s => s.id === editSaleId);
      
      // If item changed during edit
      if (originalSale.itemId !== selectedItemId) {
        const originalItem = itemsArray.find(i => i.id === originalSale.itemId);
        if (originalItem) {
          batch.update(doc(dbInstance, "items", originalSale.itemId), {
            quantity: originalItem.quantity + originalSale.quantity
          });
        }
        batch.update(itemRef, { quantity: item.quantity - qtySold });
      } else {
        batch.update(itemRef, { quantity: availableStock - qtySold });
      }
      
      batch.update(doc(salesRef, editSaleId), saleData);

      const originalDate = new Date(originalSale.createdAt).toLocaleDateString('en-CA');
      const originalMonth = originalDate.slice(0, 7);
      const deltaRevenue = revenue - originalSale.revenue;
      const deltaProfit = profit - originalSale.profit;
      const deltaCount = qtySold - originalSale.quantity;
      const summaryUpdate = {
        [`dailyTotals.${originalDate}.revenue`]: increment(deltaRevenue),
        [`dailyTotals.${originalDate}.profit`]: increment(deltaProfit),
        [`dailyTotals.${originalDate}.count`]: increment(deltaCount),
        [`monthlyTotals.${originalMonth}.revenue`]: increment(deltaRevenue),
        [`monthlyTotals.${originalMonth}.profit`]: increment(deltaProfit),
        [`lifetime.revenue`]: increment(deltaRevenue),
        [`lifetime.profit`]: increment(deltaProfit)
      };
      
      // Use update for surgical nested increments; set ensures doc existence
      // Correct Pattern: set ensures the doc exists, update ensures dot-notation creates Maps
      batch.set(salesSummaryRef, {}, { merge: true });
      batch.update(salesSummaryRef, summaryUpdate);
    } else {
      batch.set(newSaleRef, saleData);
      batch.update(itemRef, {
        quantity: item.quantity - qtySold
      });

      const currentDate = new Date().toLocaleDateString('en-CA');
      const currentMonth = currentDate.slice(0, 7);
      const summaryUpdate = {
        [`dailyTotals.${currentDate}.revenue`]: increment(revenue),
        [`dailyTotals.${currentDate}.profit`]: increment(profit),
        [`dailyTotals.${currentDate}.count`]: increment(qtySold),
        [`monthlyTotals.${currentMonth}.revenue`]: increment(revenue),
        [`monthlyTotals.${currentMonth}.profit`]: increment(profit),
        [`lifetime.revenue`]: increment(revenue),
        [`lifetime.profit`]: increment(profit)
      };

      // Use update for surgical nested increments; set ensures doc existence
      batch.set(salesSummaryRef, {}, { merge: true });
      batch.update(salesSummaryRef, summaryUpdate);
    }

    // Check if item quantity went to 0 after this sale
    if (isOutOfStock) {
      const reorderData = {
        customerName: clientBusinessName, // Use the client's business name
        itemName: item.name,
        quantity: 5, // Default reorder quantity
        notes: "Item quantity reached 0. <br>Quantity to be adjusted.",
        date: new Date().toISOString(),
        uid: authInstance.currentUser.uid,
        createdAt: new Date().toISOString()
      };
      batch.set(doc(ordersCollectionRef), reorderData); // Add to orders collection
    }

    // batch.commit() resolves immediately to the local cache when persistence is enabled.
    await batch.commit(); 

    if (editSaleId) {
      editSaleId = null;
      if (recordSaleBtn.querySelector(".btn-text")) recordSaleBtn.querySelector(".btn-text").textContent = "Record Sale";
    }

    if (!navigator.onLine) {
      showToast("Sale saved offline. It will sync when you are back online.", "info");
    }

    if (isOutOfStock) {
      showToast(`Stock Alert: ${item.name} is out of stock. An automatic order has been created.`, "info");
    }

    saleForm.reset();
    selectedItemId = null;
    // Trigger a reload of items and sales in the main script
    window.dispatchEvent(new CustomEvent('saleRecorded', { detail: { uid: authInstance.currentUser.uid } }));
  } catch (err) {
    alert("Error recording sale: " + err.message);
    console.error("Error recording sale:", err);
  } finally {
    recordSaleBtn.disabled = false;
    recordSaleBtn.classList.remove("loading");
    window.showLoadingIndicator(false);
  }
}

/**
 * Populates the sale form with existing data for editing.
 * @param {string} id - The ID of the sale to edit.
 */
window.editSale = (id) => {
  const sale = salesArray.find(s => s.id === id);
  if (!sale) return;

  editSaleId = id;
  selectedItemId = sale.itemId;
  
  // Populate form fields
  if (saleItemSearch) saleItemSearch.value = sale.itemName;
  if (salePriceInput) salePriceInput.value = sale.unitPriceSold;
  if (saleQuantityInput) saleQuantityInput.value = sale.quantity;

  // Update button UI
  const btnText = recordSaleBtn.querySelector(".btn-text");
  if (btnText) btnText.textContent = "Update Sale";

  // Smooth scroll to form
  window.scrollTo({ top: saleForm.offsetTop - 100, behavior: 'smooth' });
};

/**
 * Displays a toast notification.
 * @param {string} message - The message to display.
 * @param {string} type - The type of alert (info, success, error).
 */
function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast alert alert-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, 5000);
}