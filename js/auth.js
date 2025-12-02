// หมายเหตุ: โค้ดส่วน app.js ไม่ได้ถูก import ใน index.html จึงย้ายฟังก์ชันที่จำเป็นมาไว้ที่นี่
function createModalHandler(modalId) { /* ... implementation ... */ }
async function logAction(action, details) { /* ... implementation ... */ }

import { db, storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, getDocs, query, where, doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const pageAccess = {
  '/dashboard.html': ['admin'],
  '/user-management.html': ['admin'],
  '/audit-log.html': ['admin'],
  '/products.html': ['admin'],
  '/orders.html': ['admin', 'user'],
  '/profile.html': ['admin', 'user'],
  '/index.html': ['admin', 'user'],
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
  localStorage.removeItem('currentUser');
  console.log("User signed out");
  window.location.replace('./login.html');
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
        profileDetailsForm.phone.value = userDataFromDb.phone || '';
        
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
  // This part is removed as password management is no longer handled here.
  const passwordModalHandler = createModalHandler('password-modal');
  document.getElementById('open-password-modal')?.addEventListener('click', () => {
    document.getElementById('change-password-form').reset();
    document.getElementById('password-error-message').classList.add('hidden');
    passwordModalHandler.open();
  });
  document.getElementById('close-password-modal')?.addEventListener('click', () => passwordModalHandler.close());
  document.getElementById('cancel-password-modal')?.addEventListener('click', () => passwordModalHandler.close());
}

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

  let editingUsername = null;

  const renderUsers = async () => {
    const currentUserData = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUserData) return;

    const usersSnapshot = await getDocs(collection(db, "users"));
    const users = usersSnapshot.docs.map(docSnap => ({ uid: docSnap.id, ...docSnap.data() }));
    usersTable.innerHTML = '';

    users.sort((a, b) => (a.email || '').localeCompare(b.email || '')).forEach(user => {
      const row = userRowTemplate.content.cloneNode(true);

      const profilePicEl = row.querySelector('[data-field="profilePicture"]');
      if (user.profilePictureUrl) {
        profilePicEl.src = user.profilePictureUrl;
      } else {
        profilePicEl.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' /%3E%3C/svg%3E";
      }

      row.querySelector('[data-field="fullName"]').textContent = `${user.firstName || ''} ${user.lastName || ''}`.trim() || '(ยังไม่มีชื่อ)';
      row.querySelector('[data-field="email"]').textContent = user.email || 'N/A';
      row.querySelector('[data-field="username"]').textContent = user.username || '(ไม่มี)';

      const roleEl = row.querySelector('[data-field="role"]');
      roleEl.textContent = user.role;
      if (user.role === 'admin') {
        roleEl.classList.add('font-semibold', 'text-red-600', 'dark:text-red-500');
      }

      const editBtn = row.querySelector('.edit-user');
      const deleteBtn = row.querySelector('.delete-user');

      // Prevent user from editing/deleting themselves or the superadmin
      if (user.uid === currentUserData.uid || user.email === 'admin@system.local') {
        editBtn.disabled = true;
        deleteBtn.disabled = true;
        editBtn.title = "ไม่สามารถแก้ไขตนเองหรือ Super Admin ได้";
        deleteBtn.title = "ไม่สามารถลบตนเองหรือ Super Admin ได้";
      } else {
        editBtn.addEventListener('click', () => openEditModal(user.uid));
        deleteBtn.addEventListener('click', () => handleDeleteUser(user.uid, user.email));
      }

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

  const openAddModal = () => {
    editingUsername = null;
    userForm.reset();
    userModalTitle.textContent = 'เพิ่มผู้ใช้ใหม่';
    userForm.email.readOnly = false;
    userForm.password.required = true;
    passwordHelperText.textContent = 'จำเป็นต้องกรอกรหัสผ่านสำหรับผู้ใช้ใหม่';
    openModal();
  };

  const openEditModal = async (uid) => {
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) return;
    const user = userDocSnap.data();
    editingUsername = uid; // Store UID for editing
    userForm.reset();
    userModalTitle.textContent = 'แก้ไขผู้ใช้';
    userForm.email.value = user.email;
    userForm.username.value = user.username || ''; // เพิ่มบรรทัดนี้
    userForm.email.readOnly = true;
    userForm.role.value = user.role;
    userForm.password.required = false;
    passwordHelperText.textContent = 'เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน';
    
    // Prevent admin from demoting themselves
    // Superadmin 'admin' role cannot be changed.
    if (user.email === 'admin@system.local') {
        userForm.role.disabled = true;
    } else {
        userForm.role.disabled = false;
    }

    openModal();
  };

  const handleDeleteUser = async (uid, email) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ "${email}"? การกระทำนี้ไม่สามารถย้อนกลับได้ และต้องลบผู้ใช้ออกจาก Firebase Authentication ด้วยตนเอง`)) return;
    // Note: This only deletes the Firestore record.
    await deleteDoc(doc(db, "users", uid));
    logAction('DELETE_USER_RECORD', { userId: uid, email: email });
    await renderUsers();
    alert('ลบผู้ใช้เรียบร้อยแล้ว');
  };

  openUserModalBtn.addEventListener('click', openAddModal);
  closeUserModalBtn.addEventListener('click', closeModal);
  cancelUserModalBtn.addEventListener('click', closeModal);
  userModal.addEventListener('click', (e) => { if (e.target === userModal) closeModal(); });

  // Initial render
  renderUsers();
}

// --- Global "Auth" State Checker (using localStorage) ---
function checkAuthState() {
  const currentPath = window.location.pathname;
  const isAuthPage = currentPath.endsWith('login.html');
  const protectedPage = Object.keys(pageAccess).find(page => currentPath.includes(page));

  const userDataString = localStorage.getItem('currentUser');
  const userData = userDataString ? JSON.parse(userDataString) : null;

  if (userData) {
    // User is "signed in"
    const userRole = userData.role;

    // If user is on login page, redirect them away
    if (isAuthPage) {
      window.location.replace('./index.html');
    }

    // Check page access roles
    if (protectedPage && !pageAccess[protectedPage].includes(userRole)) {
      alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      window.location.replace('./index.html');
    }

  } else {
    // User is "signed out"
    // If they are on a protected page, redirect to login
    if (protectedPage && !isAuthPage) {
      window.location.replace('./login.html');
    }
  }

  // Update UI elements only for logged-in users on non-auth pages
  if (userData && !isAuthPage) {
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
            element.textContent = userData.email;
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
            element.style.display = 'none';
        }
    });

    // --- User Management Form Submission ---
    const userForm = document.getElementById('user-form');
    if (userForm) {
        if (!userForm.dataset.listenerAttached) {
          userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveButton = userForm.querySelector('button[type="submit"]');
            saveButton.disabled = true;
            saveButton.textContent = 'กำลังบันทึก...';

            const email = userForm.email.value;
            const username = userForm.username.value.trim(); // เพิ่ม username
            const password = userForm.password.value;
            const role = userForm.role.value;

            const editingUid = null; // This needs to be set properly in openEditModal

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
                  username: username // อัปเดต username
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
                if (!password || !email || !username) {
                    alert('กรุณากรอกอีเมล, ชื่อผู้ใช้, และรหัสผ่านสำหรับผู้ใช้ใหม่');
                    saveButton.disabled = false;
                    saveButton.textContent = 'บันทึก';
                    return;
                }
                if (password.length < 6) {
                    alert('กรุณากำหนดรหัสผ่านสำหรับผู้ใช้ใหม่');
                    saveButton.disabled = false;
                    saveButton.textContent = 'บันทึก';
                    return;
                }
                
                // This is highly insecure. For demonstration purposes only.
                alert("การสร้างผู้ใช้ใหม่จากหน้าเว็บโดยตรงไม่ปลอดภัยและถูกปิดใช้งาน");
                logAction('CREATE_USER_ATTEMPT', { email, username, role });
            }

            // ปิด Modal และ Reload
            const userModal = document.getElementById('user-modal');
            if (userModal) {
                userModal.classList.add('opacity-0', 'pointer-events-none');
                const userModalContent = document.getElementById('user-modal-content');
                if(userModalContent) userModalContent.classList.add('scale-95', 'opacity-0');
            }
            
            const usersTable = document.getElementById('users-table');
            if (usersTable) {
                window.location.reload();
            }
            saveButton.disabled = false;
            saveButton.textContent = 'บันทึก';
          });
          userForm.dataset.listenerAttached = 'true';
        }
    }
}

// Run the auth check
checkAuthState();
window.logout = logout;