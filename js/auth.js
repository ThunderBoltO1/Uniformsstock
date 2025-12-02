// หมายเหตุ: โค้ดส่วน app.js ไม่ได้ถูก import ใน index.html จึงย้ายฟังก์ชันที่จำเป็นมาไว้ที่นี่
async function logAction(action, details = {}) {
  try {
    const currentUserData = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUserData) {
      console.warn("Cannot log action: No user is logged in.");
      return;
    }

    // Prioritize display name: Full Name > Username > Email
    const displayName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUserData.username || currentUserData.email;

    const logData = {
      action: action,
      details: details,
      timestamp: new Date(), // Using client-side date for simplicity
      user: displayName,
      userId: currentUserData.uid,
    };

    await addDoc(collection(db, "audit_logs"), logData);
  } catch (error) {
    console.error("Error logging action:", error);
  }
}

// --- Firebase Imports ---
import { db, storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, getDocs, query, where, doc, getDoc, updateDoc, deleteDoc, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const pageAccess = {
  '/dashboard.html': ['admin', 'user'],
  '/user-management.html': ['admin'],
  '/audit-log.html': ['admin', 'super-platinum-admin'],
  '/products.html': ['admin', 'user'],
  '/orders.html': ['admin', 'user'],
  '/profile.html': ['admin', 'user'],
  '/index.html': ['admin', 'user'], // index.html ควรถูกป้องกันเช่นกัน
};

// --- Login Logic (for login.html) ---
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginButton = document.getElementById('login-button');
    const originalButtonText = loginButton.innerHTML;
    loginButton.disabled = true;
    loginButton.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> กำลังเข้าสู่ระบบ...`;

    const inputUsername = e.target.username.value;
    const inputPassword = e.target.password.value;
    const errorMessage = document.getElementById('error-message');
    errorMessage.classList.add('hidden'); // ซ่อนข้อความ error เก่าก่อน
    document.getElementById('forgot-password-message').classList.add('hidden');

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("username", "==", inputUsername));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error("Username not found");
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const userPasswordInDb = userData.password; // สมมติว่ามี field 'password' ใน Firestore

      // **ข้อควรระวัง**: การเปรียบเทียบรหัสผ่านแบบนี้ไม่ปลอดภัย ควรใช้ hashing
      if (inputPassword !== userPasswordInDb) {
        throw new Error("Invalid password");
      }

      // เก็บข้อมูล user ใน localStorage
      const userToStore = { uid: userDoc.id, ...userData };
      delete userToStore.password; // ไม่เก็บรหัสผ่านใน localStorage
      localStorage.setItem('currentUser', JSON.stringify(userToStore));
      logAction('LOGIN', { username: inputUsername, userId: userDoc.id });
      window.location.replace('./index.html');
    } catch (error) {
      console.error("Login failed:", error.message);
      errorMessage.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      errorMessage.classList.remove('hidden');
    } finally {
      // Restore button state
      loginButton.disabled = false;
      loginButton.innerHTML = originalButtonText;
    }
  });

  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const forgotPasswordMessage = document.getElementById('forgot-password-message');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', () => {
      forgotPasswordMessage.classList.toggle('hidden');
    });
  }
}

// --- Logout Logic ---
async function logout() {
  // เพิ่มกล่องข้อความยืนยันก่อนออกจากระบบ
  if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
    const currentUserData = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUserData) {
      await logAction('LOGOUT', { username: currentUserData.username, userId: currentUserData.uid });
    }
    localStorage.removeItem('currentUser');
    console.log("User signed out");
    window.location.replace('./login.html');
  }
}

// --- Profile Details Logic (for profile.html) ---
const profileDetailsForm = document.getElementById('profile-details-form');
if (profileDetailsForm) {
  const currentUserData = JSON.parse(localStorage.getItem('currentUser'));

  const populateProfileForm = async () => {
    if (currentUserData) {
      // ดึงข้อมูลล่าสุดจาก Firestore เพื่อให้แน่ใจว่าข้อมูลเป็นปัจจุบัน
      const userDocRef = doc(db, "users", currentUserData.uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        const userDataFromDb = docSnap.data();
        profileDetailsForm.firstName.value = userDataFromDb.firstName || '';
        profileDetailsForm.lastName.value = userDataFromDb.lastName || '';
        profileDetailsForm.email.value = userDataFromDb.email || '';
        
        // Prevent super admin from changing their email
        if (userDataFromDb.email === 'admin@system.local') {
          const emailInput = profileDetailsForm.email;
          emailInput.readOnly = true;
          emailInput.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
          const emailLabel = emailInput.previousElementSibling;
          if (emailLabel) emailLabel.textContent = 'อีเมล (ไม่สามารถแก้ไขได้)';
        }

        profileDetailsForm.phone.value = userDataFromDb.phone || '';

        // Populate and add click-to-copy for User ID
        const userIdInput = document.getElementById('profile-user-id');
        if (userIdInput) {
          userIdInput.value = currentUserData.uid;
          userIdInput.addEventListener('click', () => {
            navigator.clipboard.writeText(currentUserData.uid).then(() => {
              alert(`คัดลอก User ID แล้ว: ${currentUserData.uid}`);
            }).catch(err => {
              console.error('Failed to copy User ID: ', err);
              alert('ไม่สามารถคัดลอกได้');
            });
          });
        }
        
        const imgPreview = document.getElementById('profile-image-preview');
        if (userDataFromDb.profilePictureUrl) {
          imgPreview.src = userDataFromDb.profilePictureUrl;
        }

        // Live preview for file input
        const fileInput = document.getElementById('profilePicture');
        let objectUrl = null;
        if (fileInput) {
          fileInput.addEventListener('change', () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            const file = fileInput.files[0];
            if (file) {
              objectUrl = URL.createObjectURL(file);
              imgPreview.src = objectUrl;
            }
          });
        }
      } else {
        console.error("User document not found in Firestore, but exists in localStorage.");
        alert("ไม่พบข้อมูลผู้ใช้ในระบบ");
      }
    }
  };
  populateProfileForm();

  /**
   * Resizes and compresses an image file client-side to be under a specific size.
   * @param {File} file The image file to process.
   * @param {object} options The options for resizing and compression.
   * @param {number} options.maxWidth The maximum width of the output image.
   * @param {number} options.maxHeight The maximum height of the output image.
   * @param {number} options.maxSizeKB The maximum file size in kilobytes.
   * @returns {Promise<Blob>} A promise that resolves with the compressed image as a Blob.
   */
  function resizeAndCompressImage(file, options = { maxWidth: 500, maxHeight: 500, maxSizeKB: 50 }) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onerror = reject;
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // Calculate new dimensions
          if (width > height) {
            if (width > options.maxWidth) {
              height *= options.maxWidth / width;
              width = options.maxWidth;
            }
          } else {
            if (height > options.maxHeight) {
              width *= options.maxHeight / height;
              height = options.maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob and check size
          canvas.toBlob((blob) => {
            if (blob.size / 1024 > options.maxSizeKB) {
              // If still too large, you could implement recursive quality reduction here,
              // but for simplicity, we'll just use a fixed quality that usually works.
              canvas.toBlob(resolve, 'image/jpeg', 0.7);
            } else {
              resolve(blob);
            }
          }, 'image/jpeg', 0.9); // Start with high quality
        };
        img.src = event.target.result;
      };
    });
  }

  /**
   * Deletes a file from Firebase Storage using its download URL.
   * @param {string} url The full download URL of the file to delete.
   */
  async function deleteProfilePicture(url) {
    // Do nothing if the URL is invalid or not a Firebase Storage URL
    if (!url || !url.startsWith('https://firebasestorage.googleapis.com')) {
      return;
    }

    try {
      const fileRef = ref(storage, url);
      await deleteObject(fileRef);
      console.log("Old profile picture deleted successfully.");
    } catch (error) {
      // It's okay if the object doesn't exist, it might have been deleted already.
      if (error.code === 'storage/object-not-found') {
        console.warn("Old profile picture not found, skipping deletion.");
      } else {
        console.error("Error deleting old profile picture:", error);
      }
    }
  }

  async function uploadProfilePicture(file, username) {
    if (!file) return null;
    const storageRef = ref(storage, `profilePictures/${username}/${Date.now()}-${file.name}`);
    try {
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Upload failed", error);
      // Check for CORS or Rules error
      if (error.code === 'storage/unauthorized') {
        alert("อัปโหลดล้มเหลว: ไม่มีสิทธิ์ในการอัปโหลดไฟล์ กรุณาตรวจสอบ Storage Rules ของคุณ");
      } else {
        alert("อัปโหลดรูปภาพล้มเหลว: " + error.message);
      }
      return null;
    }
  }

  profileDetailsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentUserData = JSON.parse(localStorage.getItem('currentUser'));

    if (!currentUserData) {
      alert("กรุณาล็อกอินเพื่อบันทึกข้อมูล");
      return;
    }

    const saveButton = document.getElementById('save-profile-button');
    saveButton.disabled = true;
    saveButton.textContent = 'กำลังบันทึก...';

    const userDocRef = doc(db, "users", currentUserData.uid);
    const userDocSnap = await getDoc(userDocRef);
    const oldProfilePictureUrl = userDocSnap.exists() ? userDocSnap.data().profilePictureUrl : null;
    let newProfilePictureUrl = oldProfilePictureUrl;

    const fileInput = document.getElementById('profilePicture');
    const file = fileInput.files[0];

    if (file) {
      // บีบอัดรูปภาพก่อนอัปโหลด
      const compressedBlob = await resizeAndCompressImage(file, {
        maxWidth: 500,
        maxHeight: 500,
        maxSizeKB: 50
      });

      const uploadedUrl = await uploadProfilePicture(compressedBlob, currentUserData.username);
      if (uploadedUrl) {
        newProfilePictureUrl = uploadedUrl;
        // ถ้าอัปโหลดรูปใหม่สำเร็จ และมีรูปเก่าอยู่ ให้ลบรูปเก่าทิ้ง
        if (oldProfilePictureUrl) {
          await deleteProfilePicture(oldProfilePictureUrl);
        }
      } else {
        // Upload failed, stop the process
        saveButton.disabled = false;
        saveButton.textContent = 'บันทึกข้อมูล';
        return;
      }
    }

    // Update user profile data in Firestore
    const updatedData = {
      firstName: profileDetailsForm.firstName.value,
      lastName: profileDetailsForm.lastName.value,
      email: profileDetailsForm.email.value,
      phone: profileDetailsForm.phone.value,
      profilePictureUrl: newProfilePictureUrl,
    };

    await updateDoc(userDocRef, updatedData);

    // อัปเดตข้อมูลใน localStorage เพื่อให้ UI เปลี่ยนแปลงทันที
    const updatedCurrentUser = { ...currentUserData, ...updatedData };
    localStorage.setItem('currentUser', JSON.stringify(updatedCurrentUser));

    // เรียกใช้ฟังก์ชันอัปเดต UI อีกครั้งเพื่อแสดงรูปใหม่ที่ Header
    updateUIAfterLogin(updatedCurrentUser);

    logAction('UPDATE_PROFILE', { userId: currentUserData.uid });
    alert('บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว');
    saveButton.disabled = false;
    saveButton.textContent = 'บันทึกข้อมูล';
  });

  // Password Modal Logic
}

// --- Dashboard Page Logic (for dashboard.html) ---
if (document.getElementById('dashboard-content')) {
    const initializeDashboard = async () => {
        try {
            const ordersSnapshot = await getDocs(collection(db, "orders"));
            const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const productsSnapshot = await getDocs(collection(db, "products"));
            const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // --- 1. Populate Stat Cards ---
            const validOrders = orders.filter(o => o.status !== 'cancelled');
            const totalSales = validOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
            const totalOrdersCount = validOrders.length;
            const totalCustomers = new Set(validOrders.map(o => o.customerName)).size;
            const lowStockItemsCount = products.filter(p => p.stock < 10).length;

            document.getElementById('total-sales').textContent = `฿${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('total-orders').textContent = totalOrdersCount.toLocaleString();
            document.getElementById('total-customers').textContent = totalCustomers.toLocaleString();
            document.getElementById('low-stock-items-count').textContent = lowStockItemsCount.toLocaleString();

            // --- 1.5. Show Low Stock Notification Banner ---
            const lowStockNotification = document.getElementById('low-stock-notification');
            const lowStockAlertCount = document.getElementById('low-stock-alert-count');
            if (lowStockItemsCount > 0 && lowStockNotification && lowStockAlertCount) {
                lowStockAlertCount.textContent = lowStockItemsCount.toLocaleString();
                lowStockNotification.classList.remove('hidden');
            }


            // --- 2. Monthly Sales Chart ---
            const monthlySalesData = Array(12).fill(0);
            const monthLabels = [];
            const now = new Date();

            for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                monthLabels.push(d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }));
            }

            validOrders.forEach(order => {
                if (order.orderDate && order.orderDate.seconds) {
                    const orderDate = new Date(order.orderDate.seconds * 1000);
                    const monthDiff = (now.getFullYear() - orderDate.getFullYear()) * 12 + (now.getMonth() - orderDate.getMonth());
                    if (monthDiff >= 0 && monthDiff < 12) {
                        monthlySalesData[11 - monthDiff] += order.totalAmount || 0;
                    }
                }
            });

            const monthlySalesCtx = document.getElementById('monthly-sales-chart');
            if (monthlySalesCtx) {
                new Chart(monthlySalesCtx, {
                    type: 'bar',
                    data: {
                        labels: monthLabels,
                        datasets: [{
                            label: 'ยอดขาย (บาท)',
                            data: monthlySalesData,
                            backgroundColor: 'rgba(79, 70, 229, 0.8)',
                            borderColor: 'rgba(79, 70, 229, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            }

            // --- 3. Payment Type Chart ---
            const paymentTypeData = { 'โอนธนาคาร': 0, 'เงินสด': 0, 'บัตรเครดิต': 0 };
            const paymentTypeLabels = { 'bank': 'โอนธนาคาร', 'cash': 'เงินสด', 'credit': 'บัตรเครดิต' };
            validOrders.forEach(order => {
                const method = paymentTypeLabels[order.paymentMethod] || 'อื่นๆ';
                if (paymentTypeData.hasOwnProperty(method)) {
                    paymentTypeData[method] += order.totalAmount || 0;
                }
            });

            const paymentTypeCtx = document.getElementById('payment-type-chart');
            if (paymentTypeCtx) {
                new Chart(paymentTypeCtx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(paymentTypeData),
                        datasets: [{
                            label: 'ยอดขายตามประเภท',
                            data: Object.values(paymentTypeData),
                            backgroundColor: [
                                'rgba(59, 130, 246, 0.8)',
                                'rgba(16, 185, 129, 0.8)',
                                'rgba(245, 158, 11, 0.8)',
                            ],
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'top',
                            },
                        }
                    }
                });
            }

            // --- 3.5. Product Type Sales Chart ---
            const productTypeSales = {};
            validOrders.forEach(order => {
                const type = order.productType || 'ไม่ระบุ';
                productTypeSales[type] = (productTypeSales[type] || 0) + (order.totalAmount || 0);
            });

            const productTypeCtx = document.getElementById('product-type-chart');
            if (productTypeCtx) {
                new Chart(productTypeCtx, {
                    type: 'pie',
                    data: {
                        labels: Object.keys(productTypeSales),
                        datasets: [{
                            label: 'ยอดขาย',
                            data: Object.values(productTypeSales),
                            backgroundColor: [
                                'rgba(79, 70, 229, 0.8)', // Indigo
                                'rgba(219, 39, 119, 0.8)', // Pink
                                'rgba(14, 165, 233, 0.8)', // Sky
                            ],
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'top',
                            },
                        }
                    }
                });
            }

            // --- 4. Top Customers List ---
            const customerSales = {};
            validOrders.forEach(order => {
                const name = order.customerName || 'ลูกค้าไม่มีชื่อ';
                customerSales[name] = (customerSales[name] || 0) + (order.totalAmount || 0);
            });

            const sortedCustomers = Object.entries(customerSales)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);

            const topCustomersList = document.getElementById('top-customers-list');
            if (topCustomersList) {
                topCustomersList.innerHTML = '';
                if (sortedCustomers.length > 0) {
                    sortedCustomers.forEach(([name, total], index) => {
                        const li = document.createElement('li');
                        li.className = 'flex items-center justify-between gap-4';
                        li.innerHTML = `
                            <div class="flex items-center gap-3">
                                <span class="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 text-sm font-semibold text-slate-500">${index + 1}</span>
                                <span class="font-medium text-slate-800">${name}</span>
                            </div>
                            <span class="font-semibold text-emerald-600">฿${total.toLocaleString()}</span>
                        `;
                        topCustomersList.appendChild(li);
                    });
                } else {
                    topCustomersList.innerHTML = '<li class="py-4 text-center text-slate-400">ไม่พบข้อมูลลูกค้า</li>';
                }
            }

            // --- 6. Recent Orders ---
            const recentOrders = orders.sort((a, b) => (b.orderDate?.seconds || 0) - (a.orderDate?.seconds || 0)).slice(0, 5);
            const recentOrdersList = document.getElementById('recent-orders-list');
            if (recentOrdersList) {
                recentOrdersList.innerHTML = '';
                if (recentOrders.length > 0) {
                    recentOrders.forEach(order => {
                        const div = document.createElement('div');
                        div.className = 'flex items-start justify-between gap-4';
                        const orderDate = order.orderDate ? new Date(order.orderDate.seconds * 1000).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : 'N/A';
                        div.innerHTML = `
                            <div>
                                <p class="font-medium text-slate-800">${order.customerName || 'N/A'}</p>
                                <p class="text-xs text-slate-500">${order.productName || 'N/A'} - ${orderDate}</p>
                            </div>
                            <span class="font-semibold text-slate-700">฿${(order.totalAmount || 0).toLocaleString()}</span>
                        `;
                        recentOrdersList.appendChild(div);
                    });
                } else {
                    recentOrdersList.innerHTML = '<div class="py-4 text-center text-slate-400">ไม่พบคำสั่งซื้อล่าสุด</div>';
                }
            }

        } catch (error) {
            console.error("Error initializing dashboard:", error);
            // Optionally display an error message on the dashboard
            const dashboardElement = document.getElementById('dashboard-content');
            if (dashboardElement) {
                dashboardElement.innerHTML = '<p class="text-center text-red-500">ไม่สามารถโหลดข้อมูล Dashboard ได้</p>';
            }
        }
    };

    initializeDashboard();
}

// --- Products Page Logic (for products.html) ---
if (document.getElementById('products-table')) {
  const productsTable = document.getElementById('products-table');
  const productRowTemplate = document.getElementById('product-row');
  const productModal = document.getElementById('product-modal');
  const productModalContent = document.getElementById('product-modal-content');
  const productModalTitle = document.getElementById('product-modal-title');
  const openProductModalBtn = document.getElementById('open-product-modal');
  const closeProductModalBtn = document.getElementById('close-product-modal');
  const cancelProductModalBtn = document.getElementById('cancel-product-modal');
  const productForm = document.getElementById('product-form');
  const searchInput = document.getElementById('product-search-input');
  const deleteProductBtnInModal = document.getElementById('delete-product-button');
  const productStatusFilter = document.getElementById('product-status-filter');

  // Only run the logic if the required template is found on the page
  if (productRowTemplate) {
    let allProducts = [];
    let editingProductId = null;

    const renderProducts = (productsToRender) => {
      // Update summary cards based on the products being rendered
      // updateSummaryCards(productsToRender); // This will be called inside applyProductFilters

      productsTable.innerHTML = '';
      if (!productsToRender || productsToRender.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        const colspan = productsTable.dataset.emptyColspan || 9;
        td.colSpan = colspan;
        td.className = 'text-center py-8 text-slate-500';
        td.textContent = 'ไม่พบข้อมูลสินค้า';
        tr.appendChild(td);
        productsTable.appendChild(tr);
        return;
      }

      productsToRender.forEach((product, index) => {
        const row = productRowTemplate.content.cloneNode(true);
        const tr = row.querySelector('tr');
        tr.dataset.productId = product.docId; // Use Firestore document ID for actions

        row.querySelector('[data-field="sequence"]').textContent = index + 1;
        row.querySelector('[data-field="id"]').textContent = product.id;
        row.querySelector('[data-field="name"]').textContent = product.name || '-';
        row.querySelector('[data-field="type"]').textContent = product.type || 'N/A';
        row.querySelector('[data-field="size"]').textContent = product.size || 'N/A';
        row.querySelector('[data-field="price"]').textContent = `฿${Number(product.price).toLocaleString()}`;
        row.querySelector('[data-field="stock"]').textContent = product.stock || 0;

        const stockEl = row.querySelector('[data-field="stock"]');
        if (product.stock < 10) {
          stockEl.classList.add('text-red-600', 'font-semibold');
        }

        row.querySelector('.edit-product').addEventListener('click', () => openEditModal(product.docId));
        
        const statusEl = row.querySelector('[data-field="status"]');
        if (statusEl && product.status) {
            statusEl.textContent = product.status;
            if (product.status === 'พร้อมขาย') {
                statusEl.className = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800';
            } else if (product.status === 'หมดชั่วคราว') {
                statusEl.className = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-amber-100 text-amber-800';
            } else {
                statusEl.className = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-800';
            }
        } else if (statusEl) {
            statusEl.textContent = 'N/A';
        }
        
        productsTable.appendChild(row);
      });
    };

    const loadProducts = async () => {
      const productsSnapshot = await getDocs(collection(db, "products"));
      allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      applyProductFilters(); // Use a central filter function
    };

    const updateSummaryCards = (products) => {
        const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
        const totalCount = products.length;
        const lowStockCount = products.filter(p => p.stock < 10).length;

        const totalValueEl = document.getElementById('total-stock-value');
        const totalCountEl = document.getElementById('total-products-count');
        const lowStockCountEl = document.getElementById('low-stock-items-count');

        if (totalValueEl) totalValueEl.textContent = `฿${totalValue.toLocaleString()}`;
        if (totalCountEl) totalCountEl.textContent = totalCount.toLocaleString();
        if (lowStockCountEl) lowStockCountEl.textContent = lowStockCount.toLocaleString();
    };

    const openModal = () => {
      productModal.classList.remove('pointer-events-none', 'opacity-0');
      productModalContent.classList.remove('scale-95', 'opacity-0');
    };

    const closeModal = () => {
      productModal.classList.add('opacity-0');
      productModalContent.classList.add('scale-95', 'opacity-0');
      setTimeout(() => {
        productModal.classList.add('pointer-events-none');
        productForm.reset();
        editingProductId = null;
      }, 300);
    };

    const openAddModal = () => {
      editingProductId = null;
      productForm.reset();
      productModalTitle.textContent = 'เพิ่มสินค้าใหม่';
      productForm.id.readOnly = false; // Allow editing of ID for new products
      deleteProductBtnInModal.classList.add('hidden'); // Hide delete button for new products
      openModal();
    };

    const openEditModal = async (id) => {
      const productDoc = await getDoc(doc(db, "products", id));
      if (!productDoc.exists()) return;
      const product = { id: productDoc.id, ...productDoc.data() };
      editingProductId = id;
      productForm.reset();
      productModalTitle.textContent = 'แก้ไขสินค้า';
      
      productForm.id.value = product.id;
      productForm.id.readOnly = true; // Make ID readonly when editing
      productForm.name.value = product.name || '';
      productForm.type.value = product.type || 'ชาย';
      productForm.size.value = product.size || 'S';
      productForm.price.value = product.price;
      productForm.stock.value = product.stock;
      productForm.status.value = product.status || 'พร้อมขาย';

      // Show and configure the delete button
      deleteProductBtnInModal.classList.remove('hidden');
      // Remove old listener to prevent multiple triggers and then add the new one
      deleteProductBtnInModal.onclick = null; 
      deleteProductBtnInModal.onclick = () => {
          handleDeleteProduct(id, product.name);
          closeModal(); // Close modal after initiating delete
      };

      openModal();
    };

    const handleDeleteProduct = async (id, name) => {
      if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบสินค้า "${name}"?`)) {
        await deleteDoc(doc(db, "products", id)); // This is correct
        logAction('DELETE_PRODUCT', { productId: id, productName: name });
        loadProducts();
      }
    };

    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveButton = document.querySelector('button[type="submit"][form="product-form"]');
      saveButton.disabled = true;
      saveButton.textContent = 'กำลังบันทึก...';

      const customId = productForm.id.value.trim().toUpperCase();
      const productData = {
        id: customId, // Store custom ID inside the document as well
        name: productForm.name.value,
        type: productForm.type.value,
        size: productForm.size.value,
        price: Number(productForm.price.value),
        stock: Number(productForm.stock.value),
        status: productForm.status.value,
      };

      if (editingProductId) {
        // When editing, the ID from the form is the document ID.
        // We use `updateDoc` because `setDoc` would overwrite the whole document if we're not careful.
        await updateDoc(doc(db, "products", editingProductId), productData);
        logAction('UPDATE_PRODUCT', { productId: editingProductId, ...productData });
      } else {
        // When creating a new product
        if (!customId) {
            alert('กรุณากรอกรหัสสินค้า');
            saveButton.disabled = false;
            saveButton.textContent = 'บันทึกสินค้า';
            return;
        }

        // Check if a product with this custom ID already exists
        const newDocRef = doc(db, "products", customId);
        const docSnap = await getDoc(newDocRef);

        if (docSnap.exists()) {
            alert(`รหัสสินค้า "${customId}" นี้มีอยู่แล้วในระบบ กรุณาใช้รหัสอื่น`);
            saveButton.disabled = false;
            saveButton.textContent = 'บันทึกสินค้า';
            return;
        }

        // Use setDoc with the custom ID to create the new document
        await setDoc(newDocRef, productData);
        logAction('CREATE_PRODUCT', { productId: customId, ...productData });
      }

      closeModal();
      loadProducts();
      saveButton.disabled = false;
      saveButton.textContent = 'บันทึกสินค้า';
    });

    const applyProductFilters = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const statusFilter = productStatusFilter.value;

        let filteredProducts = allProducts;

        // Filter by status
        if (statusFilter) {
            if (statusFilter === 'low_stock') {
                filteredProducts = filteredProducts.filter(p => p.stock < 10);
            } else {
                filteredProducts = filteredProducts.filter(p => p.status === statusFilter);
            }
        }

        // Filter by search term
        if (searchTerm) {
            filteredProducts = filteredProducts.filter(p => 
                p.name.toLowerCase().includes(searchTerm) || 
                p.id.toLowerCase().includes(searchTerm)
            );
        }

        renderProducts(filteredProducts);
        updateSummaryCards(filteredProducts); // Update cards based on filtered results
    };

    // Event Listeners for filters
    searchInput.addEventListener('input', applyProductFilters);
    productStatusFilter.addEventListener('change', () => {
        applyProductFilters();
    });

    openProductModalBtn.addEventListener('click', openAddModal);
    closeProductModalBtn.addEventListener('click', closeModal);
    cancelProductModalBtn.addEventListener('click', closeModal);
    productModal.addEventListener('click', (e) => { if (e.target === productModal) closeModal(); });

    // Initial Load
    loadProducts();

    // Check for URL parameters on page load
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('filter') === 'low_stock') {
        productStatusFilter.value = 'low_stock';
        productStatusFilter.dispatchEvent(new Event('change'));
    }
  }
}

// --- Orders Page Logic (for orders.html) ---
if (document.getElementById('orders-table')) {
    const ordersTable = document.getElementById('orders-table');
    const orderRowTemplate = document.getElementById('order-row');
    const orderModal = document.getElementById('order-modal');
    const orderModalContent = document.getElementById('order-modal-content');
    const orderModalTitle = document.querySelector('#order-modal h2');
    const openOrderModalBtn = document.getElementById('open-order-modal');
    const closeOrderModalBtn = document.getElementById('close-order-modal');
    const cancelOrderModalBtn = document.getElementById('cancel-order-modal');
    const orderForm = document.getElementById('order-form');
    const productSelect = document.getElementById('order-product-select');
    const quantityInput = document.getElementById('order-quantity');
    const totalInput = document.getElementById('order-total');
    const productTypeSelect = document.getElementById('order-product-type');
    const searchInput = document.getElementById('order-search-input');
    const deleteOrderBtnInModal = document.getElementById('delete-order-button');
    const dateFilterStart = document.getElementById('date-filter-start');
    const dateFilterEnd = document.getElementById('date-filter-end');
    const clearDateFilterBtn = document.getElementById('clear-date-filter');
    const exportBtn = document.getElementById('export-orders-button');

    // Order Details Modal elements
    const orderDetailsModal = document.getElementById('order-details-modal');
    const orderDetailsModalContent = document.getElementById('order-details-modal-content');
    const closeOrderDetailsModalBtn = document.getElementById('close-order-details-modal');
    const detailsEditOrderButton = document.getElementById('details-edit-order-button');

    // State for sorting
    let currentOrderSortKey = 'date';
    let currentOrderSortDirection = 'desc';


    let allProductsForOrders = [];
    let editingOrderId = null;
    let currentlyRenderedOrders = []; // To store the logs currently being displayed for export
    let activeStatusFilter = 'all'; // 'all', 'paid', 'pending', 'cancelled'
    
    // Only run the logic if the required template is found on the page
    if (orderRowTemplate) {
        let allOrders = []; // To store all orders for filtering

        const populateProductsDropdown = async () => {
            const productsSnapshot = await getDocs(collection(db, "products"));
            allProductsForOrders = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            productSelect.innerHTML = '<option value="">-- เลือกสินค้า --</option>';
            allProductsForOrders.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = `${p.name} (ราคา: ${p.price} บาท, คงเหลือ: ${p.stock})`;
                option.dataset.price = p.price;
                option.dataset.type = p.type; // Store product type in dataset
                productSelect.appendChild(option);
            });
        };

        const calculateTotal = () => {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            const price = selectedOption.dataset.price ? parseFloat(selectedOption.dataset.price) : 0;
            const quantity = quantityInput.value ? parseInt(quantityInput.value, 10) : 0;
            totalInput.value = price * quantity;

            // Auto-set product type
            const type = selectedOption.dataset.type;
            if (type) {
                productTypeSelect.value = type;
                productTypeSelect.disabled = true; // Keep it disabled
            } else {
                productTypeSelect.value = ""; // Reset if no product is selected
                productTypeSelect.disabled = true;
            }
        };

        const openModal = () => {
            orderModal.classList.remove('pointer-events-none', 'opacity-0');
            orderModalContent.classList.remove('scale-95', 'opacity-0');
        };

        const closeModal = () => {
            orderModal.classList.add('opacity-0');
            orderModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                orderModal.classList.add('pointer-events-none');
                orderForm.reset();
                editingOrderId = null;
            }, 300);
        };

        const closeDetailsModal = () => {
            orderDetailsModal.classList.add('opacity-0');
            orderDetailsModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                orderDetailsModal.classList.add('pointer-events-none');
            }, 300);
        };

        const openDetailsModal = async (id) => {
            const orderDoc = await getDoc(doc(db, "orders", id));
            if (!orderDoc.exists()) return;
            const order = orderDoc.data();

            document.getElementById('details-order-number').textContent = order.orderNumber || id;
            document.getElementById('details-customer-name').textContent = order.customerName || 'N/A';
            document.getElementById('details-product-name').textContent = order.productName || 'N/A';
            document.getElementById('details-product-type').textContent = order.productType || 'N/A';
            document.getElementById('details-quantity').textContent = (order.quantity || 0).toLocaleString() + ' ชิ้น';
            document.getElementById('details-total-amount').textContent = `฿${(order.totalAmount || 0).toLocaleString()}`;
            document.getElementById('details-installment-amount').textContent = `฿${(order.installmentAmount || 0).toLocaleString()}`;
            
            const paymentLabels = { 'bank': 'โอนธนาคาร', 'cash': 'เงินสด', 'credit': 'บัตรเครดิต' };
            document.getElementById('details-payment-method').textContent = paymentLabels[order.paymentMethod] || order.paymentMethod || 'N/A';

            document.getElementById('details-order-date').textContent = order.orderDate?.toDate().toLocaleDateString('th-TH') || 'N/A';
            document.getElementById('details-payment-date').textContent = order.lastPaymentDate?.toDate().toLocaleDateString('th-TH') || 'N/A';

            const statusEl = document.getElementById('details-status');
            const statusLabels = { 'pending': 'รอดำเนินการ', 'paid': 'ชำระเต็มจำนวน', 'split': 'แบ่งชำระ', 'cancelled': 'ยกเลิก' };
            let statusText = statusLabels[order.status] || order.status || 'N/A';
            if (order.status === 'split') {
                statusText = `แบ่งชำระ (${order.installmentNumber || 0}/${order.installmentsCount} งวด)`;
            }
            statusEl.textContent = statusText;

            const statusColors = { 'pending': 'bg-yellow-100 text-yellow-800', 'paid': 'bg-green-100 text-green-800', 'split': 'bg-blue-100 text-blue-800', 'cancelled': 'bg-red-100 text-red-800' };
            statusEl.className = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold'; // Reset classes
            (statusColors[order.status] || 'bg-slate-100 text-slate-800').split(' ').forEach(c => statusEl.classList.add(c));

            detailsEditOrderButton.onclick = () => {
                closeDetailsModal();
                openEditModal(id);
            };

            orderDetailsModal.classList.remove('pointer-events-none', 'opacity-0');
            orderDetailsModalContent.classList.remove('scale-95', 'opacity-0');
        };

        // Listeners for the new details modal
        if (closeOrderDetailsModalBtn) {
            closeOrderDetailsModalBtn.addEventListener('click', closeDetailsModal);
            orderDetailsModal.addEventListener('click', (e) => { if (e.target === orderDetailsModal) closeDetailsModal(); });
        }

        const openAddModal = () => {
            editingOrderId = null;
            orderForm.reset();
            orderModalTitle.textContent = 'เพิ่มคำสั่งซื้อใหม่';
            // Set default date to today
            document.getElementById('order-date').valueAsDate = new Date();
            productTypeSelect.disabled = true; // Ensure type is disabled on new modal
            deleteOrderBtnInModal.classList.add('hidden'); // Hide delete button for new orders
            openModal();
        };

        const openEditModal = async (id) => {
            editingOrderId = id;
            orderForm.reset();
            orderModalTitle.textContent = 'แก้ไขคำสั่งซื้อ';

            const orderDoc = await getDoc(doc(db, "orders", id));
            if (!orderDoc.exists()) {
                alert("ไม่พบคำสั่งซื้อนี้ในระบบ");
                return;
            }
            const order = orderDoc.data();

            orderForm.name.value = order.customerName || '';
            orderForm.productId.value = order.productId || '';
            orderForm.quantity.value = order.quantity || 1;
            orderForm.total.value = order.totalAmount || 0;
            orderForm.payment.value = order.paymentMethod || 'bank';
            orderForm.status.value = order.status || 'pending';
            orderForm.date.value = order.orderDate?.toDate().toISOString().split('T')[0] || '';
            orderForm.paymentDate.value = order.lastPaymentDate?.toDate().toISOString().split('T')[0] || '';

            // Manually trigger the change event on the status select to show/hide split payment fields
            const statusSelect = document.getElementById('order-status');
            statusSelect.dispatchEvent(new Event('change'));

            // If it's a split payment, set the installment values
            if (order.status === 'split') {
                document.getElementById('order-installments-count').value = order.installmentsCount || 2;
                document.getElementById('order-installments-count').dispatchEvent(new Event('change')); // Trigger change to update number options
                document.getElementById('order-installment-number').value = order.installmentNumber || 1;
            }
            
            // Set and disable the product type dropdown
            productTypeSelect.value = order.productType || '';
            productTypeSelect.disabled = true;

            // Show and configure the delete button
            deleteOrderBtnInModal.classList.remove('hidden');
            // Remove old listener to prevent multiple triggers and then add the new one
            deleteOrderBtnInModal.onclick = null; 
            deleteOrderBtnInModal.onclick = () => {
                handleDeleteOrder(id, order.customerName);
                closeModal(); // Close modal after initiating delete
            };

            openModal();
        };

        const handleDeleteOrder = async (id, customerName) => {
            if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบคำสั่งซื้อของ "${customerName}"?`)) {
                try {
                    const orderRef = doc(db, "orders", id);
                    const orderSnap = await getDoc(orderRef);

                    if (!orderSnap.exists()) {
                        alert("ไม่พบคำสั่งซื้อที่ต้องการลบ");
                        return;
                    }

                    const orderData = orderSnap.data();
                    const { productId, quantity, status } = orderData;

                    // Only return stock if the order was not already cancelled
                    if (productId && quantity > 0 && status !== 'cancelled') {
                        const productRef = doc(db, "products", productId);
                        const productSnap = await getDoc(productRef);

                        if (productSnap.exists()) {
                            const newStock = (productSnap.data().stock || 0) + quantity;
                            await updateDoc(productRef, { stock: newStock });
                        }
                    }

                    await deleteDoc(orderRef);
                    logAction('DELETE_ORDER', { orderId: id, customerName: customerName });
                    loadOrders();
                } catch (error) {
                    console.error("Error deleting order:", error);
                    alert("เกิดข้อผิดพลาดในการลบคำสั่งซื้อ");
                }
            }
        };

        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveButton = document.querySelector('button[type="submit"][form="order-form"]');
            saveButton.disabled = true;

            const selectedProduct = allProductsForOrders.find(p => p.id === productSelect.value);
            const orderData = {
                customerName: orderForm.name.value,
                productId: productSelect.value,
                productName: selectedProduct ? selectedProduct.name : 'N/A', // Get product name from selected product
                productType: orderForm.productType.value, // Get product type from the new dropdown
                quantity: parseInt(orderForm.quantity.value, 10),
                totalAmount: parseFloat(totalInput.value),
                paymentMethod: orderForm.payment.value,
                status: orderForm.status.value,
                orderDate: new Date(orderForm.date.value),
                lastPaymentDate: orderForm.paymentDate.value ? new Date(orderForm.paymentDate.value) : null,
                installmentsCount: orderForm.status.value === 'split' ? parseInt(orderForm.installmentsCount.value, 10) : null,
                installmentNumber: orderForm.status.value === 'split' ? parseInt(orderForm.installmentNumber.value, 10) : null,
            };
            
            // Calculate installment amount if applicable
            if (orderData.status === 'split') {
                orderData.installmentAmount = orderData.totalAmount / orderData.installmentsCount;
            } else {
                orderData.installmentAmount = orderData.totalAmount;
            }

            if (editingOrderId) {
                const orderRef = doc(db, "orders", editingOrderId);
                const originalOrderSnap = await getDoc(orderRef);
                const originalOrderData = originalOrderSnap.data();

                // Check if status is changed to 'cancelled'
                if (originalOrderData.status !== 'cancelled' && orderData.status === 'cancelled') {
                    const { productId, quantity } = originalOrderData;
                    if (productId && quantity > 0) {
                        const productRef = doc(db, "products", productId);
                        const productSnap = await getDoc(productRef);
                        if (productSnap.exists()) {
                            const newStock = (productSnap.data().stock || 0) + quantity;
                            await updateDoc(productRef, { stock: newStock });
                            logAction('RETURN_STOCK', {
                                orderId: editingOrderId,
                                productId: productId,
                                quantity: quantity
                            });
                        }
                    }
                }

                await updateDoc(doc(db, "orders", editingOrderId), orderData);
                logAction('UPDATE_ORDER', { orderId: editingOrderId, changes: orderData });
            } else {
                // For new orders, check stock and deduct it.
                const quantityNeeded = orderData.quantity;
                const productToUpdate = allProductsForOrders.find(p => p.id === orderData.productId);

                if (!productToUpdate) {
                    alert('ไม่พบสินค้าที่เลือกในระบบ');
                    saveButton.disabled = false;
                    return;
                }

                if (productToUpdate.stock < quantityNeeded) {
                    alert(`สินค้าไม่เพียงพอ! สินค้า "${productToUpdate.name}" เหลือเพียง ${productToUpdate.stock} ชิ้น`);
                    saveButton.disabled = false;
                    return;
                }

                // Deduct stock
                const productRef = doc(db, "products", productToUpdate.id); // Use the actual document ID
                const newStock = productToUpdate.stock - quantityNeeded;
                await updateDoc(productRef, { stock: newStock });

                // Generate new custom order ID
                const orderDate = new Date(orderForm.date.value || Date.now()); // Use current date if form date is empty
                const year = orderDate.getFullYear();
                const month = String(orderDate.getMonth() + 1).padStart(2, '0');
                const day = String(orderDate.getDate()).padStart(2, '0');
                const datePrefix = `${year}${month}${day}`; // Format: YYYYMMDD

                // Find total number of orders to create a continuous sequence number
                const ordersCollectionRef = collection(db, "orders");
                const querySnapshot = await getDocs(ordersCollectionRef);
                const newCount = querySnapshot.size + 1;
                const sequenceNumber = String(newCount).padStart(4, '0');
                
                orderData.orderNumber = `${datePrefix}-${sequenceNumber}`; // Add custom readable ID to the data

                // Use addDoc to get a unique Firestore ID
                const newDocRef = await addDoc(collection(db, "orders"), orderData);
                logAction('CREATE_ORDER', { orderId: newDocRef.id, customOrderNumber: orderData.orderNumber, ...orderData });
            }

            closeModal();
            loadOrders(); // Reload and render the table
            saveButton.disabled = false;
        });

        // Event Listeners
        openOrderModalBtn.addEventListener('click', openAddModal);
        closeOrderModalBtn.addEventListener('click', closeModal);
        cancelOrderModalBtn.addEventListener('click', closeModal);
        orderModal.addEventListener('click', (e) => { if (e.target === orderModal) closeModal(); });
        productSelect.addEventListener('change', calculateTotal);
        quantityInput.addEventListener('input', calculateTotal);

        const renderOrders = (ordersToRender) => {
            ordersTable.innerHTML = '';

            if (!ordersToRender || ordersToRender.length === 0) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 7;
                td.className = 'text-center py-8 text-slate-500';
                td.textContent = 'ไม่พบข้อมูลคำสั่งซื้อ';
                tr.appendChild(td);
                ordersTable.appendChild(tr);
                return;
            }

        // Sorting logic before rendering
        ordersToRender.sort((a, b) => {
            let valA, valB;
            switch (currentOrderSortKey) {
                case 'date':
                case 'paymentDate':
                    valA = a[currentOrderSortKey] ? a[currentOrderSortKey].seconds : 0;
                    valB = b[currentOrderSortKey] ? b[currentOrderSortKey].seconds : 0;
                    break;
                case 'quantity':
                case 'total':
                case 'fullTotal':
                    const keyMap = { 'total': 'installmentAmount', 'fullTotal': 'totalAmount' };
                    const sortKey = keyMap[currentOrderSortKey] || currentOrderSortKey;
                    valA = Number(a[sortKey] || 0);
                    valB = Number(b[sortKey] || 0);
                    break;
                case 'id':
                    valA = a.orderNumber || a.id;
                    valB = b.orderNumber || b.id;
                    break;
                default: // For string-based fields like customerName, productName, etc.
                    valA = (a[currentOrderSortKey] || '').toLowerCase();
                    valB = (b[currentOrderSortKey] || '').toLowerCase();
                    break;
            }

            if (valA < valB) {
                return currentOrderSortDirection === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return currentOrderSortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });


            ordersToRender.sort((a, b) => {
                const dateA = a.orderDate ? a.orderDate.seconds : 0;
                const dateB = b.orderDate ? b.orderDate.seconds : 0;
                return dateB - dateA;
            }).forEach((order, index) => {
                const row = orderRowTemplate.content.cloneNode(true);
                row.querySelector('[data-field="sequence"]').textContent = index + 1;
                row.querySelector('[data-field="id"]').textContent = order.orderNumber ? order.orderNumber.toUpperCase() : order.id.substring(0, 8).toUpperCase(); // Show custom number, fallback to Firestore ID
                row.querySelector('[data-field="name"]').textContent = order.customerName || 'N/A'; // ชื่อลูกค้า (Customer Name)
                row.querySelector('[data-field="productName"]').textContent = order.productName || 'N/A'; // ชื่อสินค้า (Product Name)
                row.querySelector('[data-field="type-shirt"]').textContent = order.productType || 'N/A';
                
                // Translate payment method to Thai
                const paymentLabels = { 'bank': 'โอนธนาคาร', 'cash': 'เงินสด', 'credit': 'บัตรเครดิต' };
                row.querySelector('[data-field="payment"]').textContent = paymentLabels[order.paymentMethod] || order.paymentMethod || 'N/A';

                row.querySelector('[data-field="quantity"]').textContent = order.quantity || 0; // จำนวน
                row.querySelector('[data-field="total"]').textContent = `฿${Number(order.installmentAmount || 0).toLocaleString()}`; // ยอดงวดนี้
                row.querySelector('[data-field="fullTotal"]').textContent = `฿${Number(order.totalAmount || 0).toLocaleString()}`; // ยอดเต็ม
                row.querySelector('[data-field="date"]').textContent = order.orderDate && order.orderDate.seconds ? new Date(order.orderDate.seconds * 1000).toLocaleDateString('th-TH') : 'N/A'; // วันที่สั่ง
                row.querySelector('[data-field="paymentDate"]').textContent = order.lastPaymentDate && order.lastPaymentDate.seconds ? new Date(order.lastPaymentDate.seconds * 1000).toLocaleDateString('th-TH') : 'N/A'; // วันที่ชำระล่าสุด
                
                // Translate status to Thai and apply colors
                const statusEl = row.querySelector('[data-field="status"]');
                const statusLabels = {
                    'pending': 'รอดำเนินการ',
                    'paid': 'ชำระเต็มจำนวน',
                    'split': 'แบ่งชำระ',
                    'cancelled': 'ยกเลิก'
                };
                let statusText = statusLabels[order.status] || order.status || 'N/A';

                // If status is 'split', add installment details
                if (order.status === 'split' && order.installmentsCount) {
                    statusText = `แบ่งชำระ (${order.installmentNumber || 0}/${order.installmentsCount} งวด)`;
                }
                if (statusEl) statusEl.textContent = statusText;

                const statusColors = {
                    'pending': 'bg-yellow-100 text-yellow-800',
                    'paid': 'bg-green-100 text-green-800',
                    'split': 'bg-blue-100 text-blue-800',
                    'cancelled': 'bg-red-100 text-red-800',
                };
                if (statusEl) statusEl.className += ' ' + (statusColors[order.status] || 'bg-slate-100 text-slate-800');

                // Add event listener for the edit button
                row.querySelector('.edit-order').addEventListener('click', () => openEditModal(order.id));

                // Add click listener to the row to open details modal
                const tr = row.querySelector('tr');
                tr.addEventListener('click', (e) => {
                    if (!e.target.closest('button')) {
                        openDetailsModal(order.id);
                    }
                });
                ordersTable.appendChild(row);
            });
        };

        const loadOrders = async () => {
            const ordersSnapshot = await getDocs(collection(db, "orders"));
            allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateOrderSummaryCards(allOrders);
            applyAllFilters();
        };

        const applyAllFilters = () => {
            const searchTerm = searchInput.value.toLowerCase().trim();
            const startDate = dateFilterStart.value ? new Date(dateFilterStart.value).getTime() : null;
            const endDate = dateFilterEnd.value ? new Date(dateFilterEnd.value).setHours(23, 59, 59, 999) : null;
            
            let filteredOrders = allOrders;

            // 1. Filter by active status card
            if (activeStatusFilter !== 'all') {
                if (activeStatusFilter === 'paid') {
                    // 'paid' card includes both 'paid' and 'split' statuses
                    filteredOrders = filteredOrders.filter(order => order.status === 'paid' || order.status === 'split');
                } else {
                    filteredOrders = filteredOrders.filter(order => order.status === activeStatusFilter);
                }
            }

            // 2. Filter by date range
            if (startDate || endDate) {
                filteredOrders = filteredOrders.filter(order => {
                    const orderTimestamp = order.orderDate ? order.orderDate.seconds * 1000 : 0;
                    const startMatch = startDate ? orderTimestamp >= startDate : true;
                    const endMatch = endDate ? orderTimestamp <= endDate : true;
                    return startMatch && endMatch;
                });
            }

            // 3. Filter by search term
            if (searchTerm) {
                filteredOrders = filteredOrders.filter(order => {
                const customerName = (order.customerName || '').toLowerCase();
                const productName = (order.productName || '').toLowerCase();
                const orderId = (order.id || '').toLowerCase();
                const orderNumber = (order.orderNumber || '').toLowerCase();

                return orderId.includes(searchTerm) ||
                    orderNumber.includes(searchTerm) ||
                    customerName.includes(searchTerm) ||
                    productName.includes(searchTerm);
                });
            }

            renderOrders(filteredOrders);
        };

        // Search functionality
        searchInput.addEventListener('input', () => {
            applyAllFilters();
        });

        // Status Card Filter functionality
        document.querySelectorAll('[data-status-filter]').forEach(card => {
            card.addEventListener('click', () => {
                const status = card.dataset.statusFilter;
                activeStatusFilter = status;

                // Update UI for active card
                document.querySelectorAll('[data-status-filter]').forEach(c => {
                    c.classList.remove('border-sky-500', 'bg-sky-50/50');
                    c.classList.add('border-transparent');
                });
                card.classList.remove('border-transparent');
                card.classList.add('border-sky-500', 'bg-sky-50/50');

                applyAllFilters();
            });
        });

        // Date Filter functionality
        if (dateFilterStart && dateFilterEnd && clearDateFilterBtn) {
            dateFilterStart.addEventListener('change', applyAllFilters);
            dateFilterEnd.addEventListener('change', applyAllFilters);
            clearDateFilterBtn.addEventListener('click', () => {
                dateFilterStart.value = '';
                dateFilterEnd.value = '';
                applyAllFilters();
            });
        }

        // Sorting functionality
        document.querySelectorAll('#orders-table + thead th[data-sort], thead th[data-sort]').forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.dataset.sort;
                if (currentOrderSortKey === sortKey) {
                    currentOrderSortDirection = currentOrderSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentOrderSortKey = sortKey;
                    currentOrderSortDirection = 'desc'; // Default to descending for new columns
                }

                // Update UI indicators
                document.querySelectorAll('th[data-sort] .sort-arrow').forEach(arrow => arrow.innerHTML = '');
                const currentArrow = header.querySelector('.sort-arrow');
                if (currentArrow) {
                    currentArrow.innerHTML = currentOrderSortDirection === 'asc' ? '▲' : '▼';
                }

                applyAllFilters(); // Re-apply filters which will trigger a re-render with new sorting
            });
        });

        const exportOrdersToCSV = () => {
            if (currentlyRenderedOrders.length === 0) {
                alert('ไม่มีข้อมูลคำสั่งซื้อให้ Export');
                return;
            }

            const headers = [
                "รหัสคำสั่งซื้อ", "ลูกค้า", "ชื่อสินค้า", "ประเภท", "จำนวน", "ยอดงวดนี้", "ยอดเต็ม", "สถานะ", "วิธีชำระเงิน", "วันที่สั่ง", "วันที่ชำระล่าสุด"
            ];

            const rows = currentlyRenderedOrders.map(order => {
                const orderId = order.orderNumber || order.id;
                const customerName = order.customerName || 'N/A';
                const productName = order.productName || 'N/A';
                const productType = order.productType || 'N/A';
                const quantity = order.quantity || 0;
                const installmentAmount = order.installmentAmount || 0;
                const totalAmount = order.totalAmount || 0;

                const statusLabels = { 'pending': 'รอดำเนินการ', 'paid': 'ชำระเต็มจำนวน', 'split': 'แบ่งชำระ', 'cancelled': 'ยกเลิก' };
                let statusText = statusLabels[order.status] || order.status || 'N/A';
                if (order.status === 'split') {
                    statusText = `แบ่งชำระ (${order.installmentNumber || 0}/${order.installmentsCount} งวด)`;
                }

                const paymentLabels = { 'bank': 'โอนธนาคาร', 'cash': 'เงินสด', 'credit': 'บัตรเครดิต' };
                const paymentMethod = paymentLabels[order.paymentMethod] || order.paymentMethod || 'N/A';

                const orderDate = order.orderDate?.toDate().toLocaleDateString('th-TH') || 'N/A';
                const paymentDate = order.lastPaymentDate?.toDate().toLocaleDateString('th-TH') || 'N/A';

                // Escape commas and quotes for CSV
                const escapeCSV = (str) => `"${String(str).replace(/"/g, '""')}"`;

                return [orderId, customerName, productName, productType, quantity, installmentAmount, totalAmount, statusText, paymentMethod, orderDate, paymentDate].map(escapeCSV).join(',');
            });

            // Add BOM for UTF-8 in Excel
            const bom = '\uFEFF';
            const csvContent = bom + [headers.join(','), ...rows].join('\n');
            const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `orders_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        if (exportBtn) {
            exportBtn.addEventListener('click', exportOrdersToCSV);
        }

        loadOrders();
        populateProductsDropdown(); // Initial population of products
    }
}

const updateOrderSummaryCards = (orders) => {
    const totalOrders = orders.length;
    // นับรวม 'paid' และ 'split' เป็นชำระแล้ว
    const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'split').length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;

    const totalEl = document.getElementById('total-orders-count');
    const paidEl = document.getElementById('paid-orders-count');
    const pendingEl = document.getElementById('pending-orders-count');
    const cancelledEl = document.getElementById('cancelled-orders-count');

    if(totalEl) totalEl.textContent = totalOrders.toLocaleString();
    if(paidEl) paidEl.textContent = paidOrders.toLocaleString();
    if(pendingEl) pendingEl.textContent = pendingOrders.toLocaleString();
    if(cancelledEl) cancelledEl.textContent = cancelledOrders.toLocaleString();
};

// --- Change Password Logic (for profile.html) ---
// This functionality is removed as Firebase Auth is no longer used.

// --- User Management Page Logic (for user-management.html) ---
if (document.getElementById('users-table')) {
  const usersTable = document.getElementById('users-table');
  const userRowTemplate = document.getElementById('user-row-template');
  const openUserModalBtn = document.getElementById('open-user-modal');
  const userModal = document.getElementById('user-modal');
  const userModalContent = document.getElementById('user-modal-content');
  const userModalTitle = document.getElementById('user-modal-title');
  const closeUserModalBtn = document.getElementById('close-user-modal');
  const cancelUserModalBtn = document.getElementById('cancel-user-modal');
  const userForm = document.getElementById('user-form');
  const passwordHelperText = document.getElementById('password-helper-text');

  // New Details Modal elements
  const userDetailsModal = document.getElementById('user-details-modal');
  const userDetailsModalContent = document.getElementById('user-details-modal-content');
  const closeUserDetailsModalBtn = document.getElementById('close-user-details-modal');
  const detailsEditButton = document.getElementById('details-edit-button');

  let editingUsername = null;
  let allUsers = []; // Store all users for sorting/filtering
  let currentSortKey = 'fullName';
  let currentSortDirection = 'asc';


  const openDetailsModal = async (uid) => {
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) return;
    const user = { uid: userDocSnap.id, ...userDocSnap.data() };

    document.getElementById('details-profile-picture').src = user.profilePictureUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' /%3E%3C/svg%3E";
    document.getElementById('details-full-name').textContent = `${user.firstName || ''} ${user.lastName || ''}`.trim() || '(ยังไม่มีชื่อ)';
    document.getElementById('details-username').textContent = `@${user.username}` || '';
    document.getElementById('details-email').textContent = user.email || 'N/A';
    document.getElementById('details-phone').textContent = user.phone || 'N/A';
    
    const roleEl = document.getElementById('details-role');
    roleEl.textContent = user.role || 'N/A';
    // Reset classes and apply new ones
    roleEl.className = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold';
    const roleStyles = { 'super-platinum-admin': 'bg-purple-200 text-purple-800', 'admin': 'bg-red-100 text-red-800', 'user': 'bg-slate-100 text-slate-700' };
    (roleStyles[user.role] || roleStyles['user']).split(' ').forEach(c => roleEl.classList.add(c));

    // Configure edit button
    detailsEditButton.onclick = () => {
      closeDetailsModal();
      openEditModal(uid);
    };

    userDetailsModal.classList.remove('pointer-events-none', 'opacity-0');
    userDetailsModalContent.classList.remove('scale-95', 'opacity-0');
  };

  const updateUserSummaryCards = (users) => {
    const totalUsers = users.length;
    // นับรวม super-platinum-admin และ admin เข้าด้วยกัน
    const adminUsers = users.filter(u => u.role === 'admin' || u.role === 'super-platinum-admin').length;
    const regularUsers = users.filter(u => u.role === 'user').length;

    const totalEl = document.getElementById('total-users-count');
    const adminEl = document.getElementById('admin-users-count');
    const regularEl = document.getElementById('regular-users-count');

    if (totalEl) totalEl.textContent = totalUsers.toLocaleString();
    if (adminEl) adminEl.textContent = adminUsers.toLocaleString();
    if (regularEl) regularEl.textContent = regularUsers.toLocaleString();
  };

  const loadAndDisplayUsers = async () => {
    const currentUserData = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUserData) return;
    const usersSnapshot = await getDocs(collection(db, "users"));
    allUsers = usersSnapshot.docs.map(docSnap => ({ uid: docSnap.id, ...docSnap.data() }));
    updateUserSummaryCards(allUsers); // อัปเดตการ์ดสรุป
    renderUsers(); // เรียก renderUsers เพื่อแสดงผล
  };

  const renderUsers = () => {
    const currentUserData = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUserData) return;

    // Sorting logic
    const sortedUsers = [...allUsers].sort((a, b) => {
      let valA, valB;
      if (currentSortKey === 'fullName') {
        valA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
        valB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
      } else { // 'role' or other string-based fields
        valA = (a[currentSortKey] || '').toLowerCase();
        valB = (b[currentSortKey] || '').toLowerCase();
      }

      if (valA < valB) {
        return currentSortDirection === 'asc' ? -1 : 1;
      }
      if (valA > valB) {
        return currentSortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    usersTable.innerHTML = '';

    sortedUsers.forEach(user => {
      const row = userRowTemplate.content.cloneNode(true);
      const tr = row.querySelector('tr');
      tr.dataset.userId = user.uid;

      const profilePicEl = row.querySelector('[data-field="profilePicture"]');
      if (user.profilePictureUrl) {
        profilePicEl.src = user.profilePictureUrl;
      } else {
        profilePicEl.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' /%3E%3C/svg%3E";
      }

      row.querySelector('[data-field="fullName"]').textContent = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || '(ยังไม่มีชื่อ)';
      row.querySelector('[data-field="email"]').textContent = user.email || 'N/A';
      row.querySelector('[data-field="username"]').textContent = user.username || '(ไม่มี)';

      const roleEl = row.querySelector('[data-field="role"]');
      if (roleEl) {
        roleEl.textContent = user.role;
        const roleStyles = {
          'super-platinum-admin': 'bg-purple-200 text-purple-800 border border-purple-300',
          'admin': 'bg-red-100 text-red-800 border border-red-200',
          'user': 'bg-slate-100 text-slate-700 border border-slate-200'
        };
        const style = roleStyles[user.role] || roleStyles['user'];
        style.split(' ').forEach(c => roleEl.classList.add(c));
      } else {
        row.querySelector('td[data-field="role"]').textContent = user.role;
      }

      const editBtn = row.querySelector('.edit-user');
      const deleteBtn = row.querySelector('.delete-user');

      // Super Platinum Admin can edit anyone except themselves.
      // Regular admin cannot edit other admins or the super platinum admin.
      const isCurrentUser = user.uid === currentUserData.uid;
      const isTargetAdminOrHigher = user.role === 'admin' || user.role === 'super-platinum-admin';
      const isCurrentUserAdmin = currentUserData.role === 'admin';
      const isTargetSuperPlatinum = user.role === 'super-platinum-admin';

      if (isCurrentUser || (isCurrentUserAdmin && isTargetAdminOrHigher)) {
        editBtn.disabled = true;
        deleteBtn.disabled = true;
        editBtn.title = "คุณไม่มีสิทธิ์แก้ไขผู้ใช้ระดับสูงกว่าหรือเท่ากัน";
        deleteBtn.title = "คุณไม่มีสิทธิ์ลบผู้ใช้นี้";
      } else if (isTargetSuperPlatinum && currentUserData.role !== 'super-platinum-admin') { // No one except another SPA can edit/delete a super platinum admin
        editBtn.disabled = true;
        deleteBtn.disabled = true;
        editBtn.title = "คุณไม่มีสิทธิ์แก้ไข Super Platinum Admin";
        deleteBtn.title = "ไม่สามารถลบ Super Platinum Admin ได้";
      } else {
        editBtn.addEventListener('click', () => openEditModal(user.uid));
        deleteBtn.addEventListener('click', () => handleDeleteUser(user.uid, user.email, user.username));
      }

      // Add click listener to the row to open details modal
      tr.addEventListener('click', (e) => {
        // Open details modal only if the click was not on a button inside the row
        if (!e.target.closest('button')) {
          openDetailsModal(user.uid);
        }
      });

      usersTable.appendChild(row);
    });
  };

  const openModal = () => {
    userModal.classList.remove('pointer-events-none', 'opacity-0');
    userModalContent.classList.remove('scale-95', 'opacity-0');
  };

  const closeModal = () => {
    userModal.classList.add('opacity-0');
    userModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      userModal.classList.add('pointer-events-none');
      userForm.reset();
      editingUsername = null;
    }, 300);
  };

  const closeDetailsModal = () => {
    userDetailsModal.classList.add('opacity-0');
    userDetailsModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      userDetailsModal.classList.add('pointer-events-none');
    }, 300);
  };


  const openAddModal = () => {
    editingUsername = null;
    userForm.reset();
    userModalTitle.textContent = 'เพิ่มผู้ใช้ใหม่';

    // ซ่อนฟิลด์อีเมลเมื่อเป็นการเพิ่มผู้ใช้ใหม่
    const emailField = userForm.querySelector('#email')?.closest('div');
    if (emailField) {
      emailField.style.display = 'none';
    }
    // ซ่อนช่องแสดงรหัสผ่านปัจจุบันเมื่อเป็นการเพิ่มผู้ใช้ใหม่
    const currentPasswordDisplay = userForm.querySelector('#current-password-display');
    if (currentPasswordDisplay) {
      currentPasswordDisplay.style.display = 'none';
    }

    // Make sure name fields are visible for new user
    const nameFields = userForm.querySelector('#firstName')?.closest('.grid');
    if (nameFields) {
      nameFields.style.display = 'grid';
    }

    userForm.password.required = true;
    passwordHelperText.textContent = 'จำเป็นต้องกรอกรหัสผ่านสำหรับผู้ใช้ใหม่';
    openModal();
  };

  const openEditModal = async (uid) => {
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) return;
    const user = userDocSnap.data();
    editingUsername = uid;
    userForm.reset();
    userModalTitle.textContent = 'แก้ไขผู้ใช้';
    
    // Show email field and populate data when editing
    const emailField = userForm.querySelector('#email')?.closest('div');
    if (emailField) {
      emailField.style.display = 'block';
      const emailInput = userForm.querySelector('#email');
      if (emailInput) {
        emailInput.value = user.email || '';
        // Make email editable by default, but read-only for super admin
        emailInput.readOnly = (user.email === 'admin@system.local');
        emailInput.disabled = (user.email === 'admin@system.local'); // Also disable to prevent focus
        emailInput.classList.toggle('bg-slate-100', user.email === 'admin@system.local');
        emailInput.classList.toggle('text-slate-500', user.email === 'admin@system.local');
        emailInput.classList.toggle('cursor-not-allowed', user.email === 'admin@system.local');
      }
    }
    const currentPasswordDisplay = userForm.querySelector('#current-password-display');
    if (currentPasswordDisplay) {
      currentPasswordDisplay.style.display = 'block';
      userForm['current-password'].value = user.password || ''; // ใส่รหัสผ่านปัจจุบัน
    }

    userForm.username.value = user.username || ''; // เพิ่มบรรทัดนี้
    
    // Populate name fields for editing
    const nameFields = userForm.querySelector('#firstName')?.closest('.grid');
    if (nameFields) {
      nameFields.style.display = 'grid';
      userForm.firstName.value = user.firstName || '';
      userForm.lastName.value = user.lastName || '';
    }

    userForm.role.value = user.role;
    userForm.password.required = false;
    passwordHelperText.textContent = 'เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน';
    
    // Prevent admin from demoting themselves
    // Only Super Platinum Admin can change roles of admins.
    const currentUserRole = JSON.parse(localStorage.getItem('currentUser')).role;
    if (user.role === 'super-platinum-admin' && currentUserRole !== 'super-platinum-admin') {
        userForm.role.disabled = true;
    } else if (user.role === 'admin' && currentUserRole === 'admin' && user.uid !== JSON.parse(localStorage.getItem('currentUser')).uid) {
        userForm.role.disabled = true;
    }else {
        userForm.role.disabled = false;
    }

    openModal();
  };

  const handleDeleteUser = async (uid, email, username) => {
    const confirmationMessage = `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ "${username || email}"? การกระทำนี้ไม่สามารถย้อนกลับได้`;
    if (!confirm(confirmationMessage)) return;

    try {
      // 1. Delete user's profile picture folder from Storage
      if (username) {
        const userFolderRef = ref(storage, `profilePictures/${username}`);
        const res = await listAll(userFolderRef);
        const deletePromises = res.items.map(itemRef => deleteObject(itemRef));
        await Promise.all(deletePromises);
        console.log(`Successfully deleted storage folder for user: ${username}`);
      }

      // 2. Delete user document from Firestore
      await deleteDoc(doc(db, "users", uid));
      
      logAction('DELETE_USER_RECORD', { userId: uid, email: email, username: username });
      await renderUsers(); // Re-render the table
      alert('ลบบัญชีผู้ใช้แล้ว');

    } catch (error) {
      console.error("Error deleting user and their files:", error);
      alert('เกิดข้อผิดพลาดในการลบผู้ใช้: ' + error.message);
    }
  };

  openUserModalBtn.addEventListener('click', openAddModal);
  closeUserModalBtn.addEventListener('click', closeModal);
  cancelUserModalBtn.addEventListener('click', closeModal);
  userModal.addEventListener('click', (e) => { if (e.target === userModal) closeModal(); });

  // Listeners for the new details modal
  closeUserDetailsModalBtn.addEventListener('click', closeDetailsModal);
  userDetailsModal.addEventListener('click', (e) => { if (e.target === userDetailsModal) closeDetailsModal(); });

  // --- Sorting Event Listeners ---
  document.querySelectorAll('th[data-sort]').forEach(header => {
    header.addEventListener('click', () => {
      const sortKey = header.dataset.sort;

      if (currentSortKey === sortKey) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortKey = sortKey;
        currentSortDirection = 'asc'; // Default to ascending for new column
      }

      // Update sort indicators
      document.querySelectorAll('th[data-sort]').forEach(th => {
        const indicator = th.querySelector('.sort-indicator');
        if (indicator) {
          indicator.textContent = th === header ? (currentSortDirection === 'asc' ? '▲' : '▼') : '';
        }
      });

      renderUsers(); // Re-render with new sorting
    });
  });


  // --- Password Visibility Toggle ---
  const toggleBtn = document.getElementById('toggle-password-visibility');
  const currentPasswordInput = document.getElementById('current-password');
  const eyeIcon = document.getElementById('eye-icon');
  const eyeSlashIcon = document.getElementById('eye-slash-icon');

  if (toggleBtn && currentPasswordInput && eyeIcon && eyeSlashIcon) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = currentPasswordInput.type === 'password';
      currentPasswordInput.type = isPassword ? 'text' : 'password';
      eyeIcon.classList.toggle('hidden', isPassword);
      eyeSlashIcon.classList.toggle('hidden', !isPassword);
      toggleBtn.title = isPassword ? 'ซ่อนรหัสผ่าน' : 'ดูรหัสผ่าน';
    });
  }


  // --- User Management Form Submission ---
  if (userForm) {
    if (!userForm.dataset.listenerAttached) {
      userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveButton = document.getElementById('save-user-button') || document.getElementById('save-profile-button');
        saveButton.disabled = true;
        saveButton.textContent = 'กำลังบันทึก...';

        const email = userForm.email.value || ''; // ใช้อีเมลจากฟอร์ม หรือค่าว่างถ้าไม่มี
        const username = userForm.username.value.trim();
        const password = userForm.password.value;
        const role = userForm.role.value;
        const firstName = userForm.firstName.value.trim();
        const lastName = userForm.lastName.value.trim();

        const editingUid = editingUsername; // Use the variable set in openEditModal

        // ตรวจสอบว่า username ซ้ำหรือไม่ (ทั้งตอนเพิ่มและแก้ไข)
        if (username) {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("username", "==", username));
            const querySnapshot = await getDocs(q);
            const isUsernameTaken = !querySnapshot.empty && (querySnapshot.docs[0].id !== editingUid);

            if (isUsernameTaken) {
                alert(`ชื่อผู้ใช้ "${username}" ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น`);
                saveButton.disabled = false;
                saveButton.textContent = 'บันทึก';
                return;
            }
        }

        if (editingUid) {
            // Editing user
            const updateData = { 
              role: role,
              username: username, // อัปเดต username
              email: email, // อัปเดต email
              firstName: firstName,
              lastName: lastName
            };
            // Add password update logic if a new password is provided
            if (password) {
              // **ข้อควรระวัง**: ไม่ควรเก็บรหัสผ่านเป็น Plain text
              // ในระบบจริงควรใช้ Hashing
              updateData.password = password;
            }
            await updateDoc(doc(db, "users", editingUid), updateData);
            logAction('UPDATE_USER', { userId: editingUid, changes: { role, username } });
            alert(`อัปเดตข้อมูลผู้ใช้ ${password ? 'และรหัสผ่าน' : ''} เรียบร้อยแล้ว`);
        } else {
            // Adding new user
            if (!username || !password) {
                alert('กรุณากรอกชื่อผู้ใช้ และรหัสผ่านสำหรับผู้ใช้ใหม่');
                saveButton.disabled = false;
                saveButton.textContent = 'บันทึก';
                return;
            }
            
            // สร้างข้อมูลผู้ใช้ใหม่
            const newUser = {
              username: username,
              password: password, // **ข้อควรระวัง**: ควร hash รหัสผ่านก่อนเก็บ
              role: role,
              email: '', // ตั้งเป็นค่าว่าง
              firstName: firstName, 
              lastName: lastName, 
              phone: '', 
              profilePictureUrl: ''
            };
            await setDoc(doc(db, "users", username), newUser);
            logAction('CREATE_USER', { userId: username, username: username, role: role, firstName: firstName, lastName: lastName });
            alert('สร้างผู้ใช้ใหม่สำเร็จแล้ว');
        }

        closeModal();

        saveButton.disabled = false;
        saveButton.textContent = 'บันทึก';
      });
      userForm.dataset.listenerAttached = 'true';
    }
  }

  // Initial render
  loadAndDisplayUsers();

  // Expose the function to the window object for the refresh button
  window.userManagement = window.userManagement || {};
  window.userManagement.loadAndDisplayUsers = loadAndDisplayUsers;
}

// --- Audit Log Page Logic (for audit-log.html) ---
if (document.getElementById('audit-log-table-body')) {
    const logTableBody = document.getElementById('audit-log-table-body');
    const logRowTemplate = document.getElementById('log-row-template');
    const searchInput = document.getElementById('log-search-input');
    const userFilter = document.getElementById('log-user-filter');
    const actionFilter = document.getElementById('log-action-filter');
    const dateStartFilter = document.getElementById('log-date-filter-start');
    const dateEndFilter = document.getElementById('log-date-filter-end');
    const clearFiltersBtn = document.getElementById('clear-log-filters');
    const exportBtn = document.getElementById('export-log-button');

    let allLogs = [];
    let allUsers = [];
    let currentSortKey = 'timestamp';
    let currentSortDirection = 'desc';
    let currentlyRenderedLogs = []; // To store the logs currently being displayed

    const renderLogs = (logsToRender) => {
        logTableBody.innerHTML = '';
        if (!logsToRender || logsToRender.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.className = 'text-center py-8 text-slate-500';
            td.textContent = 'ไม่พบข้อมูลประวัติการแก้ไข';
            tr.appendChild(td);
            logTableBody.appendChild(tr);
            return;
        }

        currentlyRenderedLogs = logsToRender; // Keep a reference for exporting

        // Sorting logic
        logsToRender.sort((a, b) => {
            let valA, valB;
            if (currentSortKey === 'timestamp') {
                valA = a.timestamp?.seconds || 0;
                valB = b.timestamp?.seconds || 0;
            } else { // 'user' or other string-based fields
                valA = (a[currentSortKey] || '').toLowerCase();
                valB = (b[currentSortKey] || '').toLowerCase();
            }

            if (valA < valB) {
                return currentSortDirection === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return currentSortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });

        logsToRender.forEach(log => {
            const row = logRowTemplate.content.cloneNode(true);
            const timestamp = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('th-TH') : 'N/A';
            row.querySelector('[data-field="timestamp"]').textContent = timestamp;
            row.querySelector('[data-field="user"]').textContent = log.user || log.userId;
            row.querySelector('[data-field="action"]').textContent = log.action;
            
            const detailsEl = row.querySelector('[data-field="details"]');
            try {
                const keyTranslations = {
                    userId: 'รหัสผู้ใช้', username: 'ชื่อผู้ใช้', role: 'สิทธิ์',
                    productId: 'รหัสสินค้า', productName: 'ชื่อสินค้า',
                    orderId: 'รหัสคำสั่งซื้อ', customerName: 'ชื่อลูกค้า',
                    changes: 'การเปลี่ยนแปลง',
                    data: 'ข้อมูล',
                    firstName: 'ชื่อจริง',
                    lastName: 'นามสกุล',
                    productType: 'ประเภท',
                    quantity: 'จำนวน',
                    totalAmount: 'ยอดรวม',
                    paymentMethod: 'วิธีชำระเงิน',
                    status: 'สถานะ'
                };

                let detailsObj = log.details || {};
                let detailsText = '';

                // If details is a string, try to parse it.
                if (typeof detailsObj === 'string') {
                    try { detailsObj = JSON.parse(detailsObj); } catch (e) { /* ignore if not json */ }
                }

                // Flatten the 'data' property if it exists
                if (detailsObj.data && typeof detailsObj.data === 'object') {
                    detailsObj = { ...detailsObj, ...detailsObj.data };
                    delete detailsObj.data;
                }

                detailsText = Object.entries(detailsObj)
                    .filter(([key, value]) => value !== null && typeof value !== 'object') // Filter out objects and nulls
                    .map(([key, value]) => `${keyTranslations[key] || key}: ${value}`)
                    .join(' | ');
                
                detailsEl.textContent = detailsText || '-';
            } catch (e) {
                detailsEl.textContent = 'ไม่สามารถแสดงรายละเอียดได้';
            }

            logTableBody.appendChild(row);
        });
    };

    const applyFilters = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedUser = userFilter.value;
        const selectedAction = actionFilter.value;
        const startDate = dateStartFilter.value ? new Date(dateStartFilter.value).setHours(0, 0, 0, 0) : null;
        const endDate = dateEndFilter.value ? new Date(dateEndFilter.value).setHours(23, 59, 59, 999) : null;

        const filteredLogs = allLogs.filter(log => {
            const logTimestamp = log.timestamp ? log.timestamp.seconds * 1000 : 0;

            const userMatch = !selectedUser || log.userId === selectedUser;
            const actionMatch = !selectedAction || log.action.includes(selectedAction);
            const dateMatch = (!startDate || logTimestamp >= startDate) && (!endDate || logTimestamp <= endDate);
            
            const searchMatch = !searchTerm || 
                (log.user && log.user.toLowerCase().includes(searchTerm)) ||
                (log.action && log.action.toLowerCase().includes(searchTerm)) ||
                (JSON.stringify(log.details).toLowerCase().includes(searchTerm));

            return userMatch && actionMatch && dateMatch && searchMatch;
        });

        renderLogs(filteredLogs);
    };

    const populateUserFilter = () => {
        const uniqueUsers = [...new Map(allUsers.map(item => [item.uid, item])).values()];
        uniqueUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.uid;
            option.textContent = user.username || user.email;
            userFilter.appendChild(option);
        });
    };

    const loadData = async () => {
        try {
            // Load users for filter dropdown
            const usersSnapshot = await getDocs(collection(db, "users"));
            allUsers = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            populateUserFilter();

            // Load logs
            const logsSnapshot = await getDocs(collection(db, "audit_logs"));
            allLogs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderLogs(allLogs);
        } catch (error) {
            console.error("Error loading audit log data:", error);
            logTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
        }
    };

    // Event Listeners
    [searchInput, userFilter, actionFilter, dateStartFilter, dateEndFilter].forEach(el => {
        el.addEventListener('input', applyFilters);
        el.addEventListener('change', applyFilters);
    });

    clearFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        userFilter.value = '';
        actionFilter.value = '';
        dateStartFilter.value = '';
        dateEndFilter.value = '';
        renderLogs(allLogs);
    });

    const exportLogsToCSV = () => {
        const headers = ["วันที่/เวลา", "ผู้ดำเนินการ", "การกระทำ", "รายละเอียด"];
        
        const rows = currentlyRenderedLogs.map(log => {
            const timestamp = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('th-TH') : 'N/A';
            const user = log.user || log.userId;
            const action = log.action;
            
            // Use the same logic as renderLogs for details
            let detailsText = '-';
            try {
                let detailsObj = log.details || {};
                if (typeof detailsObj === 'string') {
                    try { detailsObj = JSON.parse(detailsObj); } catch (e) { /* ignore */ }
                }
                if (detailsObj.data && typeof detailsObj.data === 'object') {
                    detailsObj = { ...detailsObj, ...detailsObj.data };
                    delete detailsObj.data;
                }
                detailsText = Object.entries(detailsObj)
                    .filter(([key, value]) => value !== null && typeof value !== 'object')
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(' | ');
            } catch (e) { /* ignore */ }

            // Escape commas and quotes for CSV
            const escapeCSV = (str) => `"${String(str).replace(/"/g, '""')}"`;

            return [timestamp, user, action, detailsText].map(escapeCSV).join(',');
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `audit_log_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Sorting Event Listeners
    document.querySelectorAll('#audit-log-table-body + thead th[data-sort], thead th[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sort;

            if (currentSortKey === sortKey) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortKey = sortKey;
                currentSortDirection = 'desc'; // Default to descending for new column
            }

            document.querySelectorAll('th[data-sort]').forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
            header.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');

            applyFilters(); // Re-apply filters which will trigger a re-render with new sorting
        });
    });

    exportBtn.addEventListener('click', exportLogsToCSV);

    loadData();
}

// --- Global "Auth" State Checker (using localStorage) ---
function checkAuthState() {
  const currentPath = window.location.pathname;
  const isAuthPage = currentPath.endsWith('login.html');
  const protectedPage = Object.keys(pageAccess).find(page => currentPath.includes(page));

  const userDataString = localStorage.getItem('currentUser');
  const userData = userDataString ? JSON.parse(userDataString) : null;

  // กรณีที่ 1: ผู้ใช้ยังไม่ได้ล็อกอิน (ไม่มีข้อมูลใน localStorage)
  if (!userData) {
    // ถ้าพยายามเข้าหน้าอื่นที่ไม่ใช่หน้า login, ให้เด้งกลับไปหน้า login
    if (!isAuthPage) {
      window.location.replace('./login.html');
    }
    // ถ้าอยู่ที่หน้า login อยู่แล้ว ก็ไม่ต้องทำอะไร
    return;
  }

  // กรณีที่ 2: ผู้ใช้ล็อกอินแล้ว (มีข้อมูลใน localStorage)
  const userRole = userData.role;

  // ถ้าผู้ใช้ที่ล็อกอินแล้ว พยายามจะเข้าหน้า login, ให้เด้งไปหน้า dashboard
  if (isAuthPage) {
    window.location.replace('./dashboard.html');
    return;
  }

  // ตรวจสอบสิทธิ์การเข้าถึงหน้าปัจจุบัน
  if (protectedPage && !pageAccess[protectedPage].includes(userRole)) {
    // แสดงข้อความแจ้งเตือน และเมื่อผู้ใช้กด OK จะทำการ logout
    alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ ระบบจะทำการออกจากระบบเพื่อให้คุณล็อกอินใหม่อีกครั้ง');
    localStorage.removeItem('currentUser'); // ลบข้อมูลผู้ใช้ออกจากระบบทันที
    window.location.replace('./login.html'); // ส่งกลับไปหน้า login
    return;
  }

  // ถ้าผ่านทุกเงื่อนไข (ล็อกอินแล้ว และมีสิทธิ์เข้าหน้านี้) ให้อัปเดต UI
  if (userData) {
    updateUIAfterLogin(userData);
  }
}

function updateUIAfterLogin(userData) {
    const logoutButtons = document.querySelectorAll('.logout-button');
    logoutButtons.forEach(button => {
        if (!button.dataset.listenerAttached) {
            button.addEventListener('click', (e) => { e.preventDefault(); logout(); });
            button.dataset.listenerAttached = 'true';
        }
    });

    const userDisplayElements = document.querySelectorAll('.user-display');
    userDisplayElements.forEach(element => {
        if (userData && userData.firstName) {
            element.textContent = `${userData.firstName} ${userData.lastName || ''}`.trim();
        } else {
            element.textContent = userData.username || userData.email;
        }
    });

    if (userData && userData.profilePictureUrl) {
        const headerImgs = document.querySelectorAll('#header-profile-img');
        headerImgs.forEach(img => {
            img.src = userData.profilePictureUrl;
            img.onerror = () => { img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' /%3E%3C/svg%3E"; };
        });
    }

    document.querySelectorAll('[data-role]').forEach(element => {
        const requiredRolesForElement = element.dataset.role.split(' ');
        if (!requiredRolesForElement.includes(userData.role)) {
            // Hide the element, but check if it's a table cell/header to hide the whole column
            if (element.tagName === 'TH' || element.tagName === 'TD') {
                element.classList.add('hidden');
            } else {
                element.style.display = 'none';
            }
        }
    });
}

// Run the auth check
checkAuthState();
// Make logout function globally accessible for inline event handlers
window.logout = logout;