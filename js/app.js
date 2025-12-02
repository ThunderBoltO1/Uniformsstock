import { db } from './firebase-config.js';
import {
  collection,
  getDocs, 
  query, 
  orderBy, 
  addDoc, 
  doc, 
  updateDoc, 
  getDoc,
  runTransaction, 
  setDoc,
  increment, 
  onSnapshot,
  Timestamp, 
  serverTimestamp,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const updateSortUI = (tableId, sortState) => {
  document.querySelectorAll(`#${tableId} th[data-sort]`).forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = ''; // Clear previous arrow
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.sort === sortState.key) {
      th.classList.add(sortState.order === 'asc' ? 'sorted-asc' : 'sorted-desc');
      if (arrow) arrow.textContent = sortState.order === 'asc' ? ' ▲' : ' ▼';
    }
  });
};

const notificationIcons = {
  success: `<svg class="h-6 w-6 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
  error: `<svg class="h-6 w-6 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`,
};

const notificationColors = {
  success: 'border-green-400',
  error: 'border-red-400',
};

/**
 * Shows a toast notification.
 * @param {string} message The message to display.
 * @param {'success' | 'error'} type The type of notification.
 */
const showNotification = (message, type = 'success') => {
  const container = document.getElementById('notification-container');
  const template = document.getElementById('notification-template');
  if (!container || !template) return;

  const notification = template.content.cloneNode(true).firstElementChild;
  
  notification.querySelector('[data-message]').textContent = message;
  notification.querySelector('[data-icon-container]').innerHTML = notificationIcons[type];
  notification.classList.add(notificationColors[type]);

  const closeButton = notification.querySelector('[data-close-button]');
  
  const removeNotification = () => {
    notification.classList.add('opacity-0', 'translate-x-full');
    setTimeout(() => {
      notification.remove();
    }, 300); // Match transition duration
  };

  closeButton.addEventListener('click', removeNotification);

  container.appendChild(notification);

  // Animate in
  requestAnimationFrame(() => {
    notification.classList.remove('translate-x-full', 'opacity-0');
  });

  // Auto-remove after 5 seconds
  setTimeout(removeNotification, 5000);
};

/**
 * Shows a custom confirmation modal.
 * @param {string} message The message to display in the modal.
 * @param {string} [title='ยืนยันการลบ'] The title of the modal.
 * @returns {Promise<boolean>} A promise that resolves to true if confirmed, false if cancelled.
 */
const showConfirmation = (message, title = 'ยืนยันการลบ') => {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmation-modal');
    const modalContent = document.getElementById('confirmation-modal-content');
    const titleEl = document.getElementById('confirmation-modal-title');
    const messageEl = document.getElementById('confirmation-modal-message');
    const confirmBtn = document.getElementById('confirmation-confirm-button');
    const cancelBtn = document.getElementById('confirmation-cancel-button');

    if (!modal || !modalContent || !confirmBtn || !cancelBtn || !titleEl || !messageEl) {
      // Fallback to browser confirm if modal elements are not found
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;

    const close = (result) => {
      modal.classList.add('opacity-0', 'pointer-events-none');
      modalContent.classList.add('scale-95', 'opacity-0');
      resolve(result);
    };

    confirmBtn.onclick = () => close(true);
    cancelBtn.onclick = () => close(false);

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modalContent.classList.remove('scale-95', 'opacity-0');
  });
};

/**
 * Generic Modal Handler
 * @param {string} modalId - The ID of the modal element.
 */
export const createModalHandler = (modalId) => {
  const modal = document.getElementById(modalId);
  if (!modal) return { open: () => {}, close: () => {} }; // Return dummy functions if modal not found
  const modalContent = modal.querySelector('[id$="-content"]'); // e.g., product-modal-content
  const form = modal.querySelector('form');

  const open = () => {
    modal.classList.remove('pointer-events-none', 'opacity-0');
    if (modalContent) modalContent.classList.remove('scale-95', 'opacity-0');
  };

  const close = (onCloseCallback) => {
    modal.classList.add('opacity-0');
    if (modalContent) modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      modal.classList.add('pointer-events-none');
      if (form) form.reset();
      if (onCloseCallback) onCloseCallback();
    }, 300); // Match transition duration
  };

  // Add event listener for background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  return { open, close };
};

const setupModalBackgroundClick = (modalId, closeHandler) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeHandler(); });
};

/**
 * Animates a number counting up in an HTML element.
 * @param {HTMLElement} el The element to animate.
 * @param {number} target The target number.
 * @param {number} duration The duration of the animation in ms.
 * @param {boolean} isCurrency Whether to format as currency.
 */
const animateCountUp = (el, target, duration = 1500, isCurrency = false) => {
  let start = 0;
  const stepTime = Math.abs(Math.floor(duration / target)) || 50;
  const startTime = new Date().getTime();
  const endTime = startTime + duration;
  let timer;

  const run = () => {
    const now = new Date().getTime();
    const remaining = Math.max((endTime - now) / duration, 0);
    const value = Math.round(target - (remaining * target));
    const formatter = isCurrency ? new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }) : new Intl.NumberFormat('th-TH');
    el.textContent = formatter.format(value);
    if (value === target) clearInterval(timer);
  };
  timer = setInterval(run, stepTime);
  run();
};

/**
 * Logs an action to the audit_logs collection in Firestore.
 * @param {string} action - The action performed (e.g., 'CREATE_PRODUCT').
 * @param {object} details - An object containing details about the action.
 */
export const logAction = async (action, details) => {
  try {
    const user = localStorage.getItem('loggedInUser') || 'System';
    await addDoc(collection(db, 'audit_logs'), {
      timestamp: serverTimestamp(),
      user,
      action,
      details: JSON.stringify(details), // Store details as a JSON string
    });
  } catch (error) {
    console.error("Error logging action: ", error);
    // Fail silently, as logging is a secondary concern.
  }
};

// --- Products Page Logic ---
if (document.getElementById('products-table')) {
  const productsTable = document.getElementById('products-table');
  const productRowTemplate = document.getElementById('product-row');
  const refreshButton = document.getElementById('refresh-products');
  const productModalHandler = createModalHandler('product-modal');
  const productForm = document.getElementById('product-form');
  const productSearchInput = document.getElementById('product-search-input');
  const productTypeFilter = document.getElementById('product-type-filter');
  const productStatusFilter = document.getElementById('product-status-filter');
  let allProducts = []; // Cache for all products for searching
  let editingProductId = null; // To track if we are editing
  let productSort = { key: 'name', order: 'asc' };
  const renderProducts = (productsToRender) => {
    productsTable.innerHTML = ''; // Clear existing rows
    let totalStockCount = 0;
    let totalStockValue = 0;

    if (productsToRender.length === 0) {
      const colspan = productsTable.dataset.emptyColspan || 7;
      productsTable.innerHTML = `
        <tr>
          <td colspan="${colspan}" class="py-8 text-center text-slate-400">
            ไม่พบข้อมูลสินค้า
          </td>
        </tr>
      `;
      document.getElementById('filtered-stock-count').textContent = '0';
      document.getElementById('filtered-stock-value').textContent = '฿0';
      return;
    }

    const statusClasses = {
      'พร้อมขาย': 'bg-emerald-100 text-emerald-700',
      'รอผลิต': 'bg-amber-100 text-amber-700',
      'หมดชั่วคราว': 'bg-slate-100 text-slate-500',
    };

    productsToRender.forEach(product => {
      const productId = product.id;
      totalStockCount += product.stock || 0;
      totalStockValue += (product.stock || 0) * (product.price || 0);

      const row = productRowTemplate.content.cloneNode(true);

      // Highlight row if stock is low
      if (product.stock < 10) {
        const tr = row.querySelector('tr');
        tr.classList.remove('hover:bg-slate-50');
        tr.classList.add('bg-rose-50', 'hover:bg-rose-100');
      }

      row.querySelector('[data-field="id"]').textContent = productId;
      row.querySelector('[data-field="name"]').textContent = product.name;
      row.querySelector('[data-field="type"]').textContent = product.type;
      row.querySelector('[data-field="size"]').textContent = product.size;
      row.querySelector('[data-field="stock"]').textContent = product.stock;
      row.querySelector('[data-field="price"]').textContent = product.price;

      const statusElement = row.querySelector('[data-field="status"]');
      statusElement.textContent = product.status;
      const classes = statusClasses[product.status] || 'bg-slate-100 text-slate-500';
      statusElement.className += ' ' + classes;

      const editButton = row.querySelector('.edit-product');
      editButton.addEventListener('click', () => handleEditProduct(productId));

      productsTable.appendChild(row);
    });

    // Update summary footer
    document.getElementById('filtered-stock-count').textContent = new Intl.NumberFormat('th-TH').format(totalStockCount);
    document.getElementById('filtered-stock-value').textContent = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(totalStockValue);
  };

  const sortAndRenderProducts = () => {
    // 1. Sort the data
    allProducts.sort((a, b) => {
      const valA = a[productSort.key];
      const valB = b[productSort.key];
      const order = productSort.order === 'asc' ? 1 : -1;

      if (valA instanceof Timestamp && valB instanceof Timestamp) {
        return (valA.toMillis() - valB.toMillis()) * order;
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * order;
      }
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * order;
      }
      // Fallback for mixed types or nulls
      if (valA > valB) return 1 * order;
      if (valA < valB) return -1 * order;
      return 0;
    });

    // 2. Filter
    let filteredProducts = [...allProducts];

    // Type Filter
    const typeFilterValue = productTypeFilter.value;
    if (typeFilterValue) {
      filteredProducts = filteredProducts.filter(p => p.type === typeFilterValue);
    }

    // Status Filter
    const statusFilterValue = productStatusFilter.value;
    if (statusFilterValue) {
      filteredProducts = filteredProducts.filter(p => p.status === statusFilterValue);
    }

    // Search Term Filter
    const searchTerm = productSearchInput.value.toLowerCase().trim();
    if (searchTerm) {
      filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(searchTerm) || p.id.toLowerCase().includes(searchTerm));
    }

    // 3. Render the final list
    renderProducts(filteredProducts);
  };

  const listenForProductChanges = () => {
    // We no longer need orderBy in the query, as we sort client-side
    const productsQuery = query(collection(db, "products"));
    onSnapshot(productsQuery, 
      (querySnapshot) => {
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sortAndRenderProducts(); // Sort, filter, and render
      },
      (error) => {
        console.error("Error listening for product changes: ", error);
        const colspan = productsTable.dataset.emptyColspan || 1;
        productsTable.innerHTML = `<tr><td colspan="${colspan}" class="py-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
      }
    );
  };

  const onProductModalClose = () => {
      editingProductId = null;
      document.querySelector('#product-modal h2').textContent = 'เพิ่มสินค้า';
      productForm.reset();
      document.getElementById('delete-product-button').classList.add('hidden');
  };

  document.getElementById('open-product-modal')?.addEventListener('click', () => {
    onProductModalClose(); // Reset state before opening
    editingProductId = null;
    productForm.reset();
    document.querySelector('#product-modal h2').textContent = 'เพิ่มสินค้า';
    document.getElementById('delete-product-button').classList.add('hidden');
    productModalHandler.open();
  });
  document.getElementById('close-product-modal')?.addEventListener('click', () => productModalHandler.close(onProductModalClose));
  document.getElementById('cancel-product-modal')?.addEventListener('click', () => productModalHandler.close(onProductModalClose));

  const handleEditProduct = async (id) => {
    try {
      const docRef = doc(db, "products", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        editingProductId = id;
        const product = docSnap.data();
        productForm.id.value = id;
        productForm.id.readOnly = true;
        productForm.name.value = product.name || '';
        productForm.stock.value = product.stock || 0;
        productForm.price.value = product.price || 0;
        productForm.status.value = product.status || 'พร้อมขาย';
        productForm.type.value = product.type || 'ชาย';
        productForm.size.value = product.size || 'M';
        document.querySelector('#product-modal h2').textContent = 'แก้ไขสินค้า';
        document.getElementById('delete-product-button').classList.remove('hidden');
        productModalHandler.open();
      } else {
        showNotification("ไม่พบข้อมูลสินค้าที่ต้องการแก้ไข", "error");
      }
    } catch (error) {
      console.error("Error getting document:", error);
      showNotification("เกิดข้อผิดพลาดในการดึงข้อมูลเพื่อแก้ไข", "error");
    }
  };

  const resetProductForm = () => {
    productForm.reset();
    productForm.id.readOnly = false;
  }

  document.getElementById('delete-product-button')?.addEventListener('click', async () => {
    if (!editingProductId) {
      await logAction('DELETE_PRODUCT_FAILED', { reason: 'No ID' });
      showNotification('ไม่พบรหัสสินค้าที่ต้องการลบ', 'error');
      return;
    }
    const confirmed = await showConfirmation(`คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้ (${editingProductId.substring(0,8)})? การกระทำนี้ไม่สามารถย้อนกลับได้`);
    if (!confirmed) {
      return;
    }
    const deleteButton = document.getElementById('delete-product-button');
    deleteButton.disabled = true;
    deleteButton.textContent = 'กำลังลบ...';

    try {
      await deleteDoc(doc(db, "products", editingProductId));
      await logAction('DELETE_PRODUCT', { productId: editingProductId });
      showNotification('ลบสินค้าเรียบร้อยแล้ว');
      productModalHandler.close(onProductModalClose);
    } catch (error) {
      console.error("Error deleting product: ", error);
      showNotification('เกิดข้อผิดพลาดในการลบสินค้า', 'error');
    } finally {
      deleteButton.disabled = false;
      deleteButton.textContent = 'ลบสินค้า';
    }
  });

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = document.querySelector('button[type="submit"][form="product-form"]');
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';

    const id = productForm.id.value;
    const productData = {
      name: productForm.name.value,
      // id is not part of data, it's the document name
      stock: Number(productForm.stock.value) || 0,
      price: Number(productForm.price.value) || 0,
      status: productForm.status.value,
      type: productForm.type.value,
      size: productForm.size.value,
    };

    try {
      if (editingProductId) {
        // Exclude id from data to be updated
        const { id, ...updateData } = productData;
        await logAction('UPDATE_PRODUCT', { productId: editingProductId, data: updateData });
        await updateDoc(doc(db, "products", editingProductId), updateData);
        showNotification('อัปเดตข้อมูลสินค้าเรียบร้อยแล้ว');
      } else {
        const newProductRef = doc(db, "products", id);
        const docSnap = await getDoc(newProductRef);
        if (docSnap.exists()) {
          await logAction('CREATE_PRODUCT_FAILED', { reason: 'ID exists', productId: id });
          showNotification('รหัสสินค้านี้มีอยู่แล้วในระบบ', 'error');
          throw new Error("Product ID already exists.");
        }
        // Use setDoc with the user-provided ID
        await setDoc(newProductRef, productData);
        showNotification('เพิ่มสินค้าใหม่เรียบร้อยแล้ว');
      }
      await logAction('CREATE_PRODUCT', { productId: id, data: productData });
      productModalHandler.close(onProductModalClose);
    } catch (error) {
      console.error("Error saving product: ", error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'บันทึกสินค้า';
      resetProductForm();
    }
  });

  document.querySelectorAll('#products-table th[data-sort]').forEach(headerCell => {
    headerCell.addEventListener('click', () => {
      const sortKey = headerCell.dataset.sort;
      if (productSort.key === sortKey) {
        productSort.order = productSort.order === 'asc' ? 'desc' : 'asc';
      } else {
        productSort.key = sortKey;
        productSort.order = 'asc';
      }
      updateSortUI('products-table', productSort);
      sortAndRenderProducts();
    });
  });

  productForm.addEventListener('reset', resetProductForm);
  updateSortUI('products-table', productSort);
  listenForProductChanges();
  productSearchInput.addEventListener('input', sortAndRenderProducts);
  productTypeFilter?.addEventListener('change', sortAndRenderProducts);
  productStatusFilter?.addEventListener('change', sortAndRenderProducts);
  refreshButton.addEventListener('click', () => showNotification('ข้อมูลอัปเดตอัตโนมัติแบบเรียลไทม์'));
}

// --- Orders Page Logic ---
if (document.getElementById('orders-table')) {
  const ordersTable = document.getElementById('orders-table');
  const orderRowTemplate = document.getElementById('order-row');
  const refreshButton = document.getElementById('refresh-orders');
  const orderForm = document.getElementById('order-form');
  const orderSearchInput = document.getElementById('order-search-input');
  const orderModalHandler = createModalHandler('order-modal');
  const dateFilterStart = document.getElementById('date-filter-start');
  const dateFilterEnd = document.getElementById('date-filter-end');
  const productSelect = document.getElementById('order-product-select');
  const exportButton = document.getElementById('export-orders-button');
  let editingOrderId = null;
  let allOrders = []; // Cache for all orders for searching
  let orderSort = { key: 'date', order: 'desc' };
  let productsCache = [];
  
  const statusClasses = {
    'รอดำเนินการ': 'bg-amber-100 text-amber-700',
    'กำลังผลิต': 'bg-indigo-100 text-indigo-700',
    'ชำระแล้ว': 'bg-emerald-100 text-emerald-700',
    'ส่งของแล้ว': 'bg-sky-100 text-sky-700',
    'ยกเลิก': 'bg-rose-100 text-rose-700',
  };
  
  const statusMapping = {
    'pending': 'รอดำเนินการ',
    'in-production': 'กำลังผลิต',
    'paid': 'ชำระแล้ว',
    'shipped': 'ส่งของแล้ว',
    'cancelled': 'ยกเลิก',
    'split': 'แบ่งชำระ',
  };
  
  const paymentMapping = {
    'bank': 'โอนธนาคาร',
    'cash': 'เงินสด',
    'credit': 'บัตรเครดิต'
  };

  const renderOrders = (ordersToRender) => {
    ordersTable.innerHTML = '';
    if (ordersToRender.length === 0) {
      ordersTable.innerHTML = `<tr><td colspan="${ordersTable.dataset.emptyColspan || 9}" class="py-8 text-center text-slate-400">ไม่พบข้อมูลคำสั่งซื้อ</td></tr>`;
      return;
    }
    ordersToRender.forEach(order => {
      const orderId = order.id;
      const row = orderRowTemplate.content.cloneNode(true);
      row.querySelector('tr').dataset.orderId = orderId;
      row.querySelector('[data-field="id"]').textContent = orderId;
      row.querySelector('[data-field="name"]').textContent = order.customerName;
      row.querySelector('[data-field="type-shirt"]').textContent = order.productName;
      row.querySelector('[data-field="payment"]').textContent = paymentMapping[order.payment] || order.payment;
      row.querySelector('[data-field="quantity"]').textContent = order.quantity;
      row.querySelector('[data-field="total"]').textContent = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(order.total);
      
      // Calculate and display the full total price correctly
      const fullTotalValue = order.fullTotal ?? (order.status === 'split' && order.installments 
          ? order.total * order.installments.count 
          : order.total);
      row.querySelector('[data-field="fullTotal"]').textContent = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(fullTotalValue);

      // Display payment date
      const paymentDateEl = row.querySelector('[data-field="paymentDate"]');
      if (order.paymentDate && order.paymentDate.toDate) {
        paymentDateEl.textContent = order.paymentDate.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
      } else {
        paymentDateEl.textContent = '-';
      }
      row.querySelector('[data-field="date"]').textContent = order.date.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
      const statusElement = row.querySelector('[data-field="status"]');
      let statusText = statusMapping[order.status] || order.status;

      if (order.status === 'split' && order.installments) {
        statusText = `${statusText} (${order.installments.number}/${order.installments.count})`;
      }

      statusElement.textContent = statusText;
      statusElement.className += ' ' + (statusClasses[statusMapping[order.status]] || 'bg-slate-100 text-slate-500');
      row.querySelector('.edit-order').addEventListener('click', () => handleEditOrder(orderId));
      // Delete button is now in the modal
      ordersTable.appendChild(row);
    });
  };

  const sortAndRenderOrders = () => {
    // 1. Sort
    allOrders.sort((a, b) => {
      const valA = a[orderSort.key];
      const valB = b[orderSort.key]
      const order = orderSort.order === 'asc' ? 1 : -1;

      if (valA instanceof Timestamp && valB instanceof Timestamp) {
        return (valA.toMillis() - valB.toMillis()) * order;
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * order;
      }
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * order;
      }
      if (valA > valB) return 1 * order;
      if (valA < valB) return -1 * order;
      return 0;
    });

    // 2. Filter
    let filteredOrders = [...allOrders]; // Start with all sorted orders

    // Date Range Filter
    const startDate = dateFilterStart.value ? new Date(dateFilterStart.value) : null;
    const endDate = dateFilterEnd.value ? new Date(dateFilterEnd.value) : null;

    if (startDate) {
      startDate.setHours(0, 0, 0, 0); // Set to start of the day
      filteredOrders = filteredOrders.filter(order => order.date.toDate() >= startDate);
    }
    if (endDate) {
      endDate.setHours(23, 59, 59, 999); // Set to end of the day
      filteredOrders = filteredOrders.filter(order => order.date.toDate() <= endDate);
    }

    // Search Term Filter
    const searchTerm = orderSearchInput.value.toLowerCase().trim();
    if (searchTerm) {
      filteredOrders = filteredOrders.filter(order =>
          order.customerName.toLowerCase().includes(searchTerm) ||
          (order.productName && order.productName.toLowerCase().includes(searchTerm))
        );
    }

    // 3. Render
    renderOrders(filteredOrders);
  };

  const listenForOrderChanges = () => {
    // We no longer need orderBy in the query, as we sort client-side
    const ordersQuery = query(collection(db, "orders"));
    onSnapshot(ordersQuery, (querySnapshot) => {
      allOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sortAndRenderOrders();
    }, (error) => {
      console.error("Error listening for order changes: ", error);
      ordersTable.innerHTML = `<tr><td colspan="${ordersTable.dataset.emptyColspan}" class="py-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
    });
  };

  const onOrderModalClose = () => {
      editingOrderId = null;
      document.querySelector('#order-modal h2').textContent = 'เพิ่ม / แก้ไขคำสั่งซื้อ';
      orderForm.reset();
      document.getElementById('delete-order-button').classList.add('hidden');
      setInitialFormValues();
  };

  document.getElementById('open-order-modal')?.addEventListener('click', () => {
    editingOrderId = null;
    onOrderModalClose(); // Reset state before opening
    document.querySelector('#order-modal h2').textContent = 'เพิ่มคำสั่งซื้อ';
    document.getElementById('delete-order-button').classList.add('hidden');
    orderForm.reset(); // Reset the form first
    setInitialFormValues();
    orderModalHandler.open();
  });
  document.getElementById('close-order-modal')?.addEventListener('click', () => orderModalHandler.close(onOrderModalClose));
  document.getElementById('cancel-order-modal')?.addEventListener('click', () => orderModalHandler.close(onOrderModalClose));
  
  const handleEditOrder = async (id) => {
    try {
      const docRef = doc(db, "orders", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        editingOrderId = id;
        const order = docSnap.data();
        orderForm.name.value = order.customerName || '';
        orderForm.productId.value = order.productId || '';
        orderForm.quantity.value = order.quantity || 0;
        orderForm.payment.value = order.payment || 'bank';

        // When editing, if the original product is out of stock, disable other options
        // but keep the current one selectable.
        const productOption = productSelect.querySelector(`option[value="${order.productId}"]`);
        if (productOption && productOption.disabled) {
            productOption.disabled = false; // Temporarily enable it
        }

        orderForm.status.value = order.status || 'pending';
        if (order.status === 'split' && order.installments) {
          orderForm.installmentsCount.value = order.installments.count;
          orderForm.installmentNumber.value = order.installments.number;
        } else {
          // Reset to default if not a split payment
          orderForm.installmentsCount.value = '2';
          orderForm.installmentNumber.value = '1';
        }
        orderForm.date.value = order.date.toDate().toISOString().split('T')[0];
        orderForm.paymentDate.value = order.paymentDate ? order.paymentDate.toDate().toISOString().split('T')[0] : '';
        calculateTotal();
        document.querySelector('#order-modal h2').textContent = 'แก้ไขคำสั่งซื้อ';
        document.getElementById('delete-order-button').classList.remove('hidden');
        orderModalHandler.open();
      }
    } catch (error) {
      console.error("Error getting order for edit:", error);
      showNotification("เกิดข้อผิดพลาดในการดึงข้อมูลคำสั่งซื้อ", "error");
    }
  };
  
  const handleDeleteOrder = async (orderId, productId, quantity) => {
    if (!showConfirmation(`คุณแน่ใจหรือไม่ว่าต้องการลบคำสั่งซื้อนี้ (${orderId.substring(0, 8)})? การลบจะคืนสต็อกสินค้ากลับเข้าระบบ`)) {
      return;
    }
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", orderId);
        const productRef = doc(db, "products", productId);
        transaction.update(productRef, { stock: increment(quantity) });
        transaction.delete(orderRef);
      });
      showNotification('ลบคำสั่งซื้อและคืนสต็อกเรียบร้อยแล้ว');
      // Real-time listener will auto-update the UI
    } catch (error) {
      console.error("Error deleting order and restoring stock: ", error);
      showNotification(`เกิดข้อผิดพลาดในการลบคำสั่งซื้อ`, 'error');
    }
  };

  document.getElementById('delete-order-button')?.addEventListener('click', async () => {
    if (!editingOrderId) {
      showNotification('ไม่พบรหัสคำสั่งซื้อที่ต้องการลบ', 'error');
      return;
    }
    // We need to fetch the order again to get product ID and quantity for stock restoration
    try {
      const orderRef = doc(db, "orders", editingOrderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const { productId, quantity } = orderSnap.data();
        await handleDeleteOrder(editingOrderId, productId, quantity);
        orderModalHandler.close(onOrderModalClose);
      } else {
        throw new Error("Order not found for deletion.");
      }
    } catch (error) {
      showNotification('เกิดข้อผิดพลาดในการลบ: ' + error.message, 'error');
    }
  });

  const calculateTotal = () => {
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const price = Number(selectedOption.dataset.price) || 0;
    const quantity = Number(orderForm.quantity.value) || 0;
    const fullTotal = price * quantity;

    const status = orderForm.status.value;
    const installmentsCount = Number(orderForm.installmentsCount.value) || 2;

    if (status === 'split') {
      orderForm.total.value = (fullTotal / installmentsCount).toFixed(2);
      document.getElementById('split-payment-fields').classList.remove('hidden');
    } else {
      orderForm.total.value = fullTotal;
      document.getElementById('split-payment-fields').classList.add('hidden');
    }
  };

  const setInitialFormValues = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;
    
    const dateInput = orderForm.querySelector('input[name="date"]');
    if (dateInput) dateInput.value = todayString;

    // Also set payment date by default
    const paymentDateInput = orderForm.querySelector('input[name="paymentDate"]');
    if (paymentDateInput) paymentDateInput.value = todayString;
  };

  const populateProductsDropdown = async () => {
    try {
      const productsQuery = query(collection(db, "products"), orderBy("name"));
      const querySnapshot = await getDocs(productsQuery);
      productsCache = [];
      productSelect.innerHTML = '<option value="">-- กรุณาเลือกสินค้า --</option>';
      querySnapshot.forEach(doc => {
        const product = doc.data();
        productsCache.push({ id: doc.id, ...product });
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${product.name} - ${product.size} (${product.type}) [คงเหลือ: ${product.stock}]`;
        option.dataset.price = product.price;
        // Disable product if stock is 0
        if (product.stock <= 0) {
          option.disabled = true;
          option.textContent += ' (สินค้าหมด)';
        }
        productSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Error fetching products for dropdown: ", error);
      productSelect.innerHTML = '<option value="">-- ไม่สามารถโหลดสินค้าได้ --</option>';
    }
  };

  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = document.querySelector('button[type="submit"][form="order-form"]');
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';

    const quantity = Number(orderForm.quantity.value) || 0;
    const productId = orderForm.productId.value;
    
    if (!productId || quantity <= 0) {
      showNotification('กรุณาเลือกสินค้าและระบุจำนวนให้ถูกต้อง', 'error');
      submitButton.disabled = false;
      submitButton.textContent = 'บันทึก';
      return;
    }

    try { 
      const selectedProduct = productsCache.find(p => p.id === productId);
      const price = selectedProduct?.price || 0;
      const fullTotal = price * quantity;
      const orderData = {
        customerName: orderForm.name.value,
        productId: productId,
        productName: selectedProduct ? `${selectedProduct.name} - ${selectedProduct.size}` : 'N/A',
        date: Timestamp.fromDate(new Date(orderForm.date.value || Date.now())),
        paymentDate: orderForm.paymentDate.value ? Timestamp.fromDate(new Date(orderForm.paymentDate.value)) : null,
        fullTotal: fullTotal,
        payment: orderForm.payment.value,
        status: orderForm.status.value,
        quantity: quantity,
        total: Number(orderForm.total.value) || 0,
      };

      // Add installment data if status is 'split'
      if (orderData.status === 'split') {
        orderData.installments = {
          count: Number(orderForm.installmentsCount.value),
          number: Number(orderForm.installmentNumber.value)
        };
      }

      if (editingOrderId) {
        // Use a transaction to ensure stock and order are updated atomically
        await runTransaction(db, async (transaction) => {
          const orderRef = doc(db, "orders", editingOrderId);
          const oldOrderSnap = await transaction.get(orderRef);
          const oldOrderData = oldOrderSnap.data();
          
          // --- ALL READS MUST HAPPEN BEFORE WRITES ---
          // 1. Read the new product document to check its stock.
          let newProductSnap = null;
          if (orderData.status !== 'cancelled') {
            const newProductRef = doc(db, "products", orderData.productId);
            newProductSnap = await transaction.get(newProductRef);
            if (!newProductSnap.exists()) throw "ไม่พบสินค้าที่เลือก";
          }

          // --- ALL WRITES HAPPEN AFTER READS ---
          // 2. Revert stock for the old order item, if it wasn't cancelled.
          if (oldOrderData.status !== 'cancelled') {
            const oldProductRef = doc(db, "products", oldOrderData.productId);
            transaction.update(oldProductRef, { stock: increment(oldOrderData.quantity) });
          }

          // 3. Decrement stock for the new order item, if it's not being cancelled.
          if (orderData.status !== 'cancelled') {
            const newProductRef = doc(db, "products", orderData.productId);
            const isSameProduct = orderData.productId === oldOrderData.productId;
            const currentStock = newProductSnap.data().stock;
            const availableStock = currentStock + (isSameProduct && oldOrderData.status !== 'cancelled' ? oldOrderData.quantity : 0);
            if (availableStock < orderData.quantity) throw `สินค้าไม่เพียงพอ (มีในสต็อก ${currentStock} ชิ้น)`;
            transaction.update(newProductRef, { stock: increment(-orderData.quantity) });
          }
          transaction.update(orderRef, orderData);
        });
        await logAction('UPDATE_ORDER', { orderId: editingOrderId, data: orderData });
        showNotification('อัปเดตคำสั่งซื้อและสต็อกเรียบร้อยแล้ว');
      } else {
        // Create a new order with a custom date-based ID
        await runTransaction(db, async (transaction) => {
          // --- ALL READS MUST HAPPEN BEFORE WRITES ---
          const today = new Date();
          const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

          // 1. Read the daily counter
          const counterRef = doc(db, "counters", `orders_${datePrefix}`);
          const counterSnap = await transaction.get(counterRef);

          // 2. Read the product stock
          const productRef = doc(db, "products", productId);
          const productDoc = await transaction.get(productRef);
          if (!productDoc.exists()) throw "ไม่พบสินค้านี้ในระบบ";

          // --- ALL WRITES HAPPEN AFTER READS ---
          // 3. Check stock and throw error if not enough
          const currentStock = productDoc.data().stock;
          if (currentStock < quantity) throw `สินค้าไม่เพียงพอ (มีในสต็อก ${currentStock} ชิ้น)`;

          // 4. Calculate new order ID and update counter
          const newCount = (counterSnap.exists() ? counterSnap.data().lastNumber : 0) + 1;
          transaction.set(counterRef, { lastNumber: newCount });
          const newOrderId = `${datePrefix}-${String(newCount).padStart(4, '0')}`;

          // 5. Update stock and create the new order
          transaction.update(productRef, { stock: increment(-quantity) });
          const newOrderRef = doc(db, "orders", newOrderId);
          transaction.set(newOrderRef, orderData);
          await logAction('CREATE_ORDER', { orderId: newOrderId, data: orderData });
        });
        showNotification('บันทึกคำสั่งซื้อและตัดสต็อกเรียบร้อยแล้ว');
      }
      orderModalHandler.close(onOrderModalClose);
    } catch (error) {
      console.error("Error saving order: ", error);
      showNotification(`เกิดข้อผิดพลาด: ${error.message || error}`, 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'บันทึก';
    }
  });

  const handleExportOrders = async () => {
    exportButton.disabled = true;
    exportButton.textContent = 'กำลังเตรียม...';

    try {
      // Dynamically import the XLSX library
      const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js');

      const searchTerm = orderSearchInput.value.toLowerCase().trim();
      const filteredOrders = !searchTerm 
        ? allOrders
        : allOrders.filter(order =>
            order.customerName.toLowerCase().includes(searchTerm) ||
            (order.productName && order.productName.toLowerCase().includes(searchTerm))
          );

      if (filteredOrders.length === 0) {
        showNotification('ไม่มีข้อมูลคำสั่งซื้อให้ Export', 'error');
        return;
      }

      const exportData = filteredOrders.map(order => ({
        'รหัสคำสั่งซื้อ': order.id,
        'ชื่อลูกค้า': order.customerName,
        'สินค้า': order.productName,
        'จำนวน': order.quantity,
        'ยอดรวม': order.total,
        'วิธีชำระเงิน': paymentMapping[order.payment] || order.payment,
        'สถานะ': statusMapping[order.status] || order.status,
        'วันที่สั่ง': order.date.toDate().toLocaleDateString('th-TH', { year: '2-digit', month: '2-digit', day: '2-digit' }),
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
      worksheet['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `orders-export-${today}.xlsx`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      showNotification('เกิดข้อผิดพลาดในการ Export', 'error');
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = 'Export to Excel';
    }
  };

  setInitialFormValues();
  updateSortUI('orders-table', orderSort); // Set initial sort UI
  populateProductsDropdown();
  listenForOrderChanges();
  orderSearchInput.addEventListener('input', sortAndRenderOrders);
  productSelect.addEventListener('change', calculateTotal);
  orderForm.installmentsCount.addEventListener('change', calculateTotal);
  orderForm.status.addEventListener('change', calculateTotal);
  orderForm.quantity.addEventListener('input', calculateTotal);
  dateFilterStart?.addEventListener('change', sortAndRenderOrders);
  dateFilterEnd?.addEventListener('change', sortAndRenderOrders);
  document.getElementById('clear-date-filter')?.addEventListener('click', () => {
    dateFilterStart.value = '';
    dateFilterEnd.value = '';
    sortAndRenderOrders();
  });

  exportButton?.addEventListener('click', handleExportOrders);
  // Reset is handled by the modal close function now.

  document.querySelectorAll('#orders-table th[data-sort]')?.forEach(headerCell => {
    headerCell.addEventListener('click', () => {
      const sortKey = headerCell.dataset.sort;
      if (orderSort.key === sortKey) {
        orderSort.order = orderSort.order === 'asc' ? 'desc' : 'asc';
      } else {
        orderSort.key = sortKey;
        orderSort.order = 'asc';
      }
      updateSortUI('orders-table', orderSort);
      sortAndRenderOrders();
    });
  });
}

// Setup background click for the confirmation modal
const confirmationModal = document.getElementById('confirmation-modal');
if (confirmationModal) {
    setupModalBackgroundClick('confirmation-modal', () => confirmationModal.querySelector('#confirmation-cancel-button').click());
}

// --- Dashboard Page Logic ---
if (document.getElementById('dashboard-stats')) {
  const totalSalesEl = document.getElementById('total-sales');
  const totalOrdersEl = document.getElementById('total-orders');
  const monthlySalesChartCanvas = document.getElementById('monthly-sales-chart');
  const paymentTypeChartCanvas = document.getElementById('payment-type-chart');
  let monthlySalesChart = null;
  let paymentTypeChart = null;

  const updateMonthlySalesChart = (orders) => {
    if (!monthlySalesChartCanvas) return;

    const salesByMonth = {};
    const monthLabels = [];

    // Generate labels for the last 12 months
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month).padStart(2, '0')}`;
      monthLabels.push(d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }));
      salesByMonth[key] = 0;
    }

    // Sum sales for each month
    orders
      .filter(order => order.status === 'paid' || order.status === 'split')
      .forEach(order => {
        const orderDate = order.date.toDate();
        const year = orderDate.getFullYear();
        const month = orderDate.getMonth();
        const key = `${year}-${String(month).padStart(2, '0')}`;
        if (key in salesByMonth) {
          salesByMonth[key] += order.total || 0;
        }
      });

    const chartData = Object.values(salesByMonth);

    if (monthlySalesChart) {
      // Update existing chart
      monthlySalesChart.data.labels = monthLabels;
      monthlySalesChart.data.datasets[0].data = chartData;
      monthlySalesChart.update();
    } else {
      // Create new chart
      const ctx = monthlySalesChartCanvas.getContext('2d');
      monthlySalesChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [{
            label: 'ยอดขาย',
            data: chartData,
            backgroundColor: 'rgba(16, 185, 129, 0.6)', // emerald-500 with opacity
            borderColor: 'rgba(5, 150, 105, 1)', // emerald-600
            borderWidth: 1
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }
  };

  const updatePaymentTypeChart = (orders) => {
    if (!paymentTypeChartCanvas) return;

    const salesByPayment = {
      'bank': 0,
      'cash': 0,
      'credit': 0,
    };

    orders
      .filter(order => order.status === 'paid' || order.status === 'split')
      .forEach(order => {
        const paymentMethod = order.payment || 'bank'; // Default to bank if not specified
        if (paymentMethod in salesByPayment) {
          salesByPayment[paymentMethod] += order.total || 0;
        }
      });

    const paymentMapping = {
      'bank': 'โอนธนาคาร',
      'cash': 'เงินสด',
      'credit': 'บัตรเครดิต'
    };

    const chartLabels = Object.keys(salesByPayment).map(key => paymentMapping[key]);
    const chartData = Object.values(salesByPayment);

    if (paymentTypeChart) {
      paymentTypeChart.data.labels = chartLabels;
      paymentTypeChart.data.datasets[0].data = chartData;
      paymentTypeChart.update();
    } else {
      const ctx = paymentTypeChartCanvas.getContext('2d');
      paymentTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: chartLabels,
          datasets: [{
            label: 'ยอดขาย',
            data: chartData,
            backgroundColor: [
              'rgba(59, 130, 246, 0.7)', // blue-500
              'rgba(16, 185, 129, 0.7)', // emerald-500
              'rgba(249, 115, 22, 0.7)',  // orange-500
            ],
            borderColor: ['#fff'],
            borderWidth: 2,
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  };

  const updateTopCustomers = (orders) => {
    const listEl = document.getElementById('top-customers-list');
    if (!listEl) return;

    const customerTotals = {};

    orders
      .filter(order => order.status !== 'cancelled' && order.customerName)
      .forEach(order => {
        const name = order.customerName.trim();
        // Use fullTotal for accurate sum, fallback to total if not present
        const amount = order.fullTotal ?? order.total ?? 0;
        if (!customerTotals[name]) {
          customerTotals[name] = 0;
        }
        customerTotals[name] += amount;
      });

    const sortedCustomers = Object.entries(customerTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5); // Get top 5

    listEl.innerHTML = ''; // Clear current list

    if (sortedCustomers.length === 0) {
      listEl.innerHTML = '<li class="py-4 text-center text-slate-400">ยังไม่มีข้อมูลลูกค้า</li>';
      return;
    }

    sortedCustomers.forEach(([name, total], index) => {
      const li = document.createElement('li');
      li.className = 'flex items-center justify-between text-sm';
      li.innerHTML = `
        <span class="font-medium text-slate-800">${index + 1}. ${name}</span>
        <span class="font-semibold text-emerald-600">${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(total)}</span>
      `;
      listEl.appendChild(li);
    });
  };

  const updateLowStockProducts = (products) => {
    const listEl = document.getElementById('low-stock-list');
    if (!listEl) return;

    const lowStockItems = products
      .filter(p => p.stock < 10)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 5);

    listEl.innerHTML = '';

    if (lowStockItems.length === 0) {
      listEl.innerHTML = '<li class="py-4 text-center text-slate-400">ไม่มีสินค้าใกล้หมด</li>';
      return;
    }

    lowStockItems.forEach(product => {
      const li = document.createElement('li');
      li.className = 'flex items-center justify-between text-sm';
      li.innerHTML = `
        <div>
          <p class="font-medium text-slate-800">${product.name} (${product.size})</p>
          <p class="text-xs text-slate-500">${product.id}</p>
        </div>
        <span class="font-bold text-rose-600">${product.stock} ชิ้น</span>
      `;
      listEl.appendChild(li);
    });
  };

  const updateRecentOrders = (orders) => {
    const listEl = document.getElementById('recent-orders-list');
    if (!listEl) return;

    const recentOrders = orders
      .sort((a, b) => b.date.toMillis() - a.date.toMillis())
      .slice(0, 5);

    listEl.innerHTML = '';

    if (recentOrders.length === 0) {
      listEl.innerHTML = '<div class="py-4 text-center text-slate-400">ยังไม่มีคำสั่งซื้อ</div>';
      return;
    }

    recentOrders.forEach(order => {
      const div = document.createElement('div');
      div.className = 'flex items-start justify-between text-sm'; // Use items-start for better alignment
      const orderDate = order.date.toDate().toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
      const paymentMapping = {
        'bank': 'โอนธนาคาร',
        'cash': 'เงินสด',
        'credit': 'บัตรเครดิต'
      };
      const paymentText = paymentMapping[order.payment] || order.payment;
      div.innerHTML = `
        <div>
          <p class="font-medium text-slate-800">${order.customerName}</p>
          <p class="text-xs text-slate-500">${order.productName} <span class="text-slate-400">&bull;</span> ${paymentText}</p>
        </div>
        <div class="text-right">
          <p class="font-semibold text-emerald-600">${new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(order.fullTotal || order.total)}</p>
          <p class="text-xs text-slate-400">${orderDate}</p>
        </div>
      `;
      listEl.appendChild(div);
    });
  };

  const calculateDashboardStats = (orders) => {
    // Calculate total sales from 'paid' and 'split' orders
    const totalSales = orders
      .filter(order => order.status === 'paid' || order.status === 'split')
      .reduce((sum, order) => sum + (order.total || 0), 0);

    // Calculate total number of non-cancelled orders
    const totalOrders = orders.filter(order => order.status !== 'cancelled').length;

    // Update UI
    animateCountUp(totalSalesEl, totalSales, 1500, true);
    animateCountUp(totalOrdersEl, totalOrders, 1500, false);
  };

  const listenForDashboardChanges = () => {
    const ordersQuery = query(collection(db, "orders"));
    onSnapshot(ordersQuery, 
      (ordersSnapshot) => {
        const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateMonthlySalesChart(allOrders);
        updatePaymentTypeChart(allOrders);
        calculateDashboardStats(allOrders);
        updateTopCustomers(allOrders);
        updateRecentOrders(allOrders);
      },
      (error) => {
        console.error("Error listening for dashboard data: ", error);
        totalSalesEl.textContent = 'Error';
        totalOrdersEl.textContent = 'Error';
      }
    );

    const productsQuery = query(collection(db, "products"));
    onSnapshot(productsQuery, (productsSnapshot) => {
        const allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateLowStockProducts(allProducts);
      },
      (error) => {
        console.error("Error listening for dashboard data: ", error);
        totalSalesEl.textContent = 'Error';
        totalOrdersEl.textContent = 'Error';
      }
    );
  };

  listenForDashboardChanges();
}

// --- Audit Log Page Logic ---
if (document.getElementById('audit-log-table')) {
  const logTable = document.getElementById('audit-log-table');
  const logRowTemplate = document.getElementById('log-row-template');

  const renderLogs = (logs) => {
    logTable.innerHTML = '';
    if (logs.length === 0) {
      logTable.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 dark:text-slate-500">ไม่พบประวัติการแก้ไข</td></tr>`;
      return;
    }

    logs.forEach(log => {
      const row = logRowTemplate.content.cloneNode(true);
      const timestamp = log.timestamp?.toDate() ?? new Date();
      const formattedTimestamp = timestamp.toLocaleString('th-TH', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });

      row.querySelector('[data-field="timestamp"]').textContent = formattedTimestamp;
      row.querySelector('[data-field="user"]').textContent = log.user;
      row.querySelector('[data-field="action"]').textContent = log.action;
      row.querySelector('[data-field="details"]').textContent = log.details;

      logTable.appendChild(row);
    });
  };

  const listenForLogs = () => {
    const logsQuery = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(100));
    onSnapshot(logsQuery, 
      (querySnapshot) => {
        const allLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderLogs(allLogs);
      },
      (error) => {
        console.error("Error listening for audit logs: ", error);
        logTable.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดประวัติ</td></tr>`;
      }
    );
  };

  listenForLogs();
}
