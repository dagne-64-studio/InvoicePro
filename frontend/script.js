"use strict";

function backupInvoices() {
  const invoices = getSavedInvoices();

  const backup = {
    app: "InvoicePro",
    version: 1,
    exportedAt: new Date().toISOString(),
    invoices: invoices
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `invoicepro-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  alert(`Backup downloaded. ${invoices.length} invoice(s) included.`);
}

function restoreInvoicesFromFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);

      const restoredInvoices = Array.isArray(backup)
        ? backup
        : backup.invoices;

      if (!Array.isArray(restoredInvoices)) {
        throw new Error("Invalid backup file.");
      }

      const valid = restoredInvoices.every(invoice =>
        invoice &&
        typeof invoice === "object" &&
        !Array.isArray(invoice)
      );

      if (!valid) {
        throw new Error("The backup contains invalid invoice data.");
      }

      const currentInvoices = getSavedInvoices();

      if (!confirm(
        `Restore ${restoredInvoices.length} invoice(s)?\n\n` +
        `This will replace your current ${currentInvoices.length} saved invoice(s). ` +
        `Download a backup of your current invoices first if you need to keep them.`
      )) {
        return;
      }

      storeInvoices(restoredInvoices);

      if (typeof renderSavedInvoices === "function") {
        renderSavedInvoices();
      }

      if (typeof updateDashboardSummary === "function") {
        updateDashboardSummary();
      }

      alert("Invoices restored successfully.");
    } catch (error) {
      alert("Could not restore backup: " + error.message);
    }
  };

  reader.onerror = () => {
    alert("Could not read the selected backup file.");
  };

  reader.readAsText(file);
}

document
  .getElementById("backupInvoicesBtn")
  ?.addEventListener("click", backupInvoices);

document
  .getElementById("restoreInvoicesBtn")
  ?.addEventListener("click", () => {
    document.getElementById("restoreInvoicesFile")?.click();
  });

document
  .getElementById("restoreInvoicesFile")
  ?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    restoreInvoicesFromFile(file);

    event.target.value = "";
  });


// ==========================================
// INVOICEPRO - COMPLETE JAVASCRIPT
// ==========================================

const STORAGE_KEY = "invoices";

let businessLogoData = "";
let editingInvoiceIndex = null;

function getElement(id) {
  return document.getElementById(id);
}

function getCurrency() {
  return getElement("currency")?.value || "ETB";
}

function money(amount, currency = getCurrency()) {
  const value = Number(amount) || 0;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function moneyForCurrency(amount, currency) {
  return money(amount, currency || "ETB");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function getNumber(id) {
  return Math.max(0, Number(getElement(id)?.value) || 0);
}

function showMessage(message) {
  const element = getElement("message");
  if (element) element.textContent = message;
}

// ==========================================
// STORAGE
// ==========================================

function getSavedInvoices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.invoices)) return parsed.invoices;

    return [];
  } catch (error) {
    console.error("Could not read saved invoices:", error);
    return [];
  }
}

function storeInvoices(invoices) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
    return true;
  } catch (error) {
    console.error("Could not save invoices:", error);
    alert("Could not save invoices. Browser storage may be full.");
    return false;
  }
}

// ==========================================
// ITEMS AND CALCULATIONS
// ==========================================

function addItem(description = "", quantity = 1, price = 0) {
  const container = getElement("itemsContainer");
  if (!container) return;

  const item = document.createElement("div");
  item.className = "invoice-item";

  item.innerHTML = `
    <label>Description</label>
    <input class="item-description" type="text"
      placeholder="e.g. Website design">

    <div class="two-columns">
      <div>
        <label>Quantity</label>
        <input class="item-quantity" type="number"
          min="1" step="1">
      </div>
      <div>
        <label>Price per item</label>
        <input class="item-price" type="number"
          min="0" step="0.01">
      </div>
    </div>

    <p>Item total: <strong class="item-total">0.00</strong></p>

    <button type="button" class="remove-item-button">
      Remove Item
    </button>
  `;

  item.querySelector(".item-description").value = description;
  item.querySelector(".item-quantity").value = quantity;
  item.querySelector(".item-price").value = price;

  container.appendChild(item);
  calculateTotal();
}

function getItems() {
  return Array.from(
    document.querySelectorAll("#itemsContainer .invoice-item")
  ).map(item => ({
    description:
      item.querySelector(".item-description").value.trim(),
    quantity: Math.max(
      1,
      Number(item.querySelector(".item-quantity").value) || 1
    ),
    price: Math.max(
      0,
      Number(item.querySelector(".item-price").value) || 0
    )
  }));
}

function calculateTotal() {
  let subtotal = 0;

  document.querySelectorAll(
    "#itemsContainer .invoice-item"
  ).forEach(item => {
    const quantity = Math.max(
      1,
      Number(item.querySelector(".item-quantity").value) || 1
    );
    const price = Math.max(
      0,
      Number(item.querySelector(".item-price").value) || 0
    );

    const itemTotal = quantity * price;
    subtotal += itemTotal;

    item.querySelector(".item-total").textContent = money(itemTotal);
  });

  const discountPercent = Math.min(100, getNumber("discount"));
  const taxPercent = Math.min(100, getNumber("tax"));
  const discountAmount = subtotal * discountPercent / 100;
  const taxAmount =
    (subtotal - discountAmount) * taxPercent / 100;
  const total = subtotal - discountAmount + taxAmount;
  const amountPaid = getNumber("amountPaid");
const amountRemaining = Math.max(
  0,
  Math.round((total - amountPaid) * 100) / 100
);


  const status = getElement("paymentStatus");

  if (status) {
    status.value =
      total > 0 && amountPaid >= total
        ? "paid"
        : amountPaid > 0
          ? "partial"
          : "unpaid";
  }

  const values = {
    subtotal,
    discountAmount,
    taxAmount,
    total,
    amountRemaining
  };

  Object.entries(values).forEach(([id, value]) => {
    const element = getElement(id);
    if (element) element.textContent = money(value);
  });

  return {
    subtotal,
    discountPercent,
    discountAmount,
    taxPercent,
    taxAmount,
    total,
    amountPaid,
    amountRemaining,
    paymentStatus: status?.value || "unpaid"
  };
}

// ==========================================
// BUILD AND SAVE INVOICE
// ==========================================

function buildInvoice() {
  const totals = calculateTotal();

  return {
    id: globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    businessName: getElement("business")?.value.trim() || "",
    businessEmail: getElement("businessEmail")?.value.trim() || "",
    businessPhone: getElement("businessPhone")?.value.trim() || "",
businessAddress: getElement("businessAddress")?.value.trim() || "",
    customerName: getElement("customer")?.value.trim() || "",
    customerEmail: getElement("customerEmail")?.value.trim() || "",
    invoiceNumber: getElement("invoiceNumber")?.value.trim() || "",
    invoiceDate: getElement("invoiceDate")?.value || "",
    currency: getCurrency(),
    items: getItems(),
    ...totals,
    discount: totals.discountPercent,
    tax: totals.taxPercent,
    logo: businessLogoData,
    updatedAt: new Date().toISOString()
  };
}

function saveInvoice() {
  
  const customerName = getElement("customer")?.value.trim();

  if (!customerName) {
    alert("Please enter the customer name before saving.");
    getElement("customer")?.focus();
    return;
  }

  const itemDescriptions = Array.from(
    document.querySelectorAll("#itemsContainer .item-description")
  );

  const hasItemDescription = itemDescriptions.some(
    input => input.value.trim() !== ""
  );

  if (!hasItemDescription) {
    alert("Please enter a description for at least one item or service.");
    itemDescriptions[0]?.focus();
    return;
  }

  const quantityInputs = Array.from(
    document.querySelectorAll("#itemsContainer .item-quantity")
  );

  const priceInputs = Array.from(
    document.querySelectorAll("#itemsContainer .item-price")
  );

  for (let i = 0; i < quantityInputs.length; i++) {
    const description = itemDescriptions[i]?.value.trim();

    // Ignore completely empty item rows.
    if (!description) continue;

    const quantity = Number(quantityInputs[i].value);
    const price = Number(priceInputs[i].value);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("Each described item must have a quantity greater than zero.");
      quantityInputs[i].focus();
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      alert("Item prices cannot be negative.");
      priceInputs[i].focus();
      return;
    }
  }

  const discount = Number(getElement("discount")?.value);
  const tax = Number(getElement("tax")?.value);

  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    alert("Discount must be between 0% and 100%.");
    getElement("discount")?.focus();
    return;
  }

  if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
    alert("Tax must be between 0% and 100%.");
    getElement("tax")?.focus();
    return;
  }

  const amountPaid = Number(getElement("amountPaid")?.value);

  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    alert("Amount paid cannot be negative.");
    getElement("amountPaid")?.focus();
    return;
  }

 const invoiceTotal = calculateTotal().total;

  if (
    !Number.isFinite(invoiceTotal) ||
    amountPaid > invoiceTotal + 0.001
  ) {
    alert("Amount paid cannot be greater than the invoice total.");
    getElement("amountPaid")?.focus();
    return;
  }

const invoice = buildInvoice();
// Validate the invoice date.
const invoiceDateInput = getElement("invoiceDate");
const invoiceDate = invoiceDateInput?.value;

if (invoiceDate) {
  const selectedDate = new Date(`${invoiceDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (
    Number.isNaN(selectedDate.getTime()) ||
    selectedDate > today
  ) {
    alert("Invoice date cannot be in the future.");
    invoiceDateInput?.focus();
    return;
  }
}

// Validate invoice number.
if (!invoice.invoiceNumber) {
  alert("Please enter an invoice number.");
  getElement("invoiceNumber")?.focus();
  return;
}

// Validate customer name.
if (!invoice.customerName) {
  alert("Please enter the customer name.");
  getElement("customer")?.focus();
  return;
}

const invoices = getSavedInvoices();

// Update an existing invoice only when using Edit.
if (editingInvoiceIndex !== null) {
  const index = editingInvoiceIndex;

  if (!invoices[index]) {
    alert("The invoice being edited could not be found.");
    editingInvoiceIndex = null;
    return;
  }

  const duplicate = invoices.some(
    (saved, i) =>
      i !== index &&
      String(saved.invoiceNumber || "").trim().toLowerCase() ===
        String(invoice.invoiceNumber || "").trim().toLowerCase()
  );

  if (duplicate) {
    alert("Another invoice already uses this invoice number.");
    getElement("invoiceNumber")?.focus();
    return;
  }

  invoice.id = invoices[index].id || invoice.id;
  invoices[index] = invoice;

  if (!storeInvoices(invoices)) return;

  editingInvoiceIndex = null;
  renderSavedInvoices();
  updateDashboardSummary();
  showMessage("Invoice updated successfully.");
  return;
}

// New invoices must have unique invoice numbers.
const existingIndex = invoices.findIndex(
  saved =>
    String(saved.invoiceNumber || "").trim().toLowerCase() ===
    String(invoice.invoiceNumber || "").trim().toLowerCase()
);

if (existingIndex >= 0) {
  alert(
    "This invoice number already exists. " +
    "Please use a new invoice number or edit the existing invoice."
  );

  getElement("invoiceNumber")?.focus();
  return;
}

invoices.push(invoice);

if (storeInvoices(invoices)) {
  renderSavedInvoices();
  updateDashboardSummary();
  showMessage("New invoice saved successfully.");
}
}


// ==========================================
// DASHBOARD
// ==========================================

function updateDashboardSummary() {
  const invoices = getSavedInvoices();

  let totalRevenue = 0;
  let totalOutstanding = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  invoices.forEach(invoice => {
    const total = Math.max(0, Number(invoice.total) || 0);
    const paid = Math.max(0, Number(invoice.amountPaid) || 0);
    const balance = Math.max(
      0,
      Math.round((total - paid) * 100) / 100
    );

    totalRevenue += total;
    totalOutstanding += balance;

    if (total > 0 && balance === 0) {
      paidCount++;
    } else if (paid > 0) {
      partialCount++;
    } else {
      unpaidCount++;
    }
  });

  const count = getElement("dashboardInvoiceCount");
  const revenue = getElement("dashboardRevenue");
  const outstanding = getElement("dashboardOutstanding");

  if (count) count.textContent = invoices.length;

  if (revenue) {
    revenue.textContent = money(totalRevenue);
  }

  if (outstanding) {
    outstanding.textContent = money(totalOutstanding);
  }

  const paidElement = getElement("dashboardPaidCount");
  const partialElement = getElement("dashboardPartialCount");
  const unpaidElement = getElement("dashboardUnpaidCount");

  if (paidElement) paidElement.textContent = paidCount;
  if (partialElement) partialElement.textContent = partialCount;
  if (unpaidElement) unpaidElement.textContent = unpaidCount;
}


// ==========================================
// DISPLAY, SEARCH, LOAD, EDIT AND DELETE
// ==========================================

function renderSavedInvoices() {
  const list =
    getElement("savedInvoicesList") ||
    getElement("invoiceList") ||
    getElement("savedInvoices");

  const searchResultsList = getElement("searchResultsList");
  const message = getElement("invoiceSearchMessage");

  updateDashboardSummary();

  if (!list && !searchResultsList) {
    console.warn("Saved invoices list element not found.");
    return;
  }

  const invoices = getSavedInvoices();

  const searchTerm = (
    getElement("invoiceSearch")?.value || ""
  ).trim().toLowerCase();

  const statusFilter = (
    getElement("statusFilter")?.value || "all"
  ).trim().toLowerCase();

  const isSearching =
    searchTerm !== "" || statusFilter !== "all";

  // Show search results under the search box when filtering.
  const resultsList =
    isSearching && searchResultsList
      ? searchResultsList
      : list;

  if (list) list.replaceChildren();

  if (searchResultsList && searchResultsList !== list) {
    searchResultsList.replaceChildren();
  }

  function getPaymentInfo(invoice) {
    const total = Math.round(
      (Number(invoice.total) || 0) * 100
    ) / 100;

    const paid = Math.round(
      (Number(invoice.amountPaid) || 0) * 100
    ) / 100;

    const balance = Math.max(
      0,
      Math.round((total - paid) * 100) / 100
    );

    let status = "Unpaid";

    if (total > 0 && balance === 0) {
      status = "Paid";
    } else if (paid > 0) {
      status = "Partially Paid";
    }

    return { total, paid, balance, status };
  }

  function matchesStatus(status) {
    if (statusFilter === "all") return true;
    if (statusFilter === "paid" ||
        statusFilter === "fully paid") {
      return status === "Paid";
    }

    if (statusFilter === "partial" ||
        statusFilter === "partially paid") {
      return status === "Partially Paid";
    }

    if (statusFilter === "unpaid") {
      return status === "Unpaid";
    }

    return status.toLowerCase() === statusFilter;
  }

  const filteredInvoices = invoices
    .map((invoice, originalIndex) => ({
      invoice,
      originalIndex
    }))
    .filter(({ invoice }) => {
      const invoiceNumber = String(
        invoice.invoiceNumber || ""
      ).toLowerCase();

      const customerName = String(
        invoice.customerName || ""
      ).toLowerCase();

      const matchesSearch =
        invoiceNumber.includes(searchTerm) ||
        customerName.includes(searchTerm);

      const { status } = getPaymentInfo(invoice);

      return matchesSearch && matchesStatus(status);
    });

  if (message) {
    message.textContent = filteredInvoices.length
      ? `Showing ${filteredInvoices.length} matching invoice(s).`
      : isSearching
        ? "No invoices match your search and status filter."
        : "No saved invoices yet.";
  }

  if (!resultsList) return;

  if (filteredInvoices.length === 0) {
    const empty = document.createElement("li");

    empty.textContent = isSearching
      ? "No invoices match your search and status filter."
      : "No saved invoices yet.";

    resultsList.appendChild(empty);
    return;
  }

  filteredInvoices.forEach(({ invoice, originalIndex }) => {
    const li = document.createElement("li");

    const title = document.createElement("span");

    title.textContent =
      `${invoice.invoiceNumber || `Invoice ${originalIndex + 1}`} — ` +
      `${invoice.customerName || "Unknown customer"} — ` +
      `${moneyForCurrency(
        invoice.total,
        invoice.currency || "ETB"
      )}`;

    const { balance, status } = getPaymentInfo(invoice);

    const statusBadge = document.createElement("span");
    statusBadge.textContent = status;
    statusBadge.className =
      "status-badge " +
      status.toLowerCase().replaceAll(" ", "-");

    statusBadge.style.marginLeft = "8px";

    const balanceLabel = document.createElement("span");
    balanceLabel.style.marginLeft = "8px";

    if (status === "Paid") {
      balanceLabel.textContent = "Paid in full";
      balanceLabel.className = "balance-paid";
    } else {
      balanceLabel.textContent =
        `Balance due: ${moneyForCurrency(
          balance,
          invoice.currency || "ETB"
        )}`;

      balanceLabel.className = "balance-due";
    }

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "Load";

    loadButton.addEventListener("click", () => {
      loadInvoice(originalIndex);
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", () => {
      loadInvoice(originalIndex, true);
      getElement("invoiceNumber")?.focus();

      showMessage(
        "Editing invoice. Make your changes, then click Save Invoice."
      );
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", () => {
      deleteInvoice(originalIndex);
    });

    li.append(
      title,
      document.createTextNode(" "),
      statusBadge,
      document.createTextNode(" "),
      balanceLabel,
      document.createTextNode(" "),
      loadButton,
      document.createTextNode(" "),
      editButton,
      document.createTextNode(" "),
      deleteButton
    );

    resultsList.appendChild(li);
  });
}

function loadInvoice(index, enableEditing = false) {
  const invoice = getSavedInvoices()[index];

  if (!invoice) {
    alert("Invoice not found.");
    return;
  }

  editingInvoiceIndex = enableEditing ? index : null;

  const fields = {
    business: invoice.businessName,
    businessEmail: invoice.businessEmail,
    businessPhone: invoice.businessPhone,
    businessAddress: invoice.businessAddress,
    customer: invoice.customerName,
    customerEmail: invoice.customerEmail,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    currency: invoice.currency || "ETB",
    discount: invoice.discount ?? invoice.discountPercent ?? 0,
    tax: invoice.tax ?? invoice.taxPercent ?? 0,
    amountPaid: invoice.amountPaid ?? 0
  };

  Object.entries(fields).forEach(([id, value]) => {
    const element = getElement(id);
    if (element) element.value = value ?? "";
  });

  const container = getElement("itemsContainer");

  if (container) {
    container.replaceChildren();

    if (Array.isArray(invoice.items) && invoice.items.length) {
      invoice.items.forEach(item => {
        addItem(
          item.description || "",
          item.quantity || 1,
          item.price || 0
        );
      });
    } else {
      addItem();
    }
  }

  businessLogoData = invoice.logo || "";

  calculateTotal();

  showMessage(
    `${enableEditing ? "Editing" : "Loaded"} invoice ` +
    `${invoice.invoiceNumber || ""}.`
  );

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteInvoice(index) {
  const invoices = getSavedInvoices();
  const invoice = invoices[index];

  if (!invoice) {
    alert("Invoice not found.");
    return;
  }

  if (!confirm(
    `Delete invoice ${invoice.invoiceNumber || ""}? ` +
    "This cannot be undone."
  )) {
    return;
  }

  invoices.splice(index, 1);

  if (!storeInvoices(invoices)) return;

  if (editingInvoiceIndex === index) {
    editingInvoiceIndex = null;
  } else if (
    editingInvoiceIndex !== null &&
    editingInvoiceIndex > index
  ) {
    editingInvoiceIndex--;
  }

  renderSavedInvoices();
  showMessage("Invoice deleted.");
}



// ==========================================
// BUSINESS LOGO
// ==========================================

function handleLogoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    alert("Please choose a PNG, JPG, or WebP image.");
    event.target.value = "";
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert("Please choose an image smaller than 2 MB.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    businessLogoData = reader.result;
    showMessage("Business logo loaded successfully.");
  };

  reader.onerror = () => alert("Could not read the logo file.");
  reader.readAsDataURL(file);
}

// ==========================================
// ==========================================
// INVOICE PREVIEW AND PRINTfunction generatePreview


function generatePreview(autoPrint = false) {
  const invoice = buildInvoice();

  // Validate the invoice date.
  const invoiceDateInput = getElement("invoiceDate");
  const invoiceDate = invoiceDateInput?.value;

  if (!invoiceDate) {
    alert("Please select an invoice date.");
    invoiceDateInput?.focus();
    return;
  }

  const selectedDate = new Date(`${invoiceDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (
    Number.isNaN(selectedDate.getTime()) ||
    selectedDate > today
  ) {
    alert("Invoice date cannot be in the future.");
    invoiceDateInput?.focus();
    return;
  }

  // Validate invoice number and customer.
  if (!invoice.invoiceNumber || !invoice.customerName) {
    alert("Enter the invoice number and customer name first.");
    return;
  }

  // Validate at least one described item.
  const validItems = (invoice.items || []).filter(
    item => String(item.description || "").trim() !== ""
  );

  if (validItems.length === 0) {
    alert("Enter at least one item description.");
    return;
  }

  const currency = invoice.currency || "ETB";
  const total = Math.round((Number(invoice.total) || 0) * 100) / 100;
  const paid = Math.round((Number(invoice.amountPaid) || 0) * 100) / 100;
  const balance = Math.max(
    0,
    Math.round((total - paid) * 100) / 100
  );

  const paymentStatus =
    total > 0 && balance === 0
      ? "PAID"
      : paid > 0
        ? "PARTIALLY PAID"
        : "UNPAID";

  // Build invoice item rows.
  const rows = validItems.map(item => {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const amount = quantity * price;

    return `
      <tr>
        <td>${escapeHtml(item.description)}</td>
        <td class="number">${quantity}</td>
        <td class="number">
          ${escapeHtml(moneyForCurrency(price, currency))}
        </td>
        <td class="number">
          ${escapeHtml(moneyForCurrency(amount, currency))}
        </td>
      </tr>
    `;
  }).join("");

  const logoHTML = invoice.logo
    ? `<img class="logo" src="${escapeHtml(invoice.logo)}" alt="Business logo">`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>

<style>
* {
  box-sizing: border-box;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  max-width: 850px;
  margin: 30px auto;
  padding: 30px;
  color: #1f2937;
  background: #fff;
  line-height: 1.5;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 3px solid #2563eb;
}

h1 {
  margin: 0 0 12px;
  color: #2563eb;
  font-size: 36px;
  letter-spacing: 2px;
}

h2 {
  font-size: 15px;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 8px;
}

p {
  margin: 5px 0;
  overflow-wrap: anywhere;
}

.logo {
  max-width: 150px;
  max-height: 100px;
  object-fit: contain;
}

.details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin: 28px 0;
}

.details > div {
  min-width: 0;
  overflow-wrap: anywhere;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 25px;
  font-size: 13px;
}

thead {
  display: table-header-group;
}

th {
  background: #eff6ff;
  color: #1e40af;
  text-align: left;
}

th, td {
  border-bottom: 1px solid #e2e8f0;
  padding: 12px 9px;
  overflow-wrap: anywhere;
}

.number {
  text-align: right;
  white-space: nowrap;
}

.totals {
  width: 100%;
  max-width: 380px;
  margin: 25px 0 25px auto;
}

.total-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 0;
}

.grand-total {
  border-top: 2px solid #2563eb;
  font-size: 18px;
  padding-top: 12px;
  margin-top: 8px;
}

.balance {
  background: #eff6ff;
  padding: 12px;
  border-radius: 6px;
  margin-top: 12px;
}

.status {
  display: inline-block;
  font-weight: bold;
  font-size: 12px;
  padding: 5px 10px;
  border: 1px solid #94a3b8;
  border-radius: 20px;
  margin-top: 12px;
}

.footer {
  margin-top: 40px;
  padding-top: 15px;
  border-top: 1px solid #e2e8f0;
  color: #64748b;
  text-align: center;
  font-size: 12px;
}

.actions {
  text-align: center;
  margin: 25px 0;
}

button {
  background: #2563eb;
  color: white;
  border: 0;
  padding: 12px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
}

@media (max-width: 600px) {
  body {
    padding: 16px;
    margin: 0 auto;
  }

  .header {
    flex-direction: column;
  }

  .details {
    gap: 15px;
  }

  table {
    font-size: 11px;
  }

  th, td {
    padding: 7px 4px;
  }
}

@page {
  size: A4;
  margin: 12mm;
}

@media print {
  body {
    max-width: none;
    margin: 0;
    padding: 0;
    font-size: 11px;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .actions {
    display: none !important;
  }

  tr {
    break-inside: avoid;
  }

  .totals {
    break-inside: avoid;
  }
}
</style>
</head>

<body>
  
<header class="header">
  <div>
    <h1>INVOICE</h1>
    <p><strong>Invoice No:</strong>
      ${escapeHtml(invoice.invoiceNumber)}</p>
    <p><strong>Invoice Date:</strong>
      ${escapeHtml(invoice.invoiceDate)}</p>
  </div>

  ${logoHTML}
</header>


  <section class="details">
    <div>
  <h2>From</h2>
  <p><strong>${escapeHtml(invoice.businessName || "Your Business")}</strong></p>
  <p>${escapeHtml(invoice.businessEmail || "")}</p>
  <p>${escapeHtml(invoice.businessPhone || getElement("businessPhone")?.value.trim() || "")}</p>
  <p>${escapeHtml(invoice.businessAddress || getElement("businessAddress")?.value.trim() || "")}</p>
</div>

    <div>
      <h2>Bill To</h2>
      <p><strong>${escapeHtml(invoice.customerName)}</strong></p>
      <p>${escapeHtml(invoice.customerEmail || "")}</p>
    </div>
  </section>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="number">Qty</th>
        <th class="number">Unit Price</th>
        <th class="number">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="totals">
    <div class="total-row">
      <span>Subtotal</span>
      <strong>${escapeHtml(moneyForCurrency(invoice.subtotal, currency))}</strong>
    </div>

    <div class="total-row">
      <span>Discount (${Number(invoice.discount) || 0}%)</span>
      <strong>−${escapeHtml(moneyForCurrency(invoice.discountAmount, currency))}</strong>
    </div>

    <div class="total-row">
      <span>Tax (${Number(invoice.tax) || 0}%)</span>
      <strong>${escapeHtml(moneyForCurrency(invoice.taxAmount, currency))}</strong>
    </div>

    <div class="total-row grand-total">
      <span>Grand Total</span>
      <strong>${escapeHtml(moneyForCurrency(total, currency))}</strong>
    </div>

    <div class="total-row">
      <span>Amount Paid</span>
      <strong>${escapeHtml(moneyForCurrency(paid, currency))}</strong>
    </div>

    <div class="balance">
      <div class="total-row">
        <strong>Balance Due</strong>
        <strong>${escapeHtml(moneyForCurrency(balance, currency))}</strong>
      </div>
      <span class="status">Payment: ${paymentStatus}</span>
    </div>
  </section>

  <footer class="footer">
    <p>Thank you for your business!</p>
    <p>${escapeHtml(invoice.businessName || "InvoicePro")}</p>
  </footer>

  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;

  // Open the preview window.
  const previewWindow = window.open("", "_blank");

  if (!previewWindow) {
    alert("Allow pop-ups for this page and try again.");
    return;
  }

  previewWindow.document.open();
  previewWindow.document.write(html);
  previewWindow.document.close();

  // Print after the preview has loaded.
  if (autoPrint) {
    previewWindow.addEventListener("load", () => {
      previewWindow.focus();
      previewWindow.print();
    }, { once: true });
  }
}



// ==========================================
// PAYMENT RECEIPT
// ==========================================


function generateReceipt(autoPrint = true) {
  // Recalculate before reading payment details.
  const invoice = buildInvoice();

  if (!invoice.invoiceNumber || !invoice.customerName) {
    alert("Enter the invoice number and customer name first.");
    return;
  }

  const amountPaid = Number(invoice.amountPaid) || 0;
  if (amountPaid <= 0) {
    alert("Enter an amount greater than 0 in Amount Paid before printing a receipt.");
    getElement("amountPaid")?.focus();
    return;
  }

  // Open the window immediately during the button click so the browser
  // is less likely to block it as a pop-up.
  const receiptWindow = window.open("", "_blank");
  if (!receiptWindow) {
    alert("The receipt window was blocked. Allow pop-ups for InvoicePro, then try again.");
    return;
  }

  const currency = invoice.currency || "ETB";
  const total = Math.max(0, Number(invoice.total) || 0);
  const paid = Math.max(0, amountPaid);
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const paymentStatus = total > 0 && balance === 0
    ? "Paid in full"
    : paid > 0
      ? "Partially paid"
      : "Unpaid";

  const logoHTML = invoice.logo
    ? `<img class="logo-image" src="${escapeHtml(invoice.logo)}" alt="Business logo">`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment Receipt ${escapeHtml(invoice.invoiceNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    max-width: 680px;
    margin: 28px auto;
    padding: 28px;
    color: #1f2937;
    line-height: 1.5;
  }
  .receipt-header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 18px; margin-bottom: 20px; }
  .logo-image { max-width: 150px; max-height: 90px; object-fit: contain; }
  h1 { margin: 10px 0; font-size: 28px; }
  h2 { margin: 22px 0 8px; font-size: 14px; text-transform: uppercase; color: #64748b; }
  p { margin: 4px 0; overflow-wrap: anywhere; }
  .line { display: flex; justify-content: space-between; gap: 20px; padding: 11px 0; border-bottom: 1px solid #e5e7eb; }
  .line span { overflow-wrap: anywhere; }
  .status { margin-top: 18px; padding: 12px; background: #eff6ff; border-radius: 6px; }
  .actions { text-align: center; margin-top: 24px; }
  button { padding: 12px 18px; border: 0; border-radius: 6px; background: #2563eb; color: white; font-size: 15px; cursor: pointer; }
  @media (max-width: 600px) { body { margin: 0; padding: 16px; } }
  @page { size: A4; margin: 15mm; }
  @media print { body { margin: 0; padding: 0; } .actions { display: none !important; } }
</style>
</head>
<body>
  <header class="receipt-header">
    ${logoHTML}
    <h1>PAYMENT RECEIPT</h1>
    <p><strong>Receipt No:</strong> ${escapeHtml("REC-" + invoice.invoiceNumber)}</p>
    <p><strong>Invoice No:</strong> ${escapeHtml(invoice.invoiceNumber)}</p>
    <p><strong>Date:</strong> ${escapeHtml(invoice.invoiceDate || new Date().toLocaleDateString())}</p>
  </header>

  <section>
    <h2>Received by</h2>
    <p><strong>${escapeHtml(invoice.businessName || "Your Business")}</strong></p>
    <p>${escapeHtml(invoice.businessEmail || "")}</p>
    <p>${escapeHtml(invoice.businessPhone || "")}</p>
    <p>${escapeHtml(invoice.businessAddress || "")}</p>
  </section>

  <section>
    <h2>Received from</h2>
    <p><strong>${escapeHtml(invoice.customerName)}</strong></p>
    <p>${escapeHtml(invoice.customerEmail || "")}</p>
  </section>

  <section aria-label="Payment summary">
    <div class="line"><span>Invoice Total</span><strong>${escapeHtml(moneyForCurrency(total, currency))}</strong></div>
    <div class="line"><span>Payment Received</span><strong>${escapeHtml(moneyForCurrency(paid, currency))}</strong></div>
    <div class="line"><span>Balance Remaining</span><strong>${escapeHtml(moneyForCurrency(balance, currency))}</strong></div>
    <div class="status"><strong>Payment status:</strong> ${escapeHtml(paymentStatus)}</div>
  </section>

  <p style="margin-top:24px">Thank you for your payment!</p>
  <div class="actions"><button type="button" onclick="window.print()">Print / Save Receipt as PDF</button></div>
</body>
</html>`;

  try {
    receiptWindow.document.open();
    receiptWindow.document.write(html);
    receiptWindow.document.close();

    if (autoPrint) {
      // document.write() is synchronous, but allow a short render delay
      // before opening the browser print dialog.
      receiptWindow.setTimeout(() => {
        if (!receiptWindow.closed) {
          receiptWindow.focus();
          receiptWindow.print();
        }
      }, 700);
    }
  } catch (error) {
    console.error("Could not generate payment receipt:", error);
    receiptWindow.close();
    alert("Could not generate the payment receipt. Please try again.");
  }
}


// ==========================================
// CSV EXPORT
// ==========================================

function exportInvoicesToCSV() {
  const invoices = getSavedInvoices();

  if (!invoices.length) {
    alert("There are no saved invoices to export.");
    return;
  }

  const columns = [
    ["Invoice Number", "invoiceNumber"],
    ["Invoice Date", "invoiceDate"],
    ["Business Name", "businessName"],
    ["Business Email", "businessEmail"],
    ["Customer Name", "customerName"],
    ["Customer Email", "customerEmail"],
    ["Currency", "currency"],
    ["Subtotal", "subtotal"],
    ["Discount Percent", "discount"],
    ["Discount Amount", "discountAmount"],
    ["Tax Percent", "tax"],
    ["Tax Amount", "taxAmount"],
    ["Grand Total", "total"],
    ["Amount Paid", "amountPaid"],
    ["Payment Status", "paymentStatus"],
    ["Amount Remaining", "amountRemaining"]
  ];

  function csvCell(value) {
  let text = String(value ?? "");

  // Reduce the risk of spreadsheet formula injection.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

  const rows = [
    columns.map(column => column[0]),
    ...invoices.map(invoice =>
      columns.map(column => invoice[column[1]] ?? "")
    )
  ];

  const csv = "\uFEFF" +
    rows.map(row => row.map(csvCell).join(",")).join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "saved-invoices.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("CSV export started.");
}

// ==========================================
// INITIALIZATION
// ==========================================


function setDefaults() {
  const dateInput = getElement("invoiceDate");

  if (dateInput && !dateInput.value) {
    const now = new Date();
    const localDate = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    );

    dateInput.value = localDate.toISOString().slice(0, 10);
  }

  const numberInput = getElement("invoiceNumber");

  if (numberInput && !numberInput.value.trim()) {
    numberInput.value = generateNextInvoiceNumber();
  }
}

function generateNextInvoiceNumber() {
  const invoices = getSavedInvoices();
  let highestNumber = 0;

  invoices.forEach(invoice => {
    const match = String(invoice.invoiceNumber || "")
      .match(/^INV-(\d+)$/i);

    if (match) {
      highestNumber = Math.max(
        highestNumber,
        Number(match[1])
      );
    }
  });

  return `INV-${String(highestNumber + 1).padStart(3, "0")}`;
}

const BUSINESS_PROFILE_KEY = "invoiceProBusinessProfile";

function saveBusinessProfile() {
  const profile = {
    businessName: getElement("business")?.value.trim() || "",
    businessEmail: getElement("businessEmail")?.value.trim() || "",
    businessPhone: getElement("businessPhone")?.value.trim() || "",
    businessAddress: getElement("businessAddress")?.value.trim() || ""
  };

  try {
    localStorage.setItem(BUSINESS_PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error("Could not save business profile:", error);
  }
}

function loadBusinessProfile() {
  try {
    const profile = JSON.parse(
      localStorage.getItem(BUSINESS_PROFILE_KEY) || "{}"
    );

    const fields = {
      business: "businessName",
      businessEmail: "businessEmail",
      businessPhone: "businessPhone",
      businessAddress: "businessAddress"
    };

    Object.entries(fields).forEach(([id, key]) => {
      const field = getElement(id);
      if (field && typeof profile[key] === "string") {
        field.value = profile[key];
      }
    });
  } catch (error) {
    console.error("Could not load business profile:", error);
  }
}

function initializeInvoiceGenerator() {
  loadBusinessProfile();

[
  "business",
  "businessEmail",
  "businessPhone",
  "businessAddress"
].forEach((id) => {
  getElement(id)?.addEventListener("input", saveBusinessProfile);
});
  getElement("addItemButton")?.addEventListener("click", () => addItem());

getElement("clearFormBtn")?.addEventListener("click", () => {
  if (!confirm("Start a new invoice? Unsaved changes will be lost.")) {
    return;
  }
  editingInvoiceIndex = null;

  // Reset invoice fields explicitly because the HTML uses sections.
  [
    "businessLogo",
    "customer",
    "customerEmail",
    "invoiceNumber",
    "invoiceDate",
    "currency",
    "discount",
    "tax",
    "amountPaid",
    "paymentStatus"
  ].forEach(id => {
    const field = getElement(id);
    if (!field) return;

    if (field.type === "file") {
      field.value = "";
    } else if (id === "invoiceNumber") {
      field.value = generateNextInvoiceNumber();
    } else if (id === "currency") {
      field.value = "ETB";
    } else if (id === "paymentStatus") {
      field.value = "unpaid";
    } else if (id === "invoiceDate") {
      field.value = new Date().toISOString().slice(0, 10);
    } else if (id === "amountPaid" || id === "discount" || id === "tax") {
      field.value = "0";
    } else {
      field.value = "";
    }
  });

  const itemsContainer = getElement("itemsContainer");

  if (itemsContainer) {
    itemsContainer.innerHTML = "";
  }

  loadBusinessProfile();
  addItem();
  calculateTotal();

  const message = getElement("message");
  if (message) message.textContent = "Ready for a new invoice.";
});

  getElement("itemsContainer")?.addEventListener("click", event => {
    if (!event.target.matches(".remove-item-button")) return;

    const items = document.querySelectorAll(
      "#itemsContainer .invoice-item"
    );

    if (items.length <= 1) {
      alert("An invoice must have at least one item.");
      return;
    }

    event.target.closest(".invoice-item")?.remove();
    calculateTotal();
  });

  getElement("itemsContainer")?.addEventListener("input", event => {
    if (event.target.matches(
      ".item-description, .item-quantity, .item-price"
    )) {
      calculateTotal();
    }
  });

  ["discount", "tax", "amountPaid", "currency"].forEach(id => {
    getElement(id)?.addEventListener("input", calculateTotal);
    getElement(id)?.addEventListener("change", calculateTotal);
  });

  getElement("invoiceSearch")?.addEventListener(
  "input",
  renderSavedInvoices
);

getElement("statusFilter")?.addEventListener(
  "change",
  renderSavedInvoices
);

  getElement("saveInvoiceButton")?.addEventListener(
    "click", saveInvoice
  );

  getElement("previewButton")?.addEventListener(
    "click", () => generatePreview(false)
  );

  getElement("printButton")?.addEventListener("click", () => {
  const confirmed = confirm(
    "Do you want to print this invoice?"
  );

  if (!confirmed) {
    return;
  }

  generatePreview(true);
});
["receiptButton", "printReceiptButton"].forEach((id) => {
  const button = getElement(id);

  button?.addEventListener("click", () => {
    generateReceipt(true);
  });
});
 

  getElement("exportInvoicesButton")?.addEventListener(
    "click", exportInvoicesToCSV
  );

  getElement("businessLogo")?.addEventListener(
    "change", handleLogoUpload
  );

  setDefaults();

  if (!document.querySelector("#itemsContainer .invoice-item")) {
    addItem();
  } else {
    calculateTotal();
  }

  renderSavedInvoices();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeInvoiceGenerator
  );
} else {
  initializeInvoiceGenerator();
}
