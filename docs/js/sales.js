import {
  addDoc,
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
  getDocsFromServer,
  increment,
  updateDoc,
  deleteField,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";
import { getAnalyticsItemSalesRanking } from "./analytics-item-chart.js";
import {
  adjustCrateStock,
  adjustBoxStock,
  adjustQuantity,
  appendQuantityUnit,
  calculatePetrolDip,
  escapeQuantity,
  formatCrateStock,
  formatBoxStock,
  formatDisplayQuantity,
  formatNumber,
  formatQuantity,
  getCrateStockPieces,
  getBoxStockUnits,
  getPiecesPerCrate,
  getUnitsPerBox,
  isExcludedFromAllAnalyticsName,
  isStrictlyExcludedFromGeneralAnalyticsName,
  isCrateItem,
  isBoxItem,
  isLiterUnit,
  isPetrolName,
  parseQuantity,
  uppercaseInput
} from "./quantity.js";

const EXPENSE_COST_CATEGORIES = new Set([
  "general",
  "gas-cylinder",
  "k-gas",
  "total-gas",
  "pro-gas",
  "gas-refillable",
  "gas-nonrefillable",
  "soda-300ml",
  "soda-500ml",
  "petrol",
  "crate-item",
  "accessory-item"
]);
const EXCLUDED_ITEM_PURCHASE_CATEGORIES = new Set([
  "gas-cylinder",
  "k-gas",
  "total-gas",
  "pro-gas",
  "gas-refillable",
  "gas-nonrefillable",
  "soda-300ml",
  "soda-500ml",
  "crate-item",
  "accessory-item"
]);
const isExcludedItemPurchase = expense =>
  String(expense.type || "").toLowerCase() === "purchase" &&
  (EXCLUDED_ITEM_PURCHASE_CATEGORIES.has(expense.costCategory) ||
    Boolean(getCustomFuelCategoryName(expense.costCategory)));
const ALL_GAS_ANALYTICS_FILTER = "__all_gas__";
const ALL_SODA_ANALYTICS_FILTER = "__all_soda_300_500__";
const ALL_CRATE_ANALYTICS_FILTER = "__all_crate_items__";
const ALL_ACCESSORIES_ANALYTICS_FILTER = "__all_accessories__";
const GENERAL_ANALYTICS_FILTER = "__general_items__";

function isStaticAnalyticsFilter(filterValue) {
  return isGeneralAnalyticsFilter(filterValue) ||
    isCombinedAnalyticsFilter(filterValue);
}

function isGeneralAnalyticsFilter(filterValue) {
  return filterValue === GENERAL_ANALYTICS_FILTER;
}

function isCombinedAnalyticsFilter(filterValue) {
  return filterValue === ALL_GAS_ANALYTICS_FILTER ||
    filterValue === ALL_SODA_ANALYTICS_FILTER ||
    filterValue === ALL_CRATE_ANALYTICS_FILTER ||
    filterValue === ALL_ACCESSORIES_ANALYTICS_FILTER;
}

// DOM Elements (Sales & Analytics)
const saleForm = document.getElementById("saleForm");
const saleItemSearch = document.getElementById("saleItemSearch");
const saleSearchResults = document.getElementById("saleSearchResults");
const salePriceInput = document.getElementById("salePrice");
const saleTypeInput = document.getElementById("saleType");
const saleQuantityInput = document.getElementById("saleQuantity");
const saleCrateStockStatus = document.getElementById("saleCrateStockStatus");
const saleQuantityUnitField = document.getElementById("saleQuantityUnitField");
const saleQuantityUnit = document.getElementById("saleQuantityUnit");
const saleCrateOption = document.getElementById("saleCrateOption");
const salePieceOption = document.getElementById("salePieceOption");
const saleCrateSizeField = document.getElementById("saleCrateSizeField");
const saleCrateSize = document.getElementById("saleCrateSize");
const saleFullPackOption = document.getElementById("saleFullPackOption");
const saleHalfPackOption = document.getElementById("saleHalfPackOption");
const recordSaleBtn = document.getElementById("recordSaleBtn");
const salesTableBody = document.getElementById("salesTable"); // Renamed to avoid conflict with global sales array
const salesDateFilter = document.getElementById("salesDateFilter");
const petrolDipFields = document.getElementById("petrolDipFields");
const petrolOpeningDipInput = document.getElementById("petrolOpeningDip");
const petrolFuelReceivedInput = document.getElementById("petrolFuelReceived");
const petrolPumpSalesInput = document.getElementById("petrolPumpSales");
const petrolTotalAvailableInput = document.getElementById("petrolTotalAvailable");
const petrolExpectedClosingInput = document.getElementById("petrolExpectedClosingDip");
const petrolActualClosingInput = document.getElementById("petrolActualClosingDip");
const petrolVarianceInput = document.getElementById("petrolVariance");
const analyticsItemFilter = document.getElementById("analyticsItemFilter");
const analyticsItemSearch = document.getElementById("analyticsItemSearch");
const analyticsItemPrevBtn = document.getElementById("analyticsItemPrevBtn");
const analyticsItemNextBtn = document.getElementById("analyticsItemNextBtn");
const analyticsItemPageInfo = document.getElementById("analyticsItemPageInfo");
const analyticsPeriodFilter = document.getElementById("analyticsPeriodFilter");
const analyticsDateFilter = document.getElementById("analyticsDateFilter");
const analyticsDateLabel = document.getElementById("analyticsDateLabel");
const analyticsBreakdownControl = document.getElementById("analyticsBreakdownControl");
const analyticsCustomGroupControl = document.getElementById("analyticsCustomGroupControl");
const analyticsSingleDateControl = document.getElementById("analyticsSingleDateControl");
const analyticsCustomRange = document.getElementById("analyticsCustomRange");
const analyticsFromDate = document.getElementById("analyticsFromDate");
const analyticsToDate = document.getElementById("analyticsToDate");
const analyticsCustomGroupBy = document.getElementById("analyticsCustomGroupBy");
const analyticsSalesTotalEl = document.getElementById("analyticsSalesTotal");
const analyticsGrossProfitTotalEl = document.getElementById("analyticsGrossProfitTotal");
const analyticsNetRevenueTotalEl = document.getElementById("analyticsNetRevenueTotal");
const analyticsDiscountTotalEl = document.getElementById("analyticsDiscountTotal");
const analyticsExpenseTotalEl = document.getElementById("analyticsExpenseTotal");
const analyticsQuantityTotalEl = document.getElementById("analyticsQuantityTotal");
const analyticsSelectedItemBadge = document.getElementById("analyticsSelectedItemBadge");
const analyticsSaleTypeBreakdownEl = document.getElementById("analyticsSaleTypeBreakdown");
const analyticsItemChartModule = document.getElementById("analyticsItemChartModule");
const analyticsItemChartToggle = document.getElementById("analyticsItemChartToggle");
const analyticsBreakdownTable = document.getElementById("analyticsBreakdownTable");
const analyticsStockAdditionsTable = document.getElementById("analyticsStockAdditionsTable");
const petrolAnalyticsPreview = document.getElementById("petrolAnalyticsPreview");
const petrolAnalyticsTable = document.getElementById("petrolAnalyticsTable");
const exportAnalyticsPdfBtn = document.getElementById("exportAnalyticsPdfBtn");
const overviewPeriodFilter = document.getElementById("overviewPeriodFilter");
const overviewTodayDate = document.getElementById("overviewTodayDate");
const overviewLowStockEl = document.getElementById("overviewLowStock");
const overviewSalesChart = document.getElementById("overviewSalesChart");
const overviewTopItems = document.getElementById("overviewTopItems");
const overviewPetrolQuantity = document.getElementById("overviewPetrolQuantity");
const overviewPetrolRevenue = document.getElementById("overviewPetrolRevenue");
const overviewPetrolClosingDip = document.getElementById("overviewPetrolClosingDip");
const overviewRecentSales = document.getElementById("overviewRecentSales");
const overviewStockAdditions = document.getElementById("overviewStockAdditions");
const overviewExpenses = document.getElementById("overviewExpenses");
const expenseForm = document.getElementById("expenseForm");
const expenseDateInput = document.getElementById("expenseDate");
const expenseTypeInput = document.getElementById("expenseType");
const expenseCostCategoryInput = document.getElementById("expenseCostCategory");
const expenseCrateItemField = document.getElementById("expenseCrateItemField");
const expenseCrateItemInput = document.getElementById("expenseCrateItem");
const expenseAccessoryItemField = document.getElementById("expenseAccessoryItemField");
const expenseAccessoryItemInput = document.getElementById("expenseAccessoryItem");
const expenseGasTypeField = document.getElementById("expenseGasTypeField");
const expenseGasTypeInput = document.getElementById("expenseGasType");
const expenseDescriptionInput = document.getElementById("expenseDescription");
const expensePaidToSupplierInput = document.getElementById("expensePaidToSupplier");
const expenseVendorInput = document.getElementById("expenseVendor");
const expenseAmountInput = document.getElementById("expenseAmount");
const expenseNotesInput = document.getElementById("expenseNotes");
const saveExpenseBtn = document.getElementById("saveExpenseBtn");
const cancelExpenseEditBtn = document.getElementById("cancelExpenseEditBtn");
const expenseFormMessage = document.getElementById("expenseFormMessage");
const expensesTable = document.getElementById("expensesTable");
const expensePeriodFilter = document.getElementById("expensePeriodFilter");
const expenseCustomDateRange = document.getElementById("expenseCustomDateRange");
const expenseFromDate = document.getElementById("expenseFromDate");
const expenseToDate = document.getElementById("expenseToDate");

let dbInstance;
let authInstance;
let itemsArray = []; // Reference to the items array from script.js
let salesArray = []; // Local sales array for this module
let salesRef;
let stockAdditionsRef;
let stockMovementsRef;
let expensesRef;
let itemsRef; // Need itemsRef for batch updates
let accessoryItemsRef;
let analyticsItemsUid = null;
let analyticsItemPageItems = [];
let analyticsItemPageDocs = [];
let analyticsItemPageStarts = [null];
let analyticsItemPageIndex = 0;
let analyticsItemHasNextPage = false;
let analyticsItemSearchTimeout = null;
let analyticsItemPageRequest = 0;
const analyticsItemPageSize = 20;
let ordersCollectionRef; // Reference to the orders collection
let salesSummaryRef = null;
let clientBusinessName; // The business name of the logged-in client
let selectedItemId = null;
let editSaleId = null;
let editingOriginalSale = null;
let editingExpenseId = null;
let salesUnsubscribe = null;
let allSalesForAnalytics = [];
let analyticsAllSalesLoaded = false;
let stockAdditionsForAnalytics = [];
let stockAdditionsError = null;
let stockAdditionsLoaded = false;
let stockMovementsForAnalytics = [];
let stockMovementsError = null;
let stockMovementsLoaded = false;
let stockLedgerBaselineError = null;
const stockLedgerBaselineRequests = new Set();
const stockLedgerBaselineFailures = new Set();
let expensesForAnalytics = [];
let expensesError = null;
let analyticsUnsubscribe = null;
let stockAdditionsUnsubscribe = null;
let stockMovementsUnsubscribe = null;
let expensesUnsubscribe = null;
let fuelEnergyCategoriesUnsubscribe = null;
let customFuelEnergyCategories = [];
let accessoryItemsUnsubscribe = null;
let accessoryNames = new Set();
let accessoryExpenseItems = [];
let accessoryItemsError = "Loading accessory categories...";
let analyticsItemsUnsubscribe = null;
let analyticsItemsById = new Map();
let analyticsItemsLoaded = false;
let analyticsAllSalesError = null;
let analyticsItemsError = null;
let analyticsItemSalesUnsubscribe = null;
let analyticsItemSales = null;
let analyticsItemSalesError = null;
let currentAnalyticsRows = [];
let petrolDipInputRevision = 0;
let petrolDipPrefillRequest = 0;

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
  analyticsItemsUid = authInstance.currentUser.uid;
  salesRef = collection(dbInstance, "sales");
  stockAdditionsRef = collection(dbInstance, "stockAdditions");
  stockMovementsRef = collection(dbInstance, "stockMovements");
  expensesRef = collection(dbInstance, "expenses");
  const fuelEnergyCategoriesRef = collection(dbInstance, "fuelEnergyCategories");
  accessoryItemsRef = collection(dbInstance, "accessoryItems");
  ordersCollectionRef = ordersRef;
  salesSummaryRef = doc(dbInstance, "salesSummaries", authInstance.currentUser.uid);
  clientBusinessName = businessName;
  overviewTodayDate.textContent = formatOverviewTodayDate(new Date());

  // Attach event listener for sale form
  saleForm.addEventListener("submit", handleSaleFormSubmit);
  salesTableBody.addEventListener("click", handleSalesTableAction);

  // Attach search listener
  saleItemSearch.addEventListener("input", handleItemSearch);
  saleQuantityInput.addEventListener("input", () => {
    const selectedItem = itemsArray.find(item => item.id === selectedItemId);
    if (isCrateItem(selectedItem?.name)) {
      const selectedUnit = getCrateSaleQuantityUnit(selectedItem);
      if (selectedUnit) appendQuantityUnit(saleQuantityInput, selectedUnit, true);
    } else {
      appendQuantityUnit(saleQuantityInput, "L", isPetrolItem(selectedItem));
    }
    uppercaseInput(saleQuantityInput);
    updateCrateSaleStockPreview();
    updatePetrolSalePreview();
  });
  saleTypeInput.addEventListener("change", () => {
    updateSaleUnitPrice();
  });
  saleQuantityUnit.addEventListener("change", () => {
    const selectedItem = selectedItemId
      ? itemsArray.find(item => item.id === selectedItemId)
      : null;
    if (saleQuantityUnit.value !== "crate") saleCrateSize.value = "full";
    updateSaleCrateSizeField(selectedItem);
    syncSaleQuantityUnit(selectedItem);
    updateCrateSaleStockPreview();
    updateSaleUnitPrice();
  });
  saleCrateSize.addEventListener("change", () => {
    const selectedItem = selectedItemId
      ? itemsArray.find(item => item.id === selectedItemId)
      : null;
    syncSaleQuantityUnit(selectedItem);
    updateCrateSaleStockPreview();
    updateSaleUnitPrice();
  });
  [petrolOpeningDipInput, petrolFuelReceivedInput, petrolActualClosingInput].forEach(input => {
    input.addEventListener("input", () => {
      appendQuantityUnit(input, "L", true);
      uppercaseInput(input);
      petrolDipInputRevision++;
      updatePetrolSalePreview();
    });
  });
  exportAnalyticsPdfBtn.addEventListener("click", exportAnalyticsPdf);
  expenseDateInput.value = dateKey(new Date());
  expenseDateInput.max = dateKey(new Date());
  expenseFromDate.value = dateKey(new Date());
  expenseToDate.value = dateKey(new Date());
  expenseFromDate.max = dateKey(new Date());
  expenseToDate.max = dateKey(new Date());
  expensePeriodFilter.addEventListener("change", () => {
    expenseCustomDateRange.hidden = expensePeriodFilter.value !== "custom";
    renderExpensesTable();
  });
  [expenseFromDate, expenseToDate].forEach(input => {
    input.addEventListener("change", renderExpensesTable);
  });
  expenseForm.addEventListener("submit", handleExpenseFormSubmit);
  expenseCostCategoryInput.addEventListener("change", updateExpenseGasTypeField);
  expenseAccessoryItemInput.addEventListener("change", updateExpenseGasTypeField);
  expenseDescriptionInput.addEventListener("input", handleExpenseDescriptionInput);
  [expenseVendorInput, expenseNotesInput].forEach(input => {
    input.addEventListener("input", () => uppercaseInput(input));
  });
  expenseDescriptionInput.addEventListener("blur", formatCrateExpenseDescription);
  cancelExpenseEditBtn.addEventListener("click", () => {
    resetExpenseForm();
    expenseFormMessage.textContent = "Edit cancelled.";
  });
  expensesTable.addEventListener("change", event => {
    if (event.target.matches("[data-expense-category]")) {
      const row = event.target.closest("tr");
      const crateItemField = row?.querySelector("[data-expense-crate-item]");
      const accessoryItemField = row?.querySelector("[data-expense-accessory-item]");
      if (crateItemField) {
        crateItemField.hidden = event.target.value !== "crate-item";
        crateItemField.required = event.target.value === "crate-item";
      }
      if (accessoryItemField) {
        accessoryItemField.hidden = event.target.value !== "accessory-item";
        accessoryItemField.required = event.target.value === "accessory-item";
      }
    }
  });
  expensesTable.addEventListener("click", handleExpenseTableAction);
  renderCrateExpenseItemOptions(expenseCrateItemInput);
  renderAccessoryExpenseItemOptions(expenseAccessoryItemInput);
  updateExpenseGasTypeField();
  listenToFuelEnergyCategories(fuelEnergyCategoriesRef, authInstance.currentUser.uid);

  const today = dateKey(new Date());
  salesDateFilter.value = today;
  salesDateFilter.max = today;
  salesDateFilter.addEventListener("change", () => {
    if (!salesDateFilter.value) return;
    firstSalesDoc = null;
    lastSalesDoc = null;
    loadSales(authInstance.currentUser.uid);
    const selectedItem = itemsArray.find(item => item.id === selectedItemId);
    if (!editSaleId && isPetrolItem(selectedItem)) {
      prefillPetrolDipFromPreviousDay(selectedItem, false);
    }
  });
  analyticsDateFilter.value = today;
  analyticsDateFilter.max = today;
  analyticsFromDate.value = today;
  analyticsFromDate.max = today;
  analyticsToDate.value = today;
  analyticsToDate.max = today;
  analyticsItemFilter.addEventListener("change", handleAnalyticsItemChange);
  analyticsItemChartToggle.addEventListener("click", openSelectedAnalyticsGraphs);
  analyticsItemSearch.addEventListener("input", handleAnalyticsItemSearch);
  analyticsItemPrevBtn.addEventListener("click", () => changeAnalyticsItemPage(-1));
  analyticsItemNextBtn.addEventListener("click", () => changeAnalyticsItemPage(1));
  loadAnalyticsItemPage();
  analyticsDateFilter.addEventListener("change", updateAnalyticsUI);
  [analyticsFromDate, analyticsToDate, analyticsCustomGroupBy].forEach(control => {
    control.addEventListener("change", () => {
      analyticsToDate.min = analyticsFromDate.value;
      analyticsFromDate.max = analyticsToDate.value || today;
      updateAnalyticsUI();
    });
  });
  overviewPeriodFilter.addEventListener("change", renderOverview);
  document.querySelectorAll("[data-overview-tab]").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelector(`.tab-btn[data-tab="${button.dataset.overviewTab}"]`)?.click();
    });
  });
  analyticsPeriodFilter.addEventListener("change", () => {
    updateAnalyticsDateLabel();
    updateAnalyticsUI();
  });
  updateAnalyticsDateLabel();
  listenToAnalyticsItems(authInstance.currentUser.uid);
  listenToAccessoryItems(authInstance.currentUser.uid);
  listenToStockMovements(authInstance.currentUser.uid);
  listenToStockAdditions(authInstance.currentUser.uid);
  listenToExpenses(authInstance.currentUser.uid);
  salesPrevPageBtn.addEventListener("click", () => {
    if (authInstance.currentUser) loadSales(authInstance.currentUser.uid, "prev");
  });
  salesNextPageBtn.addEventListener("click", () => {
    if (authInstance.currentUser) loadSales(authInstance.currentUser.uid, "next");
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
  renderCrateExpenseItemOptions(expenseCrateItemInput);
  renderAccessoryExpenseItemOptions(expenseAccessoryItemInput);
  renderExpensesTable();
  renderOverview();
}

function listenToAnalyticsItems(uid) {
  if (analyticsItemsUnsubscribe) analyticsItemsUnsubscribe();
  const userItemsQuery = query(itemsRef, where("uid", "==", uid));
  analyticsItemsUnsubscribe = onSnapshot(userItemsQuery, snapshot => {
    const analyticsItems = snapshot.docs.map(itemDoc => ({
      id: itemDoc.id,
      ...itemDoc.data()
    }));
    analyticsItemsById = new Map(analyticsItems.map(item => [item.id, item]));
    analyticsItemsLoaded = true;
    analyticsItemsError = null;
    ensureStockLedgerBaselines(analyticsItems);
    renderAnalyticsItemPageOptions();
    if (isStaticAnalyticsFilter(analyticsItemFilter.value)) {
      analyticsItemSales = getAnalyticsSalesForFilter(analyticsItemFilter.value);
    }
    updateAnalyticsUI();
    renderOverview();
  }, error => {
    console.error("Unable to load analytics item settings:", error);
    analyticsItemsLoaded = true;
    analyticsItemsError = "Unable to load item analytics settings. Please try again.";
    updateAnalyticsUI();
    renderOverview();
  });
}

function listenToStockMovements(uid) {
  if (stockMovementsUnsubscribe) stockMovementsUnsubscribe();
  const userMovementsQuery = query(stockMovementsRef, where("uid", "==", uid));
  stockMovementsUnsubscribe = onSnapshot(userMovementsQuery, snapshot => {
    stockMovementsForAnalytics = snapshot.docs.map(movementDoc => ({
      id: movementDoc.id,
      ...movementDoc.data()
    }));
    stockMovementsError = null;
    stockMovementsLoaded = true;
    updateAnalyticsUI();
  }, error => {
    console.error("Unable to load stock movement history:", error);
    stockMovementsError = "Unable to load stock movement history. Please try again.";
    stockMovementsLoaded = true;
    updateAnalyticsUI();
  });
}

function ensureStockLedgerBaselines(items) {
  items.forEach(item => {
    if (isPetrolItem(item)) return;
    if (item.stockLedgerBaselineAt || stockLedgerBaselineRequests.has(item.id)) return;
    stockLedgerBaselineRequests.add(item.id);
    stockLedgerBaselineFailures.delete(item.id);
    stockLedgerBaselineError = stockLedgerBaselineFailures.size
      ? "Unable to prepare stock history. Please try again."
      : null;
    runTransaction(dbInstance, async transaction => {
      const itemRef = doc(dbInstance, "items", item.id);
      const snapshot = await transaction.get(itemRef);
      if (!snapshot.exists()) return null;
      const latestItem = { id: snapshot.id, ...snapshot.data() };
      if (latestItem.stockLedgerBaselineAt) return latestItem;

      const baselineAt = new Date();
      const startDate = new Date(baselineAt);
      startDate.setDate(startDate.getDate() + 1);
      const baseline = {
        stockLedgerBaselineUnits: getItemStockUnits(latestItem),
        stockLedgerUnit: getItemStockUnit(latestItem),
        stockLedgerBaselineAt: serverTimestamp(),
        stockLedgerStartDate: dateKey(startDate),
        stockLedgerValid: true
      };
      transaction.update(itemRef, baseline);
      return null;
    }).then(baselineItem => {
      if (baselineItem) analyticsItemsById.set(item.id, baselineItem);
      stockLedgerBaselineError = stockLedgerBaselineFailures.size
        ? "Unable to prepare stock history. Please try again."
        : null;
    }).catch(error => {
      console.error("Unable to establish stock history baseline:", error);
      stockLedgerBaselineFailures.add(item.id);
      stockLedgerBaselineError = "Unable to prepare stock history. Please try again.";
    }).finally(() => {
      stockLedgerBaselineRequests.delete(item.id);
      updateAnalyticsUI();
    });
  });
}

function listenToAccessoryItems(uid) {
  if (accessoryItemsUnsubscribe) accessoryItemsUnsubscribe();
  const userAccessoryItemsQuery = query(accessoryItemsRef, where("uid", "==", uid));
  accessoryItemsUnsubscribe = onSnapshot(userAccessoryItemsQuery, snapshot => {
    accessoryExpenseItems = snapshot.docs.map(accessoryDoc => ({
      id: accessoryDoc.id,
      name: String(accessoryDoc.data().name || "").trim()
    })).filter(accessory => accessory.name);
    accessoryNames = new Set(accessoryExpenseItems
      .map(accessory => accessory.name.toLowerCase()));
    renderAccessoryExpenseItemOptions(expenseAccessoryItemInput);
    renderExpensesTable();
    accessoryItemsError = null;
    if (analyticsItemFilter.value === GENERAL_ANALYTICS_FILTER ||
        analyticsItemFilter.value === ALL_ACCESSORIES_ANALYTICS_FILTER) {
      analyticsItemSales = getAnalyticsSalesForFilter(analyticsItemFilter.value);
    }
    updateAnalyticsUI();
    renderOverview();
  }, error => {
    console.error("Unable to load accessory analytics items:", error);
    accessoryItemsError = "Unable to load accessories for analytics. Please try again.";
    updateAnalyticsUI();
    renderOverview();
  });
}

function handleAnalyticsItemSearch() {
  clearTimeout(analyticsItemSearchTimeout);
  analyticsItemSearchTimeout = setTimeout(() => {
    analyticsItemPageStarts = [null];
    analyticsItemPageIndex = 0;
    loadAnalyticsItemPage();
  }, 300);
}

function changeAnalyticsItemPage(direction) {
  if (direction < 0) {
    if (analyticsItemPageIndex === 0) return;
    analyticsItemPageIndex--;
    loadAnalyticsItemPage();
    return;
  }

  if (!analyticsItemHasNextPage || !analyticsItemPageDocs.length) return;
  analyticsItemPageStarts = analyticsItemPageStarts.slice(0, analyticsItemPageIndex + 1);
  analyticsItemPageStarts.push(analyticsItemPageDocs[analyticsItemPageDocs.length - 1]);
  analyticsItemPageIndex++;
  loadAnalyticsItemPage();
}

async function loadAnalyticsItemPage() {
  if (!analyticsItemsUid || !itemsRef) return;
  const requestId = ++analyticsItemPageRequest;
  const search = analyticsItemSearch.value.trim().toLowerCase();
  analyticsItemPageInfo.textContent = "Loading items...";
  analyticsItemPrevBtn.disabled = true;
  analyticsItemNextBtn.disabled = true;

  try {
    let itemQuery = query(
      itemsRef,
      where("uid", "==", analyticsItemsUid),
      orderBy("name_lowercase")
    );
    if (search) {
      itemQuery = query(
        itemQuery,
        where("name_lowercase", ">=", search),
        where("name_lowercase", "<=", `${search}\uf8ff`)
      );
    }
    const pageStart = analyticsItemPageStarts[analyticsItemPageIndex];
    const pagedQuery = pageStart
      ? query(itemQuery, startAfter(pageStart), limit(analyticsItemPageSize + 1))
      : query(itemQuery, limit(analyticsItemPageSize + 1));
    const snapshot = await getDocs(pagedQuery);
    if (requestId !== analyticsItemPageRequest) return;

    analyticsItemHasNextPage = snapshot.docs.length > analyticsItemPageSize;
    analyticsItemPageDocs = snapshot.docs.slice(0, analyticsItemPageSize);
    analyticsItemPageItems = analyticsItemPageDocs.map(itemDoc => ({
      id: itemDoc.id,
      ...itemDoc.data()
    }));
    renderAnalyticsItemPageOptions();
    if (search) {
      const exactMatches = analyticsItemPageItems.filter(item =>
        String(item.name || "").trim().toLowerCase() === search
      );
      if (exactMatches.length === 1) {
        const exactMatch = exactMatches[0];
        analyticsItemFilter.value = exactMatch.id;
        analyticsItemSearch.value = exactMatch.name;
        handleAnalyticsItemChange();
      }
    }
    analyticsItemPageInfo.textContent = analyticsItemPageDocs.length
      ? `Page ${analyticsItemPageIndex + 1} · ${analyticsItemPageSize} per page`
      : search ? "No matching items" : "No items available";
    analyticsItemPrevBtn.disabled = analyticsItemPageIndex === 0;
    analyticsItemNextBtn.disabled = !analyticsItemHasNextPage;
  } catch (error) {
    if (requestId !== analyticsItemPageRequest) return;
    console.error("Unable to load Analytics item page:", error);
    analyticsItemPageInfo.textContent = "Unable to load items. Edit the search or try again.";
    analyticsItemPrevBtn.disabled = analyticsItemPageIndex === 0;
    analyticsItemNextBtn.disabled = true;
  }
}

function renderAnalyticsItemPageOptions() {
  const selectedValue = analyticsItemFilter.value;
  const selectedOption = [...analyticsItemFilter.options]
    .find(option => option.value === selectedValue);
  const selectedLabel = selectedOption?.textContent || "";
  [...analyticsItemFilter.options]
    .filter(option => option.value !== "" && !isStaticAnalyticsFilter(option.value))
    .forEach(option => option.remove());

  const renderedItemIds = new Set();
  [...analyticsItemsById.values()]
    .filter(isPetrolItem)
    .forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.dataset.analyticsPetrolItem = "true";
      option.textContent = getAnalyticsItemLabel(item);
      analyticsItemFilter.appendChild(option);
      renderedItemIds.add(item.id);
    });

  analyticsItemPageItems.forEach(pageItem => {
    const item = analyticsItemsById.get(pageItem.id) || pageItem;
    if (!item.name || renderedItemIds.has(item.id)) return;
    const option = document.createElement("option");
    option.value = item.id;
    option.dataset.analyticsPageItem = "true";
    option.textContent = getAnalyticsItemLabel(item);
    analyticsItemFilter.appendChild(option);
    renderedItemIds.add(item.id);
  });

  if (selectedValue && !isStaticAnalyticsFilter(selectedValue) &&
      !renderedItemIds.has(selectedValue)) {
    const selectedItem = analyticsItemsById.get(selectedValue);
    const option = document.createElement("option");
    option.value = selectedValue;
    option.textContent = selectedItem ? getAnalyticsItemLabel(selectedItem) : selectedLabel;
    analyticsItemFilter.appendChild(option);
  }
  analyticsItemFilter.value = selectedValue;
}

function getAnalyticsItemLabel(item) {
  const gasType = item.gasType === "refillable"
    ? "Refillable"
    : item.gasType === "non-refillable" ? "Non-refillable" : "";
  return gasType ? `${item.name} (${gasType})` : item.name;
}

function listenToStockAdditions(uid) {
  if (stockAdditionsUnsubscribe) stockAdditionsUnsubscribe();
  const userStockAdditionsQuery = query(stockAdditionsRef, where("uid", "==", uid));
  stockAdditionsUnsubscribe = onSnapshot(userStockAdditionsQuery, snapshot => {
    stockAdditionsForAnalytics = snapshot.docs.map(additionDoc => ({
      id: additionDoc.id,
      ...additionDoc.data()
    }));
    stockAdditionsError = null;
    stockAdditionsLoaded = true;
    renderAnalyticsStockAdditions();
    updateAnalyticsUI();
    renderOverview();
  }, error => {
    console.error("Unable to load stock addition history:", error);
    stockAdditionsError = "Unable to load stock additions. Please try again.";
    stockAdditionsLoaded = true;
    renderAnalyticsStockAdditions();
    updateAnalyticsUI();
    renderOverview();
  });
}

function listenToExpenses(uid) {
  if (expensesUnsubscribe) expensesUnsubscribe();
  const userExpensesQuery = query(expensesRef, where("uid", "==", uid));
  expensesUnsubscribe = onSnapshot(userExpensesQuery, snapshot => {
    expensesForAnalytics = snapshot.docs.map(expenseDoc => ({
      id: expenseDoc.id,
      ...expenseDoc.data()
    }));
    expensesError = null;
    renderExpensesTable();
    updateAnalyticsUI();
    renderOverview();
  }, error => {
    console.error("Unable to load expense records:", error);
    expensesError = "Unable to load expense and purchase records. Please try again.";
    renderExpensesTable();
    updateAnalyticsUI();
    renderOverview();
  });
}

function listenToFuelEnergyCategories(categoriesRef, uid) {
  if (fuelEnergyCategoriesUnsubscribe) fuelEnergyCategoriesUnsubscribe();
  const userCategoriesQuery = query(categoriesRef, where("uid", "==", uid));
  fuelEnergyCategoriesUnsubscribe = onSnapshot(userCategoriesQuery, snapshot => {
    customFuelEnergyCategories = snapshot.docs.map(categoryDoc => ({
      id: categoryDoc.id,
      ...categoryDoc.data()
    }));
    renderExpenseCostCategoryOptions();
    renderExpensesTable();
  }, error => {
    console.error("Unable to load custom Fuel & Energy expense categories:", error);
    expenseFormMessage.textContent =
      `Unable to load custom Fuel & Energy categories: ${error.message}`;
  });
}

function renderExpenseCostCategoryOptions() {
  const fuelOptions = document.getElementById("fuelEnergyExpenseOptions");
  fuelOptions.querySelectorAll("option[data-custom-fuel-category]").forEach(option => option.remove());
  customFuelEnergyCategories
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach(category => {
      const option = document.createElement("option");
      option.value = `fuel:${category.id}`;
      option.dataset.customFuelCategory = "true";
      option.textContent = category.name;
      fuelOptions.appendChild(option);
    });
  updateExpenseGasTypeField();
}

function isValidExpenseCostCategory(category) {
  return EXPENSE_COST_CATEGORIES.has(category) ||
    customFuelEnergyCategories.some(fuelCategory => `fuel:${fuelCategory.id}` === category);
}

function updateExpenseGasTypeField() {
  const category = expenseCostCategoryInput.value;
  const isGasCategory = ["gas-cylinder", "gas-refillable", "gas-nonrefillable"].includes(category) ||
    getSelectedExpenseCategoryName().toLowerCase().includes("gas");
  const isFuelEnergyCategory = expenseCostCategoryInput.selectedOptions[0]
    ?.parentElement?.id === "fuelEnergyExpenseOptions";
  const requiresGasType = !isPetrolExpenseCategory() && (isFuelEnergyCategory || isGasCategory);
  const isCrateItemCategory = category === "crate-item";
  const isAccessoryItemCategory = category === "accessory-item";
  expenseCrateItemField.hidden = !isCrateItemCategory;
  expenseCrateItemInput.required = isCrateItemCategory;
  expenseAccessoryItemField.hidden = !isAccessoryItemCategory;
  expenseAccessoryItemInput.required = isAccessoryItemCategory;
  expenseGasTypeField.hidden = !requiresGasType;
  expenseGasTypeInput.required = requiresGasType;
  appendQuantityUnit(expenseDescriptionInput, "L", isPetrolExpenseCategory());
  if (!requiresGasType) {
    expenseGasTypeInput.value = "";
  } else if (category === "gas-refillable") {
    expenseGasTypeInput.value = "refillable";
  } else if (category === "gas-nonrefillable") {
    expenseGasTypeInput.value = "non-refillable";
  }
}

function formatCrateExpenseDescription() {
  if (!["crate-item", "soda-300ml", "soda-500ml"].includes(expenseCostCategoryInput.value)) return;
  const description = expenseDescriptionInput.value.trim();
  if (/^\d+(?:\.\d+)?$/.test(description)) {
    expenseDescriptionInput.value = `${description} CRATES`;
  }
}

function getCrateExpenseItems() {
  return itemsArray
    .filter(item => isCrateItem(item.name) || isSodaAnalyticsItem(item))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function renderCrateExpenseItemOptions(select, selectedItemId = select.value) {
  const options = getCrateExpenseItems();
  select.innerHTML = `<option value="">Choose crate item...</option>${options.map(item =>
    `<option value="${escapeQuantity(item.id)}">${escapeQuantity(item.name)}</option>`
  ).join("")}`;
  if (selectedItemId && options.some(item => item.id === selectedItemId)) {
    select.value = selectedItemId;
  }
}

function renderAccessoryExpenseItemOptions(select, selectedItemId = select.value) {
  const options = accessoryExpenseItems.slice()
    .sort((left, right) => left.name.localeCompare(right.name));
  select.innerHTML = `<option value="">Choose accessory...</option>${options.map(accessory =>
    `<option value="${escapeQuantity(accessory.id)}">${escapeQuantity(accessory.name)}</option>`
  ).join("")}`;
  if (selectedItemId && options.some(accessory => accessory.id === selectedItemId)) {
    select.value = selectedItemId;
  }
}

function renderCrateExpenseItemSelect(expense) {
  const selectedItemId = expense.crateItemId || "";
  const options = getCrateExpenseItems();
  const hasSelectedItem = options.some(item => item.id === selectedItemId);
  const selectedName = hasSelectedItem ? "" : expense.crateItemName || "";
  const isCrateCategory = expense.costCategory === "crate-item";
  return `<select class="expense-linked-item-select" data-expense-crate-item${isCrateCategory ? " required" : " hidden"} aria-label="Crate inventory item">
    <option value="">Choose crate item...</option>
    ${selectedName ? `<option value="${escapeQuantity(selectedItemId)}" selected>${escapeQuantity(selectedName)} (not in inventory)</option>` : ""}
    ${options.map(item =>
      `<option value="${escapeQuantity(item.id)}"${item.id === selectedItemId ? " selected" : ""}>${escapeQuantity(item.name)}</option>`
    ).join("")}
  </select>`;
}

function renderAccessoryExpenseItemSelect(expense) {
  const selectedItemId = expense.accessoryItemId || "";
  const hasSelectedItem = accessoryExpenseItems.some(accessory => accessory.id === selectedItemId);
  const selectedName = hasSelectedItem ? "" : expense.accessoryItemName || "";
  const isAccessoryCategory = expense.costCategory === "accessory-item";
  return `<select class="expense-linked-item-select" data-expense-accessory-item${isAccessoryCategory ? " required" : " hidden"} aria-label="Accessory item">
    <option value="">Choose accessory...</option>
    ${selectedName ? `<option value="${escapeQuantity(selectedItemId)}" selected>${escapeQuantity(selectedName)} (not in accessory list)</option>` : ""}
    ${accessoryExpenseItems.slice().sort((left, right) => left.name.localeCompare(right.name)).map(accessory =>
      `<option value="${escapeQuantity(accessory.id)}"${accessory.id === selectedItemId ? " selected" : ""}>${escapeQuantity(accessory.name)}</option>`
    ).join("")}
  </select>`;
}

function getSelectedExpenseCategoryName() {
  const selectedOption = expenseCostCategoryInput.selectedOptions[0];
  if (selectedOption?.value.startsWith("fuel:")) {
    return getCustomFuelCategoryName(selectedOption.value);
  }
  return selectedOption?.textContent || "";
}

function isPetrolExpenseCategory() {
  return /\bpetrol\b/i.test(getSelectedExpenseCategoryName());
}

function handleExpenseDescriptionInput() {
  appendQuantityUnit(expenseDescriptionInput, "L", isPetrolExpenseCategory());
  uppercaseInput(expenseDescriptionInput);
}

function getCustomFuelCategoryName(categoryId) {
  return customFuelEnergyCategories.find(category => `fuel:${category.id}` === categoryId)?.name || "";
}

function getCustomFuelCategoryForItem(item) {
  const itemName = String(item?.name || "").trim().toLowerCase();
  return customFuelEnergyCategories.find(category =>
    String(category.name || "").trim().toLowerCase() === itemName
  );
}

function getExpenseGasType(expense) {
  if (expense.costCategory === "gas-refillable") return "refillable";
  if (expense.costCategory === "gas-nonrefillable") return "non-refillable";
  return expense.gasType || "";
}

function getExpenseGasCategory(expense) {
  const category = expense.costCategory || "";
  if (["k-gas", "total-gas", "pro-gas"].includes(category)) {
    return getExpenseGasType(expense) === "refillable"
      ? "gas-refillable"
      : "gas-nonrefillable";
  }
  if (category === "gas-cylinder" || category === "gas-refillable" ||
      category === "gas-nonrefillable") return category;
  const customCategoryName = getCustomFuelCategoryName(category);
  if (customCategoryName.toLowerCase().includes("gas")) {
    return getExpenseGasType(expense) === "refillable"
      ? "gas-refillable"
      : getExpenseGasType(expense) === "non-refillable"
        ? "gas-nonrefillable"
        : "gas-cylinder";
  }
  return "";
}

function isCrateExpenseForItem(expense, item) {
  if (expense.costCategory !== "crate-item" || !item) return false;
  return expense.crateItemId
    ? expense.crateItemId === item.id
    : String(expense.crateItemName || "").trim().toLowerCase() ===
      String(item.name || "").trim().toLowerCase();
}

function isAccessoryExpenseForItem(expense, item) {
  if (expense.costCategory !== "accessory-item" || !isAccessoryAnalyticsItem(item)) return false;
  const accessory = accessoryExpenseItems.find(candidate =>
    candidate.id === expense.accessoryItemId);
  const expenseName = accessory?.name || expense.accessoryItemName || "";
  return String(expenseName).trim().toLowerCase() ===
    String(item.name || "").trim().toLowerCase();
}

function isSodaCrateExpense(expense) {
  if (expense.costCategory !== "crate-item") return false;
  const crateItem = analyticsItemsById.get(expense.crateItemId) ||
    itemsArray.find(item => item.id === expense.crateItemId) ||
    itemsArray.find(item =>
      String(item.name || "").trim().toLowerCase() ===
      String(expense.crateItemName || "").trim().toLowerCase());
  return isSodaAnalyticsItem(crateItem);
}

async function handleExpenseFormSubmit(event) {
  event.preventDefault();
  formatCrateExpenseDescription();
  const user = authInstance.currentUser;
  const date = expenseDateInput.value;
  const today = dateKey(new Date());
  const amount = Number(expenseAmountInput.value);
  const parsedDate = new Date(`${date}T00:00:00`);
  if (!user) {
    expenseFormMessage.textContent = "You must be signed in to record a cost.";
    return;
  }
  if (!date || !Number.isFinite(parsedDate.getTime()) || date > today) {
    expenseFormMessage.textContent = "Choose today or an earlier date.";
    return;
  }
  if (!expenseDescriptionInput.value.trim()) {
    expenseFormMessage.textContent = "Enter a description for this cost.";
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    expenseFormMessage.textContent = "Enter an amount greater than zero.";
    return;
  }
  const selectedCategoryName = getSelectedExpenseCategoryName();
  const isGasCategory = ["gas-cylinder", "gas-refillable", "gas-nonrefillable"]
    .includes(expenseCostCategoryInput.value) ||
    selectedCategoryName.toLowerCase().includes("gas");
  const isFuelEnergyCategory = expenseCostCategoryInput.selectedOptions[0]
    ?.parentElement?.id === "fuelEnergyExpenseOptions";
  const requiresGasType = !isPetrolExpenseCategory() && (isFuelEnergyCategory || isGasCategory);
  if (requiresGasType && !expenseGasTypeInput.value) {
    expenseFormMessage.textContent = "Choose whether this Fuel & Energy cost is refillable or non-refillable.";
    return;
  }
  const crateItem = expenseCostCategoryInput.value === "crate-item"
    ? itemsArray.find(item => item.id === expenseCrateItemInput.value)
    : null;
  if (expenseCostCategoryInput.value === "crate-item" && !crateItem) {
    expenseFormMessage.textContent = "Choose a crate item from inventory.";
    return;
  }
  const accessoryItem = expenseCostCategoryInput.value === "accessory-item"
    ? accessoryExpenseItems.find(item => item.id === expenseAccessoryItemInput.value)
    : null;
  if (expenseCostCategoryInput.value === "accessory-item" && !accessoryItem) {
    expenseFormMessage.textContent = "Choose an accessory from the accessory list.";
    return;
  }
  const gasType = requiresGasType ? expenseGasTypeInput.value : "";
  const namedGasCategory = ["k-gas", "total-gas", "pro-gas"]
    .includes(expenseCostCategoryInput.value);
  const costCategory = isGasCategory && !namedGasCategory
    ? gasType === "refillable" ? "gas-refillable" : "gas-nonrefillable"
    : expenseCostCategoryInput.value;

  const expenseData = {
    date,
    type: expenseTypeInput.value,
    costCategory,
    description: expenseDescriptionInput.value.trim(),
    paidToSupplier: expensePaidToSupplierInput.value,
    vendor: expenseVendorInput.value.trim(),
    amount,
    notes: expenseNotesInput.value.trim()
  };
  const expenseForDuplicateCheck = {
    ...expenseData,
    ...(crateItem ? { crateItemId: crateItem.id, crateItemName: crateItem.name } : {}),
    ...(accessoryItem ? { accessoryItemId: accessoryItem.id, accessoryItemName: accessoryItem.name } : {})
  };
  saveExpenseBtn.disabled = true;
  cancelExpenseEditBtn.disabled = true;
  saveExpenseBtn.classList.add("loading");
  expenseFormMessage.textContent = "";
  try {
    let duplicate;
    try {
      duplicate = await findDuplicateExpense(
        expenseForDuplicateCheck,
        user.uid,
        editingExpenseId
      );
    } catch (error) {
      console.error("Unable to verify duplicate expense records:", error);
      expenseFormMessage.textContent = `Unable to verify duplicate costs: ${error.message}`;
      return;
    }
    if (duplicate && !confirmDuplicateExpense(duplicate)) {
      expenseFormMessage.textContent = "Cost was not saved because a matching entry already exists.";
      return;
    }

    if (editingExpenseId) {
      const expenseRef = doc(expensesRef, editingExpenseId);
      await runTransaction(dbInstance, async transaction => {
        const expenseSnapshot = await transaction.get(expenseRef);
        if (!expenseSnapshot.exists()) {
          throw new Error("This cost no longer exists.");
        }
        if (expenseSnapshot.data().uid !== user.uid) {
          throw new Error("You do not have permission to update this cost.");
        }
        transaction.update(expenseRef, {
          ...expenseData,
          crateItemId: crateItem ? crateItem.id : deleteField(),
          crateItemName: crateItem ? crateItem.name : deleteField(),
          accessoryItemId: accessoryItem ? accessoryItem.id : deleteField(),
          accessoryItemName: accessoryItem ? accessoryItem.name : deleteField(),
          gasType: gasType || deleteField(),
          updatedAt: serverTimestamp()
        });
      });
      resetExpenseForm();
      expenseFormMessage.textContent = "Cost updated. Expense and profit reports will refresh automatically.";
    } else {
      await addDoc(expensesRef, {
        uid: user.uid,
        ...expenseData,
        ...(crateItem ? { crateItemId: crateItem.id, crateItemName: crateItem.name } : {}),
        ...(accessoryItem ? { accessoryItemId: accessoryItem.id, accessoryItemName: accessoryItem.name } : {}),
        ...(gasType ? { gasType } : {}),
        createdAt: new Date().toISOString()
      });
      resetExpenseForm();
      expenseFormMessage.textContent = "Cost recorded.";
    }
  } catch (error) {
    console.error(editingExpenseId
      ? "Unable to update expense or purchase:"
      : "Unable to record expense or purchase:", error);
    expenseFormMessage.textContent = `Unable to ${editingExpenseId ? "update" : "record"} cost: ${error.message}`;
  } finally {
    saveExpenseBtn.disabled = false;
    cancelExpenseEditBtn.disabled = false;
    saveExpenseBtn.classList.remove("loading");
  }
}

async function findDuplicateExpense(expense, uid, excludedExpenseId = null) {
  const snapshot = await getDocsFromServer(query(
    expensesRef,
    where("uid", "==", uid)
  ));
  const candidateDate = expense.date || expenseDateKey(expense);
  const candidateType = String(expense.type || "Expense").trim().toLowerCase();
  const candidateCategory = String(expense.costCategory || "").trim().toLowerCase();
  const candidateItem = getExpenseDuplicateItemKey(expense);
  const candidateAmount = Number(expense.amount);

  return snapshot.docs
    .filter(expenseDoc => expenseDoc.id !== excludedExpenseId)
    .map(expenseDoc => ({ id: expenseDoc.id, ...expenseDoc.data() }))
    .find(existing => (
      expenseDateKey(existing) === candidateDate &&
      String(existing.type || "Expense").trim().toLowerCase() === candidateType &&
      String(existing.costCategory || "").trim().toLowerCase() === candidateCategory &&
      getExpenseDuplicateItemKey(existing) === candidateItem &&
      Number(existing.amount) === candidateAmount
    )) || null;
}

function getExpenseDuplicateItemKey(expense) {
  const normalize = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (expense.costCategory === "crate-item") {
    return `crate:${expense.crateItemId || normalize(expense.crateItemName)}`;
  }
  if (expense.costCategory === "accessory-item") {
    return `accessory:${expense.accessoryItemId || normalize(expense.accessoryItemName)}`;
  }
  return `description:${normalize(expense.description)}`;
}

function confirmDuplicateExpense(duplicate) {
  const item = duplicate.crateItemName || duplicate.accessoryItemName ||
    duplicate.description || "matching cost";
  return window.confirm(
    `A matching ${duplicate.type || "Expense"} entry already exists for "${item}" ` +
    `on ${expenseDateKey(duplicate)} for KES ${formatNumber(duplicate.amount)}. ` +
    "Record this additional entry anyway?"
  );
}

function renderExpensesTable() {
  if (expensesError) {
    expensesTable.innerHTML = `<tr><td colspan="9">${escapeQuantity(expensesError)}</td></tr>`;
    return;
  }
  const today = new Date();
  const todayKey = dateKey(today);
  let startKey;
  let endKey = todayKey;
  if (expensePeriodFilter.value === "custom") {
    startKey = expenseFromDate.value;
    endKey = expenseToDate.value;
    if (!startKey || !endKey || startKey > endKey) {
      expensesTable.innerHTML =
        `<tr><td colspan="9" style="text-align:center;">Choose a valid custom date range.</td></tr>`;
      return;
    }
  } else {
    const periodDays = expensePeriodFilter.value === "today"
      ? 1
      : Number(expensePeriodFilter.value) || 1;
    const periodStart = new Date(today);
    periodStart.setDate(today.getDate() - periodDays + 1);
    startKey = dateKey(periodStart);
  }
  const sortedExpenses = expensesForAnalytics
    .filter(expense => {
      const expenseDate = expenseDateKey(expense);
      return expenseDate >= startKey && expenseDate <= todayKey;
    })
    .sort((left, right) =>
      expenseDateKey(right).localeCompare(expenseDateKey(left))
    );
  expensesTable.innerHTML = sortedExpenses.length
    ? sortedExpenses.map(expense => {
      const date = expense.date || dateKey(new Date(expense.createdAt));
      const selectedCategory = isValidExpenseCostCategory(expense.costCategory)
        ? expense.costCategory
        : "";
      return `<tr>
        <td>${escapeQuantity(date)}</td>
        <td>${escapeQuantity(expense.type || "Expense")}</td>
        <td>${escapeQuantity(expense.description || "")}</td>
        <td>
          <div class="expense-category-fields">
          <select class="expense-category-select" data-expense-category="${escapeQuantity(expense.id)}" aria-label="Cost category for ${escapeQuantity(expense.description || "expense")}">
            <option value=""${selectedCategory ? "" : " selected"}>Unclassified</option>
            <option value="general"${selectedCategory === "general" ? " selected" : ""}>General</option>
            <optgroup label="Fuel & Energy">
              <option value="k-gas"${selectedCategory === "k-gas" ? " selected" : ""}>K GAS</option>
              <option value="total-gas"${selectedCategory === "total-gas" ? " selected" : ""}>TOTAL GAS</option>
              <option value="pro-gas"${selectedCategory === "pro-gas" ? " selected" : ""}>PRO GAS</option>
              ${customFuelEnergyCategories.map(category =>
                `<option value="fuel:${escapeQuantity(category.id)}"${selectedCategory === `fuel:${category.id}` ? " selected" : ""}>${escapeQuantity(category.name)}</option>`
              ).join("")}
            </optgroup>
            ${selectedCategory === "gas-cylinder"
              ? `<option value="gas-cylinder" selected>Legacy: Gas cylinder</option>`
              : ""}
            <option value="gas-refillable"${selectedCategory === "gas-refillable" ? " selected" : ""}>Gas: Refillable</option>
            <option value="gas-nonrefillable"${selectedCategory === "gas-nonrefillable" ? " selected" : ""}>Gas: Non-refillable</option>
            <option value="crate-item"${selectedCategory === "crate-item" ? " selected" : ""}>Crate Items</option>
            <option value="accessory-item"${selectedCategory === "accessory-item" ? " selected" : ""}>Accessories</option>
          </select>
          ${renderCrateExpenseItemSelect(expense)}
          ${renderAccessoryExpenseItemSelect(expense)}
          </div>
        </td>
        <td>${escapeQuantity(expense.paidToSupplier || "—")}</td>
        <td>${escapeQuantity(expense.vendor || "—")}</td>
        <td>${formatNumber(expense.amount)}</td>
        <td>${escapeQuantity(expense.notes || "—")}</td>
        <td><div class="expense-row-actions">
          <button type="button" data-save-expense-category="${escapeQuantity(expense.id)}">Save category</button>
          <button type="button" data-edit-expense="${escapeQuantity(expense.id)}">Edit</button>
          <button type="button" data-delete-expense="${escapeQuantity(expense.id)}">Delete</button>
        </div></td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="9" style="text-align:center;">No expenses or purchases recorded for this period.</td></tr>`;
}

function handleExpenseTableAction(event) {
  const saveButton = event.target.closest("[data-save-expense-category]");
  if (saveButton) {
    handleExpenseCategorySave(event);
    return;
  }
  const editButton = event.target.closest("[data-edit-expense]");
  if (editButton) {
    startExpenseEdit(editButton.dataset.editExpense);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-expense]");
  if (deleteButton) {
    deleteExpense(deleteButton.dataset.deleteExpense, deleteButton);
  }
}

function startExpenseEdit(expenseId) {
  const expense = expensesForAnalytics.find(candidate => candidate.id === expenseId);
  const user = authInstance.currentUser;
  if (!expense || !user || expense.uid !== user.uid) {
    expenseFormMessage.textContent = "This cost is no longer available. Refresh the list and try again.";
    return;
  }

  const category = expense.costCategory || "";
  if (!isValidExpenseCostCategory(category)) {
    expenseFormMessage.textContent = "This cost has an unsupported category. Save a valid category in the table before editing.";
    return;
  }
  if (category && ![...expenseCostCategoryInput.options].some(option => option.value === category)) {
    const legacyOption = document.createElement("option");
    legacyOption.value = category;
    legacyOption.textContent = `Legacy: ${category}`;
    expenseCostCategoryInput.appendChild(legacyOption);
  }

  editingExpenseId = expense.id;
  expenseDateInput.value = expenseDateKey(expense);
  expenseTypeInput.value = expense.type === "Purchase" ? "Purchase" : "Expense";
  expenseCostCategoryInput.value = category;
  expenseDescriptionInput.value = expense.description || "";
  expensePaidToSupplierInput.value = expense.paidToSupplier === "Yes" ? "Yes" : "No";
  expenseVendorInput.value = expense.vendor || "";
  expenseAmountInput.value = expense.amount ?? "";
  expenseNotesInput.value = expense.notes || "";
  updateExpenseGasTypeField();
  expenseGasTypeInput.value = getExpenseGasType(expense);
  renderCrateExpenseItemOptions(expenseCrateItemInput, expense.crateItemId || "");
  renderAccessoryExpenseItemOptions(expenseAccessoryItemInput, expense.accessoryItemId || "");
  saveExpenseBtn.querySelector(".btn-text").textContent = "Update cost";
  cancelExpenseEditBtn.hidden = false;
  expenseFormMessage.textContent = `Editing ${expense.description || "cost"}. Saving will update linked expense and profit reports.`;
  expenseForm.scrollIntoView({ behavior: "smooth", block: "start" });
  expenseDateInput.focus();
}

function resetExpenseForm() {
  expenseForm.reset();
  expenseDateInput.value = dateKey(new Date());
  editingExpenseId = null;
  saveExpenseBtn.querySelector(".btn-text").textContent = "Record cost";
  cancelExpenseEditBtn.hidden = true;
  renderCrateExpenseItemOptions(expenseCrateItemInput, "");
  renderAccessoryExpenseItemOptions(expenseAccessoryItemInput, "");
  updateExpenseGasTypeField();
}

async function deleteExpense(expenseId, button) {
  const expense = expensesForAnalytics.find(candidate => candidate.id === expenseId);
  const user = authInstance.currentUser;
  if (!expense || !user || expense.uid !== user.uid) {
    expenseFormMessage.textContent = "This cost is no longer available. Refresh the list and try again.";
    return;
  }

  const description = expense.description || "this cost";
  if (!window.confirm(
    `Delete ${expense.type || "Expense"} "${description}" for KES ${formatNumber(expense.amount)}? ` +
    "Expense and profit reports will be recalculated. Inventory stock is not changed."
  )) {
    return;
  }

  button.disabled = true;
  try {
    const expenseRef = doc(expensesRef, expenseId);
    await runTransaction(dbInstance, async transaction => {
      const expenseSnapshot = await transaction.get(expenseRef);
      if (!expenseSnapshot.exists()) {
        throw new Error("This cost no longer exists.");
      }
      if (expenseSnapshot.data().uid !== user.uid) {
        throw new Error("You do not have permission to delete this cost.");
      }
      transaction.delete(expenseRef);
    });
    if (editingExpenseId === expenseId) resetExpenseForm();
    expenseFormMessage.textContent = "Cost deleted. Expense and profit reports will refresh automatically.";
  } catch (error) {
    console.error("Unable to delete expense or purchase:", error);
    expenseFormMessage.textContent = `Unable to delete cost: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function handleExpenseCategorySave(event) {
  const saveButton = event.target.closest("[data-save-expense-category]");
  if (!saveButton) return;

  const expenseId = saveButton.dataset.saveExpenseCategory;
  const categoryInput = [...expensesTable.querySelectorAll("select[data-expense-category]")]
    .find(select => select.dataset.expenseCategory === expenseId);
  const category = categoryInput?.value;
  if (!category || !isValidExpenseCostCategory(category)) {
    expenseFormMessage.textContent = "Choose a cost category before saving.";
    return;
  }
  const crateItemInput = [...expensesTable.querySelectorAll("select[data-expense-crate-item]")]
    .find(select => select.closest("tr")?.querySelector("[data-expense-category]")?.dataset.expenseCategory === expenseId);
  const crateItem = category === "crate-item"
    ? itemsArray.find(item => item.id === crateItemInput?.value)
    : null;
  if (category === "crate-item" && !crateItem) {
    expenseFormMessage.textContent = "Choose a crate item from inventory before saving its category.";
    return;
  }
  const accessoryItemInput = [...expensesTable.querySelectorAll("select[data-expense-accessory-item]")]
    .find(select => select.closest("tr")?.querySelector("[data-expense-category]")?.dataset.expenseCategory === expenseId);
  const accessoryItem = category === "accessory-item"
    ? accessoryExpenseItems.find(item => item.id === accessoryItemInput?.value)
    : null;
  if (category === "accessory-item" && !accessoryItem) {
    expenseFormMessage.textContent = "Choose an accessory from the accessory list before saving its category.";
    return;
  }

  const existingExpense = expensesForAnalytics.find(expense => expense.id === expenseId);
  const user = authInstance.currentUser;
  if (!existingExpense || !user || existingExpense.uid !== user.uid) {
    expenseFormMessage.textContent = "This cost is no longer available. Refresh the list and try again.";
    return;
  }
  const updatedExpense = {
    ...existingExpense,
    costCategory: category,
    ...(crateItem
      ? { crateItemId: crateItem.id, crateItemName: crateItem.name }
      : { crateItemId: "", crateItemName: "" }),
    ...(accessoryItem
      ? { accessoryItemId: accessoryItem.id, accessoryItemName: accessoryItem.name }
      : { accessoryItemId: "", accessoryItemName: "" })
  };

  saveButton.disabled = true;
  expenseFormMessage.textContent = "";
  try {
    let duplicate;
    try {
      duplicate = await findDuplicateExpense(updatedExpense, user.uid, expenseId);
    } catch (error) {
      console.error("Unable to verify duplicate expense records:", error);
      expenseFormMessage.textContent = `Unable to verify duplicate costs: ${error.message}`;
      return;
    }
    if (duplicate && !confirmDuplicateExpense(duplicate)) {
      expenseFormMessage.textContent = "Category was not saved because a matching entry already exists.";
      return;
    }

    await updateDoc(doc(expensesRef, expenseId), {
      costCategory: category,
      crateItemId: crateItem ? crateItem.id : deleteField(),
      crateItemName: crateItem ? crateItem.name : deleteField(),
      accessoryItemId: accessoryItem ? accessoryItem.id : deleteField(),
      accessoryItemName: accessoryItem ? accessoryItem.name : deleteField()
    });
    expenseFormMessage.textContent = "Cost category updated.";
  } catch (error) {
    console.error("Unable to update expense category:", error);
    expenseFormMessage.textContent = `Unable to update category: ${error.message}`;
  } finally {
    saveButton.disabled = false;
  }
}

function handleAnalyticsItemChange() {
  if (analyticsItemSalesUnsubscribe) {
    analyticsItemSalesUnsubscribe();
    analyticsItemSalesUnsubscribe = null;
  }
  analyticsItemSalesError = null;

  const itemId = analyticsItemFilter.value;
  if (!itemId) {
    analyticsItemSales = [];
    updateAnalyticsUI();
    return;
  }
  if (isStaticAnalyticsFilter(itemId)) {
    analyticsItemSales = getAnalyticsSalesForFilter(itemId);
    updateAnalyticsUI();
    return;
  }
  analyticsItemSales = [];
  updateAnalyticsUI();
  const itemSalesQuery = query(
    salesRef,
    where("uid", "==", authInstance.currentUser.uid),
    where("itemId", "==", itemId)
  );

  analyticsItemSalesUnsubscribe = onSnapshot(itemSalesQuery, snapshot => {
    analyticsItemSales = snapshot.docs.map(saleDoc => saleDoc.data());
    analyticsItemSalesError = null;
    updateAnalyticsUI();
  }, error => {
    console.error("Unable to load item sales analytics:", error);
    analyticsItemSalesError = "Unable to load sales for this item. Please try again.";
    updateAnalyticsUI();
  });
}

/**
 * Filters items based on search input and renders results.
 */
function handleItemSearch() {
  const term = saleItemSearch.value.toLowerCase().trim();
  selectedItemId = null;
  setSaleQuantityUnit(null);
  setPetrolDipFieldsVisible(false);

  if (!term) {
    saleSearchResults.style.display = "none";
    return;
  }

  const matches = itemsArray.filter(i =>
    i.name.toLowerCase().includes(term) &&
    (isBoxItem(i) ? getBoxStockUnits(i) :
      isCrateItem(i.name) ? getCrateStockPieces(i) :
        (parseQuantity(i.quantity)?.amount ?? 0)) > 0);

  if (matches.length === 0) {
    saleSearchResults.style.display = "none";
    return;
  }

  saleSearchResults.innerHTML = matches.map(item => `
    <div class="search-result-item" onclick="window.selectSaleItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')">
      <strong>${item.name}</strong> <br/>
      ${item.gasType ? `<small class="sale-gas-type">${getGasTypeLabel(item.gasType)}</small><br/>` : ""}
      <small>${isCrateItem(item.name) || isBoxItem(item)
        ? `Price: KES ${formatNumber(item.outgoing)} / ${isBoxItem(item) ? "box" : "crate"} | KES ${
          item.pieceSellingPrice === null || item.pieceSellingPrice === undefined
            ? "Not set"
            : formatNumber(item.pieceSellingPrice)
        } / ${isBoxItem(item) ? "unit" : "piece"}`
        : `Price: KES ${formatNumber(item.outgoing)}`
      } | Stock: ${escapeQuantity(
        isBoxItem(item) ? formatBoxStock(item) :
          isCrateItem(item.name) ? formatCrateStock(item) : formatDisplayQuantity(item.quantity)
      )}</small>
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
  const selectedItem = itemsArray.find(item => item.id === id);
  setSaleQuantityUnit(selectedItem);
  updateCrateSaleStockPreview();
  setPetrolDipFieldsVisible(isPetrolItem(selectedItem));
  if (isPetrolItem(selectedItem)) {
    prefillPetrolDipFromPreviousDay(selectedItem);
  }

  updateSaleUnitPrice();
  saleQuantityInput.focus();
}

function getGasTypeLabel(gasType) {
  if (gasType === "refillable") return "Refillable";
  if (gasType === "non-refillable") return "Non-refillable";
  return "";
}

function getSaleGasType(sale) {
  return sale.gasType || itemsArray.find(item => item.id === sale.itemId)?.gasType || "";
}

async function prefillPetrolDipFromPreviousDay(item, resetEntries = true) {
  const requestId = ++petrolDipPrefillRequest;
  const inputRevision = petrolDipInputRevision;
  const itemId = item.id;
  const selectedDateKey = salesDateFilter.value;

  petrolOpeningDipInput.value = "";
  if (resetEntries) {
    petrolFuelReceivedInput.value = "0 L";
    petrolActualClosingInput.value = "";
  }
  updatePetrolSalePreview();

  try {
    const previousSalesQuery = query(
      salesRef,
      where("uid", "==", authInstance.currentUser.uid),
      where("itemId", "==", itemId)
    );
    const snapshot = await getDocs(previousSalesQuery);
    if (requestId !== petrolDipPrefillRequest ||
        selectedItemId !== itemId ||
        petrolDipInputRevision !== inputRevision) {
      return;
    }

    const priorDipSales = snapshot.docs
      .map(saleDoc => saleDoc.data())
      .filter(sale => {
        const closingDip = sale.petrolDip?.actualClosingDipLiters;
        if (closingDip === null || closingDip === undefined) return false;
        const saleTimestamp = new Date(sale.createdAt);
        return Number.isFinite(saleTimestamp.getTime()) && dateKey(saleTimestamp) < selectedDateKey;
      })
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    const previousClosingDip = priorDipSales[0]?.petrolDip.actualClosingDipLiters;
    if (previousClosingDip !== null && previousClosingDip !== undefined &&
        Number.isFinite(Number(previousClosingDip))) {
      petrolOpeningDipInput.value = `${previousClosingDip} L`;
    }
    updatePetrolSalePreview();
  } catch (error) {
    console.error("Unable to load previous day's petrol closing dip:", error);
    if (requestId === petrolDipPrefillRequest && selectedItemId === itemId) {
      showToast("Could not load the previous day's closing dip. Enter the opening dip manually.", "error");
    }
  }
}

function isPetrolItem(item) {
  return isPetrolName(item?.name);
}

function isGasAnalyticsItem(item) {
  return Boolean(item && !isPetrolItem(item) &&
    (item.gasType === "refillable" || item.gasType === "non-refillable" ||
     /gas/i.test(item.name || "")));
}

function isSodaAnalyticsItem(item) {
  const name = String(item?.name || "");
  return /\bsoda\b/i.test(name) && /\b(?:300|500)\s*ml\b/i.test(name);
}

function isCrateAnalyticsItem(item) {
  return Boolean(item && isCrateItem(item.name));
}

function isAccessoryAnalyticsItem(item) {
  return Boolean(item && accessoryNames.has(String(item.name || "").trim().toLowerCase()));
}

function matchesAnalyticsGroup(item, filterValue) {
  if (filterValue === ALL_GAS_ANALYTICS_FILTER) return isGasAnalyticsItem(item);
  if (filterValue === ALL_SODA_ANALYTICS_FILTER) return isSodaAnalyticsItem(item);
  if (filterValue === ALL_CRATE_ANALYTICS_FILTER) return isCrateAnalyticsItem(item);
  if (filterValue === ALL_ACCESSORIES_ANALYTICS_FILTER) return isAccessoryAnalyticsItem(item);
  return false;
}

function getGasTypeForSale(sale) {
  const item = analyticsItemsById.get(sale.itemId) ||
    itemsArray.find(candidate => candidate.id === sale.itemId) ||
    { name: sale.itemName, gasType: sale.gasType };
  if (!isGasAnalyticsItem(item)) return "";
  const gasType = sale.gasType || item?.gasType;
  if (gasType === "refillable") return "Refillable";
  if (gasType === "non-refillable") return "Non-refillable";
  return "Type not recorded";
}

function getGroupedAnalyticsSales(filterValue) {
  return allSalesForAnalytics.filter(sale => {
    const item = analyticsItemsById.get(sale.itemId) ||
      itemsArray.find(candidate => candidate.id === sale.itemId) ||
      { name: sale.itemName, gasType: sale.gasType };
    return matchesAnalyticsGroup(item, filterValue);
  });
}

function getAnalyticsSalesForFilter(filterValue) {
  return filterValue === GENERAL_ANALYTICS_FILTER
    ? allSalesForAnalytics.filter(isIncludedInAllAnalytics)
    : getGroupedAnalyticsSales(filterValue);
}

function setSaleQuantityUnit(item) {
  const boxItem = isBoxItem(item);
  const crateItem = !boxItem && isCrateItem(item?.name);
  const packagedItem = crateItem || boxItem;
  const packageName = boxItem ? "box" : "crate";
  saleQuantityUnitField.hidden = !packagedItem;
  saleCrateStockStatus.hidden = !packagedItem;
  saleQuantityInput.placeholder = packagedItem ? "Enter quantity" : "Qty (e.g. 2 kg, 3 cartons)";
  salePriceInput.placeholder = packagedItem ? `Selling price per ${packageName}` : "Price Sold";
  saleQuantityUnit.value = "";
  saleCrateSize.value = "full";
  const unitsPerPack = boxItem ? getUnitsPerBox(item) : crateItem ? getPiecesPerCrate(item) : 24;
  saleCrateOption.textContent = `${boxItem ? "Box" : "Crate"} (${formatNumber(unitsPerPack)} pieces)`;
  salePieceOption.textContent = "Individual piece";
  saleFullPackOption.textContent = `Full ${packageName}`;
  saleHalfPackOption.textContent = `Half ${packageName}`;
  saleCrateSizeField.firstChild.textContent = `${boxItem ? "Box" : "Crate"} size`;
  updateSaleCrateSizeField(item);
  syncSaleQuantityUnit(item);
  updateSaleUnitPrice();
  updateCrateSaleStockPreview();
}

function supportsHalfCrate(item) {
  if (isBoxItem(item)) return getUnitsPerBox(item) % 2 === 0;
  if (!isCrateItem(item?.name)) return false;
  const name = String(item.name);
  const isWaterCrate = /\bwater\b/i.test(name);
  const isTargetSodaCrate = /\bsoda\b/i.test(name) && /\b(?:300|500)\s*ml\b/i.test(name);
  return (isWaterCrate || isTargetSodaCrate) &&
    getPiecesPerCrate(item) % 2 === 0;
}

function updateSaleCrateSizeField(item) {
  saleCrateSizeField.hidden = !supportsHalfCrate(item) ||
    saleQuantityUnit.value !== "crate";
}

function getCrateSaleQuantityUnit(item) {
  if (!saleQuantityUnit.value) return "";
  if (saleQuantityUnit.value === "piece") return "PIECES";
  const packageLabel = isBoxItem(item) ? "BOX" : "CRATE";
  return supportsHalfCrate(item) && saleCrateSize.value === "half"
    ? `HALF ${packageLabel}S`
    : `${packageLabel}S`;
}

function updateCrateSaleStockPreview() {
  const item = itemsArray.find(candidate => candidate.id === selectedItemId);
  const boxItem = isBoxItem(item);
  const crateItem = !boxItem && isCrateItem(item?.name);
  if (!crateItem && !boxItem) {
    saleCrateStockStatus.hidden = true;
    saleCrateStockStatus.textContent = "";
    return;
  }

  saleCrateStockStatus.hidden = false;
  const piecesPerCrate = boxItem ? getUnitsPerBox(item) : getPiecesPerCrate(item);
  let availablePieces = boxItem ? getBoxStockUnits(item) : getCrateStockPieces(item);
  if (editSaleId && editingOriginalSale?.itemId === selectedItemId) {
    availablePieces += getCrateSaleStockUnits(editingOriginalSale, item);
  }

  const formatStock = pieces => {
    const crates = Math.floor(pieces / piecesPerCrate);
    const loosePieces = pieces % piecesPerCrate;
    const stock = boxItem
      ? formatBoxStock({
        quantity: formatQuantity(crates, "BOXES"),
        looseUnits: loosePieces,
        unitsPerBox: piecesPerCrate
      })
      : formatCrateStock({
        quantity: formatQuantity(crates, "CRATES"),
        loosePieces,
        piecesPerCrate
      });
    const unitLabel = "PIECE";
    return `${stock} (${formatNumber(pieces)} ${pieces === 1 ? unitLabel : `${unitLabel}S`})`;
  };

  const lines = [`Available: ${formatStock(availablePieces)}`];
  const saleQuantity = parseQuantity(saleQuantityInput.value);
  if (!saleQuantityUnit.value) {
    lines.push("Choose how to sell this item.");
  } else if (saleQuantity && Number.isInteger(saleQuantity.amount) && saleQuantity.amount > 0) {
    const packSize = getCrateSaleQuantityUnit(item);
    const piecesToSell = saleQuantity.amount *
      (packSize === "HALF CRATES" ? piecesPerCrate / 2 :
        packSize === "HALF BOXES" ? piecesPerCrate / 2 :
          packSize === "CRATES" || packSize === "BOXES" ? piecesPerCrate : 1);
    if (piecesToSell <= availablePieces) {
      lines.push(`After sale: ${formatStock(availablePieces - piecesToSell)}`);
    } else {
      lines.push("Not enough stock for this quantity.");
    }
  }
  saleCrateStockStatus.textContent = lines.join(" | ");
}

function syncSaleQuantityUnit(item) {
  const quantity = parseQuantity(saleQuantityInput.value);
  if (!quantity) return;

  if (isCrateItem(item?.name) || isBoxItem(item)) {
    if (!quantity.unit || /^(?:half\s+)?(?:crates?|boxes?)$|^(?:pieces?|units?)$/i.test(quantity.unit)) {
      const unit = getCrateSaleQuantityUnit(item);
      if (unit) saleQuantityInput.value = formatQuantity(quantity.amount, unit);
    }
    return;
  }

  if (/^(crates?|pieces?|boxes?|units?)$/i.test(quantity.unit)) {
    saleQuantityInput.value = String(quantity.amount);
  }
  appendQuantityUnit(saleQuantityInput, "L", isPetrolItem(item));
  saleCrateStockStatus.hidden = true;
}

function updateSaleUnitPrice() {
  const item = itemsArray.find(candidate => candidate.id === selectedItemId);
  if (!item) {
    salePriceInput.readOnly = false;
    return;
  }
  const boxItem = isBoxItem(item);
  const crateItem = !boxItem && isCrateItem(item.name);
  if (!crateItem && !boxItem) {
    salePriceInput.placeholder = saleTypeInput.value === "wholesale"
      ? "Wholesale price"
      : "Price Sold";
    salePriceInput.readOnly = false;
    salePriceInput.value = item.outgoing;
    return;
  }

  if (!saleQuantityUnit.value) {
    salePriceInput.placeholder = saleTypeInput.value === "wholesale"
      ? "Wholesale price"
      : "Price Sold";
    salePriceInput.readOnly = false;
    salePriceInput.value = "";
    return;
  }

  const isPieceSale = saleQuantityUnit.value === "piece";
  const isHalfCrateSale = !isPieceSale &&
    supportsHalfCrate(item) &&
    saleCrateSize.value === "half";
  salePriceInput.readOnly = isHalfCrateSale && saleTypeInput.value !== "wholesale";
  const packageName = boxItem ? "box" : "crate";
  const unitName = "piece";
  salePriceInput.placeholder = saleTypeInput.value === "wholesale"
    ? isPieceSale ? `Wholesale price per ${unitName}`
      : isHalfCrateSale ? `Wholesale price per half ${packageName}` : `Wholesale price per ${packageName}`
    : isPieceSale
    ? `Selling price per ${unitName}`
    : isHalfCrateSale ? `Selling price per half ${packageName}` : `Selling price per ${packageName}`;
  salePriceInput.value = isPieceSale
    ? Number(item.pieceSellingPrice) || ""
    : isHalfCrateSale ? Number(item.outgoing) / 2 : item.outgoing;
}

function getRetailUnitPrice(item, crateItem, saleUnit, crateSize) {
  if (!crateItem) return Number(item.outgoing);
  if (saleUnit === "piece") return Number(item.pieceSellingPrice);
  return saleSizeForPrice(item, crateSize);
}

function saleSizeForPrice(item, crateSize) {
  return crateSize === "half" && supportsHalfCrate(item)
    ? Number(item.outgoing) / 2
    : Number(item.outgoing);
}

function getCrateSaleStockUnits(sale, item) {
  const quantity = Number(sale.quantity) || 0;
  const unit = String(sale.quantityUnit || "").toLowerCase();
  const boxSale = Number(sale.unitsPerBox) > 0 ||
    unit.startsWith("box") || unit.startsWith("half box");
  const crateSale = !boxSale && (Number(sale.piecesPerCrate) > 0 ||
    isCrateItem(item?.name) || unit.startsWith("crate") || unit.startsWith("half crate"));
  if (!crateSale && !boxSale) return quantity;
  const boxItem = boxSale || (!crateSale && isBoxItem(item));
  const unitsPerPack = Number(boxItem ? sale.unitsPerBox : sale.piecesPerCrate) ||
    (boxItem ? getUnitsPerBox(item) : getPiecesPerCrate(item));
  if (sale.crateSize === "half" || unit.startsWith("half crate") || unit.startsWith("half box")) {
    return quantity * unitsPerPack / 2;
  }
  return quantity * (!unit || unit.startsWith("crate") || unit.startsWith("box") ? unitsPerPack : 1);
}

function formatSaleQuantity(sale) {
  const quantity = Number(sale.quantity) || 0;
  const unit = String(sale.quantityUnit || "").trim().toUpperCase();
  if (unit === "HALF CRATES") {
    return `${formatNumber(quantity)} HALF ${quantity === 1 ? "CRATE" : "CRATES"}`;
  }
  if (unit === "CRATES") {
    return `${formatNumber(quantity)} FULL ${quantity === 1 ? "CRATE" : "CRATES"}`;
  }
  if (unit === "PIECES") {
    return `${formatNumber(quantity)} ${quantity === 1 ? "PIECE" : "PIECES"}`;
  }
  if (unit === "HALF BOXES") {
    return `${formatNumber(quantity)} HALF ${quantity === 1 ? "BOX" : "BOXES"}`;
  }
  if (unit === "BOXES") {
    return `${formatNumber(quantity)} FULL ${quantity === 1 ? "BOX" : "BOXES"}`;
  }
  if (unit === "UNITS") {
    return `${formatNumber(quantity)} ${quantity === 1 ? "PIECE" : "PIECES"}`;
  }
  return formatDisplayQuantity(formatQuantity(sale.quantity, sale.quantityUnit || ""));
}

function getItemStockUnits(item) {
  return isBoxItem(item)
    ? getBoxStockUnits(item)
    : isCrateItem(item.name)
    ? getCrateStockPieces(item)
    : parseQuantity(item.quantity)?.amount ?? 0;
}

function getItemStockUnit(item) {
  return isBoxItem(item)
    ? "PIECES"
    : isCrateItem(item.name)
    ? "PIECES"
    : String(parseQuantity(item.quantity)?.unit || "").toUpperCase();
}

function createStockMovement(item, quantityDelta, type) {
  return {
    uid: item.uid || authInstance.currentUser.uid,
    itemId: item.id,
    itemName: item.name,
    quantityDelta,
    quantityUnit: getItemStockUnit(item),
    type,
    occurredAt: serverTimestamp()
  };
}

function getSalesSummaryUpdate(originalSale, replacementSale = null) {
  const originalSaleDate = new Date(originalSale.createdAt);
  const replacementSaleDate = replacementSale ? new Date(replacementSale.createdAt) : null;
  if (!Number.isFinite(originalSaleDate.getTime()) ||
      (replacementSaleDate && !Number.isFinite(replacementSaleDate.getTime()))) {
    throw new Error("The sale date is invalid, so sales totals cannot be reconciled.");
  }
  const originalDate = dateKey(originalSaleDate);
  const replacementDate = replacementSaleDate ? dateKey(replacementSaleDate) : null;
  const originalMonth = originalDate.slice(0, 7);
  const replacementMonth = replacementDate?.slice(0, 7);
  const originalRevenue = Number(originalSale.revenue) || 0;
  const replacementRevenue = Number(replacementSale?.revenue) || 0;
  const originalProfit = Number(originalSale.profit) || 0;
  const replacementProfit = Number(replacementSale?.profit) || 0;
  const originalQuantity = Number(originalSale.quantity) || 0;
  const replacementQuantity = Number(replacementSale?.quantity) || 0;
  const updates = {
    "lifetime.revenue": increment(replacementRevenue - originalRevenue),
    "lifetime.profit": increment(replacementProfit - originalProfit)
  };

  if (originalDate === replacementDate) {
    updates[`dailyTotals.${originalDate}.revenue`] =
      increment(replacementRevenue - originalRevenue);
    updates[`dailyTotals.${originalDate}.profit`] =
      increment(replacementProfit - originalProfit);
    updates[`dailyTotals.${originalDate}.count`] =
      increment(replacementQuantity - originalQuantity);
  } else {
    updates[`dailyTotals.${originalDate}.revenue`] = increment(-originalRevenue);
    updates[`dailyTotals.${originalDate}.profit`] = increment(-originalProfit);
    updates[`dailyTotals.${originalDate}.count`] = increment(-originalQuantity);
    if (replacementSale) {
      updates[`dailyTotals.${replacementDate}.revenue`] = increment(replacementRevenue);
      updates[`dailyTotals.${replacementDate}.profit`] = increment(replacementProfit);
      updates[`dailyTotals.${replacementDate}.count`] = increment(replacementQuantity);
    }
  }

  if (originalMonth === replacementMonth) {
    updates[`monthlyTotals.${originalMonth}.revenue`] =
      increment(replacementRevenue - originalRevenue);
    updates[`monthlyTotals.${originalMonth}.profit`] =
      increment(replacementProfit - originalProfit);
  } else {
    updates[`monthlyTotals.${originalMonth}.revenue`] = increment(-originalRevenue);
    updates[`monthlyTotals.${originalMonth}.profit`] = increment(-originalProfit);
    if (replacementSale) {
      updates[`monthlyTotals.${replacementMonth}.revenue`] = increment(replacementRevenue);
      updates[`monthlyTotals.${replacementMonth}.profit`] = increment(replacementProfit);
    }
  }

  return updates;
}

function getItemStockUpdate(item, unitAdjustment) {
  if (isBoxItem(item)) {
    return adjustBoxStock(item, unitAdjustment);
  }
  if (isCrateItem(item.name)) {
    return adjustCrateStock(item, unitAdjustment);
  }
  return { quantity: adjustQuantity(item.quantity, unitAdjustment) };
}

function setPetrolDipFieldsVisible(visible) {
  petrolDipFields.hidden = !visible;
  appendQuantityUnit(saleQuantityInput, "L", visible);
  [petrolOpeningDipInput, petrolFuelReceivedInput, petrolActualClosingInput].forEach(input => {
    input.required = visible;
  });
  if (!visible) {
    petrolOpeningDipInput.value = "";
    petrolFuelReceivedInput.value = "";
    petrolActualClosingInput.value = "";
    updatePetrolSalePreview();
  } else {
    updatePetrolSalePreview();
  }
}

function updatePetrolSalePreview() {
  const saleQuantity = parseQuantity(saleQuantityInput.value);
  const pumpSales = saleQuantity?.amount;
  petrolPumpSalesInput.value = Number.isFinite(pumpSales) ? formatNumber(pumpSales).replace(/,/g, "") : "";

  const openingDip = parseLiterInput(petrolOpeningDipInput);
  const fuelReceived = parseLiterInput(petrolFuelReceivedInput);
  const actualClosingDip = parseLiterInput(petrolActualClosingInput);
  if (openingDip === null || fuelReceived === null ||
      actualClosingDip === null || !Number.isFinite(pumpSales)) {
    petrolTotalAvailableInput.value = "";
    petrolExpectedClosingInput.value = "";
    petrolVarianceInput.value = "";
    return null;
  }

  const dip = calculatePetrolDip(openingDip, fuelReceived, pumpSales, actualClosingDip);
  if (!dip) {
    petrolTotalAvailableInput.value = "";
    petrolExpectedClosingInput.value = "";
    petrolVarianceInput.value = "";
    return null;
  }
  petrolTotalAvailableInput.value = formatNumber(dip.totalAvailableLiters).replace(/,/g, "");
  petrolExpectedClosingInput.value = formatNumber(dip.expectedClosingDipLiters).replace(/,/g, "");
  petrolVarianceInput.value = formatNumber(dip.varianceLiters).replace(/,/g, "");
  return dip;
}

function parseLiterInput(input) {
  const quantity = parseQuantity(input.value);
  if (!quantity || (quantity.unit && !isLiterUnit(quantity.unit))) return null;
  return quantity.amount;
}

function getAnalyticsDateRange(period, selectedDate) {
  if (period === "custom") {
    if (!analyticsFromDate.value || !analyticsToDate.value ||
        analyticsFromDate.value > analyticsToDate.value) {
      return { start: new Date(NaN), end: new Date(NaN) };
    }
    const start = new Date(`${analyticsFromDate.value}T00:00:00`);
    const end = new Date(`${analyticsToDate.value}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const end = new Date(`${selectedDate}T00:00:00`);
  end.setDate(end.getDate() + 1);

  if (period === "daily") {
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    return { start, end };
  }

  const start = new Date(end);
  if (period === "last-7-days") start.setDate(start.getDate() - 7);
  else if (period === "last-30-days") start.setDate(start.getDate() - 30);
  else if (period === "last-2-months" || period === "last-3-months" ||
      period === "last-6-months") {
    const months = period === "last-2-months" ? 2 : period === "last-3-months" ? 3 : 6;
    const dayOfMonth = start.getDate();
    start.setDate(1);
    start.setMonth(start.getMonth() - months);
    const lastDayOfTargetMonth = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0
    ).getDate();
    start.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  }
  else throw new Error(`Unsupported analytics period: ${period}`);
  return { start, end };
}

function getAnalyticsPeriodLabel(period) {
  if (period === "custom") {
    return `Custom range by ${analyticsCustomGroupBy.value}`;
  }
  return ({
    daily: "Today",
    "last-7-days": "Last 7 days",
    "last-30-days": "Last 30 days",
    "last-2-months": "Last 2 months",
    "last-3-months": "Last 3 months",
    "last-6-months": "Last 6 months",
    custom: "Custom range"
  })[period] || "Selected period";
}

function formatAnalyticsDateRange(period, selectedDate) {
  const { start, end } = getAnalyticsDateRange(period, selectedDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    return "Choose a valid custom date range";
  }
  const formatDate = date => date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  if (period === "daily") return formatDate(start);

  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  return `${formatDate(start)} - ${formatDate(lastDay)}`;
}

function renderPetrolAnalytics() {
  const selectedItemId = analyticsItemFilter.value;
  const selectedItem = analyticsItemsById.get(selectedItemId) ||
    itemsArray.find(item => item.id === selectedItemId);
  const showPetrol = Boolean(selectedItemId && isPetrolItem(selectedItem));
  petrolAnalyticsPreview.hidden = !showPetrol;
  if (!showPetrol) return;

  if (analyticsItemSalesError) {
    petrolAnalyticsTable.innerHTML = `<tr><td colspan="8">${escapeQuantity(analyticsItemSalesError)}</td></tr>`;
    return;
  }

  const { start, end } = getAnalyticsDateRange(analyticsPeriodFilter.value, analyticsDateFilter.value);
  const salesInPeriod = (analyticsItemSales || [])
    .filter(sale => {
      const saleDate = new Date(sale.createdAt);
      return sale.petrolDip && saleDate >= start && saleDate < end;
    })
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));

  petrolAnalyticsTable.innerHTML = salesInPeriod.length
    ? salesInPeriod.map(sale => {
      const dip = sale.petrolDip;
      return `<tr>
        <td>${escapeQuantity(new Date(sale.createdAt).toLocaleString())}</td>
        <td>${formatNumber(dip.openingDipLiters)}</td>
        <td>${formatNumber(dip.fuelReceivedLiters)}</td>
        <td>${formatNumber(dip.pumpSalesLiters)}</td>
        <td>${formatNumber(dip.totalAvailableLiters)}</td>
        <td>${formatNumber(dip.expectedClosingDipLiters)}</td>
        <td>${formatNumber(dip.actualClosingDipLiters)}</td>
        <td>${formatNumber(dip.varianceLiters)}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="8" style="text-align:center;">No petrol dip records for this period.</td></tr>`;
}

async function exportAnalyticsPdf() {
  if (stockAdditionsError || expensesError || stockMovementsError ||
      !stockMovementsLoaded || !analyticsItemsLoaded || analyticsItemsError ||
      stockLedgerBaselineError ||
      stockLedgerBaselineRequests.size) {
    alert("Stock or expense history could not be prepared, so the report was not exported.");
    return;
  }
  exportAnalyticsPdfBtn.disabled = true;
  exportAnalyticsPdfBtn.classList.add("loading");
  exportAnalyticsPdfBtn.querySelector(".btn-text").textContent = "Preparing PDF...";
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

  try {
    buildAnalyticsPdf();
  } catch (error) {
    console.error("Unable to export Analytics PDF:", error);
    alert(`Unable to export Analytics PDF: ${error.message}`);
  } finally {
    exportAnalyticsPdfBtn.disabled = false;
    exportAnalyticsPdfBtn.classList.remove("loading");
    exportAnalyticsPdfBtn.querySelector(".btn-text").textContent = "Export Analytics PDF";
  }
}

function buildAnalyticsPdf() {
  const { start: reportStart, end: reportEnd } = getAnalyticsDateRange(
    analyticsPeriodFilter.value,
    analyticsDateFilter.value
  );
  if (!Number.isFinite(reportStart.getTime()) ||
      !Number.isFinite(reportEnd.getTime()) || reportStart >= reportEnd) {
    throw new Error("Choose a valid custom date range before exporting.");
  }
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const itemName = analyticsItemFilter.selectedOptions[0]?.textContent || "No analysis selected";
  const period = analyticsPeriodFilter.value;
  const selectedDate = analyticsDateFilter.value;
  const rows = currentAnalyticsRows;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const footerY = pageHeight - 8;
  const tableBottom = footerY - 8;
  let y = 16;

  const drawSectionTitle = (title, minimumContentHeight = 18) => {
    if (y + 6 + minimumContentHeight > tableBottom) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text(String(title).toUpperCase(), pageWidth / 2, y, { align: "center" });
    y += 8;
  };

  const drawTable = (headers, dataRows, columnWidths, options = {}) => {
    if (headers.length !== columnWidths.length ||
        dataRows.some(row => row.length !== headers.length) ||
        columnWidths.some(width => !Number.isFinite(width) || width <= 0)) {
      throw new Error("Analytics PDF table has mismatched or invalid columns.");
    }
    const rowPadding = 2.5;
    const lineHeight = 4.5;
    const headerFontSize = 8;
    const headerLineHeight = 4.5;
    const drawHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(headerFontSize);
      const headerLines = headers.map((header, index) =>
        doc.splitTextToSize(String(header), columnWidths[index] - 4)
      );
      const headerHeight = Math.max(
        8,
        Math.max(...headerLines.map(lines => lines.length), 1) * headerLineHeight + 3
      );
      if (y + headerHeight > tableBottom) {
        doc.addPage();
        y = 16;
      }
      let x = margin;
      headers.forEach((header, index) => {
        doc.setFillColor(203, 213, 225);
        doc.setDrawColor(100, 116, 139);
        doc.rect(x, y, columnWidths[index], headerHeight, "FD");
        doc.setTextColor(15, 23, 42);
        doc.text(headerLines[index], x + 2, y + 4.5);
        x += columnWidths[index];
      });
      y += headerHeight;
    };

    drawHeader();
    dataRows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) =>
        doc.splitTextToSize(String(cell), columnWidths[index] - 4)
      );
      const lineCount = Math.max(...cellLines.map(lines => lines.length), 1);
      let lineOffset = 0;

      while (lineOffset < lineCount) {
        const availableHeight = tableBottom - y;
        const maxLines = Math.floor((availableHeight - rowPadding * 2) / lineHeight);
        if (maxLines < 1) {
          doc.addPage();
          y = 16;
          drawHeader();
          continue;
        }

        const segmentLineCount = Math.min(maxLines, lineCount - lineOffset);
        const rowHeight = segmentLineCount * lineHeight + rowPadding * 2;
        const segmentLines = cellLines.map(lines =>
          lines.slice(lineOffset, lineOffset + segmentLineCount)
        );
        if (lineOffset > 0 && segmentLines[0].length === 0) {
          segmentLines[0] = ["(continued)"];
        }

        let x = margin;
        segmentLines.forEach((lines, index) => {
          doc.setDrawColor(148, 163, 184);
          const alternateRow = rowIndex % 2 === 1;
          doc.setFillColor(alternateRow ? 226 : 241, alternateRow ? 232 : 245, alternateRow ? 240 : 249);
          doc.rect(x, y, columnWidths[index], rowHeight, "FD");
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(30, 41, 59);
          if (lines.length) {
            const textY = y + rowPadding + 3.2;
            if (options.rightAlignedColumns?.includes(index)) {
              doc.text(lines, x + columnWidths[index] - 2, textY, { align: "right" });
            } else {
              doc.text(lines, x + 2, textY);
            }
          }
          x += columnWidths[index];
        });
        y += rowHeight;
        lineOffset += segmentLineCount;

        if (lineOffset < lineCount) {
          doc.addPage();
          y = 16;
          drawHeader();
        }
      }
    });

    y += 7;
  };

  const drawSideBySideSummaryTables = (leftRows, rightRows) => {
    if (leftRows.length !== 4 || rightRows.length !== 4) {
      throw new Error("Analytics PDF summary must have four rows per table.");
    }
    const gap = 6;
    const tableWidth = (pageWidth - margin * 2 - gap) / 2;
    const columnWidths = [tableWidth * 0.64, tableWidth * 0.36];
    const headerHeight = 8;
    const rowPadding = 2.5;
    const lineHeight = 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const leftLines = leftRows.map(row => row.map((cell, index) =>
      doc.splitTextToSize(String(cell), columnWidths[index] - 4)
    ));
    const rightLines = rightRows.map(row => row.map((cell, index) =>
      doc.splitTextToSize(String(cell), columnWidths[index] - 4)
    ));
    const rowHeights = leftLines.map((row, index) => {
      const lineCount = Math.max(
        ...row.map(lines => lines.length),
        ...rightLines[index].map(lines => lines.length),
        1
      );
      return lineCount * lineHeight + rowPadding * 2;
    });
    const tableHeight = headerHeight + rowHeights.reduce((total, height) => total + height, 0);

    if (y + tableHeight > tableBottom) {
      doc.addPage();
      y = 16;
    }

    const drawTableAt = (rows, linesByRow, x) => {
      const headers = ["Metric", "Value"];
      let columnX = x;
      headers.forEach((header, index) => {
        doc.setFillColor(203, 213, 225);
        doc.setDrawColor(100, 116, 139);
        doc.rect(columnX, y, columnWidths[index], headerHeight, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(header, columnX + 2, y + 4.8);
        columnX += columnWidths[index];
      });

      let rowY = y + headerHeight;
      rows.forEach((row, rowIndex) => {
        columnX = x;
        row.forEach((cell, columnIndex) => {
          const lines = linesByRow[rowIndex][columnIndex];
          const rowHeight = rowHeights[rowIndex];
          const alternateRow = rowIndex % 2 === 1;
          doc.setDrawColor(148, 163, 184);
          doc.setFillColor(
            alternateRow ? 226 : 241,
            alternateRow ? 232 : 245,
            alternateRow ? 240 : 249
          );
          doc.rect(columnX, rowY, columnWidths[columnIndex], rowHeight, "FD");
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(30, 41, 59);
          if (lines.length) {
            const textY = rowY + rowPadding + 3.2;
            if (columnIndex === 1) {
              doc.text(lines, columnX + columnWidths[columnIndex] - 2, textY, {
                align: "right"
              });
            } else {
              doc.text(lines, columnX + 2, textY);
            }
          }
          columnX += columnWidths[columnIndex];
        });
        rowY += rowHeights[rowIndex];
      });
    };

    drawTableAt(leftRows, leftLines, margin);
    drawTableAt(rightRows, rightLines, margin + tableWidth + gap);
    y += tableHeight + 7;
  };

  const shopName = String(clientBusinessName || "Client Shop").trim();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  const shopNameLines = doc.splitTextToSize(shopName, pageWidth - margin * 2);
  doc.text(shopNameLines, pageWidth / 2, y, { align: "center" });
  y += shopNameLines.length * 7 + 1;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text("SALES ANALYTICS", pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  drawSectionTitle("Report filters");
  drawTable(
    ["Report filter", "Selection"],
    [
      ["Item", itemName],
      ["Breakdown", getAnalyticsPeriodLabel(period)],
      ["Date range", formatAnalyticsDateRange(period, selectedDate)]
    ],
    [40, pageWidth - margin * 2 - 40]
  );

  const summaryRows = [
    ["Gross sales revenue", `KES ${analyticsSalesTotalEl.textContent}`],
    ["Gross sales profit", `KES ${analyticsGrossProfitTotalEl.textContent}`],
    ["Expenses and purchases", `KES ${analyticsExpenseTotalEl.textContent}`],
    ["Net sales revenue", `KES ${analyticsNetRevenueTotalEl.textContent}`],
    ["Wholesale discounts", `KES ${analyticsDiscountTotalEl.textContent}`],
    ["Quantity sold", analyticsQuantityTotalEl.textContent],
    ...getAnalyticsSaleTypeQuantities(rows.flatMap(row => row.dateKeys)).map(({ type, quantities, isCrateSelection }) => [
      `${type} quantity sold`,
      formatAnalyticsSaleTypeQuantity(quantities, isCrateSelection)
    ])
  ];
  drawSectionTitle("Summary", 90);
  drawSideBySideSummaryTables(summaryRows.slice(0, 4), summaryRows.slice(4, 8));

  doc.addPage();
  y = 16;
  drawSectionTitle("Sales breakdown");
  const selectedAnalyticsSales = analyticsItemSales !== null
    ? analyticsItemSales
    : allSalesForAnalytics.filter(isIncludedInAllAnalytics);
  drawTable(
    ["Period", "Opening stock", "Closing stock", "Gross sales", "Gross profit", "Expenses", "Net revenue", "Wholesale discounts", "Items sold", "Products and quantities"],
    rows.map(row => {
      const salesByItem = new Map();
      selectedAnalyticsSales.forEach(sale => {
        if (!row.dateKeys.includes(dateKey(new Date(sale.createdAt)))) return;

        const unit = sale.quantityUnit || "";
        const itemName = sale.itemName || "Item";
        const gasType = getGasTypeForSale(sale);
        const saleType = sale.saleType === "wholesale" ? "wholesale" : "retail";
        const isGroupedCrate = analyticsItemFilter.value === ALL_CRATE_ANALYTICS_FILTER;
        const itemKey = `${sale.itemId || sale.itemName}|${isGroupedCrate ? "" : gasType.toLowerCase()}|${isGroupedCrate ? "" : unit.toLowerCase()}|${saleType}`;
        const productLabel = `${gasType ? `${itemName} (${gasType})` : itemName} (${saleType})`;
        const existing = salesByItem.get(itemKey) || {
          name: productLabel,
          quantity: 0,
          unit,
          crates: 0,
          halfCrates: 0,
          pieces: 0
        };
        if (isGroupedCrate) {
          const quantityUnit = String(sale.quantityUnit || "CRATES").toLowerCase();
          if (sale.crateSize === "half" || quantityUnit.startsWith("half crate")) {
            existing.halfCrates += Number(sale.quantity) || 0;
          } else if (quantityUnit.startsWith("piece")) {
            existing.pieces += Number(sale.quantity) || 0;
          } else {
            existing.crates += Number(sale.quantity) || 0;
          }
        } else {
          existing.quantity += Number(sale.quantity) || 0;
        }
        salesByItem.set(itemKey, existing);
      });
      const productsAndQuantities = [...salesByItem.values()]
        .map(item => analyticsItemFilter.value === ALL_CRATE_ANALYTICS_FILTER
        ? `${item.name}: ${formatNumber(item.crates)} full, ${formatNumber(item.halfCrates)} half, ${formatNumber(item.pieces)} pcs`
          : `${item.name}: ${formatSaleQuantity({ quantity: item.quantity, quantityUnit: item.unit })}`)
        .join("\n") || "—";
      const rowExpenses = getExpensesForCurrentAnalytics(row.dateKeys)
        .reduce((total, expense) => total + (Number(expense.amount) || 0), 0);
      const netRevenue = isAnalyticsNetAvailable() ? row.revenue - rowExpenses : null;
      const crateQuantity = getAnalyticsQuantityDisplay(row.dateKeys);

      return [
        row.label,
        getAnalyticsStockPdfDisplay(row, "opening"),
        getAnalyticsStockPdfDisplay(row, "closing"),
        formatNumber(row.revenue),
        formatNumber(row.profit),
        `KES ${formatNumber(rowExpenses)}`,
        netRevenue === null ? "—" : formatNumber(netRevenue),
        `KES ${formatNumber(row.discount || 0)}`,
        crateQuantity
          ? crateQuantity
            .replace("Full crates: ", "Full: ")
            .replace(", Half crates: ", "\nHalf: ")
            .replace(", Pieces: ", "\nPieces: ")
          : formatNumber(row.quantity),
        productsAndQuantities
      ];
    }),
    [22, 42, 42, 19, 19, 18, 20, 24, 25, pageWidth - margin * 2 - 231],
    { rightAlignedColumns: [3, 4, 5, 6, 7, 8] }
  );

  const { start: stockStart, end: stockEnd } = getAnalyticsDateRange(period, selectedDate);
  const selectedItemId = analyticsItemFilter.value;
  const stockAdditionRows = stockAdditionsForAnalytics
    .filter(addition => {
      const additionDate = addition.stockDate || dateKey(new Date(addition.createdAt));
      const date = new Date(`${additionDate}T00:00:00`);
      const groupedAddition = isCombinedAnalyticsFilter(selectedItemId) &&
        matchesAnalyticsGroup(
          analyticsItemsById.get(addition.itemId) ||
            itemsArray.find(item => item.id === addition.itemId) ||
            { name: addition.itemName },
          selectedItemId
        );
      const matchesItem = isGeneralAnalyticsFilter(selectedItemId)
        ? true
        : isCombinedAnalyticsFilter(selectedItemId)
          ? groupedAddition
          : addition.itemId === selectedItemId;
      return date >= stockStart && date < stockEnd &&
        matchesItem;
    })
    .sort((left, right) =>
      (left.stockDate || dateKey(new Date(left.createdAt)))
        .localeCompare(right.stockDate || dateKey(new Date(right.createdAt))))
    .map(addition => {
      const additionDate = addition.stockDate || dateKey(new Date(addition.createdAt));
      return [
        additionDate,
        new Date(`${additionDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }),
        addition.itemName || "Item",
        formatStockAdditionQuantity(addition)
      ];
    });
  drawSectionTitle("Stock additions");
  drawTable(
    ["Date", "Day", "Item", "Quantity added"],
    stockAdditionRows.length
      ? stockAdditionRows
      : [["No stock additions for this period", "", "", ""]],
    [30, 35, 75, pageWidth - margin * 2 - 140]
  );

  const expenseRows = getExpensesForAnalyticsSelection(
    getExpensesForDateRange(stockStart, stockEnd)
  )
    .sort((left, right) => expenseDateKey(left).localeCompare(expenseDateKey(right)))
    .map(expense => {
      const expenseDate = expenseDateKey(expense);
      return [
        expenseDate,
        new Date(`${expenseDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }),
        expense.type || "Expense",
        expense.description || "",
        expense.paidToSupplier || "—",
        expense.vendor || "—",
        `KES ${formatNumber(expense.amount)}`,
        expense.notes || "—"
      ];
    });
  drawSectionTitle("Expenses and purchases");
  drawTable(
    ["Date", "Day", "Type", "Description", "Paid to supplier?", "Supplier", "Amount", "Notes"],
    expenseRows.length
      ? expenseRows
      : [["No expenses or purchases for this period", "", "", "", "", "", "", ""]],
    [25, 29, 23, 49, 43, 28, 30, pageWidth - margin * 2 - 227]
  );

  if (!petrolAnalyticsPreview.hidden) {
    const { start, end } = getAnalyticsDateRange(period, selectedDate);
    const petrolRows = (analyticsItemSales || [])
      .filter(sale => {
        const saleDate = new Date(sale.createdAt);
        return sale.petrolDip && saleDate >= start && saleDate < end;
      })
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
      .map(sale => {
        const dip = sale.petrolDip;
        return [
          new Date(sale.createdAt).toLocaleDateString(),
          `${formatNumber(dip.openingDipLiters)} L`,
          `${formatNumber(dip.fuelReceivedLiters)} L`,
          `${formatNumber(dip.pumpSalesLiters)} L`,
          `${formatNumber(dip.totalAvailableLiters)} L`,
          `${formatNumber(dip.expectedClosingDipLiters)} L`,
          `${formatNumber(dip.actualClosingDipLiters)} L`,
          `${formatNumber(dip.varianceLiters)} L`
        ];
      });

    drawSectionTitle("Petrol dip readings (L)");
    drawTable(
      ["Date", "Opening (L)", "Received (L)", "Pump sales (L)", "Available (L)", "Expected close (L)", "Actual close (L)", "Variance (L)"],
      petrolRows.length ? petrolRows : [["No petrol dip records", "", "", "", "", "", "", ""]],
      [32, 31, 31, 31, 34, 39, 34, 45]
    );
  }

  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("BizPulse Analytics | business.competencehub.co.ke", margin, footerY);
    doc.text(`Page ${page} of ${doc.getNumberOfPages()}`, pageWidth - margin, footerY, { align: "right" });
  }

  const fileShopName = shopName.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "Client_Shop";
  doc.save(`${fileShopName}_Analytics_${selectedDate}.pdf`);
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
  const selectedDate = salesDateFilter.value;
  if (!selectedDate) return Promise.resolve();
  const startDate = new Date(`${selectedDate}T00:00:00`);
  const nextDay = new Date(startDate);
  nextDay.setDate(startDate.getDate() + 1);
  const baseQuery = query(
    salesRef,
    where("uid", "==", uid),
    where("createdAt", ">=", startDate.toISOString()),
    where("createdAt", "<", nextDay.toISOString()),
    orderBy("createdAt", "desc")
  );

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
      } else if (direction === "initial") {
        firstSalesDoc = null;
        lastSalesDoc = null;
      }

      salesArray = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (direction === 'next' && !snapshot.empty) salesPage++;
      else if (direction === 'prev' && !snapshot.empty) salesPage--;
      else if (direction === 'initial') salesPage = 1;

      renderSalesTable();
      updateSalesPaginationUI(snapshot.size, snapshot.empty);
      window.showLoadingIndicator(false);
      if (isFirstLoad) { isFirstLoad = false; resolve(); }
    }, (error) => {
      console.error("Sales listener error:", error);
      window.showLoadingIndicator(false);
      if (isFirstLoad) resolve(); // Resolve anyway to not block the app
    });
  });
}

function updateSalesPaginationUI(currentCount, isEmpty = false) {
  if (salesPageInfo) salesPageInfo.textContent = `Page ${salesPage}`;
  if (salesPrevPageBtn) salesPrevPageBtn.disabled = (salesPage === 1);
  if (salesNextPageBtn) salesNextPageBtn.disabled = isEmpty || currentCount < salesPageSize;
}

/**
 * Listens to all sales for real-time global analytics.
 */
function listenToAnalytics(uid) {
  if (analyticsUnsubscribe) analyticsUnsubscribe();
  const userSalesQuery = query(salesRef, where("uid", "==", uid));
  analyticsUnsubscribe = onSnapshot(userSalesQuery, snapshot => {
    allSalesForAnalytics = snapshot.docs.map(saleDoc => ({
      id: saleDoc.id,
      ...saleDoc.data()
    }));
    analyticsAllSalesError = null;
    analyticsAllSalesLoaded = true;
    if (isStaticAnalyticsFilter(analyticsItemFilter.value)) {
      analyticsItemSales = getAnalyticsSalesForFilter(analyticsItemFilter.value);
    }
    updateAnalyticsUI();
    renderOverview();
  }, error => {
    console.error("Analytics listener error:", error);
    analyticsAllSalesError = "Unable to load sales analytics. Please try again.";
    analyticsAllSalesLoaded = true;
    updateAnalyticsUI();
    renderOverview();
  });
}

export async function refreshSalesSection(section) {
  const uid = authInstance?.currentUser?.uid;
  if (!uid) throw new Error("No signed-in user is available to refresh dashboard data.");

  if (section === "expenses") {
    listenToExpenses(uid);
    listenToFuelEnergyCategories(collection(dbInstance, "fuelEnergyCategories"), uid);
    return;
  }

  if (section !== "overview" && section !== "analytics") {
    throw new Error(`Unsupported dashboard section: ${section}`);
  }

  listenToAnalytics(uid);
  listenToAnalyticsItems(uid);
  listenToStockMovements(uid);
  listenToStockAdditions(uid);
  listenToExpenses(uid);
  listenToAccessoryItems(uid);

  if (section === "analytics") {
    await loadAnalyticsItemPage();
    handleAnalyticsItemChange();
  }
}

/**
 * Updates the analytics cards using the full sales dataset.
 */
function updateAnalyticsUI() {
  const period = analyticsPeriodFilter.value;
  const selectedDate = analyticsDateFilter.value;
  if (!selectedDate) return;

  const analyticsSelectedItem = analyticsItemFilter.value;
  const supportsGroupedItemChart = isStaticAnalyticsFilter(analyticsSelectedItem);
  analyticsItemChartModule.hidden = !supportsGroupedItemChart;
  analyticsItemChartToggle.disabled = !analyticsAllSalesLoaded || Boolean(analyticsAllSalesError);
  analyticsItemChartToggle.title = analyticsAllSalesError ||
    (!analyticsAllSalesLoaded ? "Sales data is still loading." : "");
  analyticsSelectedItemBadge.textContent = analyticsSelectedItem
    ? getSelectedAnalyticsItemLabel()
    : "";
  analyticsSelectedItemBadge.title = analyticsSelectedItem
    ? getSelectedAnalyticsItemLabel()
    : "";
  analyticsSelectedItemBadge.hidden = !analyticsSelectedItem;
  if (!analyticsSelectedItem) {
    analyticsSalesTotalEl.textContent = "—";
    analyticsGrossProfitTotalEl.textContent = "—";
    analyticsNetRevenueTotalEl.textContent = "—";
    analyticsDiscountTotalEl.textContent = "—";
    analyticsExpenseTotalEl.textContent = "—";
    analyticsQuantityTotalEl.textContent = "—";
    analyticsSaleTypeBreakdownEl.textContent = "";
    currentAnalyticsRows = [];
    analyticsBreakdownTable.innerHTML =
      `<tr><td colspan="9">Choose an analysis view or select an item.</td></tr>`;
    renderAnalyticsStockAdditions();
    renderPetrolAnalytics();
    return;
  }
  const requiresAccessoryDefinitions = isGeneralAnalyticsFilter(analyticsSelectedItem) ||
    analyticsSelectedItem === ALL_ACCESSORIES_ANALYTICS_FILTER;
  const analyticsError = expensesError ||
    (requiresAccessoryDefinitions ? accessoryItemsError : null) ||
    (isStaticAnalyticsFilter(analyticsSelectedItem)
      ? analyticsAllSalesError || analyticsItemsError
      : analyticsItemSalesError);
  if (analyticsError) {
    analyticsSalesTotalEl.textContent = "—";
    analyticsGrossProfitTotalEl.textContent = "—";
    analyticsNetRevenueTotalEl.textContent = "—";
    analyticsDiscountTotalEl.textContent = "—";
    analyticsExpenseTotalEl.textContent = "—";
    analyticsQuantityTotalEl.textContent = "—";
    analyticsSaleTypeBreakdownEl.textContent = "";
    currentAnalyticsRows = [];
    analyticsBreakdownTable.innerHTML = `<tr><td colspan="9">${escapeQuantity(analyticsError)}</td></tr>`;
    renderAnalyticsStockAdditions();
    renderPetrolAnalytics();
    return;
  }

  const { start, end } = getAnalyticsDateRange(period, selectedDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    analyticsSalesTotalEl.textContent = "—";
    analyticsGrossProfitTotalEl.textContent = "—";
    analyticsNetRevenueTotalEl.textContent = "—";
    analyticsDiscountTotalEl.textContent = "—";
    analyticsExpenseTotalEl.textContent = "—";
    analyticsQuantityTotalEl.textContent = "—";
    analyticsSaleTypeBreakdownEl.textContent = "";
    currentAnalyticsRows = [];
    analyticsBreakdownTable.innerHTML =
      `<tr><td colspan="9">Choose a valid custom date range.</td></tr>`;
    renderAnalyticsStockAdditions();
    renderPetrolAnalytics();
    return;
  }

  const dailyTotals = getDailyAnalyticsTotals();
  const rows = getAnalyticsBreakdownRows(period, selectedDate, dailyTotals);
  const totals = rows.reduce((result, row) => ({
    revenue: result.revenue + row.revenue,
    profit: result.profit + row.profit,
    discount: result.discount + (row.discount || 0),
    quantity: result.quantity + row.quantity
  }), { revenue: 0, profit: 0, discount: 0, quantity: 0 });
  const periodExpenses = getExpensesForCurrentAnalytics(rows.flatMap(row => row.dateKeys));
  const expenseTotal = periodExpenses.reduce((total, expense) =>
    total + (Number(expense.amount) || 0), 0);
  const hasNetView = isAnalyticsNetAvailable();

  analyticsSalesTotalEl.textContent = formatNumber(totals.revenue);
  analyticsGrossProfitTotalEl.textContent = formatNumber(totals.profit);
  analyticsNetRevenueTotalEl.textContent = hasNetView
    ? formatNumber(totals.revenue - expenseTotal)
    : "—";
  analyticsDiscountTotalEl.textContent = formatNumber(totals.discount);
  analyticsExpenseTotalEl.textContent = formatNumber(expenseTotal);
  analyticsQuantityTotalEl.textContent =
    getAnalyticsQuantityDisplay(rows.flatMap(row => row.dateKeys)) || formatNumber(totals.quantity);
  analyticsSaleTypeBreakdownEl.innerHTML =
    getAnalyticsSaleTypeBreakdown(rows.flatMap(row => row.dateKeys));
  analyticsBreakdownTable.innerHTML = rows.map(row => `
    <tr>
      <td>${row.label}</td>
      <td class="analytics-stock-balance-cell">${getAnalyticsStockDisplayHtml(row, "opening")}</td>
      <td class="analytics-stock-balance-cell">${getAnalyticsStockDisplayHtml(row, "closing")}</td>
      <td>${formatNumber(row.revenue)}</td>
      <td>${formatNumber(row.profit)}</td>
      <td>${formatNumber(getExpensesForCurrentAnalytics(row.dateKeys)
        .reduce((total, expense) => total + (Number(expense.amount) || 0), 0))}</td>
      <td>${hasNetView
        ? formatNumber(row.revenue - getExpensesForCurrentAnalytics(row.dateKeys)
          .reduce((total, expense) => total + (Number(expense.amount) || 0), 0))
        : "—"}</td>
      <td>${formatNumber(row.discount || 0)}</td>
      <td>${getAnalyticsQuantityDisplay(row.dateKeys) || formatNumber(row.quantity)}</td>
    </tr>
  `).join("");
  currentAnalyticsRows = rows;
  renderAnalyticsStockAdditions();
  renderPetrolAnalytics();

  updateAnalyticsDateLabel();

}

function openSelectedAnalyticsGraphs() {
  if (!analyticsAllSalesLoaded || analyticsAllSalesError) {
    showToast(analyticsAllSalesError || "Sales data is still loading. Try again shortly.", "error");
    return;
  }

  const { start, end } = getAnalyticsDateRange(
    analyticsPeriodFilter.value,
    analyticsDateFilter.value
  );
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    showToast("Choose a valid analytics date range before opening the graphs.", "error");
    return;
  }
  const selectedFilter = analyticsItemFilter.value;
  const isCrateGroup = selectedFilter === ALL_CRATE_ANALYTICS_FILTER ||
    selectedFilter === ALL_SODA_ANALYTICS_FILTER;
  const rankings = getAnalyticsItemSalesRanking({
    sales: getAnalyticsSalesForFilter(selectedFilter),
    items: [...analyticsItemsById.values()],
    isCrateGroup,
    start,
    endExclusive: end
  });
  const graphPayload = {
    title: getSelectedAnalyticsItemLabel(),
    dateRange: formatAnalyticsDateRange(analyticsPeriodFilter.value, analyticsDateFilter.value),
    periodLabel: getAnalyticsPeriodLabel(analyticsPeriodFilter.value),
    isCrateGroup,
    rankings
  };
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channelName = `analytics-item-graphs-${token}`;
  const graphWindowUrl = new URL("analytics-item-graphs", window.location.href);
  graphWindowUrl.searchParams.set("channel", token);
  graphWindowUrl.searchParams.set("returnTo", window.location.href);

  if (!("BroadcastChannel" in window)) {
    showToast("Your browser cannot open item sales graphs. Please use a browser with BroadcastChannel support.", "error");
    return;
  }

  let channel;
  try {
    channel = new BroadcastChannel(channelName);
  } catch (error) {
    console.error("Unable to start the item sales graphs channel:", error);
    showToast("Could not open the item sales graphs. Please try again.", "error");
    return;
  }

  const timeoutId = window.setTimeout(() => {
    channel.close();
    showToast("The graphs page did not respond. Please try again.", "error");
  }, 30000);
  channel.addEventListener("message", event => {
    if (event.data?.type !== "analytics-graphs-ready") return;
    channel.postMessage({ type: "analytics-graphs-data", payload: graphPayload });
    window.clearTimeout(timeoutId);
    channel.close();
  }, { once: true });

  const graphWindow = window.open(graphWindowUrl.href, "_blank");
  if (!graphWindow) {
    window.clearTimeout(timeoutId);
    channel.close();
    showToast("The graphs tab was blocked. Allow pop-ups and try again.", "error");
    return;
  }
  graphWindow.opener = null;
}

function renderOverview() {
  if (!overviewPeriodFilter) return;

  overviewTodayDate.textContent = formatOverviewTodayDate(new Date());
  const isToday = overviewPeriodFilter.value === "today";
  const days = isToday ? 1 : Number(overviewPeriodFilter.value) || 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(today.getDate() + 1);
  const start = new Date(today);
  start.setDate(today.getDate() - days + 1);
  const overviewError = analyticsAllSalesError || analyticsItemsError || expensesError;
  if (overviewError) {
    const errorMessage = escapeQuantity(overviewError);
    overviewSalesChart.innerHTML = `<p class="overview-empty-state">${errorMessage}</p>`;
    overviewTopItems.innerHTML = `<p class="overview-empty-state">${errorMessage}</p>`;
    overviewRecentSales.innerHTML = `<tr><td colspan="4">${errorMessage}</td></tr>`;
    overviewPetrolQuantity.textContent = "—";
    overviewPetrolRevenue.textContent = "—";
    overviewPetrolClosingDip.textContent = "—";
    overviewLowStockEl.textContent = String(countLowStockItems());
    renderOverviewStockAdditions(start, end);
    renderOverviewExpenses(getExpensesForDateRange(start, end));
    return;
  }

  const periodSales = allSalesForAnalytics.filter(sale => {
    const saleDate = new Date(sale.createdAt);
    return Number.isFinite(saleDate.getTime()) && saleDate >= start && saleDate < end;
  });
  const petrolSales = periodSales.filter(sale =>
    isPetrolName(analyticsItemsById.get(sale.itemId)?.name || sale.itemName)
  );
  const includedSales = periodSales.filter(sale =>
    !isPetrolName(analyticsItemsById.get(sale.itemId)?.name || sale.itemName) &&
    isIncludedInAllAnalytics(sale)
  );

  const periodExpenses = getExpensesForDateRange(start, end);

  overviewLowStockEl.textContent = String(countLowStockItems());
  renderOverviewSalesChart(start, days, includedSales);
  renderOverviewTopItems(periodSales);
  renderOverviewRecentSales(periodSales.filter(sale => !isFuelEnergySale(sale)));
  renderOverviewStockAdditions(start, end);
  renderOverviewExpenses(periodExpenses);
  renderOverviewPetrol(petrolSales);
}

function formatOverviewTodayDate(date) {
  const day = date.getDate();
  const remainder = day % 100;
  const ordinalSuffix = remainder >= 11 && remainder <= 13
    ? "th"
    : day % 10 === 1
      ? "st"
      : day % 10 === 2
        ? "nd"
        : day % 10 === 3
          ? "rd"
          : "th";
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return `${weekday}, ${day}${ordinalSuffix} ${month} ${date.getFullYear()}`;
}

function countLowStockItems() {
  const inventoryItems = analyticsItemsById.size
    ? [...analyticsItemsById.values()]
    : itemsArray;
  return inventoryItems.filter(item => (
    isCrateItem(item.name)
      ? getCrateStockPieces(item)
      : parseQuantity(item.quantity)?.amount ?? 0
  ) <= 3).length;
}

function formatStockAdditionQuantity(addition) {
  const quantity = Number(addition.quantity) || 0;
  const unit = String(addition.quantityUnit || "").trim().toUpperCase();
  if (unit === "BOXES") {
    const boxLabel = quantity === 1 ? "BOX" : "BOXES";
    const unitsAdded = Number(addition.unitsAdded) ||
      quantity * (Number(addition.unitsPerBox) || 0);
    return `${formatNumber(quantity)} ${boxLabel} (${formatNumber(unitsAdded)} PIECES)`;
  }
  if (unit === "UNITS" || unit === "PIECES") {
    return `${formatNumber(quantity)} ${quantity === 1 ? "PIECE" : "PIECES"}`;
  }
  if (unit === "CRATES") {
    const crateLabel = quantity === 1 ? "CRATE" : "CRATES";
    const piecesAdded = Number(addition.piecesAdded) ||
      quantity * (Number(addition.piecesPerCrate) || 0);
    return `${formatNumber(quantity)} ${crateLabel} (${formatNumber(piecesAdded)} PIECES)`;
  }
  return formatDisplayQuantity(formatQuantity(quantity, unit));
}

function expenseDateKey(expense) {
  return expense.date || dateKey(new Date(expense.createdAt));
}

function getExpensesForDateKeys(dateKeys) {
  const dateSet = new Set(dateKeys);
  return expensesForAnalytics.filter(expense => dateSet.has(expenseDateKey(expense)));
}

function getExpensesForCurrentAnalytics(dateKeys) {
  return getExpensesForAnalyticsSelection(getExpensesForDateKeys(dateKeys));
}

function getExpensesForAnalyticsSelection(expenses) {
  const selectedValue = analyticsItemFilter.value;
  if (isGeneralAnalyticsFilter(selectedValue)) {
    return expenses.filter(expense =>
      !["crate-item", "accessory-item"].includes(expense.costCategory) &&
      !isExcludedItemPurchase(expense));
  }

  const isPurchase = expense => String(expense.type || "").toLowerCase() === "purchase";
  const selectedItem = analyticsItemsById.get(selectedValue) ||
    itemsArray.find(item => item.id === selectedValue);
  const customFuelCategory = getCustomFuelCategoryForItem(selectedItem);
  if (customFuelCategory) {
    const customCategoryId = `fuel:${customFuelCategory.id}`;
    return expenses.filter(expense =>
      isPurchase(expense) &&
      expense.costCategory === customCategoryId
    );
  }

  if (selectedValue === ALL_GAS_ANALYTICS_FILTER) {
    return expenses.filter(expense => isPurchase(expense) &&
      Boolean(getExpenseGasCategory(expense)));
  }
  if (selectedValue === ALL_SODA_ANALYTICS_FILTER) {
    return expenses.filter(expense =>
      (isPurchase(expense) && ["soda-300ml", "soda-500ml"].includes(expense.costCategory)) ||
      isSodaCrateExpense(expense));
  }
  if (selectedValue === ALL_CRATE_ANALYTICS_FILTER) {
    return expenses.filter(expense => expense.costCategory === "crate-item" ||
      (isPurchase(expense) && ["soda-300ml", "soda-500ml"].includes(expense.costCategory)));
  }
  if (selectedValue === ALL_ACCESSORIES_ANALYTICS_FILTER) {
    return expenses.filter(expense => expense.costCategory === "accessory-item");
  }
  if (isGasAnalyticsItem(selectedItem)) {
    const gasCategory = selectedItem.gasType === "refillable"
      ? "gas-refillable"
      : selectedItem.gasType === "non-refillable" ? "gas-nonrefillable" : null;
    return expenses.filter(expense => isPurchase(expense) &&
      (gasCategory
        ? getExpenseGasCategory(expense) === gasCategory
        : Boolean(getExpenseGasCategory(expense))));
  }
  if (isSodaAnalyticsItem(selectedItem)) {
    const sodaCategory = /\b300\s*ml\b/i.test(selectedItem.name)
      ? "soda-300ml"
      : "soda-500ml";
    return expenses.filter(expense =>
      (isPurchase(expense) && expense.costCategory === sodaCategory) ||
      isCrateExpenseForItem(expense, selectedItem));
  }
  if (isCrateAnalyticsItem(selectedItem)) {
    return expenses.filter(expense => isCrateExpenseForItem(expense, selectedItem));
  }
  if (isAccessoryAnalyticsItem(selectedItem)) {
    return expenses.filter(expense => isAccessoryExpenseForItem(expense, selectedItem));
  }
  return [];
}

function isAnalyticsNetAvailable() {
  const selectedValue = analyticsItemFilter.value;
  if (isGeneralAnalyticsFilter(selectedValue) || isCombinedAnalyticsFilter(selectedValue)) return true;
  const selectedItem = analyticsItemsById.get(selectedValue) ||
    itemsArray.find(item => item.id === selectedValue);
  return isPetrolItem(selectedItem) ||
    isGasAnalyticsItem(selectedItem) ||
    isSodaAnalyticsItem(selectedItem) ||
    isCrateAnalyticsItem(selectedItem) ||
    isAccessoryAnalyticsItem(selectedItem);
}

function getExpensesForDateRange(start, end) {
  return expensesForAnalytics.filter(expense => {
    const date = new Date(`${expenseDateKey(expense)}T00:00:00`);
    return Number.isFinite(date.getTime()) && date >= start && date < end;
  });
}

function renderOverviewExpenses(expenses) {
  if (!overviewExpenses) return;
  if (expensesError) {
    overviewExpenses.innerHTML =
      `<tr><td colspan="4" class="overview-empty-state">${escapeQuantity(expensesError)}</td></tr>`;
    return;
  }
  const recentExpenses = [...expenses]
    .sort((left, right) => expenseDateKey(right).localeCompare(expenseDateKey(left)))
    .slice(0, 5);
  overviewExpenses.innerHTML = recentExpenses.length
    ? recentExpenses.map(expense => `<tr>
        <td>${escapeQuantity(new Date(`${expenseDateKey(expense)}T00:00:00`).toLocaleDateString())}</td>
        <td>${escapeQuantity(expense.type || "Expense")}</td>
        <td>${escapeQuantity(expense.description || "")}</td>
        <td>KES ${formatNumber(expense.amount)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="overview-empty-state">No expenses or purchases in this period.</td></tr>`;
}

function renderAnalyticsStockAdditions() {
  if (!analyticsStockAdditionsTable) return;
  if (stockAdditionsError) {
    analyticsStockAdditionsTable.innerHTML =
      `<tr><td colspan="4">${escapeQuantity(stockAdditionsError)}</td></tr>`;
    return;
  }

  const dateKeys = new Set(currentAnalyticsRows.flatMap(row => row.dateKeys));
  const selectedItemId = analyticsItemFilter.value;
  const additions = stockAdditionsForAnalytics
    .filter(addition => {
      const additionDate = addition.stockDate || dateKey(new Date(addition.createdAt));
      const groupedAddition = isCombinedAnalyticsFilter(selectedItemId) &&
        matchesAnalyticsGroup(
          analyticsItemsById.get(addition.itemId) ||
            itemsArray.find(item => item.id === addition.itemId) ||
            { name: addition.itemName },
          selectedItemId
        );
      return dateKeys.has(additionDate) &&
        (isGeneralAnalyticsFilter(selectedItemId) || (isCombinedAnalyticsFilter(selectedItemId)
          ? groupedAddition
          : addition.itemId === selectedItemId));
    })
    .sort((left, right) =>
      (right.stockDate || dateKey(new Date(right.createdAt)))
        .localeCompare(left.stockDate || dateKey(new Date(left.createdAt))));

  analyticsStockAdditionsTable.innerHTML = additions.length
    ? additions.map(addition => {
      const date = addition.stockDate || dateKey(new Date(addition.createdAt));
      return `<tr>
        <td>${escapeQuantity(date)}</td>
        <td>${escapeQuantity(new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }))}</td>
        <td>${escapeQuantity(addition.itemName || "Item")}</td>
        <td>${escapeQuantity(formatStockAdditionQuantity(addition))}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="4" style="text-align:center;">No stock additions for this period.</td></tr>`;
}

function renderOverviewStockAdditions(start, end) {
  if (!overviewStockAdditions) return;
  if (stockAdditionsError) {
    overviewStockAdditions.innerHTML =
      `<tr><td colspan="3" class="overview-empty-state">${escapeQuantity(stockAdditionsError)}</td></tr>`;
    return;
  }

  const additions = stockAdditionsForAnalytics
    .filter(addition => {
      const additionDate = addition.stockDate || dateKey(new Date(addition.createdAt));
      const date = new Date(`${additionDate}T00:00:00`);
      return date >= start && date < end;
    })
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 5);
  overviewStockAdditions.innerHTML = additions.length
    ? additions.map(addition => {
      const date = addition.stockDate || dateKey(new Date(addition.createdAt));
      return `<tr>
        <td>${escapeQuantity(new Date(`${date}T00:00:00`).toLocaleDateString())}</td>
        <td>${escapeQuantity(addition.itemName || "Item")}</td>
        <td>${escapeQuantity(formatStockAdditionQuantity(addition))}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="3" class="overview-empty-state">No stock additions in this period.</td></tr>`;
}

function renderOverviewSalesChart(start, days, sales) {
  const dailyRevenue = new Map();
  sales.forEach(sale => {
    const key = dateKey(new Date(sale.createdAt));
    dailyRevenue.set(key, (dailyRevenue.get(key) || 0) + (Number(sale.revenue) || 0));
  });

  const values = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, value: dailyRevenue.get(dateKey(date)) || 0 };
  });
  const width = 680;
  const height = 220;
  const left = 54;
  const right = 12;
  const top = 18;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxRevenue = Math.max(...values.map(point => point.value), 0);
  const scaleMax = maxRevenue || 1;
  const points = values.map((point, index) => {
    const x = left + (values.length === 1 ? chartWidth / 2 : (index * chartWidth) / (values.length - 1));
    const y = top + chartHeight - (point.value / scaleMax) * chartHeight;
    return { ...point, x, y };
  });
  const polyline = points.map(point => `${point.x},${point.y}`).join(" ");
  const labels = [0, Math.floor((days - 1) / 2), days - 1]
    .filter((index, position, indexes) => indexes.indexOf(index) === position)
    .map(index => {
      const point = points[index];
      return `<text x="${point.x}" y="${height - 10}" text-anchor="middle">${escapeQuantity(
        point.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      )}</text>`;
    }).join("");
  const guides = [0, 0.5, 1].map(ratio => {
    const y = top + chartHeight * ratio;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="overview-chart-guide" />
      <text x="${left - 8}" y="${y + 4}" text-anchor="end">${escapeQuantity(
        formatNumber(scaleMax * (1 - ratio))
      )}</text>`;
  }).join("");

  overviewSalesChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily sales revenue for ${days} days">
      ${guides}
      <polyline points="${polyline}" class="overview-chart-line" />
      ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.5" class="overview-chart-point">
        <title>${escapeQuantity(point.date.toLocaleDateString())}: KES ${escapeQuantity(formatNumber(point.value))}</title>
      </circle>`).join("")}
      ${labels}
    </svg>`;
}

function renderOverviewTopItems(sales) {
  const itemsByUnit = new Map();
  sales.forEach(sale => {
    const inventoryItem = analyticsItemsById.get(sale.itemId) ||
      itemsArray.find(item => item.id === sale.itemId);
    const itemForSale = inventoryItem || { name: sale.itemName };
    const boxSale = isBoxItem(itemForSale);
    const crateSale = !boxSale && isCrateItem(itemForSale.name);
    const unit = boxSale
      ? "PIECES"
      : crateSale
      ? "PIECES"
      : String(sale.quantityUnit || parseQuantity(inventoryItem?.quantity)?.unit || "PIECES")
        .trim().toUpperCase();
    const quantity = boxSale || crateSale
      ? getCrateSaleStockUnits(sale, itemForSale)
      : Number(sale.quantity) || 0;
    const unitItems = itemsByUnit.get(unit) || new Map();
    const key = sale.itemId || sale.itemName || "unknown";
    const item = unitItems.get(key) || {
      name: sale.itemName || inventoryItem?.name || "Item",
      quantity: 0
    };
    item.quantity += quantity;
    unitItems.set(key, item);
    itemsByUnit.set(unit, unitItems);
  });

  const unitGroups = [...itemsByUnit.entries()]
    .map(([unit, unitItems]) => ({
      unit,
      items: [...unitItems.values()]
        .sort((left, right) => right.quantity - left.quantity)
        .slice(0, 5)
    }))
    .sort((left, right) => left.unit.localeCompare(right.unit));
  if (!unitGroups.length) {
    overviewTopItems.innerHTML = `<p class="overview-empty-state">No inventory sales in this period.</p>`;
    return;
  }
  overviewTopItems.innerHTML = unitGroups.map(group => {
    const maxQuantity = group.items[0].quantity || 1;
    return `<section class="overview-top-unit-group">
      <h4>${escapeQuantity(group.unit)}</h4>
      ${group.items.map(item => {
        const width = Math.max(4, (item.quantity / maxQuantity) * 100);
        return `<div class="overview-top-item">
          <div class="overview-top-item-label">
            <strong>${escapeQuantity(item.name)}</strong>
            <span>${formatNumber(item.quantity)} ${escapeQuantity(group.unit)}</span>
          </div>
          <div class="overview-top-item-track" aria-hidden="true"><span style="width: ${width}%"></span></div>
        </div>`;
      }).join("")}
    </section>`;
  }).join("");
}

function renderOverviewRecentSales(sales) {
  const recentSales = [...sales]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 5);
  overviewRecentSales.innerHTML = recentSales.length
    ? recentSales.map(sale => `<tr>
        <td>${escapeQuantity(new Date(sale.createdAt).toLocaleDateString())}</td>
        <td>${escapeQuantity(sale.itemName || "Item")}${getSaleGasType(sale)
          ? `<br><small class="sale-gas-type">${escapeQuantity(getGasTypeLabel(getSaleGasType(sale)))}</small>`
          : ""}</td>
        <td>${escapeQuantity(formatSaleQuantity(sale))}</td>
        <td>${formatNumber(sale.revenue)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="overview-empty-state">No non-fuel sales in this period.</td></tr>`;
}

function isFuelEnergySale(sale) {
  const item = analyticsItemsById.get(sale.itemId) ||
    itemsArray.find(candidate => candidate.id === sale.itemId) ||
    { name: sale.itemName, gasType: sale.gasType };
  const normalizedName = String(item.name || sale.itemName || "").trim().toLowerCase();
  return isPetrolItem(item) ||
    isGasAnalyticsItem(item) ||
    customFuelEnergyCategories.some(category =>
      String(category.name || "").trim().toLowerCase() === normalizedName
    );
}

function renderOverviewPetrol(sales) {
  const quantity = sales.reduce((total, sale) => total + (Number(sale.quantity) || 0), 0);
  const revenue = sales.reduce((total, sale) => total + (Number(sale.revenue) || 0), 0);
  overviewPetrolQuantity.textContent = `${formatNumber(quantity)} L`;
  overviewPetrolRevenue.textContent = `KES ${formatNumber(revenue)}`;

  const latestDip = allSalesForAnalytics
    .filter(sale => sale.petrolDip &&
      isPetrolName(analyticsItemsById.get(sale.itemId)?.name || sale.itemName) &&
      sale.petrolDip.actualClosingDipLiters !== null &&
      sale.petrolDip.actualClosingDipLiters !== undefined &&
      Number.isFinite(Number(sale.petrolDip.actualClosingDipLiters)))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0];
  overviewPetrolClosingDip.textContent = latestDip
    ? `${formatNumber(latestDip.petrolDip.actualClosingDipLiters)} L`
    : "No dip record";
}

function getDailyAnalyticsTotals() {
  const totals = {};
  const sales = analyticsItemSales !== null
    ? analyticsItemSales
    : allSalesForAnalytics.filter(isIncludedInAllAnalytics);

  sales.forEach(sale => {
    const date = dateKey(new Date(sale.createdAt));
    if (!totals[date]) totals[date] = { revenue: 0, profit: 0, discount: 0, quantity: 0 };
    totals[date].revenue += Number(sale.revenue) || 0;
    totals[date].profit += Number(sale.profit) || 0;
    totals[date].discount += getSaleDiscount(sale);
    totals[date].quantity += Number(sale.quantity) || 0;
  });
  return totals;
}

function getSaleDiscount(sale) {
  if (Number.isFinite(Number(sale.discountAmount))) {
    return Number(sale.discountAmount);
  }
  if (sale.saleType !== "wholesale") return 0;
  const retailUnitPrice = Number(sale.retailUnitPrice);
  const unitPriceSold = Number(sale.unitPriceSold);
  const quantity = Number(sale.quantity) || 0;
  return Number.isFinite(retailUnitPrice) && Number.isFinite(unitPriceSold)
    ? Math.max(0, retailUnitPrice - unitPriceSold) * quantity
    : 0;
}

function isIncludedInAllAnalytics(sale) {
  const item = analyticsItemsById.get(sale.itemId);
  const itemName = item?.name || sale.itemName;
  if (isStrictlyExcludedFromGeneralAnalyticsName(itemName)) return false;
  if (accessoryNames.has(String(itemName || "").trim().toLowerCase()) &&
      item?.includeInAllAnalyticsManuallySet !== true) {
    return false;
  }
  if (typeof item?.includeInAllAnalytics === "boolean") {
    return item.includeInAllAnalytics;
  }
  return !isExcludedFromAllAnalyticsName(itemName);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getSelectedAnalyticsItemLabel() {
  return analyticsItemFilter.selectedOptions[0]?.textContent.trim() || "Selected item";
}

function getAnalyticsQuantityDisplay(dateKeys) {
  const selectedItemId = analyticsItemFilter.value;
  const selectedItem = analyticsItemsById.get(selectedItemId) ||
    itemsArray.find(item => item.id === selectedItemId);
  const isAllCratesSelected = selectedItemId === ALL_CRATE_ANALYTICS_FILTER;
  const isBoxSelection = isBoxItem(selectedItem);
  if (!isAllCratesSelected && !isCrateItem(selectedItem?.name) && !isBoxSelection) return null;

  const selectedDates = new Set(dateKeys);
  const quantities = { crates: 0, halfCrates: 0, pieces: 0, boxes: 0, halfBoxes: 0, units: 0 };
  (analyticsItemSales || []).forEach(sale => {
    if (!selectedDates.has(dateKey(new Date(sale.createdAt)))) return;

    const quantity = Number(sale.quantity) || 0;
    const unit = String(sale.quantityUnit || "CRATES").toLowerCase();
    if (isAllCratesSelected) {
      if (!isCrateItem(sale.itemName || "")) return;
    }
    if (isBoxSelection) {
      if (sale.crateSize === "half" || unit.startsWith("half box")) quantities.halfBoxes += quantity;
      else if (unit.startsWith("unit") || unit.startsWith("piece")) quantities.units += quantity;
      else quantities.boxes += quantity;
      return;
    }
    if (sale.crateSize === "half" || unit.startsWith("half crate")) {
      quantities.halfCrates += quantity;
    } else if (unit.startsWith("piece")) {
      quantities.pieces += quantity;
    } else {
      quantities.crates += quantity;
    }
  });

  return isBoxSelection
    ? `Full boxes: ${formatNumber(quantities.boxes)}, Half boxes: ${formatNumber(quantities.halfBoxes)}, Pieces: ${formatNumber(quantities.units)}`
    : `Full crates: ${formatNumber(quantities.crates)}, Half crates: ${formatNumber(quantities.halfCrates)}, Pieces: ${formatNumber(quantities.pieces)}`;
}

function getAnalyticsSaleTypeBreakdown(dateKeys) {
  return getAnalyticsSaleTypeQuantities(dateKeys)
    .map(({ type, quantities, isCrateSelection, isBoxSelection }) => `
      <span class="analytics-sale-type-quantity"><strong>${type}</strong> ${formatAnalyticsSaleTypeQuantity(quantities, isCrateSelection, isBoxSelection)}</span>`)
    .join("");
}

function getAnalyticsSaleTypeQuantities(dateKeys) {
  const selectedItemId = analyticsItemFilter.value;
  const selectedItem = analyticsItemsById.get(selectedItemId) ||
    itemsArray.find(item => item.id === selectedItemId);
  const isCrateSelection = selectedItemId === ALL_CRATE_ANALYTICS_FILTER ||
    isCrateItem(selectedItem?.name);
  const isBoxSelection = isBoxItem(selectedItem);
  const selectedDates = new Set(dateKeys);
  const quantities = new Map([
    ["retail", { total: 0, crates: 0, halfCrates: 0, pieces: 0, boxes: 0, halfBoxes: 0, units: 0 }],
    ["wholesale", { total: 0, crates: 0, halfCrates: 0, pieces: 0, boxes: 0, halfBoxes: 0, units: 0 }]
  ]);
  const sales = analyticsItemSales !== null
    ? analyticsItemSales
    : allSalesForAnalytics.filter(isIncludedInAllAnalytics);

  sales.forEach(sale => {
    if (!selectedDates.has(dateKey(new Date(sale.createdAt)))) return;
    if (selectedItemId === ALL_CRATE_ANALYTICS_FILTER && !isCrateItem(sale.itemName || "")) return;

    const saleType = sale.saleType === "wholesale" ? "wholesale" : "retail";
    const quantity = Number(sale.quantity) || 0;
    const typeQuantities = quantities.get(saleType);
    typeQuantities.total += quantity;
    if (isBoxSelection) {
      const unit = String(sale.quantityUnit || "BOXES").toLowerCase();
      if (sale.crateSize === "half" || unit.startsWith("half box")) {
        typeQuantities.halfBoxes += quantity;
      } else if (unit.startsWith("unit") || unit.startsWith("piece")) {
        typeQuantities.units += quantity;
      } else {
        typeQuantities.boxes += quantity;
      }
    } else if (isCrateSelection) {
      const unit = String(sale.quantityUnit || "CRATES").toLowerCase();
      if (sale.crateSize === "half" || unit.startsWith("half crate")) {
        typeQuantities.halfCrates += quantity;
      } else if (unit.startsWith("piece")) {
        typeQuantities.pieces += quantity;
      } else {
        typeQuantities.crates += quantity;
      }
    }
  });

  return [...quantities.entries()].map(([type, typeQuantities]) => ({
    type: type === "retail" ? "Retail" : "Wholesale",
    quantities: typeQuantities,
    isCrateSelection,
    isBoxSelection
  }));
}

function formatAnalyticsSaleTypeQuantity(quantities, isCrateSelection = false, isBoxSelection = false) {
  return isBoxSelection
    ? `${formatNumber(quantities.boxes)} FULL BOXES, ${formatNumber(quantities.halfBoxes)} HALF BOXES, ${formatNumber(quantities.units)} PIECES`
    : isCrateSelection
    ? `${formatNumber(quantities.crates)} FULL CRATES, ${formatNumber(quantities.halfCrates)} HALF CRATES, ${formatNumber(quantities.pieces)} PIECES`
    : formatNumber(quantities.total);
}

function emptyDailyTotal() {
  return { revenue: 0, profit: 0, discount: 0, quantity: 0 };
}

function getDailyBreakdown(selectedDate, dailyTotals) {
  const total = dailyTotals[selectedDate] || emptyDailyTotal();
  return [{
    label: new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    }),
    dateKeys: [selectedDate],
    ...total
  }];
}

function getAnalyticsBreakdownRows(period, selectedDate, dailyTotals) {
  if (period === "daily") return getDailyBreakdown(selectedDate, dailyTotals);

  const { start, end } = getAnalyticsDateRange(period, selectedDate);
  if (period === "custom" &&
      (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end)) {
    return [];
  }
  const rows = [];
  if (period === "custom" && analyticsCustomGroupBy.value === "month") {
    const monthDate = new Date(start.getFullYear(), start.getMonth(), 1);
    while (monthDate < end) {
      const monthStart = new Date(monthDate);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const segmentStart = monthStart < start ? start : monthStart;
      const segmentEnd = monthEnd < end ? monthEnd : end;
      const dateKeys = [];
      for (const date = new Date(segmentStart); date < segmentEnd; date.setDate(date.getDate() + 1)) {
        dateKeys.push(dateKey(date));
      }
      const total = dateKeys.reduce((result, key) => {
        const daily = dailyTotals[key] || emptyDailyTotal();
        result.revenue += daily.revenue;
        result.profit += daily.profit;
        result.discount += daily.discount;
        result.quantity += daily.quantity;
        return result;
      }, emptyDailyTotal());
      rows.push({
        label: monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        dateKeys,
        ...total
      });
      monthDate.setMonth(monthDate.getMonth() + 1);
    }
    return rows;
  }

  for (const date = new Date(start); date < end; date.setDate(date.getDate() + 1)) {
    const key = dateKey(date);
    const total = dailyTotals[key] || emptyDailyTotal();
    rows.push({
      label: date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      }),
      dateKeys: [key],
      ...total
    });
  }
  return rows;
}

function getAnalyticsStockItems() {
  const selectedItemId = analyticsItemFilter.value;
  return [...analyticsItemsById.values()].filter(item => {
    if (isPetrolItem(item)) return false;
    if (isGeneralAnalyticsFilter(selectedItemId)) {
      return isIncludedInAllAnalytics({ itemId: item.id, itemName: item.name });
    }
    if (isCombinedAnalyticsFilter(selectedItemId)) {
      return matchesAnalyticsGroup(item, selectedItemId);
    }
    return item.id === selectedItemId;
  });
}

function getAnalyticsStockBalance(item, row) {
  if (!item.stockLedgerBaselineAt || !item.stockLedgerStartDate ||
      item.stockLedgerValid === false) return null;
  const start = new Date(`${row.dateKeys[0]}T00:00:00`);
  const end = new Date(`${row.dateKeys[row.dateKeys.length - 1]}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const trackedFrom = new Date(`${item.stockLedgerStartDate}T00:00:00`);
  if (start < trackedFrom) return null;

  if (item.stockLedgerHistoryMode === "source-events-v1") {
    return getBackfilledStockBalance(item, start, end);
  }

  const baselineAt = getStockHistoryDate(item.stockLedgerBaselineAt);
  if (!Number.isFinite(baselineAt.getTime())) return null;
  let opening = Number(item.stockLedgerBaselineUnits) || 0;
  let closing = opening;
  stockMovementsForAnalytics.forEach(movement => {
    if (movement.itemId !== item.id ||
        String(movement.quantityUnit || "").toUpperCase() !== item.stockLedgerUnit) return;
    const occurredAt = getStockHistoryDate(movement.occurredAt);
    if (occurredAt <= baselineAt) return;
    if (!Number.isFinite(occurredAt.getTime())) return;
    const delta = Number(movement.quantityDelta) || 0;
    if (occurredAt < start) opening += delta;
    if (occurredAt < end) closing += delta;
  });
  return { opening, closing };
}

function getBackfilledStockBalance(item, start, end) {
  const unit = String(item.stockLedgerUnit || "").toUpperCase();
  const trackedFrom = new Date(`${item.stockLedgerStartDate}T00:00:00`);
  const currentUnits = getItemStockUnits(item);
  const datedEvents = [];
  const addDatedEvent = (occurredAt, delta) => {
    if (!Number.isFinite(occurredAt.getTime()) || occurredAt < trackedFrom) return;
    datedEvents.push({ occurredAt, delta });
  };

  allSalesForAnalytics.forEach(sale => {
    if (sale.itemId !== item.id) return;
    const occurredAt = getStockHistoryDate(sale.createdAt);
    const saleUnit = String(sale.quantityUnit || unit).trim().toUpperCase();
    const packagedSale = Number(sale.unitsPerBox) > 0 ||
      Number(sale.piecesPerCrate) > 0 ||
      /^(?:half\s+)?(?:boxes?|crates?)$/i.test(saleUnit);
    if (!packagedSale && saleUnit !== unit) return;
    const quantity = getCrateSaleStockUnits(sale, item);
    if (Number.isFinite(quantity)) addDatedEvent(occurredAt, -quantity);
  });

  stockAdditionsForAnalytics.forEach(addition => {
    if (addition.itemId !== item.id) return;
    const dateValue = addition.stockDate || addition.createdAt;
    const occurredAt = typeof dateValue === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? new Date(`${dateValue}T00:00:00`)
      : getStockHistoryDate(dateValue);
    const additionUnit = String(addition.quantityUnit || "").trim().toUpperCase();
    let quantity;
    if (isCrateItem(item.name)) {
      const piecesAdded = Number(addition.piecesAdded);
      if (addition.piecesAdded !== null && addition.piecesAdded !== undefined &&
          Number.isInteger(piecesAdded) && piecesAdded >= 0) {
        quantity = piecesAdded;
      } else if (additionUnit === "CRATES") {
        quantity = Number(addition.quantity) * getPiecesPerCrate(item);
      } else if (additionUnit === "PIECES") {
        quantity = Number(addition.quantity);
      }
    } else if (isBoxItem(item)) {
      const unitsAdded = Number(addition.unitsAdded);
      if (addition.unitsAdded !== null && addition.unitsAdded !== undefined &&
          Number.isInteger(unitsAdded) && unitsAdded >= 0) {
        quantity = unitsAdded;
      } else if (additionUnit === "BOXES") {
        quantity = Number(addition.quantity) * (Number(addition.unitsPerBox) || getUnitsPerBox(item));
      } else if (additionUnit === "UNITS" || additionUnit === "PIECES") {
        quantity = Number(addition.quantity);
      }
    } else if (additionUnit === unit) {
      quantity = Number(addition.quantity);
    }
    if (Number.isFinite(quantity)) addDatedEvent(occurredAt, quantity);
  });

  stockMovementsForAnalytics.forEach(movement => {
    if (movement.itemId !== item.id || movement.type !== "manual-adjustment" ||
        String(movement.quantityUnit || "").toUpperCase() !== unit) return;
    const occurredAt = getStockHistoryDate(movement.occurredAt);
    const delta = Number(movement.quantityDelta);
    if (Number.isFinite(delta)) addDatedEvent(occurredAt, delta);
  });

  const openingBaseline = currentUnits -
    datedEvents.reduce((total, event) => total + event.delta, 0);
  let opening = openingBaseline;
  let closing = openingBaseline;
  datedEvents.forEach(({ occurredAt, delta }) => {
    if (occurredAt < start) opening += delta;
    if (occurredAt < end) closing += delta;
  });
  return { opening, closing };
}

function getStockHistoryDate(value) {
  return value && typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);
}

function formatAnalyticsStockUnits(item, units) {
  if (isBoxItem(item)) {
    const unitsPerBox = getUnitsPerBox(item);
    return formatBoxStock({
      quantity: formatQuantity(Math.floor(units / unitsPerBox), "BOXES"),
      looseUnits: units % unitsPerBox,
      unitsPerBox
    });
  }
  if (isCrateItem(item.name)) {
    const piecesPerCrate = getPiecesPerCrate(item);
    return formatCrateStock({
      quantity: formatQuantity(Math.floor(units / piecesPerCrate), "CRATES"),
      loosePieces: units % piecesPerCrate,
      piecesPerCrate
    });
  }
  const quantityUnit = item.stockLedgerUnit || getItemStockUnit(item);
  return formatDisplayQuantity(formatQuantity(units, quantityUnit));
}

function getAnalyticsStockDisplay(row, balanceKey) {
  const selectedItem = analyticsItemsById.get(analyticsItemFilter.value) ||
    itemsArray.find(item => item.id === analyticsItemFilter.value);
  if (selectedItem && isPetrolItem(selectedItem)) return "See Petrol Dip Breakdown";
  if (stockMovementsError || stockAdditionsError || analyticsAllSalesError ||
      analyticsItemsError || stockLedgerBaselineError) {
    return "Stock history unavailable";
  }
  if (!stockMovementsLoaded || !analyticsItemsLoaded ||
      !analyticsAllSalesLoaded || !stockAdditionsLoaded ||
      stockLedgerBaselineRequests.size) return "Preparing stock history";
  const items = getAnalyticsStockItems();
  if (!items.length) return "—";
  return items.map(item => {
    const balance = getAnalyticsStockBalance(item, row);
    const value = balance
      ? formatAnalyticsStockUnits(item, balance[balanceKey])
      : "Not tracked";
    return `${item.name}: ${value}`;
  }).join("\n");
}

function getAnalyticsStockPdfDisplay(row, balanceKey) {
  return getAnalyticsStockDisplay(row, balanceKey)
    .split("\n")
    .map(line => line
      .replace(/\s+CRATE:/i, ":")
      .replace(/\bCRATES\b/gi, "crates")
      .replace(/\bCRATE\b/gi, "crate")
      .replace(/\bPIECES\b/gi, "pcs")
      .replace(/\bPIECE\b/gi, "pc"))
    .join("\n");
}

function getAnalyticsStockDisplayHtml(row, balanceKey) {
  const selectedItem = analyticsItemsById.get(analyticsItemFilter.value) ||
    itemsArray.find(item => item.id === analyticsItemFilter.value);
  if (selectedItem && isPetrolItem(selectedItem)) {
    return '<span class="analytics-stock-message">See Petrol Dip Breakdown</span>';
  }
  if (stockMovementsError || stockAdditionsError || analyticsAllSalesError ||
      analyticsItemsError || stockLedgerBaselineError) {
    return '<span class="analytics-stock-message">Stock history unavailable</span>';
  }
  if (!stockMovementsLoaded || !analyticsItemsLoaded ||
      !analyticsAllSalesLoaded || !stockAdditionsLoaded ||
      stockLedgerBaselineRequests.size) {
    return '<span class="analytics-stock-message">Preparing stock history</span>';
  }

  const items = getAnalyticsStockItems();
  if (!items.length) return "—";
  return items.map(item => {
    const balance = getAnalyticsStockBalance(item, row);
    const value = balance
      ? formatAnalyticsStockUnits(item, balance[balanceKey])
      : "Not tracked";
    return `<div class="analytics-stock-item">` +
      `<span class="analytics-stock-item-name">${escapeQuantity(item.name)}</span>` +
      `<span class="analytics-stock-item-quantity">${escapeQuantity(value)}</span>` +
      `</div>`;
  }).join("");
}

function updateAnalyticsDateLabel() {
  const period = analyticsPeriodFilter.value;
  const isDaily = period === "daily";
  const isCustom = period === "custom";
  analyticsCustomGroupControl.hidden = !isCustom;
  analyticsSingleDateControl.hidden = isCustom;
  analyticsCustomRange.hidden = !isCustom;
  analyticsDateFilter.type = "date";
  analyticsDateLabel.textContent = isDaily ? "Date" : "Through date";
}

/**
 * Renders only the paginated sales table.
 */
function renderSalesTable() {
  salesTableBody.innerHTML = "";

  // Pagination returns a limited slice of data
  salesArray.forEach(sale => {
    const row = document.createElement("tr");
    row.innerHTML = `
        <td>${new Date(sale.createdAt).toLocaleDateString()}</td>
        <td>${new Date(sale.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}</td>
        <td>${sale.itemName}${getSaleGasType(sale)
          ? `<br><small class="sale-gas-type">${getGasTypeLabel(getSaleGasType(sale))}</small>`
          : ""}</td>
        <td>${escapeQuantity(formatSaleQuantity(sale))}</td>
        <td>${sale.saleType === "wholesale" ? "Wholesale" : "Retail"}</td>
        <td>${formatNumber(sale.unitPriceSold)}</td>
        <td>${formatNumber(sale.revenue)}</td>
        <td style="color: green; font-weight: bold;">${formatNumber(sale.profit)}</td>
        <td><div class="sale-row-actions">
          <button type="button" class="sale-edit-button" data-sale-action="edit" data-sale-id="${escapeQuantity(sale.id)}">Edit</button>
          <button type="button" class="sale-delete-button" data-sale-action="delete" data-sale-id="${escapeQuantity(sale.id)}">Delete</button>
        </div></td>
      `;
    salesTableBody.appendChild(row);
  });

  if (salesTableBody.innerHTML === "") {
    salesTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: #6b7280; padding: 20px;">
      No sales recorded yet.
    </td></tr>`;
  }
}

function handleSalesTableAction(event) {
  const button = event.target.closest("button[data-sale-action]");
  if (!button) return;
  const saleId = button.dataset.saleId;
  if (button.dataset.saleAction === "edit") {
    window.editSale(saleId);
  } else if (button.dataset.saleAction === "delete") {
    deleteSale(saleId, button);
  }
}

async function deleteSale(saleId, button) {
  const sale = salesArray.find(candidate => candidate.id === saleId);
  const user = authInstance.currentUser;
  if (!sale || !user || sale.uid !== user.uid) {
    showToast("This sale is no longer available. Refresh the list and try again.", "error");
    return;
  }

  const quantity = formatSaleQuantity(sale);
  if (!window.confirm(
    `Delete the ${quantity} sale of ${sale.itemName} recorded on ` +
    `${new Date(sale.createdAt).toLocaleString()}? The inventory balance and sales totals will be corrected.`
  )) {
    return;
  }

  button.disabled = true;
  try {
    const saleRef = doc(salesRef, saleId);
    const summaryUpdateRef = salesSummaryRef;
    await runTransaction(dbInstance, async transaction => {
      const saleSnapshot = await transaction.get(saleRef);
      if (!saleSnapshot.exists()) {
        throw new Error("This sale no longer exists.");
      }
      const latestSale = { id: saleSnapshot.id, ...saleSnapshot.data() };
      if (latestSale.uid !== user.uid) {
        throw new Error("You do not have permission to delete this sale.");
      }
      const itemRef = doc(itemsRef, latestSale.itemId);
      const [itemSnapshot, summarySnapshot] = await Promise.all([
        transaction.get(itemRef),
        transaction.get(summaryUpdateRef)
      ]);
      if (!itemSnapshot.exists()) {
        throw new Error("The inventory item for this sale no longer exists, so stock cannot be restored.");
      }
      const item = { id: itemSnapshot.id, ...itemSnapshot.data() };
      if (item.uid !== user.uid) {
        throw new Error("You do not have permission to update this inventory item.");
      }
      const stockUnits = getCrateSaleStockUnits(latestSale, item);
      if (!Number.isFinite(stockUnits) || stockUnits <= 0) {
        throw new Error("The sale quantity is invalid, so inventory cannot be reconciled.");
      }

      transaction.update(itemRef, getItemStockUpdate(item, stockUnits));
      transaction.delete(saleRef);
      if (!isPetrolItem(item)) {
        transaction.set(
          doc(stockMovementsRef),
          createStockMovement(item, stockUnits, "sale-delete")
        );
      }
      transaction.set(summaryUpdateRef, {}, { merge: true });
      transaction.update(summaryUpdateRef, getSalesSummaryUpdate(latestSale));
      if (!summarySnapshot.exists()) {
        console.warn("Sales summary document was missing during sale deletion.");
      }
    });

    window.dispatchEvent(new CustomEvent("saleRecorded", { detail: { uid: user.uid } }));
    showToast(`Deleted the sale and restored ${quantity} to ${sale.itemName}.`, "success");
  } catch (error) {
    console.error("Unable to delete sale:", error);
    showToast(`Unable to delete sale: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function findDuplicateSale(sale, saleDateKey, uid, excludedSaleId = null) {
  let existingSales;
  let historyIncomplete = false;
  if (navigator.onLine) {
    const selectedDateStart = new Date(`${saleDateKey}T00:00:00`);
    const nextDateStart = new Date(selectedDateStart);
    nextDateStart.setDate(selectedDateStart.getDate() + 1);
    const matchingDateQuery = query(
      salesRef,
      where("uid", "==", uid),
      where("createdAt", ">=", selectedDateStart.toISOString()),
      where("createdAt", "<", nextDateStart.toISOString()),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocsFromServer(matchingDateQuery);
    existingSales = snapshot.docs.map(saleDoc => ({
      id: saleDoc.id,
      ...saleDoc.data()
    }));
  } else {
    const localSales = new Map();
    [...allSalesForAnalytics, ...salesArray].forEach(existing => {
      if (existing.id) localSales.set(existing.id, existing);
    });
    existingSales = [...localSales.values()];
    historyIncomplete = !analyticsAllSalesLoaded || Boolean(analyticsAllSalesError);
  }

  const normalizedUnit = value => String(value || "").trim().toLowerCase();
  const duplicate = existingSales.find(existing => {
    if (existing.id === excludedSaleId) return false;
    const existingDate = new Date(existing.createdAt);
    return Number.isFinite(existingDate.getTime()) &&
      dateKey(existingDate) === saleDateKey &&
      existing.uid === uid &&
      existing.itemId === sale.itemId &&
      String(existing.saleType || "retail").toLowerCase() ===
        String(sale.saleType || "retail").toLowerCase() &&
      Number(existing.quantity) === Number(sale.quantity) &&
      normalizedUnit(existing.quantityUnit) === normalizedUnit(sale.quantityUnit) &&
      Number(existing.unitPriceSold) === Number(sale.unitPriceSold);
  });

  return { duplicate: duplicate || null, historyIncomplete };
}

/**
 * Handles the submission of the sale form.
 * @param {Event} e - The form submission event.
 */
async function handleSaleFormSubmit(e) {
  window.showLoadingIndicator(true); // Show loading indicator
  e.preventDefault();
  const selectedSaleDate = salesDateFilter.value;
  const selectedSaleDateStart = new Date(`${selectedSaleDate}T00:00:00`);
  if (!selectedSaleDate || !Number.isFinite(selectedSaleDateStart.getTime()) ||
      selectedSaleDate > dateKey(new Date())) {
    alert("Choose today or an earlier date for this sale.");
    window.showLoadingIndicator(false);
    return;
  }
  const unitPriceSold = Number(salePriceInput.value);
  const saleQuantity = parseQuantity(saleQuantityInput.value);
  const item = itemsArray.find(i => i.id === selectedItemId);

  if (!selectedItemId || !item) {
    alert("Please search and select an item from the list.");
    window.showLoadingIndicator(false);
    return;
  }

  if (!saleQuantity || saleQuantity.amount <= 0) {
    alert("Enter a valid quantity greater than zero, such as 2, 2 kg, or 3 cartons.");
    window.showLoadingIndicator(false);
    return;
  }

  const itemQuantity = parseQuantity(item.quantity);
  const itemUnit = itemQuantity?.unit || "";
  const petrolItem = isPetrolItem(item);
  const boxItem = isBoxItem(item);
  const crateItem = !boxItem && isCrateItem(item.name);
  const packagedItem = crateItem || boxItem;
  const packageName = boxItem ? "box" : "crate";
  const unitName = boxItem ? "unit" : "piece";
  const saleUnit = packagedItem ? saleQuantityUnit.value : "";
  if (packagedItem && saleUnit !== "crate" && saleUnit !== "piece") {
    alert(`Choose how to sell this ${packageName} item before entering the sale.`);
    window.showLoadingIndicator(false);
    saleQuantityUnit.focus();
    return;
  }
  const crateSize = packagedItem && saleUnit === "crate" &&
    supportsHalfCrate(item) && saleCrateSize.value === "half"
    ? "half"
    : "full";
  const unitsPerPack = boxItem ? getUnitsPerBox(item) : getPiecesPerCrate(item);
  if (packagedItem && !Number.isInteger(saleQuantity.amount)) {
    alert(`${boxItem ? "Boxes and pieces" : "Crates and pieces"} must be sold as whole numbers.`);
    window.showLoadingIndicator(false);
    return;
  }
  const expectedSaleUnit = packagedItem
    ? crateSize === "half" ? `HALF ${boxItem ? "BOXES" : "CRATES"}` :
      saleUnit === "crate" ? `${boxItem ? "BOXES" : "CRATES"}` : "PIECES"
    : "";
  if (packagedItem && saleQuantity.unit &&
      saleQuantity.unit.toLowerCase() !== expectedSaleUnit.toLowerCase() &&
      !(saleUnit === "crate" && crateSize === "full" &&
        (boxItem ? /^boxes?$/i : /^crates?$/i).test(saleQuantity.unit)) &&
      !(saleUnit === "piece" && (boxItem ? /^units?$/i : /^pieces?$/i).test(saleQuantity.unit))) {
    alert(`Select ${saleUnit} in the Sell as menu or remove the unit from the quantity.`);
    window.showLoadingIndicator(false);
    return;
  }
  if (packagedItem && crateSize === "half" && !supportsHalfCrate(item)) {
    alert(boxItem
      ? "Half-box sales require an even number of pieces per box."
      : "Half crates are available only for water crates and Soda 300ml/500ml crates with an even piece count.");
    window.showLoadingIndicator(false);
    return;
  }
  if (packagedItem && saleUnit === "piece" &&
      (item.pieceSellingPrice === null || item.pieceSellingPrice === undefined ||
       item.pieceSellingPrice === "" || !Number.isFinite(Number(item.pieceSellingPrice)))) {
    alert(`Set this item's selling price per ${unitName} in Inventory before selling individual ${unitName}s.`);
    window.showLoadingIndicator(false);
    return;
  }
  if (!packagedItem && saleQuantity.unit && itemUnit &&
      saleQuantity.unit.toLowerCase() !== itemUnit.toLowerCase() &&
      !(petrolItem && isLiterUnit(saleQuantity.unit) && isLiterUnit(itemUnit))) {
    alert(`Sale unit must match the inventory unit (${itemUnit}).`);
    window.showLoadingIndicator(false);
    return;
  }
  const qtySold = saleQuantity.amount;
  const saleType = saleTypeInput.value === "wholesale" ? "wholesale" : "retail";
  const retailUnitPrice = getRetailUnitPrice(item, packagedItem, saleUnit, crateSize);
  if (!Number.isFinite(retailUnitPrice) || retailUnitPrice < 0) {
    alert("A valid retail price is required for this item before recording a sale.");
    window.showLoadingIndicator(false);
    return;
  }
  if (!Number.isFinite(unitPriceSold) || unitPriceSold <= 0) {
    alert("Enter a price sold greater than zero.");
    window.showLoadingIndicator(false);
    return;
  }
  if (saleType === "wholesale" && unitPriceSold >= retailUnitPrice) {
    alert(`Wholesale price must be lower than the retail price of KES ${formatNumber(retailUnitPrice)}.`);
    window.showLoadingIndicator(false);
    return;
  }
  const discountAmount = saleType === "wholesale"
    ? (retailUnitPrice - unitPriceSold) * qtySold
    : 0;
  const stockUnitsSold = packagedItem
    ? qtySold * (saleUnit === "piece"
      ? 1
      : unitsPerPack * (crateSize === "half" ? 0.5 : 1))
    : qtySold;
  const quantityUnit = packagedItem
    ? saleUnit === "piece" ? "PIECES" :
      crateSize === "half" ? `HALF ${boxItem ? "BOXES" : "CRATES"}` : boxItem ? "BOXES" : "CRATES"
    : petrolItem ? "L" : (itemUnit || saleQuantity.unit);
  let petrolDip = null;
  if (petrolItem) {
    const saleUnit = saleQuantity.unit || itemUnit;
    if (saleUnit && !isLiterUnit(saleUnit)) {
      alert("Petrol quantities must be recorded in liters (L).");
      window.showLoadingIndicator(false);
      return;
    }
    petrolDip = updatePetrolSalePreview();
    if (!petrolDip) {
      alert("Enter valid opening dip, fuel received, and actual closing dip values.");
      window.showLoadingIndicator(false);
      return;
    }
  }

  // Stock check logic adjustment for Edit
  let availableStock = getItemStockUnits(item);
  if (editSaleId) {
    const originalSale = editingOriginalSale || salesArray.find(s => s.id === editSaleId);
    if (originalSale.itemId === selectedItemId) {
      availableStock += getCrateSaleStockUnits(originalSale, item);
    }
  }

  if (stockUnitsSold > availableStock) {
    const availableUnit = petrolItem ? "L" : itemUnit;
    const availableQuantity = packagedItem
      ? boxItem ? formatBoxStock({
        quantity: formatQuantity(Math.floor(availableStock / unitsPerPack), "BOXES"),
        looseUnits: availableStock % unitsPerPack,
        unitsPerBox: unitsPerPack
      }) : formatCrateStock({
        quantity: formatQuantity(Math.floor(availableStock / getPiecesPerCrate(item)), "CRATES"),
        loosePieces: availableStock % getPiecesPerCrate(item),
        piecesPerCrate: getPiecesPerCrate(item)
      })
      : formatDisplayQuantity(formatQuantity(availableStock, availableUnit));
    alert(`Insufficient stock! | ${availableQuantity}`);
    window.showLoadingIndicator(false);
    return;
  }

  const revenue = unitPriceSold * qtySold;
  const cost = packagedItem
    ? item.incoming * (stockUnitsSold / unitsPerPack)
    : item.incoming * qtySold;
  const profit = revenue - cost;
  const saleDateTimestamp = new Date(selectedSaleDateStart);
  const currentTime = new Date();
  saleDateTimestamp.setHours(
    currentTime.getHours(),
    currentTime.getMinutes(),
    currentTime.getSeconds(),
    currentTime.getMilliseconds()
  );

  const isOutOfStock = availableStock - stockUnitsSold === 0;
  const saleData = {
    itemId: selectedItemId,
    itemName: item.name,
    ...(item.gasType ? { gasType: item.gasType } : {}),
    saleType,
    retailUnitPrice,
    unitPriceSold,
    discountAmount,
    quantity: qtySold,
    quantityUnit,
    ...(crateItem ? {
      piecesPerCrate: getPiecesPerCrate(item),
      crateSize: saleUnit === "crate" ? crateSize : null
    } : {}),
    ...(boxItem ? {
      unitsPerBox: unitsPerPack,
      crateSize: saleUnit === "crate" ? crateSize : null
    } : {}),
    ...(petrolDip ? { petrolDip } : {}),
    revenue,
    profit,
    uid: authInstance.currentUser.uid,
    createdAt: saleDateTimestamp.toISOString()
  };

  recordSaleBtn.disabled = true;
  recordSaleBtn.classList.add("loading");

  try {
    const duplicateCheck = await findDuplicateSale(
      saleData,
      selectedSaleDate,
      authInstance.currentUser.uid,
      editSaleId
    );
    if (duplicateCheck.duplicate) {
      const duplicate = duplicateCheck.duplicate;
      const matchingSale = `${formatSaleQuantity(duplicate)} of ${duplicate.itemName} ` +
        `(${duplicate.saleType || "retail"}, KES ${formatNumber(duplicate.unitPriceSold)} each)`;
      if (!window.confirm(
        `A matching sale already exists for ${matchingSale} on ${selectedSaleDate}. ` +
        "Record this additional sale anyway?"
      )) return;
    } else if (duplicateCheck.historyIncomplete &&
        !window.confirm(
          "You are offline and complete sales history is not available on this device. " +
          "The duplicate check may be incomplete. Continue recording this sale?"
        )) {
      return;
    }

    let outOfStockAfterSave = isOutOfStock;
    if (editSaleId) {
      const originalSale = editingOriginalSale || salesArray.find(s => s.id === editSaleId);
      if (!originalSale) throw new Error("This sale is no longer available. Refresh and try again.");
      const originalItem = itemsArray.find(candidate => candidate.id === originalSale.itemId) ||
        analyticsItemsById.get(originalSale.itemId);
      const originalStockUnits = getCrateSaleStockUnits(
        originalSale,
        originalItem || { name: originalSale.itemName }
      );
      const sameItem = originalSale.itemId === selectedItemId;
      const availableStock = getItemStockUnits(item) +
        (sameItem ? originalStockUnits : 0);
      if (stockUnitsSold > availableStock) {
        throw new Error("There is not enough current stock to save this edited sale.");
      }
      const itemRef = doc(itemsRef, selectedItemId);
      const saleRef = doc(salesRef, editSaleId);
      outOfStockAfterSave = availableStock - stockUnitsSold === 0;
      await runTransaction(dbInstance, async transaction => {
        const saleSnapshot = await transaction.get(saleRef);
        if (!saleSnapshot.exists()) throw new Error("This sale no longer exists.");
        const latestSale = { id: saleSnapshot.id, ...saleSnapshot.data() };
        if (latestSale.uid !== authInstance.currentUser.uid ||
            latestSale.itemId !== originalSale.itemId) {
          throw new Error("This sale changed while you were editing it. Refresh and try again.");
        }
        const targetItemRef = doc(itemsRef, selectedItemId);
        const originalItemRef = sameItem ? targetItemRef : doc(itemsRef, latestSale.itemId);
        const [targetItemSnapshot, originalItemSnapshot] = await Promise.all([
          transaction.get(targetItemRef),
          sameItem ? Promise.resolve(null) : transaction.get(originalItemRef)
        ]);
        if (!targetItemSnapshot.exists() || (!sameItem && !originalItemSnapshot?.exists())) {
          throw new Error("The inventory item for this sale no longer exists.");
        }
        const targetItem = { id: targetItemSnapshot.id, ...targetItemSnapshot.data() };
        const previousItem = sameItem
          ? targetItem
          : { id: originalItemSnapshot.id, ...originalItemSnapshot.data() };
        if (targetItem.uid !== authInstance.currentUser.uid ||
            previousItem.uid !== authInstance.currentUser.uid) {
          throw new Error("You do not have permission to update the inventory for this sale.");
        }
        const previousStockUnits = getCrateSaleStockUnits(latestSale, previousItem);
        if (!Number.isFinite(previousStockUnits) || previousStockUnits <= 0) {
          throw new Error("The original sale quantity is invalid, so inventory cannot be reconciled.");
        }
        const latestAvailableStock = getItemStockUnits(targetItem) +
          (sameItem ? previousStockUnits : 0);
        if (stockUnitsSold > latestAvailableStock) {
          throw new Error("There is not enough current stock to save this edited sale.");
        }

        if (sameItem) {
          transaction.update(
            targetItemRef,
            getItemStockUpdate(targetItem, previousStockUnits - stockUnitsSold)
          );
          const delta = previousStockUnits - stockUnitsSold;
          if (delta !== 0 && !isPetrolItem(targetItem)) {
            transaction.set(
              doc(stockMovementsRef),
              createStockMovement(targetItem, delta, "sale-edit")
            );
          }
        } else {
          transaction.update(
            originalItemRef,
            getItemStockUpdate(previousItem, previousStockUnits)
          );
          transaction.update(targetItemRef, getItemStockUpdate(targetItem, -stockUnitsSold));
          if (!isPetrolItem(previousItem)) {
            transaction.set(
              doc(stockMovementsRef),
              createStockMovement(previousItem, previousStockUnits, "sale-edit")
            );
          }
          if (!isPetrolItem(targetItem)) {
            transaction.set(
              doc(stockMovementsRef),
              createStockMovement(targetItem, -stockUnitsSold, "sale-edit")
            );
          }
        }

        transaction.update(saleRef, saleData);
        transaction.set(salesSummaryRef, {}, { merge: true });
        transaction.update(salesSummaryRef, getSalesSummaryUpdate(latestSale, saleData));
        outOfStockAfterSave = latestAvailableStock - stockUnitsSold === 0;
        if (outOfStockAfterSave) {
          transaction.set(doc(ordersCollectionRef), {
            customerName: clientBusinessName,
            itemName: targetItem.name,
            quantity: isPetrolItem(targetItem)
              ? "5 L"
              : isCrateItem(targetItem.name) ? "5 CRATES" : 5,
            notes: "Item quantity reached 0. <br>Quantity to be adjusted.",
            date: new Date().toISOString(),
            uid: authInstance.currentUser.uid,
            createdAt: new Date().toISOString()
          });
        }
      });
    } else {
      const batch = writeBatch(dbInstance);
      const newSaleRef = doc(salesRef);
      const itemRef = doc(itemsRef, selectedItemId);
      batch.set(newSaleRef, saleData);
      batch.update(itemRef, getItemStockUpdate(item, -stockUnitsSold));
      if (!isPetrolItem(item)) {
        batch.set(doc(stockMovementsRef), createStockMovement(
          item,
          -stockUnitsSold,
          "sale"
        ));
      }

      const currentDate = selectedSaleDate;
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
      if (isOutOfStock) {
        batch.set(doc(ordersCollectionRef), {
          customerName: clientBusinessName,
          itemName: item.name,
          quantity: isPetrolItem(item) ? "5 L" : crateItem ? "5 CRATES" : 5,
          notes: "Item quantity reached 0. <br>Quantity to be adjusted.",
          date: new Date().toISOString(),
          uid: authInstance.currentUser.uid,
          createdAt: new Date().toISOString()
        });
      }
      await batch.commit();
    }

    if (editSaleId) {
      editSaleId = null;
      editingOriginalSale = null;
      if (recordSaleBtn.querySelector(".btn-text")) recordSaleBtn.querySelector(".btn-text").textContent = "Record Sale";
    }

    if (!navigator.onLine) {
      showToast("Sale saved offline. It will sync when you are back online.", "info");
    }

    if (outOfStockAfterSave) {
      showToast(`Stock Alert: ${item.name} is out of stock. An automatic order has been created.`, "info");
    }

    saleForm.reset();
    selectedItemId = null;
    setSaleQuantityUnit(null);
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
  editingOriginalSale = sale;
  selectedItemId = sale.itemId;
  
  // Populate form fields
  if (saleItemSearch) saleItemSearch.value = sale.itemName;
  if (saleTypeInput) saleTypeInput.value = sale.saleType === "wholesale" ? "wholesale" : "retail";
  if (salePriceInput) salePriceInput.value = sale.unitPriceSold;
  if (saleQuantityInput) {
    saleQuantityInput.value = formatQuantity(sale.quantity, sale.quantityUnit || "");
  }
  const item = itemsArray.find(candidate => candidate.id === sale.itemId);
  setSaleQuantityUnit(item);
  if (isCrateItem(item?.name) || isBoxItem(item)) {
    const unit = String(sale.quantityUnit || "").toLowerCase();
    saleQuantityUnit.value = unit.includes("crate") || unit.includes("box") ? "crate" : "piece";
    saleCrateSize.value = sale.crateSize === "half" || unit.startsWith("half crate") ||
      unit.startsWith("half box")
      ? "half"
      : "full";
  }
  updateSaleCrateSizeField(item);
  syncSaleQuantityUnit(item);
  if (salePriceInput) salePriceInput.value = sale.unitPriceSold;
  updateCrateSaleStockPreview();
  setPetrolDipFieldsVisible(isPetrolItem(item));
  if (sale.petrolDip) {
    petrolOpeningDipInput.value = `${sale.petrolDip.openingDipLiters} L`;
    petrolFuelReceivedInput.value = `${sale.petrolDip.fuelReceivedLiters} L`;
    petrolActualClosingInput.value = `${sale.petrolDip.actualClosingDipLiters} L`;
    updatePetrolSalePreview();
  }

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