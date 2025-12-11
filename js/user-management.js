import { db, storage } from './firebase-config.js';
import { logAction } from './auth.js';
import {
    collection, getDocs, query, where, doc, getDoc,
    updateDoc, deleteDoc, setDoc, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/**
 * Resizes and compresses an image file client-side to be under a specific size.
 * @param {File} file The image file to process.
 * @param {object} options The options for resizing and compression.
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

                canvas.toBlob((blob) => {
                    if (blob.size / 1024 > options.maxSizeKB) {
                        canvas.toBlob(resolve, 'image/jpeg', 0.7);
                    } else {
                        resolve(blob);
                    }
                }, 'image/jpeg', 0.9);
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
    if (!url || !url.startsWith('https://firebasestorage.googleapis.com')) {
        return;
    }
    try {
        const fileRef = ref(storage, url);
        await deleteObject(fileRef);
        console.log("Old profile picture deleted successfully.");
    } catch (error) {
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
        return await getDownloadURL(snapshot.ref);
    } catch (error) {
        console.error("Upload failed", error);
        alert("อัปโหลดรูปภาพล้มเหลว: " + error.message);
        return null;
    }
}

export function initializeUserManagementPage() {
    if (!document.getElementById('users-table')) return;

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

    // Profile picture elements in modal
    const modalImgPreview = document.getElementById('modal-profile-image-preview');
    const modalFileUpload = document.getElementById('modal-profile-picture-upload');

    // New Details Modal elements
    const userDetailsModal = document.getElementById('user-details-modal');
    const userDetailsModalContent = document.getElementById('user-details-modal-content');
    const closeUserDetailsModalBtn = document.getElementById('close-user-details-modal');
    const detailsEditButton = document.getElementById('details-edit-button');

    // Pagination elements for Users
    const usersPrevPageBtn = document.getElementById('users-prev-page-button');
    const usersNextPageBtn = document.getElementById('users-next-page-button');
    const usersPaginationInfoEl = document.getElementById('users-pagination-info');

    // State variables for User Management
    const USERS_PER_PAGE = 10;
    let usersLastVisible = null;
    let usersFirstVisible = null;
    let usersPageHistory = [];
    let usersCurrentPageNumber = 1;
    let editingUsername = null; // This is actually the UID
    let currentSortKey = 'firstName'; // Default sort by first name
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

    const loadAndDisplayUsers = async (direction = 'first') => {
        const currentUserData = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUserData) return;

        const usersCollectionRef = collection(db, "users");
        let q;

        // --- Build Query Constraints ---
        const constraints = [];

        // 1. Sorting
        const sortField = currentSortKey === 'fullName' ? 'firstName' : currentSortKey;
        constraints.push(orderBy(sortField, currentSortDirection));

        // 2. Pagination
        if (direction === 'next' && usersLastVisible) {
            constraints.push(startAfter(usersLastVisible));
        } else if (direction === 'prev' && usersPageHistory.length > 0) {
            const prevPageStart = usersPageHistory.pop();
            if (prevPageStart) {
                constraints.push(startAfter(prevPageStart));
            }
        }
        constraints.push(limit(USERS_PER_PAGE));

        try {
            q = query(usersCollectionRef, ...constraints);
            const documentSnapshots = await getDocs(q);
            const users = documentSnapshots.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

            renderUsers(users);
            updateUserSummaryCards(users); // Update cards with current page data

            // --- Update Pagination State ---
            if (!documentSnapshots.empty) {
                usersFirstVisible = documentSnapshots.docs[0];
                usersLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];

                if (direction === 'next') { usersCurrentPageNumber++; usersPageHistory.push(usersFirstVisible); }
                else if (direction === 'prev') { usersCurrentPageNumber--; }
                else { usersPageHistory = []; usersCurrentPageNumber = 1; }
            }

            usersNextPageBtn.disabled = documentSnapshots.docs.length < USERS_PER_PAGE;
            usersPrevPageBtn.disabled = usersCurrentPageNumber === 1;

            const startItem = (usersCurrentPageNumber - 1) * USERS_PER_PAGE + 1;
            const endItem = startItem + users.length - 1;
            usersPaginationInfoEl.textContent = `${startItem} - ${endItem}`;

        } catch (error) {
            console.error("Error loading users:", error);
            usersTable.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">ไม่สามารถโหลดข้อมูลผู้ใช้ได้</td></tr>`;
        }
    };

    const renderUsers = (usersToRender) => {
        const currentUserData = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUserData) return;

        usersTable.innerHTML = '';

        usersToRender.forEach(user => {
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

            const isCurrentUser = user.uid === currentUserData.uid;
            const isTargetAdminOrHigher = user.role === 'admin' || user.role === 'super-platinum-admin';
            const isCurrentUserAdmin = currentUserData.role === 'admin';
            const isTargetSuperPlatinum = user.role === 'super-platinum-admin';

            if (isCurrentUser || (isCurrentUserAdmin && isTargetAdminOrHigher)) {
                editBtn.disabled = true;
                deleteBtn.disabled = true;
                editBtn.title = "คุณไม่มีสิทธิ์แก้ไขผู้ใช้ระดับสูงกว่าหรือเท่ากัน";
                deleteBtn.title = "ไม่สามารถลบผู้ใช้ปัจจุบันได้";
            } else if (isTargetSuperPlatinum && currentUserData.role !== 'super-platinum-admin') {
                editBtn.disabled = true;
                deleteBtn.disabled = true;
                editBtn.title = "คุณไม่มีสิทธิ์แก้ไข Super Platinum Admin";
                deleteBtn.title = "ไม่สามารถลบ Super Platinum Admin ได้";
            } else {
                editBtn.addEventListener('click', () => openEditModal(user.uid));
                deleteBtn.addEventListener('click', () => handleDeleteUser(user.uid, user.email, user.username));
            }

            tr.addEventListener('click', (e) => {
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
        if (modalImgPreview) modalImgPreview.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' /%3E%3C/svg%3E";
        if (modalFileUpload) modalFileUpload.value = '';
        if (window.modalProfilePicObjectUrl) URL.revokeObjectURL(window.modalProfilePicObjectUrl);
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

        const emailField = userForm.querySelector('#email')?.closest('div');
        if (emailField) emailField.style.display = 'none';
        const currentPasswordDisplay = userForm.querySelector('#current-password-display');
        if (currentPasswordDisplay) currentPasswordDisplay.style.display = 'none';
        const nameFields = userForm.querySelector('#firstName')?.closest('.grid');
        if (nameFields) nameFields.style.display = 'grid';

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

        const emailField = userForm.querySelector('#email')?.closest('div');
        if (emailField) {
            emailField.style.display = 'block';
            const emailInput = userForm.querySelector('#email');
            if (emailInput) {
                emailInput.value = user.email || '';
                emailInput.readOnly = (user.email === 'admin@system.local');
                emailInput.disabled = (user.email === 'admin@system.local');
                emailInput.classList.toggle('bg-slate-100', user.email === 'admin@system.local');
                emailInput.classList.toggle('text-slate-500', user.email === 'admin@system.local');
                emailInput.classList.toggle('cursor-not-allowed', user.email === 'admin@system.local');
            }
        }
        const currentPasswordDisplay = userForm.querySelector('#current-password-display');
        if (currentPasswordDisplay) {
            currentPasswordDisplay.style.display = 'block';
            userForm['current-password'].value = user.password || '';
        }

        userForm.username.value = user.username || '';

        const nameFields = userForm.querySelector('#firstName')?.closest('.grid');
        if (nameFields) {
            nameFields.style.display = 'grid';
            userForm.firstName.value = user.firstName || '';
            userForm.lastName.value = user.lastName || '';
        }

        userForm.role.value = user.role;
        userForm.password.required = false;
        passwordHelperText.textContent = 'เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน';

        if (modalImgPreview) {
            modalImgPreview.src = user.profilePictureUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' /%3E%3C/svg%3E";
        }

        const currentUserRole = JSON.parse(localStorage.getItem('currentUser')).role;
        if ((user.role === 'super-platinum-admin' || user.role === 'admin') && currentUserRole !== 'super-platinum-admin') {
            userForm.role.disabled = true;
        } else if (user.role === 'admin' && currentUserRole === 'admin' && user.uid !== JSON.parse(localStorage.getItem('currentUser')).uid) {
            userForm.role.disabled = true;
        } else {
            userForm.role.disabled = false;
        }

        openModal();
    };

    const handleDeleteUser = async (uid, email, username) => {
        const confirmationMessage = `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ "${username || email}"? การกระทำนี้ไม่สามารถย้อนกลับได้`;
        if (!confirm(confirmationMessage)) return;

        try {
            if (username) {
                const userFolderRef = ref(storage, `profilePictures/${username}`);
                const res = await listAll(userFolderRef);
                const deletePromises = res.items.map(itemRef => deleteObject(itemRef));
                await Promise.all(deletePromises);
                console.log(`Successfully deleted storage folder for user: ${username}`);
            }

            await deleteDoc(doc(db, "users", uid));

            logAction('DELETE_USER_RECORD', { userId: uid, email: email, username: username });
            await loadAndDisplayUsers('first');
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

    closeUserDetailsModalBtn.addEventListener('click', closeDetailsModal);
    userDetailsModal.addEventListener('click', (e) => { if (e.target === userDetailsModal) closeDetailsModal(); });

    if (modalFileUpload && modalImgPreview) {
        modalFileUpload.addEventListener('change', () => {
            if (window.modalProfilePicObjectUrl) {
                URL.revokeObjectURL(window.modalProfilePic-object-url);
            }
            const file = modalFileUpload.files[0];
            if (file) {
                window.modalProfilePicObjectUrl = URL.createObjectURL(file);
                modalImgPreview.src = window.modalProfilePicObjectUrl;
            }
        });
    }

    if (usersNextPageBtn && usersPrevPageBtn) {
        usersNextPageBtn.addEventListener('click', () => loadAndDisplayUsers('next'));
        usersPrevPageBtn.addEventListener('click', () => loadAndDisplayUsers('prev'));
    }

    document.querySelectorAll('th[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sort;
            if (currentSortKey === sortKey) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortKey = sortKey;
                currentSortDirection = 'asc';
            }
            document.querySelectorAll('th[data-sort]').forEach(th => {
                const indicator = th.querySelector('.sort-indicator');
                if (indicator) {
                    indicator.textContent = th === header ? (currentSortDirection === 'asc' ? '▲' : '▼') : '';
                }
            });
            loadAndDisplayUsers('first');
        });
    });

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

    if (userForm) {
        if (!userForm.dataset.listenerAttached) {
            userForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const saveButton = document.getElementById('save-user-button') || document.getElementById('save-profile-button');
                saveButton.disabled = true;
                saveButton.textContent = 'กำลังบันทึก...';

                const email = userForm.email.value || '';
                const username = userForm.username.value.trim();
                const password = userForm.password.value;
                const role = userForm.role.value;
                const firstName = userForm.firstName.value.trim();
                const lastName = userForm.lastName.value.trim();

                const editingUid = editingUsername;
                const file = modalFileUpload.files[0];
                let newProfilePictureUrl = null;

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
                    const userDocRef = doc(db, "users", editingUid);
                    const userDocSnap = await getDoc(userDocRef);
                    const existingUserData = userDocSnap.data();
                    newProfilePictureUrl = existingUserData.profilePictureUrl;

                    if (file) {
                        const compressedBlob = await resizeAndCompressImage(file, { maxWidth: 500, maxHeight: 500, maxSizeKB: 50 });
                        const uploadedUrl = await uploadProfilePicture(compressedBlob, username);
                        if (uploadedUrl) {
                            newProfilePictureUrl = uploadedUrl;
                            if (existingUserData.profilePictureUrl) {
                                await deleteProfilePicture(existingUserData.profilePictureUrl);
                            }
                        } else {
                            saveButton.disabled = false;
                            saveButton.textContent = 'บันทึก';
                            return;
                        }
                    }

                    const updateData = {
                        role: role,
                        username: username,
                        email: email,
                        firstName: firstName,
                        lastName: lastName,
                        profilePictureUrl: newProfilePictureUrl,
                    };
                    if (password) {
                        updateData.password = password;
                    }
                    await updateDoc(userDocRef, updateData);
                    logAction('UPDATE_USER', { userId: editingUid, changes: { role, username } });
                    alert(`อัปเดตข้อมูลผู้ใช้ ${password ? 'และรหัสผ่าน' : ''} เรียบร้อยแล้ว`);
                } else {
                    if (!username || !password) {
                        alert('กรุณากรอกชื่อผู้ใช้ และรหัสผ่านสำหรับผู้ใช้ใหม่');
                        saveButton.disabled = false;
                        saveButton.textContent = 'บันทึก';
                        return;
                    }

                    if (file) {
                        const compressedBlob = await resizeAndCompressImage(file, { maxWidth: 500, maxHeight: 500, maxSizeKB: 50 });
                        const uploadedUrl = await uploadProfilePicture(compressedBlob, username);
                        if (uploadedUrl) {
                            newProfilePictureUrl = uploadedUrl;
                        } else {
                            saveButton.disabled = false;
                            saveButton.textContent = 'บันทึก';
                            return;
                        }
                    }

                    const newUser = {
                        username: username,
                        password: password,
                        role: role,
                        email: '',
                        firstName: firstName,
                        lastName: lastName,
                        phone: '',
                        profilePictureUrl: newProfilePictureUrl || ''
                    };
                    await setDoc(doc(db, "users", username), newUser);
                    logAction('CREATE_USER', { userId: username, username: username, role: role, firstName: firstName, lastName: lastName });
                    alert('สร้างผู้ใช้ใหม่สำเร็จแล้ว');
                }

                closeModal();
                loadAndDisplayUsers('first');

                saveButton.disabled = false;
                saveButton.textContent = 'บันทึก';
            });
            userForm.dataset.listenerAttached = 'true';
        }
    }

    loadAndDisplayUsers('first');

    window.userManagement = window.userManagement || {};
    window.userManagement.loadAndDisplayUsers = loadAndDisplayUsers;

    // --- MutationObserver to disable actions for current user ---
    function disableActionsForCurrentUser() {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUser || !currentUser.username) return;

        const userRows = document.querySelectorAll('#users-table tr');
        userRows.forEach(row => {
            const usernameElement = row.querySelector('[data-field="username"]');
            if (usernameElement && usernameElement.textContent === currentUser.username) {
                const editButton = row.querySelector('.edit-user');
                const deleteButton = row.querySelector('.delete-user');
                if (editButton) editButton.disabled = true;
                if (deleteButton) deleteButton.disabled = true;
            }
        });
    }

    const observer = new MutationObserver(() => {
        disableActionsForCurrentUser();
    });

    if (usersTable) {
        observer.observe(usersTable, { childList: true, subtree: true });
    }
}