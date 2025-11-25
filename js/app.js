// API Configuration
const API_ENABLED = true; // เปิดใช้งาน API
const API_BASE = window.location.origin; // ใช้ origin ปัจจุบันเพื่อรองรับทั้ง local และ production

// ตรวจสอบว่าอยู่ในโหมด development หรือไม่
const IS_DEVELOPMENT = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// ตั้งค่า endpoints
const SHEETS_ENDPOINT = {
  products: `${API_BASE}/api/products`,
  orders: `${API_BASE}/api/orders`,
};

// ตั้งค่า Google Sheets
const GOOGLE_SHEETS = {
  products: {
    sheetId: "1i3XMdNVGD9-MSCi9UKHcDuUXC7oGmLXNI5bvEhsoCaU",
    gid: "23685886",
    numericFields: ["stock", "price"],
  },
  orders: {
    sheetId: "1i3XMdNVGD9-MSCi9UKHcDuUXC7oGmLXNI5bvEhsoCaU",
    gid: "1366868069",
    numericFields: ["quantity", "total"],
  },
};

// ตั้งค่า API Status
const API_STATUS = {
  products: "enabled",
  orders: "enabled"
};

// ตั้งค่า CORS สำหรับการเรียก API
const API_CONFIG = {
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
};

// ฟังก์ชันสำหรับเรียก API
async function fetchData(endpoint, options = {}) {
  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

const state = {
  products: [],
  orders: [],
  editingProduct: null,
  editingOrder: null,
  isLoading: false,
  error: null
};

// ฟังก์ชันโหลดสินค้าทั้งหมด
async function loadProducts() {
  if (!API_ENABLED || API_STATUS.products !== 'enabled') {
    console.warn('Products API is disabled');
    return [];
  }

  state.isLoading = true;
  state.error = null;
  
  try {
    const products = await fetchData(SHEETS_ENDPOINT.products);
    state.products = products.map(product => ({
      ...product,
      price: Number(product.price) || 0,
      stock: Number(product.stock) || 0
    }));
    return state.products;
  } catch (error) {
    console.error('Failed to load products:', error);
    state.error = 'ไม่สามารถโหลดข้อมูลสินค้าได้: ' + (error.message || 'เกิดข้อผิดพลาด');
    throw error;
  } finally {
    state.isLoading = false;
  }
}

// ฟังก์ชันบันทึกสินค้า
async function saveProduct(productData) {
  if (!API_ENABLED || API_STATUS.products !== 'enabled') {
    console.warn('Products API is disabled');
    return { success: false, message: 'Products API is disabled' };
  }

  state.isLoading = true;
  state.error = null;

  try {
    const response = await fetchData(SHEETS_ENDPOINT.products, {
      method: 'POST',
      body: JSON.stringify(productData)
    });
    
    // โหลดข้อมูลใหม่หลังจากบันทึก
    await loadProducts();
    return response;
  } catch (error) {
    console.error('Failed to save product:', error);
    state.error = 'ไม่สามารถบันทึกข้อมูลสินค้าได้: ' + (error.message || 'เกิดข้อผิดพลาด');
    throw error;
  } finally {
    state.isLoading = false;
  }
}

// ฟังก์ชันโหลดคำสั่งซื้อทั้งหมด
async function loadOrders() {
  if (!API_ENABLED || API_STATUS.orders !== 'enabled') {
    console.warn('Orders API is disabled');
    return [];
  }

  state.isLoading = true;
  state.error = null;
  
  try {
    const orders = await fetchData(SHEETS_ENDPOINT.orders);
    state.orders = orders.map(order => ({
      ...order,
      quantity: Number(order.quantity) || 0,
      total: Number(order.total) || 0
    }));
    return state.orders;
  } catch (error) {
    console.error('Failed to load orders:', error);
    state.error = 'ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้: ' + (error.message || 'เกิดข้อผิดพลาด');
    throw error;
  } finally {
    state.isLoading = false;
  }
}

// ฟังก์ชันบันทึกคำสั่งซื้อ
async function saveOrder(orderData) {
  if (!API_ENABLED || API_STATUS.orders !== 'enabled') {
    console.warn('Orders API is disabled');
    return { success: false, message: 'Orders API is disabled' };
  }

  state.isLoading = true;
  state.error = null;

  try {
    const response = await fetchData(SHEETS_ENDPOINT.orders, {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
    
    // โหลดข้อมูลใหม่หลังจากบันทึก
    await loadOrders();
    return response;
  } catch (error) {
    console.error('Failed to save order:', error);
    state.error = 'ไม่สามารถบันทึกข้อมูลคำสั่งซื้อได้: ' + (error.message || 'เกิดข้อผิดพลาด');
    throw error;
  } finally {
    state.isLoading = false;
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

async function fetchSheetData(kind) {
  const url = SHEETS_ENDPOINT[kind];
  const shouldUseApi = API_STATUS[kind] !== "disabled";
  if (shouldUseApi) {
    try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API ${kind} status ${response.status}`);
    return response.json();
    } catch (err) {
      API_STATUS[kind] = "disabled";
      console.warn(`API ${kind} unavailable, fallback to Google Sheets`, err);
    }
  }
  return fetchGoogleSheet(kind);
}

async function mutateSheet(kind, payload) {
  try {
    const url = SHEETS_ENDPOINT[kind];
    
    if (!API_ENABLED) {
      throw new Error("ระบบ API ยังไม่ได้เปิดใช้งาน");
    }

    if (!url) {
      throw new Error(`ไม่พบ URL สำหรับ ${kind}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      ...API_CONFIG,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await safeReadJson(response);
      throw new Error(errorData?.error || `เกิดข้อผิดพลาดในการบันทึกข้อมูล ${kind}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error in mutateSheet (${kind}):`, error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

function renderTable(tableId, rowTemplateId, rows, mapper) {
  const table = document.getElementById(tableId);
  const tmpl = document.getElementById(rowTemplateId);

  table.innerHTML = "";
  if (!rows.length) {
    const emptyColspan = Number(table.dataset.emptyColspan) || 6;
    table.innerHTML = `<tr><td colspan="${emptyColspan}" class="py-8 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>`;
    return;
  }

  rows.forEach((row) => {
    const clone = tmpl.content.cloneNode(true);
    mapper(clone, row);
    table.appendChild(clone);
  });
}

function renderProducts() {
  renderTable("products-table", "product-row", state.products, (clone, row) => {
    Object.entries(row).forEach(([key, value]) => {
      const el = clone.querySelector(`[data-field="${key}"]`);
      if (!el) return;
      if (key === "price") {
        el.textContent = formatCurrency(value);
      } else if (key === "stock") {
        el.textContent = `${value} ชิ้น`;
      } else if (key === "status") {
        const badge = clone.querySelector("[data-field='status']");
        if (badge) {
          badge.textContent = value || "-";
          badge.className = mapProductStatusColor(value);
        }
      } else {
        el.textContent = value || "-";
      }
    });

    const editBtn = clone.querySelector(".edit-product");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        state.editingProduct = row;
        fillForm("product-form", row);
        openProductModal();
      });
    }
  });
}

function renderOrders() {
  renderTable("orders-table", "order-row", state.orders, (clone, row) => {
    Object.entries(row).forEach(([key, value]) => {
      const el = clone.querySelector(`[data-field="${key}"]`);
      if (!el) return;
      if (key === "total") {
        el.textContent = formatCurrency(value);
      } else if (key === "quantity") {
        el.textContent = `${value} ชุด`;
      } else if (key === "status") {
        const badge = clone.querySelector("[data-field='status']");
        badge.textContent = mapStatusText(value);
        badge.className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${mapStatusColor(
          value,
        )}`;
      } else if (key === "date") {
        el.textContent = new Date(value).toLocaleDateString("th-TH");
      } else {
        el.textContent = value || "-";
      }
    });

    const editBtn = clone.querySelector(".edit-order");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        state.editingOrder = row;
        fillForm("order-form", row);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  });
}

function fillForm(formId, data) {
  const form = document.getElementById(formId);
  Array.from(form.elements).forEach((field) => {
    if (!field.name) return;
    field.value = data[field.name] ?? "";
  });
}

function serializeForm(form) {
  return Array.from(form.elements).reduce((acc, field) => {
    if (!field.name) return acc;
    acc[field.name] = field.type === "number" ? Number(field.value) : field.value;
    return acc;
  }, {});
}

function mapStatusColor(status) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold";
  switch (status) {
    case "paid":
      return `${base} bg-emerald-100 text-emerald-700`;
    case "shipped":
      return `${base} bg-sky-100 text-sky-700`;
    case "in-production":
      return `${base} bg-indigo-100 text-indigo-700`;
    case "cancelled":
      return `${base} bg-rose-100 text-rose-700`;
    default:
      return `${base} bg-amber-100 text-amber-700`;
  }
}

function mapProductStatusColor(status) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold";
  switch (status) {
    case "พร้อมขาย":
      return `${base} bg-emerald-100 text-emerald-700`;
    case "รอผลิต":
      return `${base} bg-amber-100 text-amber-700`;
    case "หมดชั่วคราว":
      return `${base} bg-slate-200 text-slate-600`;
    default:
      return `${base} bg-slate-100 text-slate-600`;
  }
}

async function fetchGoogleSheet(kind) {
  const meta = GOOGLE_SHEETS[kind];
  if (!meta) throw new Error(`ไม่พบ Google Sheet สำหรับ ${kind}`);
  const csvUrl = `https://docs.google.com/spreadsheets/d/${meta.sheetId}/export?format=csv&gid=${meta.gid}`;
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`โหลดข้อมูล ${kind} จาก Google Sheets ไม่สำเร็จ`);
  const csv = await response.text();
  return parseCsv(csv, meta.numericFields || []);
}

function parseCsv(csv, numericFields = []) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  
  const headers = parseCsvLine(lines.shift()).map((h) => h.trim());
  
  return lines
    .map((line) => parseCsvLine(line))
    .filter((cells) => cells.some((cell) => cell.trim().length))
    .map((cells) => {
      return headers.reduce((record, header, idx) => {
        if (!header) return record;
        let value = (cells[idx] ?? "").trim();
        if (numericFields.includes(header)) {
          const numeric = Number(value.replace(/,/g, ""));
          value = Number.isNaN(numeric) ? 0 : numeric;
        }
        record[header] = value;
        return record;
      }, {});
    });
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function generateProductId(product) {
  const prefix = "sku";
  const category = (product.category || "item").replace(/\W+/g, "").slice(0, 4) || "item";
  const timestamp = Date.now().toString(36);
  return `${prefix}-${category}-${timestamp}`;
}

function generateOrderId() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `ORD-${dateStr}-${random}`;
}

function mapStatusText(status) {
  return (
    {
      pending: "รอดำเนินการ",
      "in-production": "กำลังผลิต",
      paid: "ชำระแล้ว",
      shipped: "ส่งของแล้ว",
      cancelled: "ยกเลิก",
    }[status] || status
  );
}

async function handleProductsReload() {
  const btn = document.getElementById("refresh-products");
  btn.disabled = true;
  try {
    state.products = await fetchSheetData("products");
    renderProducts();
  } catch (err) {
    console.error(err);
    alert("ไม่สามารถโหลดข้อมูลสินค้าได้");
  } finally {
    btn.disabled = false;
  }
}

async function handleOrdersReload() {
  const btn = document.getElementById("refresh-orders");
  btn.disabled = true;
  try {
    state.orders = await fetchSheetData("orders");
    renderOrders();
  } catch (err) {
    console.error(err);
    alert("ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้");
  } finally {
    btn.disabled = false;
  }
}

const productForm = document.getElementById("product-form");
const orderForm = document.getElementById("order-form");
const refreshProductsBtn = document.getElementById("refresh-products");
const refreshOrdersBtn = document.getElementById("refresh-orders");
const productModal = document.getElementById("product-modal");
const openProductModalBtn = document.getElementById("open-product-modal");
const closeProductModalBtn = document.getElementById("close-product-modal");
const cancelProductModalBtn = document.getElementById("cancel-product-modal");

function openProductModal(isEdit = false) {
  if (!productModal) return;
  productModal.classList.remove("hidden");
}

function closeProductModal() {
  if (!productModal || !productForm) return;
  productModal.classList.add("hidden");
  productForm.reset();
  state.editingProduct = null;
}

if (refreshProductsBtn) {
  refreshProductsBtn.addEventListener("click", handleProductsReload);
  handleProductsReload();
}

if (openProductModalBtn) {
  openProductModalBtn.addEventListener("click", () => {
    state.editingProduct = null;
    if (productForm) {
      productForm.reset();
    }
    openProductModal();
  });
}

if (closeProductModalBtn) {
  closeProductModalBtn.addEventListener("click", () => {
    closeProductModal();
  });
}

if (cancelProductModalBtn) {
  cancelProductModalBtn.addEventListener("click", () => {
    closeProductModal();
  });
}

if (productForm) {
  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = serializeForm(e.target);
    if (!payload.id) {
      payload.id = generateProductId(payload);
    }

    try {
      await mutateSheet("products", {
        action: state.editingProduct ? "update" : "create",
        payload,
      });
      await handleProductsReload();
      closeProductModal();
      alert("บันทึกสินค้าแล้ว");
    } catch (err) {
      console.error(err);
      alert("บันทึกสินค้าไม่สำเร็จ");
    }
  });
}

if (orderForm) {
  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = serializeForm(e.target);
    if (!payload.id) {
      payload.id = generateOrderId();
    }
    try {
      await mutateSheet("orders", {
        action: state.editingOrder ? "update" : "create",
        payload,
      });
      await handleOrdersReload();
      e.target.reset();
      state.editingOrder = null;
      alert("บันทึกคำสั่งซื้อแล้ว");
    } catch (err) {
      console.error(err);
      alert("บันทึกคำสั่งซื้อไม่สำเร็จ");
    }
  });
  if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener("click", handleOrdersReload);
  }
  handleOrdersReload();
}

