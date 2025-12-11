import { initializeProductsPage } from './products.js';
import { initializeOrdersPage } from './orders.js';
import { initializeUserManagementPage } from './user-management.js';

// หมายเหตุ: โค้ดส่วน app.js ไม่ได้ถูก import ใน index.html จึงย้ายฟังก์ชันที่จำเป็นมาไว้ที่นี่
export async function logAction(action, details = {}) {
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
import { collection, getDocs, query, where, doc, getDoc, updateDoc, deleteDoc, addDoc, setDoc, orderBy, limit, startAfter, getAggregateFromServer, sum, count } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
      await logAction('LOGIN', { username: inputUsername, userId: userDoc.id });
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
    // Keep track of chart instances to destroy them before re-rendering
    let monthlySalesChartInstance = null;
    let paymentTypeChartInstance = null;
    let productTypeChartInstance = null;

    const initializeDashboard = async () => {
        const dashboardElement = document.getElementById('dashboard-content');
        try {
            // --- 1. Populate Stat Cards using Aggregate Queries ---
            const ordersCollection = collection(db, "orders");
            const productsCollection = collection(db, "products");

            // Create queries
            // Using 'in' is more efficient than '!=' for Firestore queries.
            const validOrdersQuery = query(ordersCollection, where('status', 'in', ['pending', 'paid', 'split']));
            const lowStockQuery = query(productsCollection, where('stock', '<', 10));

            // Perform aggregations in parallel
            const [ordersAggSnapshot, lowStockAggSnapshot] = await Promise.all([
                getAggregateFromServer(validOrdersQuery, {
                    totalSales: sum('totalAmount'),
                    totalOrders: count()
                }),
                getAggregateFromServer(lowStockQuery, {
                    lowStockItems: count()
                })
            ]);

            const totalSales = ordersAggSnapshot.data().totalSales || 0;
            const totalOrdersCount = ordersAggSnapshot.data().totalOrders || 0;
            const lowStockItemsCount = lowStockAggSnapshot.data().lowStockItems || 0;

            document.getElementById('total-sales').textContent = `฿${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('total-orders').textContent = totalOrdersCount.toLocaleString();
            document.getElementById('low-stock-items-count').textContent = lowStockItemsCount.toLocaleString();

            // --- 1.5. Show Low Stock Notification Banner ---
            const lowStockNotification = document.getElementById('low-stock-notification');
            const lowStockAlertCount = document.getElementById('low-stock-alert-count');
            if (lowStockItemsCount > 0 && lowStockNotification && lowStockAlertCount) {
                lowStockAlertCount.textContent = lowStockItemsCount.toLocaleString();
                lowStockNotification.classList.remove('hidden');
            }

            // For metrics not supported by aggregation (like distinct count), we still need to fetch some data.
            // This is less efficient but necessary for now.
            const validOrdersDocs = await getDocs(validOrdersQuery);
            const validOrders = validOrdersDocs.docs.map(d => d.data());
            const totalCustomers = new Set(validOrders.map(o => o.customerName)).size;
            document.getElementById('total-customers').textContent = totalCustomers.toLocaleString();


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
                if (monthlySalesChartInstance) {
                    monthlySalesChartInstance.destroy();
                }
                monthlySalesChartInstance = new Chart(monthlySalesCtx, {
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
                if (paymentTypeChartInstance) {
                    paymentTypeChartInstance.destroy();
                }
                paymentTypeChartInstance = new Chart(paymentTypeCtx, {
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
                if (order.items && order.items.length > 0) {
                    // New format: iterate through items array
                    order.items.forEach(item => {
                        const type = item.productType || 'ไม่ระบุ';
                        const itemTotal = (item.price || 0) * (item.quantity || 0);
                        productTypeSales[type] = (productTypeSales[type] || 0) + itemTotal;
                    });
                } else {
                    // Old format: direct productType field
                    const type = order.productType || 'ไม่ระบุ';
                    productTypeSales[type] = (productTypeSales[type] || 0) + (order.totalAmount || 0);
                }
            });

            const productTypeCtx = document.getElementById('product-type-chart');
            if (productTypeCtx) {
                if (productTypeChartInstance) {
                    productTypeChartInstance.destroy();
                }
                productTypeChartInstance = new Chart(productTypeCtx, {
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

            // --- 5. Top Selling Products ---
            const productSales = {};
            validOrders.forEach(order => {
                if (order.items && order.items.length > 0) {
                    // New format: iterate through items array
                    order.items.forEach(item => {
                        const name = item.productName || 'สินค้าไม่ระบุ';
                        const quantity = item.quantity || 0;
                        productSales[name] = (productSales[name] || 0) + quantity;
                    });
                } else {
                    // Old format: direct productName and quantity fields
                    const name = order.productName || 'สินค้าไม่ระบุ';
                    const quantity = order.quantity || 0;
                    productSales[name] = (productSales[name] || 0) + quantity;
                }
            });

            const sortedProducts = Object.entries(productSales)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);

            const topProductsList = document.getElementById('top-selling-products-list');
            if (topProductsList) {
                topProductsList.innerHTML = '';
                if (sortedProducts.length > 0) {
                    sortedProducts.forEach(([name, totalQuantity], index) => {
                        const li = document.createElement('li');
                        li.className = 'flex items-center justify-between gap-4';
                        li.innerHTML = `
                            <div class="flex items-center gap-3">
                                <span class="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 text-sm font-semibold text-slate-500">${index + 1}</span>
                                <span class="font-medium text-slate-800">${name}</span>
                            </div>
                            <span class="font-semibold text-blue-600">${totalQuantity.toLocaleString()} ชิ้น</span>
                        `;
                        topProductsList.appendChild(li);
                    });
                } else {
                    topProductsList.innerHTML = '<li class="py-4 text-center text-slate-400">ไม่พบข้อมูลสินค้าขายดี</li>';
                }
            }
            // --- 7. Low Stock Products List ---
            const lowStockProductsQuery = query(productsCollection, where('stock', '<', 10), orderBy('stock', 'asc'), limit(5));
            const lowStockProductsSnapshot = await getDocs(lowStockProductsQuery);
            const lowStockProducts = lowStockProductsSnapshot.docs.map(d => d.data());

            const lowStockProductsList = document.getElementById('low-stock-products-list');
            if (lowStockProductsList) {
                lowStockProductsList.innerHTML = '';
                if (lowStockProducts.length > 0) {
                    lowStockProducts.forEach(product => {
                        const li = document.createElement('li');
                        li.className = 'flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-50/80';
                        li.innerHTML = `
                            <div class="flex items-center gap-3">
                                <div class="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-100 text-amber-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                                </div>
                                <div>
                                    <p class="font-semibold text-slate-800">${product.name}</p>
                                    <p class="text-xs text-slate-500">รหัส: ${product.id}</p>
                                </div>
                            </div>
                            <span class="font-bold text-xl text-red-600">${product.stock.toLocaleString()} <span class="text-sm font-medium text-slate-500">ชิ้น</span></span>
                        `;
                        lowStockProductsList.appendChild(li);
                    });
                } else {
                    lowStockProductsList.innerHTML = '<li class="py-4 text-center text-slate-400">ไม่มีสินค้าที่ใกล้หมดสต็อก</li>';
                }
            }

            // --- 6. Recent Orders ---
            const recentOrdersQuery = query(ordersCollection, orderBy('orderDate', 'desc'), limit(5));
            const recentOrdersSnapshot = await getDocs(recentOrdersQuery);
            const recentOrders = recentOrdersSnapshot.docs.map(d => d.data());
            const recentOrdersList = document.getElementById('recent-orders-list');
            if (recentOrdersList) {
                recentOrdersList.innerHTML = '';
                if (recentOrders.length > 0) {
                    recentOrders.forEach(order => {
                        const div = document.createElement('div');
                        div.className = 'flex items-start justify-between gap-4';
                        // Check for new item structure vs old productName
                        const productDisplay = (order.items && order.items.length > 0) ? order.items.map(item => item.productName).join(', ') : (order.productName || 'N/A');
                        const orderDate = order.orderDate ? new Date(order.orderDate.seconds * 1000).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : 'N/A';
                        div.innerHTML = `
                            <div>
                                <p class="font-medium text-slate-800">${order.customerName || 'N/A'}</p>
                                <p class="text-xs text-slate-500">${productDisplay} - ${orderDate}</p>
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
            if (dashboardElement) {
                dashboardElement.innerHTML = '<p class="text-center text-red-500">ไม่สามารถโหลดข้อมูล Dashboard ได้</p>';
            }
        }
    };

    initializeDashboard();
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
    
    // Pagination elements for Logs
    const logsPrevPageBtn = document.getElementById('logs-prev-page-button');
    const logsNextPageBtn = document.getElementById('logs-next-page-button');
    const logsPaginationInfoEl = document.getElementById('logs-pagination-info');

    // State variables
    const LOGS_PER_PAGE = 20;
    let allUsers = [];
    let logsLastVisible = null;
    let logsFirstVisible = null;
    let logsPageHistory = [];
    let logsCurrentPageNumber = 1;
    let currentLogSortKey = 'timestamp';
    let currentLogSortDirection = 'desc';
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

    const populateUserFilter = () => {
        const uniqueUsers = [...new Map(allUsers.map(item => [item.uid, item])).values()];
        uniqueUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.uid;
            option.textContent = user.username || user.email;
            userFilter.appendChild(option);
        });
    };

    const loadLogs = async (direction = 'first') => {
        const logsCollectionRef = collection(db, "audit_logs");
        let q;

        // --- Build Query Constraints ---
        const constraints = [];
        const searchTerm = searchInput.value.toLowerCase();
        const selectedUser = userFilter.value;
        const selectedAction = actionFilter.value;
        const startDate = dateStartFilter.value ? new Date(dateStartFilter.value).setHours(0, 0, 0, 0) : null;
        const endDate = dateEndFilter.value ? new Date(dateEndFilter.value).setHours(23, 59, 59, 999) : null;

        // 1. Filtering (Server-side where possible)
        if (selectedUser) constraints.push(where('userId', '==', selectedUser));
        if (selectedAction) constraints.push(where('action', '==', selectedAction)); // Use '==' for exact match on action filter

        // 2. Sorting
        constraints.push(orderBy(currentLogSortKey, currentLogSortDirection));

        // 3. Pagination
        if (direction === 'next' && logsLastVisible) {
            constraints.push(startAfter(logsLastVisible));
        } else if (direction === 'prev' && logsPageHistory.length > 0) {
            const prevPageStart = logsPageHistory.pop();
            if (prevPageStart) {
                constraints.push(startAfter(prevPageStart));
            }
        }
        constraints.push(limit(LOGS_PER_PAGE));

        try {
            q = query(logsCollectionRef, ...constraints);
            const documentSnapshots = await getDocs(q);

            let logs = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Client-side filtering for search and date range
            if (searchTerm) {
                logs = logs.filter(log =>
                    (log.user && log.user.toLowerCase().includes(searchTerm)) ||
                    (log.action && log.action.toLowerCase().includes(searchTerm)) ||
                    (JSON.stringify(log.details).toLowerCase().includes(searchTerm))
                );
            }
            if (startDate || endDate) {
                logs = logs.filter(log => {
                    const logTimestamp = log.timestamp ? log.timestamp.seconds * 1000 : 0;
                    const startMatch = !startDate || logTimestamp >= startDate;
                    const endMatch = !endDate || logTimestamp <= endDate;
                    return startMatch && endMatch;
                });
            }

            renderLogs(logs);

            // --- Update Pagination State ---
            if (!documentSnapshots.empty) {
                logsFirstVisible = documentSnapshots.docs[0];
                logsLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];

                if (direction === 'next') { logsCurrentPageNumber++; logsPageHistory.push(logsFirstVisible); } 
                else if (direction === 'prev') { logsCurrentPageNumber--; } 
                else { logsPageHistory = []; logsCurrentPageNumber = 1; }
            }

            logsNextPageBtn.disabled = documentSnapshots.docs.length < LOGS_PER_PAGE;
            logsPrevPageBtn.disabled = logsCurrentPageNumber === 1;

            const startItem = (logsCurrentPageNumber - 1) * LOGS_PER_PAGE + 1;
            const endItem = startItem + logs.length - 1;
            logsPaginationInfoEl.textContent = `${startItem} - ${endItem}`;

        } catch (error) {
            console.error("Error loading audit log data:", error);
            logTableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล อาจต้องสร้าง Index ใน Firestore</td></tr>`;
        }
    };

    const exportLogsToCSV = () => {
        const headers = ["วันที่/เวลา", "ผู้ดำเนินการ", "การกระทำ", "รายละเอียด"];
        
        const rows = currentlyRenderedLogs.map(log => {
            const timestamp = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('th-TH') : 'N/A';
            const user = log.user || log.userId || 'N/A';
            const action = log.action;
            
            // Use the same logic as renderLogs for details
            let detailsText = '-';
            try {
                let detailsObj = log.details || {};
                if (detailsObj.data && typeof detailsObj.data === 'object') {
                    detailsObj = { ...detailsObj, ...detailsObj.data };
                    delete detailsObj.data;
                }
                detailsText = Object.entries(detailsObj)
                    .filter(([key, value]) => value !== null && typeof value !== 'object')
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(' | ');
            } catch (e) { /* ignore, detailsText remains '-' */ }

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

    const triggerNewLogQuery = () => {
        logsLastVisible = null; // Reset pagination
        loadLogs('first');
    };

    // Event Listeners
    [searchInput, userFilter, actionFilter, dateStartFilter, dateEndFilter].forEach(el => {
        el.addEventListener('input', triggerNewLogQuery);
        el.addEventListener('change', triggerNewLogQuery);
    });

    clearFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        userFilter.value = '';
        actionFilter.value = '';
        dateStartFilter.value = '';
        dateEndFilter.value = '';
        triggerNewLogQuery();
    });

    // Sorting Event Listeners
    document.querySelectorAll('#audit-log-table-body + thead th[data-sort], thead th[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sort;

            if (currentLogSortKey === sortKey) {
                currentLogSortDirection = currentLogSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentLogSortKey = sortKey;
                currentLogSortDirection = 'desc'; // Default to descending for new column
            }

            document.querySelectorAll('th[data-sort]').forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
            header.classList.add(currentLogSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');

            triggerNewLogQuery(); // Re-run query with new sorting
        });
    });

    exportBtn.addEventListener('click', exportLogsToCSV);
    logsNextPageBtn.addEventListener('click', () => loadLogs('next'));
    logsPrevPageBtn.addEventListener('click', () => loadLogs('prev'));

    // Initial Load
    getDocs(collection(db, "users")).then(usersSnapshot => {
        allUsers = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        populateUserFilter();
        loadLogs('first'); // Load logs after users are populated
    });
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

// Initialize page-specific logic
initializeProductsPage();
initializeOrdersPage();
initializeUserManagementPage();
// Make logout function globally accessible for inline event handlers
window.logout = logout;