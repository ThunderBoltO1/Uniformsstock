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
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Products Page Logic ---
if (document.getElementById('products-table')) {
  const productsTable = document.getElementById('products-table');
  const productRowTemplate = document.getElementById('product-row');
  const refreshButton = document.getElementById('refresh-products');
  const productModal = document.getElementById('product-modal');
  const productForm = document.getElementById('product-form');
  let editingProductId = null; // To track if we are editing
  
  // --- Orders Page Logic (from previous step) ---
  
  const statusClasses = {
    'พร้อมขาย': 'bg-emerald-100 text-emerald-700',
    'รอผลิต': 'bg-amber-100 text-amber-700',
    'หมดชั่วคราว': 'bg-slate-100 text-slate-500',
  };

  const renderProducts = (docs) => {
    // This is from Products Page Logic, assuming it's correctly placed above.
    // The following is the logic for the Orders Page.
  };

  // --- Orders Page Logic ---
  if (document.getElementById('orders-table')) {
    const ordersTable = document.getElementById('orders-table');
    const orderRowTemplate = document.getElementById('order-row');
    const refreshButton = document.getElementById('refresh-orders');
    const orderForm = document.getElementById('order-form');
    let editingOrderId = null;
    const productSelect = document.getElementById('order-product-select');
    let productsCache = []; // Cache to store product data
  
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
  
    const renderOrders = (docs) => {
      ordersTable.innerHTML = '';
      if (docs.empty) {
        const colspan = ordersTable.dataset.emptyColspan || 1;
        ordersTable.innerHTML = `<tr><td colspan="${colspan}" class="py-8 text-center text-slate-400">ยังไม่มีข้อมูลคำสั่งซื้อ</td></tr>`;
        return;
      }
  
      docs.forEach(doc => {
        const order = doc.data();
        const orderId = doc.id;
        const row = orderRowTemplate.content.cloneNode(true);
  
        row.querySelector('[data-field="id"]').textContent = orderId.substring(0, 8);
        row.querySelector('[data-field="name"]').textContent = order.customerName;
        row.querySelector('[data-field="type-shirt"]').textContent = order['type-shirt'];
        row.querySelector('[data-field="category"]').textContent = order.category;
        row.querySelector('[data-field="payment"]').textContent = order.payment;
        row.querySelector('[data-field="quantity"]').textContent = order.quantity;
        row.querySelector('[data-field="total"]').textContent = new Intl.NumberFormat('th-TH').format(order.total);
        
        let displayDate = '-';
        if (order.date && order.date.toDate) {
          displayDate = order.date.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        } else if (order.date) {
          displayDate = new Date(order.date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        row.querySelector('[data-field="date"]').textContent = displayDate;
  
        const statusElement = row.querySelector('[data-field="status"]');
        const statusText = statusMapping[order.status] || order.status;
        statusElement.textContent = statusText;
        const classes = statusClasses[statusText] || 'bg-slate-100 text-slate-500';
        statusElement.className += ' ' + classes;
  
        const editButton = row.querySelector('.edit-order');
        editButton.addEventListener('click', () => handleEditOrder(orderId));
  
        ordersTable.appendChild(row);
      });
    };
  
    const fetchOrders = async () => {
      try {
        const ordersQuery = query(collection(db, "orders"), orderBy("date", "desc"));
        const querySnapshot = await getDocs(ordersQuery);
        renderOrders(querySnapshot);
      } catch (error) {
        console.error("Error fetching orders: ", error);
        const colspan = ordersTable.dataset.emptyColspan || 1;
        ordersTable.innerHTML = `<tr><td colspan="${colspan}" class="py-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
      }
    };
  
    const handleEditOrder = async (id) => {
      // Logic for editing an order (from previous step)
    };
  
    const calculateTotal = () => {
      // Logic for calculating total (from previous step)
    };
  
    const populateProductsDropdown = async () => {
      // Logic for populating dropdown (from previous step)
    };
  
    orderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'กำลังบันทึก...';
  
      const quantity = Number(orderForm.quantity.value) || 0;
      const productId = orderForm.productId.value;
  
      // Prevent submission if product or quantity is invalid
      if (!productId || quantity <= 0) {
        alert('กรุณาเลือกสินค้าและระบุจำนวนให้ถูกต้อง');
        submitButton.disabled = false;
        submitButton.textContent = 'บันทึกคำสั่งซื้อ';
        return;
      }
  
      try {
        if (editingOrderId) {
          // Note: Stock logic for 'edit' is complex (e.g., quantity changes) and is not implemented here.
          // This implementation focuses on creating a new order.
          alert('การแก้ไขคำสั่งซื้อยังไม่รองรับการอัปเดตสต็อกอัตโนมัติ');
          throw new Error("Edit mode stock update not implemented.");
        } else {
          // Create new order and deduct stock using a transaction
          await runTransaction(db, async (transaction) => {
            const productRef = doc(db, "products", productId);
            const productDoc = await transaction.get(productRef);
  
            if (!productDoc.exists()) {
              throw "ไม่พบสินค้านี้ในระบบ";
            }
  
            const currentStock = productDoc.data().stock;
            if (currentStock < quantity) {
              throw `สินค้าไม่เพียงพอ (มีในสต็อก ${currentStock} ชิ้น)`;
            }
  
            // 1. Update stock
            transaction.update(productRef, { stock: increment(-quantity) });
  
            // 2. Create new order document
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
        editingOrderId = null;
        fetchOrders();
      } catch (error) {
        console.error("Error saving order: ", error);
        alert(`เกิดข้อผิดพลาด: ${error.toString()}`);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'บันทึกคำสั่งซื้อ';
      }
    });
  
    // Initial Setup and Event Listeners
    populateProductsDropdown();
    fetchOrders();
    refreshButton.addEventListener('click', fetchOrders);
    productSelect.addEventListener('change', calculateTotal);
    orderForm.quantity.addEventListener('input', calculateTotal);
  }

  // --- End of Orders Page Logic ---

  const fetchProducts = async () => {
    productsTable.innerHTML = ''; // Clear existing rows
    if (docs.empty) {
      const colspan = productsTable.dataset.emptyColspan || 1;
      productsTable.innerHTML = `
        <tr>
          <td colspan="${colspan}" class="py-8 text-center text-slate-400">
            ยังไม่มีข้อมูลสินค้าในระบบ
          </td>
        </tr>
      `;
      return;
    }

    docs.forEach(doc => {
      const product = doc.data();
      const productId = doc.id;
      const row = productRowTemplate.content.cloneNode(true);

      const idElement = row.querySelector('[data-field="id"]');
      if (idElement) idElement.textContent = doc.id.substring(0, 8);

      const nameElement = row.querySelector('[data-field="name"]');
      if (nameElement) nameElement.textContent = product.name;

      const categoryElement = row.querySelector('[data-field="category"]');
      if (categoryElement) categoryElement.textContent = product.category;

      const stockElement = row.querySelector('[data-field="stock"]');
      if (stockElement) stockElement.textContent = product.stock;

      const priceElement = row.querySelector('[data-field="price"]');
      if (priceElement) priceElement.textContent = product.price;

      const statusElement = row.querySelector('[data-field="status"]');
      if (statusElement) {
        statusElement.textContent = product.status;
        const classes = statusClasses[product.status] || 'bg-slate-100 text-slate-500';
        statusElement.className += ' ' + classes;
      }

      // Add event listener for the edit button
      const editButton = row.querySelector('.edit-product');
      if (editButton) {
        editButton.addEventListener('click', () => handleEditProduct(productId));
      }

      productsTable.appendChild(row);
    });
  };

  const fetchProducts = async () => {
    try {
      const productsQuery = query(collection(db, "products"), orderBy("name"));
      const querySnapshot = await getDocs(productsQuery);
      renderProducts(querySnapshot);
    } catch (error) {
      console.error("Error fetching products: ", error);
      const colspan = productsTable.dataset.emptyColspan || 1;
      productsTable.innerHTML = `<tr><td colspan="${colspan}" class="py-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
    }
  };

  // --- Modal and Form Logic ---
  const openModal = () => productModal?.classList.remove('hidden');
  const closeModal = () => {
    productModal.classList.add('hidden');
    productForm.reset();
    editingProductId = null;
    document.querySelector('#product-modal h2').textContent = 'เพิ่มสินค้า';
  };

  document.getElementById('open-product-modal')?.addEventListener('click', () => {
    editingProductId = null;
    productForm.reset();
    document.querySelector('#product-modal h2').textContent = 'เพิ่มสินค้า';
    openModal();
  });
  document.getElementById('close-product-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-product-modal')?.addEventListener('click', closeModal);
  
  // Handle editing a product
  const handleEditProduct = async (id) => {
    try {
      const docRef = doc(db, "products", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        editingProductId = id;
        const product = docSnap.data();
        
        // Fill the form with existing data
        productForm.name.value = product.name || '';
        productForm.category.value = product.category || '';
        productForm.stock.value = product.stock || 0;
        productForm.price.value = product.price || 0;
        productForm.status.value = product.status || 'พร้อมขาย';

        document.querySelector('#product-modal h2').textContent = 'แก้ไขสินค้า';
        openModal();
      } else {
        console.log("No such document!");
        alert("ไม่พบข้อมูลสินค้าที่ต้องการแก้ไข");
      }
    } catch (error) {
      console.error("Error getting document:", error);
      alert("เกิดข้อผิดพลาดในการดึงข้อมูลเพื่อแก้ไข");
    }
  };

  // Handle form submission for both add and edit
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
        // Update existing document
        const productRef = doc(db, "products", editingProductId);
        await updateDoc(productRef, productData);
        alert('อัปเดตข้อมูลสินค้าเรียบร้อยแล้ว');
      } else {
        // Add new document
        await addDoc(collection(db, "products"), productData);
        alert('เพิ่มสินค้าใหม่เรียบร้อยแล้ว');
      }
      closeModal();
      fetchProducts(); // Refresh the table
    } catch (error) {
      console.error("Error saving product: ", error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'บันทึกสินค้า';
    }
  });

  // Initial fetch
  fetchProducts();

  // Refresh button
  refreshButton?.addEventListener('click', fetchProducts);
}