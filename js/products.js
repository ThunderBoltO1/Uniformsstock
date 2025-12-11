import { db } from './firebase-config.js';
import { logAction } from './auth.js';
import { 
    collection, getDocs, query, where, doc, getDoc, 
    updateDoc, deleteDoc, setDoc, orderBy, limit, startAfter 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Products Page Logic (for products.html) ---
export function initializeProductsPage() {
    if (!document.getElementById('products-table')) return;

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
    const productTypeFilter = document.getElementById('product-type-filter');

    // Pagination elements for Products
    const productsPrevPageBtn = document.getElementById('products-prev-page-button');
    const productsNextPageBtn = document.getElementById('products-next-page-button');
    const productsPaginationInfoEl = document.getElementById('products-pagination-info');

    // Only run the logic if the required template is found on the page
    if (productRowTemplate) {
        // State variables for Products page
        const PRODUCTS_PER_PAGE = 10;
        let productsLastVisible = null;
        let productsFirstVisible = null;
        let productsPageHistory = [];
        let productsCurrentPageNumber = 1;
        let currentProductSortKey = 'id';
        let currentProductSortDirection = 'asc';
        let editingProductId = null;

        const renderProducts = (productsToRender) => {
            // Note: Summary cards will now be less accurate as they only reflect the current page.
            // For full accuracy, separate aggregate queries would be needed.
            updateSummaryCards(productsToRender);

            const startSequence = (productsCurrentPageNumber - 1) * PRODUCTS_PER_PAGE;
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

                row.querySelector('[data-field="sequence"]').textContent = startSequence + index + 1;
                row.querySelector('[data-field="id"]').textContent = product.id;
                row.querySelector('[data-field="name"]').textContent = product.name || '-';
                row.querySelector('[data-field="type"]').textContent = product.type || 'N/A';
                row.querySelector('[data-field="size"]').textContent = product.size || 'N/A';
                row.querySelector('[data-field="price"]').textContent = `฿${Number(product.price).toLocaleString()}`;
                row.querySelector('[data-field="stock"]').textContent = product.stock || 0;

                const stockEl = row.querySelector('[data-field="stock"]');
                const isLowStock = product.stock < 10;
                if (isLowStock) {
                    // เพิ่ม class ให้กับแถว (tr) ทั้งหมดเพื่อให้มีพื้นหลังสีเหลือง
                    const tr = row.querySelector('tr');
                    if (tr) {
                        tr.classList.add('bg-amber-50', 'hover:bg-amber-100');
                    }
                    stockEl.classList.remove('text-slate-700');
                    stockEl.classList.add('text-amber-600', 'font-bold');
                }

                row.querySelector('.edit-product').addEventListener('click', () => openEditModal(product.docId));

                // Add this part for the duplicate button
                const duplicateBtn = row.querySelector('.duplicate-product');
                if (duplicateBtn) {
                    duplicateBtn.addEventListener('click', () => openDuplicateModal(product.docId));
                }

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

        const loadProducts = async (direction = 'first') => {
            const productsCollectionRef = collection(db, "products");
            let q;

            // --- Build Query Constraints ---
            const constraints = [];
            const searchTerm = searchInput.value.toLowerCase();
            const statusFilter = productStatusFilter.value;
            const typeFilter = productTypeFilter.value;

            // 1. Filtering (Server-side where possible)
            if (statusFilter && statusFilter !== 'low_stock') constraints.push(where('status', '==', statusFilter));
            if (typeFilter) constraints.push(where('type', '==', typeFilter));

            // 2. Sorting
            constraints.push(orderBy(currentProductSortKey, currentProductSortDirection));

            // 3. Pagination
            if (direction === 'next' && productsLastVisible) {
                constraints.push(startAfter(productsLastVisible));
            } else if (direction === 'prev' && productsPageHistory.length > 0) {
                const prevPageStart = productsPageHistory.pop();
                if (prevPageStart) {
                    constraints.push(startAfter(prevPageStart));
                }
            }
            constraints.push(limit(PRODUCTS_PER_PAGE));

            try {
                q = query(productsCollectionRef, ...constraints);
                const documentSnapshots = await getDocs(q);

                let products = documentSnapshots.docs.map(doc => ({ docId: doc.id, ...doc.data() }));

                // Client-side filtering for search and low_stock (as they can't be combined with other filters easily)
                if (statusFilter === 'low_stock') products = products.filter(p => p.stock < 10);
                if (searchTerm) products = products.filter(p => p.name.toLowerCase().includes(searchTerm) || p.id.toLowerCase().includes(searchTerm));

                renderProducts(products);

                // --- Update Pagination State ---
                if (!documentSnapshots.empty) {
                    productsFirstVisible = documentSnapshots.docs[0];
                    productsLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];

                    if (direction === 'next') { productsCurrentPageNumber++; productsPageHistory.push(productsFirstVisible); }
                    else if (direction === 'prev') { productsCurrentPageNumber--; }
                    else { productsPageHistory = []; productsCurrentPageNumber = 1; }
                }

                productsNextPageBtn.disabled = documentSnapshots.docs.length < PRODUCTS_PER_PAGE;
                productsPrevPageBtn.disabled = productsCurrentPageNumber === 1;

                const startItem = (productsCurrentPageNumber - 1) * PRODUCTS_PER_PAGE + 1;
                const endItem = startItem + products.length - 1;
                productsPaginationInfoEl.textContent = `${startItem} - ${endItem}`;
            } catch (error) {
                console.error("Error loading products:", error);
                productsTable.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-red-500">ไม่สามารถโหลดข้อมูลได้ อาจต้องสร้าง Index ใน Firestore</td></tr>`;
            }
        };

        const updateSummaryCards = (products) => {
            const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
            const totalCount = products.length;
            const lowStockCount = products.filter(p => p.stock < 10).length;

            const lowStockCard = document.getElementById('low-stock-card');
            const totalValueEl = document.getElementById('total-stock-value');
            const totalCountEl = document.getElementById('total-products-count');
            const lowStockCountEl = document.getElementById('low-stock-items-count');

            if (totalValueEl) totalValueEl.textContent = `฿${totalValue.toLocaleString()}`;
            if (totalCountEl) totalCountEl.textContent = totalCount.toLocaleString();
            if (lowStockCountEl) {
                lowStockCountEl.textContent = lowStockCount.toLocaleString();
                lowStockCountEl.classList.toggle('text-amber-600', lowStockCount > 0);
                lowStockCountEl.classList.toggle('text-slate-800', lowStockCount === 0);
            }
            if (lowStockCard) {
                lowStockCard.classList.toggle('bg-amber-50', lowStockCount > 0);
                lowStockCard.classList.toggle('border-amber-300', lowStockCount > 0);
            }
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
                productForm.id.readOnly = false;
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

        const openDuplicateModal = async (id) => {
            const productDoc = await getDoc(doc(db, "products", id));
            if (!productDoc.exists()) {
                alert('ไม่พบสินค้าที่ต้องการคัดลอก');
                return;
            }
            const product = productDoc.data();

            editingProductId = null;
            productForm.reset();
            productModalTitle.textContent = 'คัดลอกสินค้า';

            productForm.id.value = ''; // Clear ID
            productForm.id.readOnly = false; // Make ID editable
            productForm.id.placeholder = `เช่น ${product.id}-COPY`; // Suggest a new ID

            productForm.name.value = product.name || '';
            productForm.type.value = product.type || 'ชาย';
            productForm.size.value = product.size || 'S';
            productForm.price.value = product.price;
            productForm.stock.value = product.stock;
            productForm.status.value = product.status || 'พร้อมขาย';

            deleteProductBtnInModal.classList.add('hidden');
            openModal();
        };

        const openEditModal = async (id) => {
            editingProductId = id;
            const productDoc = await getDoc(doc(db, "products", id));
            if (!productDoc.exists()) return;
            const product = { docId: productDoc.id, ...productDoc.data() };
            productForm.reset();
            productModalTitle.textContent = 'แก้ไขสินค้า';

            productForm.id.value = product.id; // This is the custom ID field from the document data
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
                await logAction('DELETE_PRODUCT', { productId: id, productName: name });
                loadProducts('first');
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
                // When editing, `editingProductId` is the document ID.
                // We use `updateDoc` because `setDoc` would overwrite the whole document if we're not careful.
                await updateDoc(doc(db, "products", editingProductId), productData);
                await logAction('UPDATE_PRODUCT', { productId: editingProductId, ...productData });
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
                await logAction('CREATE_PRODUCT', { productId: customId, ...productData });
            }

            closeModal();
            loadProducts('first');
            saveButton.disabled = false;
            saveButton.textContent = 'บันทึกสินค้า';
        });

        const triggerNewProductQuery = () => {
            productsLastVisible = null; // Reset pagination
            loadProducts('first');
        };

        // Event Listeners
        searchInput.addEventListener('input', triggerNewProductQuery);
        productStatusFilter.addEventListener('change', triggerNewProductQuery);
        productTypeFilter.addEventListener('change', triggerNewProductQuery);

        document.querySelectorAll('#products-table + thead th[data-sort], thead th[data-sort]').forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.dataset.sort;
                if (currentProductSortKey === sortKey) {
                    currentProductSortDirection = currentProductSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentProductSortKey = sortKey;
                    currentProductSortDirection = 'desc';
                }
                document.querySelectorAll('th[data-sort] .sort-arrow').forEach(arrow => arrow.innerHTML = '');
                header.querySelector('.sort-arrow').innerHTML = currentProductSortDirection === 'asc' ? '▲' : '▼';
                triggerNewProductQuery();
            });
        });

        openProductModalBtn.addEventListener('click', openAddModal);
        closeProductModalBtn.addEventListener('click', closeModal);
        cancelProductModalBtn.addEventListener('click', closeModal);
        productModal.addEventListener('click', (e) => { if (e.target === productModal) closeModal(); });
        productsNextPageBtn.addEventListener('click', () => loadProducts('next'));
        productsPrevPageBtn.addEventListener('click', () => loadProducts('prev'));

        // Initial Load
        loadProducts('first');

        // Check for URL parameters on page load
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('filter') === 'low_stock') {
            productStatusFilter.value = 'low_stock';
            triggerNewProductQuery();
        }
    }
}