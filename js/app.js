const API_ENABLED = false; // เปลี่ยนเป็น true เมื่อ endpoint พร้อมใช้งาน
const API_BASE = "https://uniforms-stock-ram2-hosp.netlify.app";
const SHEETS_ENDPOINT = {
  products: `${API_BASE}/api/products`,
  orders: `${API_BASE}/api/orders`,
};

const API_STATUS = {
  products: API_ENABLED ? "unknown" : "disabled",
  orders: API_ENABLED ? "unknown" : "disabled",
};

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

const state = {
  products: [],
  orders: [],
  editingProduct: null,
  editingOrder: null,
};

function formatCurrency(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

async function fetchSheetData(kind) {
  const url = SHEETS_ENDPOINT[kind];
  const shouldUseApi = API_ENABLED && API_STATUS[kind] !== "disabled";
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
  const url = SHEETS_ENDPOINT[kind];
  const body = JSON.stringify(payload);

  if (!API_ENABLED || API_STATUS[kind] === "disabled") {
    throw new Error("ยังไม่ได้เปิดใช้งาน API สำหรับบันทึกข้อมูล");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    const message = await safeReadJson(response);
    throw new Error(message?.error || "บันทึกข้อมูลไม่สำเร็จ");
  }
  return response.json();
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
        window.scrollTo({ top: 0, behavior: "smooth" });
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
  return parseCsv(csv, meta);
}

function parseCsv(csv, meta) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines.shift()).map((header) => header.trim());

  return lines
    .map((line) => parseCsvLine(line))
    .filter((cells) => cells.some((cell) => cell.trim().length))
    .map((cells) => {
      return headers.reduce((record, header, idx) => {
        if (!header) return record;
        let value = (cells[idx] ?? "").trim();
        if (meta.numericFields?.includes(header)) {
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

if (productForm) {
  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = serializeForm(e.target);
    if (!payload.id) {
      payload.id = generateProductId(payload);
    }
    payload.updatedAt = new Date().toLocaleString("th-TH");
    try {
      await mutateSheet("products", {
        action: state.editingProduct ? "update" : "create",
        payload,
      });
      await handleProductsReload();
      e.target.reset();
      state.editingProduct = null;
      alert("บันทึกข้อมูลสินค้าแล้ว");
    } catch (err) {
      console.error(err);
      alert("บันทึกข้อมูลสินค้าไม่สำเร็จ");
    }
  });
  if (refreshProductsBtn) {
    refreshProductsBtn.addEventListener("click", handleProductsReload);
  }
  handleProductsReload();
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

