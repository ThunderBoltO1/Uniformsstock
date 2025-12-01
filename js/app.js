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
  increment,
  onSnapshot, 
  Timestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Products Page Logic ---
if (document.getElementById('products-table')) {
  const productsTable = document.getElementById('products-table');
  const productRowTemplate = document.getElementById('product-row');
  const refreshButton = document.getElementById('refresh-products');
  const productModal = document.getElementById('product-modal');
  const productForm = document.getElementById('product-form');
  const productSearchInput = document.getElementById('product-search-input');
  let allProducts = []; // Cache for all products for searching
  let editingProductId = null; // To track if we are editing
  let productSort = { key: 'name', order: 'asc' };
  
  const statusClasses = {
    'พร้อมขาย': 'bg-emerald-100 text-emerald-700',
    'รอผลิต': 'bg-amber-100 text-amber-700',
    'หมดชั่วคราว': 'bg-slate-100 text-slate-500',
  };

  const renderProducts = (productsToRender) => {
    productsTable.innerHTML = ''; // Clear existing rows
    if (productsToRender.length === 0) {
      const colspan = productsTable.dataset.emptyColspan || 7;
      productsTable.innerHTML = `
        <tr>
          <td colspan="${colspan}" class="py-8 text-center text-slate-400">
            ยังไม่มีข้อมูลสินค้าในระบบ
          </td>
        </tr>
      `;
      return;
    }

    productsToRender.forEach(product => {
      const productId = product.id;
      const row = productRowTemplate.content.cloneNode(true);

      row.querySelector('[data-field="id"]').textContent = productId.substring(0, 8);
      row.querySelector('[data-field="name"]').textContent = product.name;
      row.querySelector('[data-field="category"]').textContent = product.category;
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

    // 2. Filter the (now sorted) data
    const searchTerm = productSearchInput.value.toLowerCase().trim();
    const filteredProducts = !searchTerm
      ? allProducts
      : allProducts.filter(product => 
          product.name.toLowerCase().includes(searchTerm) ||
          product.category.toLowerCase().includes(searchTerm)
        );

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

  const openModal = () => {
    const modalContent = document.getElementById('product-modal-content');
    productModal.classList.remove('pointer-events-none', 'opacity-0');
    modalContent.classList.remove('scale-95', 'opacity-0');
  };

  const closeModal = () => {
    const modalContent = document.getElementById('product-modal-content');
    productModal.classList.add('opacity-0');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      productModal.classList.add('pointer-events-none');
      productForm.reset();
      editingProductId = null;
      document.querySelector('#product-modal h2').textContent = 'เพิ่มสินค้า';
      document.getElementById('delete-product-button').classList.add('hidden');
    }, 300); // Match duration of transition
  };

  document.getElementById('open-product-modal').addEventListener('click', () => {
    editingProductId = null;
    productForm.reset();
    document.querySelector('#product-modal h2').textContent = 'เพิ่มสินค้า';
    document.getElementById('delete-product-button').classList.add('hidden');
    openModal();
  });
  document.getElementById('close-product-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-product-modal').addEventListener('click', closeModal);

  const handleEditProduct = async (id) => {
    try {
      const docRef = doc(db, "products", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        editingProductId = id;
        const product = docSnap.data();
        productForm.name.value = product.name || '';
        productForm.category.value = product.category || '';
        productForm.stock.value = product.stock || 0;
        productForm.price.value = product.price || 0;
        productForm.status.value = product.status || 'พร้อมขาย';
        document.querySelector('#product-modal h2').textContent = 'แก้ไขสินค้า';
        document.getElementById('delete-product-button').classList.remove('hidden');
        openModal();
      } else {
        alert("ไม่พบข้อมูลสินค้าที่ต้องการแก้ไข");
      }
    } catch (error) {
      console.error("Error getting document:", error);
      alert("เกิดข้อผิดพลาดในการดึงข้อมูลเพื่อแก้ไข");
    }
  };

  document.getElementById('delete-product-button')?.addEventListener('click', async () => {
    if (!editingProductId) {
      alert('เกิดข้อผิดพลาด: ไม่พบรหัสสินค้าที่ต้องการลบ');
      return;
    }
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้ (${editingProductId.substring(0,8)})? การกระทำนี้ไม่สามารถย้อนกลับได้`)) {
      return;
    }
    const deleteButton = document.getElementById('delete-product-button');
    deleteButton.disabled = true;
    deleteButton.textContent = 'กำลังลบ...';

    try {
      await deleteDoc(doc(db, "products", editingProductId));
      alert('ลบสินค้าเรียบร้อยแล้ว');
      closeModal();
    } catch (error) {
      console.error("Error deleting product: ", error);
      alert('เกิดข้อผิดพลาดในการลบสินค้า');
    } finally {
      deleteButton.disabled = false;
      deleteButton.textContent = 'ลบสินค้า';
    }
  });

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';

    const productData = {
      name: productForm.name.value,
      category: productForm.category.value,
      stock: Number(productForm.stock.value) || 0,
      price: Number(productForm.price.value) || 0,
      status: productForm.status.value,
    };

    try {
      if (editingProductId) {
        await updateDoc(doc(db, "products", editingProductId), productData);
        alert('อัปเดตข้อมูลสินค้าเรียบร้อยแล้ว');
      } else {
        await addDoc(collection(db, "products"), productData);
        alert('เพิ่มสินค้าใหม่เรียบร้อยแล้ว');
      }
      closeModal();
    } catch (error) {
      console.error("Error saving product: ", error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'บันทึกสินค้า';
    }
  });

  const updateSortUI = (tableId, sortState) => {
    document.querySelectorAll(`#${tableId} th[data-sort]`).forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === sortState.key) {
        th.classList.add(sortState.order === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });
  };

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

  listenForProductChanges();
  productSearchInput.addEventListener('input', sortAndRenderProducts);
  refreshButton.addEventListener('click', () => alert('ข้อมูลอัปเดตอัตโนมัติแบบเรียลไทม์'));
}

// --- Orders Page Logic ---
if (document.getElementById('orders-table')) {
  const ordersTable = document.getElementById('orders-table');
  const orderRowTemplate = document.getElementById('order-row');
  const refreshButton = document.getElementById('refresh-orders');
  const orderForm = document.getElementById('order-form');
  const orderSearchInput = document.getElementById('order-search-input');
  const productSelect = document.getElementById('order-product-select');
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
  };

  const renderOrders = (ordersToRender) => {
    ordersTable.innerHTML = '';
    if (ordersToRender.length === 0) {
      ordersTable.innerHTML = `<tr><td colspan="${ordersTable.dataset.emptyColspan || 10}" class="py-8 text-center text-slate-400">ไม่พบข้อมูลคำสั่งซื้อ</td></tr>`;
      return;
    }
    ordersToRender.forEach(order => {
      const orderId = order.id;
      const row = orderRowTemplate.content.cloneNode(true);
      row.querySelector('tr').dataset.orderId = orderId;
      row.querySelector('[data-field="id"]').textContent = orderId.substring(0, 8);
      row.querySelector('[data-field="name"]').textContent = order.customerName;
      row.querySelector('[data-field="type-shirt"]').textContent = order['type-shirt'];
      row.querySelector('[data-field="category"]').textContent = order.category;
      row.querySelector('[data-field="payment"]').textContent = order.payment;
      row.querySelector('[data-field="quantity"]').textContent = order.quantity;
      row.querySelector('[data-field="total"]').textContent = new Intl.NumberFormat('th-TH').format(order.total);
      row.querySelector('[data-field="date"]').textContent = order.date.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
      const statusElement = row.querySelector('[data-field="status"]');
      const statusText = statusMapping[order.status] || order.status;
      statusElement.textContent = statusText;
      statusElement.className += ' ' + (statusClasses[statusText] || 'bg-slate-100 text-slate-500');
      row.querySelector('.edit-order').addEventListener('click', () => handleEditOrder(orderId));
      row.querySelector('.delete-order').addEventListener('click', () => handleDeleteOrder(orderId, order.productId, order.quantity));
      ordersTable.appendChild(row);
    });
  };

  const sortAndRenderOrders = () => {
    // 1. Sort
    allOrders.sort((a, b) => {
      const valA = a[orderSort.key];
      const valB = b[orderSort.key];
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
    const searchTerm = orderSearchInput.value.toLowerCase().trim();
    const filteredOrders = !searchTerm
      ? allOrders
      : allOrders.filter(order =>
          order.customerName.toLowerCase().includes(searchTerm) ||
          (order['type-shirt'] && order['type-shirt'].toLowerCase().includes(searchTerm))
        );

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

  const handleEditOrder = async (id) => {
    alert('ฟังก์ชันแก้ไขคำสั่งซื้อยังไม่สมบูรณ์');
  };

  const handleDeleteOrder = async (orderId, productId, quantity) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบคำสั่งซื้อนี้ (${orderId.substring(0, 8)})? การลบจะคืนสต็อกสินค้ากลับเข้าระบบ`)) {
      return;
    }
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", orderId);
        const productRef = doc(db, "products", productId);
        transaction.update(productRef, { stock: increment(quantity) });
        transaction.delete(orderRef);
      });
      alert('ลบคำสั่งซื้อและคืนสต็อกเรียบร้อยแล้ว');
      // Real-time listener will auto-update the UI
    } catch (error) {
      console.error("Error deleting order and restoring stock: ", error);
      alert(`เกิดข้อผิดพลาดในการลบคำสั่งซื้อ: ${error.toString()}`);
    }
  };

  const calculateTotal = () => {
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const price = Number(selectedOption.dataset.price) || 0;
    const quantity = Number(orderForm.quantity.value) || 0;
    orderForm.total.value = price * quantity;
  };

  const setInitialFormValues = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;
    
    const dateInput = orderForm.querySelector('input[name="date"]');
    if (dateInput) dateInput.value = todayString;
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
        option.textContent = `${product.name} (${product.price} บาท)`;
        option.dataset.price = product.price;
        productSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Error fetching products for dropdown: ", error);
      productSelect.innerHTML = '<option value="">-- ไม่สามารถโหลดสินค้าได้ --</option>';
    }
  };

  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';

    const quantity = Number(orderForm.quantity.value) || 0;
    const productId = orderForm.productId.value;

    if (!productId || quantity <= 0) {
      alert('กรุณาเลือกสินค้าและระบุจำนวนให้ถูกต้อง');
      submitButton.disabled = false;
      submitButton.textContent = 'บันทึกคำสั่งซื้อ';
      return;
    }

    try {
      if (editingOrderId) {
        alert('การแก้ไขคำสั่งซื้อยังไม่รองรับการอัปเดตสต็อกอัตโนมัติ');
        throw new Error("Edit mode stock update not implemented.");
      } else {
        await runTransaction(db, async (transaction) => {
          const productRef = doc(db, "products", productId);
          const productDoc = await transaction.get(productRef);
          if (!productDoc.exists()) throw "ไม่พบสินค้านี้ในระบบ";
          const currentStock = productDoc.data().stock;
          if (currentStock < quantity) throw `สินค้าไม่เพียงพอ (มีในสต็อก ${currentStock} ชิ้น)`;
          
          transaction.update(productRef, { stock: increment(-quantity) });

          const newOrderRef = doc(collection(db, "orders"));
          const selectedProduct = productsCache.find(p => p.id === productId);
          const orderData = {
            customerName: orderForm.name.value,
            productId: productId,
            'type-shirt': selectedProduct ? selectedProduct.name : 'N/A',
            category: orderForm.category.value,
            date: Timestamp.fromDate(new Date(orderForm.date.value)),
            payment: orderForm.payment.value,
            status: orderForm.status.value,
            quantity: quantity,
            total: Number(orderForm.total.value) || 0,
          };
          transaction.set(newOrderRef, orderData);
        });
        alert('บันทึกคำสั่งซื้อและตัดสต็อกเรียบร้อยแล้ว');
      }
      orderForm.reset();
      // setTimeout is needed to allow the browser to reset the form before we set new values
      setTimeout(setInitialFormValues, 0);
      editingOrderId = null;
    } catch (error) {
      console.error("Error saving order: ", error);
      alert(`เกิดข้อผิดพลาด: ${error.toString()}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'บันทึกคำสั่งซื้อ';
    }
  });
  
  setInitialFormValues();
  updateSortUI('orders-table', orderSort); // Set initial sort UI
  populateProductsDropdown();
  listenForOrderChanges();
  refreshButton.addEventListener('click', () => alert('ข้อมูลในตารางอัปเดตอัตโนมัติแบบเรียลไทม์'));
  orderSearchInput.addEventListener('input', sortAndRenderOrders);
  productSelect.addEventListener('change', calculateTotal);
  orderForm.quantity.addEventListener('input', calculateTotal);
  orderForm.addEventListener('reset', () => setTimeout(setInitialFormValues, 0));

  document.querySelectorAll('#orders-table th[data-sort]').forEach(headerCell => {
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
