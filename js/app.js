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
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Products Page Logic ---
if (document.getElementById('products-table')) {
  const productsTable = document.getElementById('products-table');
  const productRowTemplate = document.getElementById('product-row');
  const refreshButton = document.getElementById('refresh-products');
  const productModal = document.getElementById('product-modal');
  const productForm = document.getElementById('product-form');
  let editingProductId = null; // To track if we are editing
  
  const statusClasses = {
    'พร้อมขาย': 'bg-emerald-100 text-emerald-700',
    'รอผลิต': 'bg-amber-100 text-amber-700',
    'หมดชั่วคราว': 'bg-slate-100 text-slate-500',
  };

  const renderProducts = (docs) => {
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

  const listenForProductChanges = () => {
    const productsQuery = query(collection(db, "products"), orderBy("name"));
    onSnapshot(productsQuery, 
      (querySnapshot) => {
        renderProducts(querySnapshot);
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
    }, 300); // Match duration of transition
  };

  document.getElementById('open-product-modal').addEventListener('click', () => {
    editingProductId = null;
    productForm.reset();
    document.querySelector('#product-modal h2').textContent = 'เพิ่มสินค้า';
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
        openModal();
      } else {
        alert("ไม่พบข้อมูลสินค้าที่ต้องการแก้ไข");
      }
    } catch (error) {
      console.error("Error getting document:", error);
      alert("เกิดข้อผิดพลาดในการดึงข้อมูลเพื่อแก้ไข");
    }
  };

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

  listenForProductChanges();
  refreshButton.addEventListener('click', () => alert('ข้อมูลอัปเดตอัตโนมัติแบบเรียลไทม์'));
}

// --- Orders Page Logic ---
if (document.getElementById('orders-table')) {
  const ordersTable = document.getElementById('orders-table');
  const orderRowTemplate = document.getElementById('order-row');
  const refreshButton = document.getElementById('refresh-orders');
  const orderForm = document.getElementById('order-form');
  const productSelect = document.getElementById('order-product-select');
  let editingOrderId = null;
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

  const renderOrders = (docs) => {
    ordersTable.innerHTML = '';
    if (docs.empty) {
      ordersTable.innerHTML = `<tr><td colspan="${ordersTable.dataset.emptyColspan}" class="py-8 text-center text-slate-400">ยังไม่มีข้อมูลคำสั่งซื้อ</td></tr>`;
      return;
    }
    docs.forEach(doc => {
      const order = doc.data();
      const row = orderRowTemplate.content.cloneNode(true);
      row.querySelector('[data-field="id"]').textContent = doc.id.substring(0, 8);
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
      row.querySelector('.edit-order').addEventListener('click', () => handleEditOrder(doc.id));
      ordersTable.appendChild(row);
    });
  };

  const listenForOrderChanges = () => {
    const ordersQuery = query(collection(db, "orders"), orderBy("date", "desc"));
    onSnapshot(ordersQuery, renderOrders, (error) => {
      console.error("Error listening for order changes: ", error);
      ordersTable.innerHTML = `<tr><td colspan="${ordersTable.dataset.emptyColspan}" class="py-8 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
    });
  };

  const handleEditOrder = async (id) => {
    // Note: Stock logic for 'edit' is complex and not implemented.
    alert('ฟังก์ชันแก้ไขคำสั่งซื้อยังไม่สมบูรณ์');
  };

  const calculateTotal = () => {
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const price = Number(selectedOption.dataset.price) || 0;
    const quantity = Number(orderForm.quantity.value) || 0;
    orderForm.total.value = price * quantity;
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
      editingOrderId = null;
    } catch (error) {
      console.error("Error saving order: ", error);
      alert(`เกิดข้อผิดพลาด: ${error.toString()}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'บันทึกคำสั่งซื้อ';
    }
  });

  populateProductsDropdown();
  listenForOrderChanges();
  refreshButton.addEventListener('click', () => alert('ข้อมูลอัปเดตอัตโนมัติแบบเรียลไทม์'));
  productSelect.addEventListener('change', calculateTotal);
  orderForm.quantity.addEventListener('input', calculateTotal);
}
