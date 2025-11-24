const SHEETS_ENDPOINT = {
  products: "https://script.google.com/macros/s/YOUR-APPSCRIPT-ID/exec?table=products",
  orders: "https://script.google.com/macros/s/YOUR-APPSCRIPT-ID/exec?table=orders",
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
  if (!url.includes("YOUR-APPSCRIPT-ID")) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`โหลดข้อมูล ${kind} ไม่สำเร็จ`);
    return response.json();
  }

  // Mock data for local preview before hooking Google Sheets
  if (kind === "products") {
    return [
      {
        name: "เสื้อโปโลพนักงาน",
        sku: "SKU-001",
        stock: 120,
        price: 399,
        notes: "สีกรม ไซซ์ S-XL",
        updatedAt: "2025-11-24 10:45",
      },
      {
        name: "เสื้อกาวน์",
        sku: "SKU-018",
        stock: 35,
        price: 650,
        notes: "",
        updatedAt: "2025-11-24 09:20",
      },
    ];
  }
  return [
    {
      orderId: "ORD-2025-001",
      customer: "บริษัท ABC จำกัด",
      product: "เสื้อโปโล 20 ตัว",
      total: 7999,
      status: "pending",
      date: "2025-11-24",
      notes: "",
    },
  ];
}

async function mutateSheet(kind, payload) {
  const url = SHEETS_ENDPOINT[kind];
  const body = JSON.stringify(payload);

  if (!url.includes("YOUR-APPSCRIPT-ID")) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) throw new Error("บันทึกข้อมูลไม่สำเร็จ");
    return response.json();
  }

  console.info(`[Mock] ${kind} payload`, payload);
  return { success: true };
}

function renderTable(tableId, rowTemplateId, rows, mapper) {
  const table = document.getElementById(tableId);
  const tmpl = document.getElementById(rowTemplateId);

  table.innerHTML = "";
  if (!rows.length) {
    table.innerHTML =
      '<tr><td colspan="6" class="py-8 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>';
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
    default:
      return `${base} bg-amber-100 text-amber-700`;
  }
}

function mapStatusText(status) {
  return (
    {
      pending: "รอดำเนินการ",
      paid: "ชำระแล้ว",
      shipped: "ส่งของแล้ว",
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

