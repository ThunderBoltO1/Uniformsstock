import { db } from './firebase-config.js';
import { logAction } from './auth.js';
import {
    collection, getDocs, query, where, doc, getDoc,
    updateDoc, deleteDoc, setDoc, orderBy, limit, startAfter,
    getAggregateFromServer, count
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const updateOrderSummaryCards = async () => {
    try {
        const ordersCollectionRef = collection(db, "orders");

        // Use getAggregateFromServer for efficient counting
        const [totalAgg, paidAgg, splitAgg, pendingAgg, cancelledAgg] = await Promise.all([
            getAggregateFromServer(ordersCollectionRef, { total: count() }),
            getAggregateFromServer(query(ordersCollectionRef, where('status', '==', 'paid')), { total: count() }),
            getAggregateFromServer(query(ordersCollectionRef, where('status', '==', 'split')), { total: count() }),
            getAggregateFromServer(query(ordersCollectionRef, where('status', '==', 'pending')), { total: count() }),
            getAggregateFromServer(query(ordersCollectionRef, where('status', '==', 'cancelled')), { total: count() })
        ]);

        const totalOrders = totalAgg.data().total || 0;
        const paidOrders = paidAgg.data().total || 0;
        const splitOrders = splitAgg.data().total || 0;
        const pendingOrders = pendingAgg.data().total || 0;
        const cancelledOrders = cancelledAgg.data().total || 0;

        const totalEl = document.getElementById('total-orders-count');
        const paidEl = document.getElementById('paid-orders-count');
        const splitEl = document.getElementById('split-orders-count');
        const pendingEl = document.getElementById('pending-orders-count');
        const cancelledEl = document.getElementById('cancelled-orders-count');

        if (totalEl) totalEl.textContent = totalOrders.toLocaleString();
        if (paidEl) paidEl.textContent = paidOrders.toLocaleString();
        if (splitEl) splitEl.textContent = splitOrders.toLocaleString();
        if (pendingEl) pendingEl.textContent = pendingOrders.toLocaleString();
        if (cancelledEl) cancelledEl.textContent = cancelledOrders.toLocaleString();

    } catch (error) {
        console.error("Error updating order summary cards:", error);
    }
};

export function initializeOrdersPage() {
    if (!document.getElementById('orders-table')) return;

    const ordersTable = document.getElementById('orders-table');
    const orderRowTemplate = document.getElementById('order-row');
    const orderModal = document.getElementById('order-modal');
    const orderModalContent = document.getElementById('order-modal-content');
    const orderModalTitle = document.querySelector('#order-modal h2');
    const openOrderModalBtn = document.getElementById('open-order-modal');
    const closeOrderModalBtn = document.getElementById('close-order-modal');
    const cancelOrderModalBtn = document.getElementById('cancel-order-modal');
    const orderForm = document.getElementById('order-form');
    const addOrderItemBtn = document.getElementById('add-order-item-button');
    const orderItemsContainer = document.getElementById('order-items-container');
    const orderItemTemplate = document.getElementById('order-item-template');
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
    const detailsPrintReceiptButton = document.getElementById('details-print-receipt-button');

    // --- Dynamic validation for payment date AND split payment fields ---
    const orderStatusSelect = document.getElementById('order-status');
    const paymentDateInput = document.getElementById('order-payment-date');
    const paymentDateLabel = document.querySelector('label[for="order-payment-date"]');
    const paymentDateHelper = document.getElementById('payment-date-helper');
    const splitPaymentFields = document.getElementById('split-payment-fields');
    const installmentsCountSelect = document.getElementById('order-installments-count');
    const installmentNumberSelect = document.getElementById('order-installment-number');

    // This function will be defined here but used in openAddModal and openEditModal too
    let updateFormBasedOnStatus = () => {}; 

    if (orderStatusSelect && paymentDateInput && paymentDateLabel && paymentDateHelper && splitPaymentFields && installmentsCountSelect && installmentNumberSelect) {
        
        updateFormBasedOnStatus = (status) => {
            // 1. Handle Payment Date Requirement
            if (status === 'paid') {
                paymentDateInput.required = true;
                paymentDateLabel.innerHTML = 'วันที่ชำระเงิน <span class="text-red-500">*</span>';
                paymentDateHelper.classList.add('hidden');
                // If the date is not set, default to today
                if (!paymentDateInput.value) {
                    paymentDateInput.valueAsDate = new Date();
                }
            } else { // For 'pending', 'cancelled', or 'split'
                // For 'split' status, the payment date is optional. It's only entered when a payment is actually made.
                // This allows creating a "split payment" order without an initial payment.
                paymentDateInput.required = false;
                paymentDateLabel.innerHTML = 'วันที่ชำระเงิน';
                paymentDateHelper.classList.remove('hidden');
            }

            // 2. Handle Split Payment Fields Visibility
            if (status === 'split') {
                splitPaymentFields.classList.remove('hidden');
            } else {
                splitPaymentFields.classList.add('hidden');
            }
        };

        orderStatusSelect.addEventListener('change', (e) => {
            updateFormBasedOnStatus(e.target.value);
        });

        // Update installment number options when count changes
        installmentsCountSelect.addEventListener('change', (e) => {
            const count = parseInt(e.target.value, 10);
            const currentVal = installmentNumberSelect.value;
            installmentNumberSelect.innerHTML = '';

            // Add the "Not yet paid" option
            const notPaidOption = document.createElement('option');
            notPaidOption.value = "0";
            notPaidOption.textContent = "ยังไม่ชำระ";
            installmentNumberSelect.appendChild(notPaidOption);

            for (let i = 1; i <= count; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `งวดที่ ${i}`;
                installmentNumberSelect.appendChild(option);
            }
            // Try to preserve the selected value if it's still valid
            if (parseInt(currentVal, 10) <= count) {
                installmentNumberSelect.value = currentVal;
            } else {
                installmentNumberSelect.value = "0"; // Default to not paid if previous value is invalid
            }
        });
    }

    // Pagination elements
    const prevPageBtn = document.getElementById('prev-page-button');
    const nextPageBtn = document.getElementById('next-page-button');
    const paginationInfoEl = document.getElementById('pagination-info');

    // State variables
    const ORDERS_PER_PAGE = 15;
    let lastVisible = null; // Last document snapshot of the current page
    let firstVisible = null; // First document snapshot of the current page
    let pageHistory = []; // Stack to store firstVisible of previous pages
    let currentPageNumber = 1;
    let currentOrderSortKey = 'id'; // เปลี่ยนค่าเริ่มต้นเป็น 'id' (orderNumber)
    let currentOrderSortDirection = 'desc'; // เรียงจากมากไปน้อย


    let allProductsForOrders = [];
    let editingOrderId = null;
    let currentlyRenderedOrders = []; // To store the logs currently being displayed for export

    // Only run the logic if the required template is found on the page
    if (orderRowTemplate) {
        let allOrders = []; // To store all orders for filtering

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
                if (orderItemsContainer) orderItemsContainer.innerHTML = '';
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

            // Display multiple items
            const items = order.items || [{ productName: order.productName, quantity: order.quantity }];
            document.getElementById('details-product-name').textContent = items.map(item => `${item.productName} (x${item.quantity})`).join(', ');
            document.getElementById('details-product-type').textContent = [...new Set(items.map(item => item.productType))].join(', ') || 'N/A';
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            document.getElementById('details-quantity').textContent = totalQuantity.toLocaleString() + ' ชิ้น';

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

            statusEl.className = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold'; // Reset classes
            let statusColorClasses = 'bg-slate-100 text-slate-800'; // Default

            if (order.status === 'cancelled') {
                statusColorClasses = 'bg-red-100 text-red-800';
            } else if (order.status === 'pending') {
                statusColorClasses = 'bg-yellow-100 text-yellow-800';
            } else if (order.status === 'paid') {
                statusColorClasses = 'bg-green-100 text-green-800';
            } else if (order.status === 'split') {
                const num = order.installmentNumber || 0;
                const count = order.installmentsCount || 0;
                if (num === 0) {
                    statusColorClasses = 'bg-red-100 text-red-800'; // ยังไม่ชำระ
                } else if (num > 0 && num === count) {
                    statusColorClasses = 'bg-green-100 text-green-800'; // ชำระครบแล้ว
                } else {
                    statusColorClasses = 'bg-blue-100 text-blue-800'; // กำลังแบ่งชำระ
                }
            }
            statusColorClasses.split(' ').forEach(c => statusEl.classList.add(c));

            detailsEditOrderButton.onclick = () => {
                closeDetailsModal();
                openEditModal(id);
            };
            // Store the order ID on the edit button so the print button can access it
            if (detailsEditOrderButton) {
                detailsEditOrderButton.dataset.orderId = id;
            }

            orderDetailsModal.classList.remove('pointer-events-none', 'opacity-0');
            orderDetailsModalContent.classList.remove('scale-95', 'opacity-0');
        };

        const printOrderReceipt = async (id) => {
            const orderDoc = await getDoc(doc(db, "orders", id));
            if (!orderDoc.exists()) {
                alert('ไม่พบข้อมูลคำสั่งซื้อสำหรับพิมพ์');
                return;
            }
            const order = orderDoc.data();

            // --- ย้ายโค้ดจาก orders.html มาไว้ที่นี่ ---
            // 1. ดึงชื่อผู้ใช้ปัจจุบันจาก localStorage มาแสดงเป็น "ผู้รับเงิน"
            const currentUser = JSON.parse(localStorage.getItem('currentUser'));
            const staffName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'N/A';
            const receiptStaffNameEl = document.getElementById('receipt-staff-name');
            if (receiptStaffNameEl) receiptStaffNameEl.textContent = staffName;

            // 2. สร้าง timestamp ณ เวลาที่พิมพ์
            const now = new Date();
            const printTimestampEl = document.getElementById('receipt-print-timestamp');
            if (printTimestampEl) printTimestampEl.textContent = now.toLocaleString('th-TH');
            // --- สิ้นสุดส่วนที่ย้ายมา ---

            await logAction('PRINT_RECEIPT', { orderId: id, orderNumber: order.orderNumber || id, customerName: order.customerName });
            // รองรับทั้งข้อมูลเก่า (ไม่มี items array) และข้อมูลใหม่
            const itemsToPrint = order.items && order.items.length > 0
                ? order.items
                : [{
                    productName: order.productName,
                    quantity: order.quantity,
                    productType: order.productType, // เพิ่มการดึง productType สำหรับข้อมูลเก่า
                    price: (order.quantity > 0 ? order.totalAmount / order.quantity : 0),
                }];

            // Populate receipt data
            document.getElementById('receipt-order-number').textContent = order.orderNumber || id;
            document.getElementById('receipt-order-date').textContent = order.orderDate?.toDate().toLocaleDateString('th-TH') || 'N/A';
            document.getElementById('receipt-order-time').textContent = now.toLocaleTimeString('th-TH'); // เปลี่ยนให้ใช้เวลาปัจจุบัน
            document.getElementById('receipt-customer-name').textContent = order.customerName || 'N/A';

            const itemsBody = document.getElementById('receipt-items-body');
            itemsBody.innerHTML = ''; // Clear previous items

            itemsToPrint.forEach(item => {
                const itemRow = document.createElement('tr');
                itemRow.className = 'border-b';
                itemRow.innerHTML = `
                    <td class="py-2">${item.productName || 'N/A'} <span class="text-xs text-slate-500">(${item.productType || 'N/A'})</span></td>
                    <td class="py-2 text-right">${(item.quantity || 0).toLocaleString()}</td>
                    <td class="py-2 text-right">฿${(item.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="py-2 text-right">฿${((item.price || 0) * (item.quantity || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                `;
                itemsBody.appendChild(itemRow);
            });

            // Populate footer
            const paymentDetailsEl = document.getElementById('receipt-payment-details');
            const installmentAmountEl = document.getElementById('receipt-installment-amount');
            const totalRowEl = document.getElementById('receipt-total-row');

            installmentAmountEl.textContent = `฿${(order.installmentAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('receipt-total-amount').textContent = `฿${(order.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            if (order.status === 'split' && order.installmentsCount) {
                // Handle display for "not yet paid"
                if (order.installmentNumber > 0) {
                    paymentDetailsEl.textContent = `ชำระงวดที่ ${order.installmentNumber} / ${order.installmentsCount}`;
                } else {
                    paymentDetailsEl.textContent = `แบ่งชำระ (ยังไม่ชำระ)`;
                }
                totalRowEl.classList.remove('hidden');
            } else {
                paymentDetailsEl.textContent = '';
                totalRowEl.classList.add('hidden');
            }

            // Add class to body to optimize print rendering
            document.body.classList.add('is-printing');
            // Trigger print dialog
            window.print();
            // Remove class after print dialog is handled
            document.body.classList.remove('is-printing');
        };

        // Listeners for the new details modal
        if (closeOrderDetailsModalBtn) {
            closeOrderDetailsModalBtn.addEventListener('click', closeDetailsModal);
            orderDetailsModal.addEventListener('click', (e) => { if (e.target === orderDetailsModal) closeDetailsModal(); });
        }

        // Add listener for the print button
        if (detailsPrintReceiptButton) {
            detailsPrintReceiptButton.addEventListener('click', () => {
                const orderId = detailsEditOrderButton.dataset.orderId; // Get orderId from edit button
                if (orderId) printOrderReceipt(orderId);
            });
        }

        const openAddModal = async () => {
            editingOrderId = null;
            orderForm.reset();
            
            // Ensure the container is empty before starting
            if (orderItemsContainer) {
                orderItemsContainer.innerHTML = '';
            }

            orderModalTitle.textContent = 'เพิ่มคำสั่งซื้อใหม่';
            // Set default date to today
            document.getElementById('order-date').valueAsDate = new Date();
            deleteOrderBtnInModal.classList.add('hidden'); // Hide delete button for new orders
            // Trigger update for the default status ('pending')
            updateFormBasedOnStatus(orderStatusSelect.value);

            await addNewOrderItem(); // Add the first item row automatically
            openModal();
        };

        const openEditModal = async (id) => {
            editingOrderId = id;
            orderForm.reset();

            const orderDoc = await getDoc(doc(db, "orders", id));
            if (!orderDoc.exists()) {
                alert("ไม่พบคำสั่งซื้อนี้ในระบบ");
                return;
            }
            const order = orderDoc.data();

            // Populate items
            orderItemsContainer.innerHTML = '';
            if (order.items && order.items.length > 0) {
                for (const item of order.items) {
                    await addNewOrderItem(item);
                }
            }
            updateGrandTotal();

            orderForm.name.value = order.customerName || '';
            orderForm.payment.value = order.paymentMethod || 'bank';
            orderForm.status.value = order.status || 'pending';
            orderForm.date.value = order.orderDate?.toDate().toISOString().split('T')[0] || '';
            orderForm.paymentDate.value = order.lastPaymentDate?.toDate().toISOString().split('T')[0] || '';

            // Manually trigger the update for the loaded status
            updateFormBasedOnStatus(order.status || 'pending');

            // If it's a split payment, set the installment values
            if (order.status === 'split') {
                document.getElementById('order-installments-count').value = order.installmentsCount || 2;
                document.getElementById('order-installments-count').dispatchEvent(new Event('change')); // Trigger change to update number options
                document.getElementById('order-installment-number').value = order.installmentNumber ?? 0;
            }

            orderModalTitle.textContent = 'แก้ไขคำสั่งซื้อ';

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
                    const { items, status } = orderData;

                    // Only return stock if the order was not already cancelled
                    if (items && items.length > 0 && status !== 'cancelled') {
                        for (const item of items) {
                            const productRef = doc(db, "products", item.productId);
                            const productSnap = await getDoc(productRef);
                            if (productSnap.exists()) {
                                const newStock = (productSnap.data().stock || 0) + item.quantity;
                                await updateDoc(productRef, { stock: newStock });
                            }
                        }
                    }

                    await deleteDoc(orderRef);
                    logAction('DELETE_ORDER', { orderId: id, customerName: customerName });
                    loadOrders('first'); // Reload the first page after deletion
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

            const itemRows = orderItemsContainer.querySelectorAll('.order-item-row');
            const items = Array.from(itemRows).map(row => {
                const productId = row.querySelector('.order-item-product').value;
                const product = allProductsForOrders.find(p => p.id === productId);
                return {
                    productId: productId,
                    productName: product ? product.name : 'N/A',
                    productType: product ? product.type : 'N/A',
                    quantity: parseInt(row.querySelector('.order-item-quantity').value, 10),
                    price: product ? product.price : 0,
                };
            });

            const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            const orderData = {
                customerName: orderForm.name.value,
                items: items,
                totalAmount: totalAmount,
                paymentMethod: orderForm.payment.value,
                status: orderForm.status.value,
                orderDate: new Date(orderForm.date.value),
                lastPaymentDate: orderForm.paymentDate.value ? new Date(orderForm.paymentDate.value) : null,
                installmentsCount: orderForm.status.value === 'split' ? parseInt(orderForm.installmentsCount.value, 10) : null,
                installmentNumber: orderForm.status.value === 'split' ? parseInt(orderForm.installmentNumber.value, 10) : null,
            };

            // Calculate installment amount if applicable
            if (orderData.status === 'split') {
                const total = orderData.totalAmount;
                const count = orderData.installmentsCount;
                const currentInstallment = orderData.installmentNumber;

                // If "Not yet paid" is selected, the amount for this transaction is 0.
                if (currentInstallment === 0) {
                    orderData.installmentAmount = 0;
                } else {
                    const baseInstallment = Math.ceil(total / count);
                    if (currentInstallment < count) {
                        orderData.installmentAmount = baseInstallment;
                    } else { // Last installment
                        orderData.installmentAmount = total - (baseInstallment * (count - 1));
                    }
                }
            } else {
                orderData.installmentAmount = orderData.totalAmount;
            }

            if (editingOrderId) {
                const orderRef = doc(db, "orders", editingOrderId);
                const originalOrderSnap = await getDoc(orderRef);
                const originalOrderData = originalOrderSnap.data();

                // Check if status is changed to 'cancelled'
                if (originalOrderData.status !== 'cancelled' && orderData.status === 'cancelled') {
                    const itemsToReturn = originalOrderData.items || [];
                    for (const item of itemsToReturn) {
                        if (item.productId && item.quantity > 0) {
                            const productRef = doc(db, "products", item.productId);
                            const productSnap = await getDoc(productRef);
                            if (productSnap.exists()) {
                                const newStock = (productSnap.data().stock || 0) + item.quantity;
                                await updateDoc(productRef, { stock: newStock });
                                logAction('RETURN_STOCK', {
                                    orderId: editingOrderId,
                                    ...item
                                });
                            }
                        }
                    }
                }

                await updateDoc(doc(db, "orders", editingOrderId), orderData);
                logAction('UPDATE_ORDER', { orderId: editingOrderId, changes: orderData });
            } else {
                // For new orders, check stock and deduct it.
                for (const item of orderData.items) {
                    const productToUpdate = allProductsForOrders.find(p => p.id === item.productId);
                    if (!productToUpdate) {
                        alert(`ไม่พบสินค้าสำหรับรหัส: ${item.productId}`);
                        saveButton.disabled = false;
                        return;
                    }
                    if (productToUpdate.stock < item.quantity) {
                        alert(`สินค้าไม่เพียงพอ! สินค้า "${productToUpdate.name}" เหลือเพียง ${productToUpdate.stock} ชิ้น`);
                        saveButton.disabled = false;
                        return;
                    }
                }

                // Deduct stock for all items
                for (const item of orderData.items) {
                    const productRef = doc(db, "products", item.productId);
                    const productData = allProductsForOrders.find(p => p.id === item.productId);
                    const newStock = productData.stock - item.quantity;
                    await updateDoc(productRef, { stock: newStock });
                }

                // Generate new custom order ID
                const orderDate = new Date(orderForm.date.value || Date.now()); // Use current date if form date is empty
                const year = orderDate.getFullYear();
                const month = String(orderDate.getMonth() + 1).padStart(2, '0');
                const day = String(orderDate.getDate()).padStart(2, '0');
                const datePrefix = `${year}${month}${day}`; // Format: YYYYMMDD

                // --- Use a monthly counter for unique sequence numbers ---
                const counterRef = doc(db, "counters", `orders_${year}`);
                const monthField = `month_${month}`;

                const counterSnap = await getDoc(counterRef);
                const currentCount = (counterSnap.exists() && counterSnap.data()[monthField]) ? counterSnap.data()[monthField] : 0;
                const newCount = currentCount + 1;

                // Update the counter for the next order
                await setDoc(counterRef, { [monthField]: newCount }, { merge: true });

                const sequenceNumber = String(newCount).padStart(4, '0');

                orderData.orderNumber = `${datePrefix}-${sequenceNumber}`; // Add custom readable ID to the data

                // Use setDoc with the custom orderNumber as the document ID
                const newOrderRef = doc(db, "orders", orderData.orderNumber);
                await setDoc(newOrderRef, orderData);
                logAction('CREATE_ORDER', { orderId: orderData.orderNumber, ...orderData });
            }

            closeModal();
            loadOrders('first'); // Reload and render the first page
            saveButton.disabled = false;
        });

        // Event Listeners
        openOrderModalBtn.addEventListener('click', openAddModal);
        closeOrderModalBtn.addEventListener('click', closeModal);
        cancelOrderModalBtn.addEventListener('click', closeModal);
        orderModal.addEventListener('click', (e) => { if (e.target === orderModal) closeModal(); });

        // --- Multi-item Order Logic ---
        const populateProductsDropdown = async (selectElement) => {
            if (allProductsForOrders.length === 0) {
                const productsSnapshot = await getDocs(collection(db, "products"));
                allProductsForOrders = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            selectElement.innerHTML = '<option value="">-- เลือกสินค้า --</option>';
            allProductsForOrders.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = `${p.name} (คงเหลือ: ${p.stock})`;
                option.dataset.price = p.price;
                selectElement.appendChild(option);
            });
        };

        const updateGrandTotal = () => {
            const itemRows = orderItemsContainer.querySelectorAll('.order-item-row');
            let grandTotal = 0;
            itemRows.forEach(row => {
                const itemTotalInput = row.querySelector('.order-item-total');
                grandTotal += parseFloat(itemTotalInput.value) || 0;
            });
            document.getElementById('order-total').value = grandTotal.toFixed(2);
        };

        const calculateItemTotal = (itemRow) => {
            const productSelect = itemRow.querySelector('.order-item-product');
            const quantityInput = itemRow.querySelector('.order-item-quantity');
            const itemTotalInput = itemRow.querySelector('.order-item-total');

            const selectedOption = productSelect.options[productSelect.selectedIndex];
            // Add a guard clause to prevent error if no option is selected (e.g., product deleted)
            if (!selectedOption || !selectedOption.dataset.price) {
                itemTotalInput.value = (0).toFixed(2);
                updateGrandTotal();
                return;
            }
            const price = parseFloat(selectedOption.dataset.price) || 0;
            const quantity = parseInt(quantityInput.value, 10) || 0;

            itemTotalInput.value = (price * quantity).toFixed(2);
            updateGrandTotal();
        };

        const addNewOrderItem = async (itemData = null) => {
            const templateContent = orderItemTemplate.content.cloneNode(true);
            const newRow = templateContent.querySelector('.order-item-row');
            const productSelect = newRow.querySelector('.order-item-product');
            const quantityInput = newRow.querySelector('.order-item-quantity');
            const removeBtn = newRow.querySelector('.remove-order-item-button');

            await populateProductsDropdown(productSelect);

            if (itemData) {
                productSelect.value = itemData.productId;
                quantityInput.value = itemData.quantity;
            }

            newRow.addEventListener('input', () => calculateItemTotal(newRow));
            removeBtn.addEventListener('click', () => {
                newRow.remove();
                updateGrandTotal();
            });

            orderItemsContainer.appendChild(newRow);
            if (itemData) {
                calculateItemTotal(newRow);
            }
        };

        if (addOrderItemBtn) addOrderItemBtn.addEventListener('click', () => addNewOrderItem());

        const renderOrders = (ordersToRender) => {
            currentlyRenderedOrders = ordersToRender; // For CSV export
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

            ordersToRender.forEach((order, index) => {
                const row = orderRowTemplate.content.cloneNode(true);
                row.querySelector('[data-field="sequence"]').textContent = index + 1;
                row.querySelector('[data-field="id"]').textContent = order.orderNumber ? order.orderNumber.toUpperCase() : order.id.substring(0, 8).toUpperCase(); // Show custom number, fallback to Firestore ID
                row.querySelector('[data-field="name"]').textContent = order.customerName || 'N/A';

                const items = order.items || [{ productName: order.productName, productType: order.productType, quantity: order.quantity }];
                row.querySelector('[data-field="productName"]').textContent = items.map(item => item.productName).join(', ');
                row.querySelector('[data-field="type-shirt"]').textContent = [...new Set(items.map(item => item.productType))].join(', ');

                // Translate payment method to Thai
                const paymentLabels = { 'bank': 'โอนธนาคาร', 'cash': 'เงินสด', 'credit': 'บัตรเครดิต' };
                row.querySelector('[data-field="payment"]').textContent = paymentLabels[order.paymentMethod] || order.paymentMethod || 'N/A';

                const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
                row.querySelector('[data-field="quantity"]').textContent = totalQuantity;
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

                // --- NEW COLOR LOGIC ---
                let statusColorClasses = 'bg-slate-100 text-slate-800'; // Default

                if (order.status === 'cancelled') {
                    statusColorClasses = 'bg-red-100 text-red-800';
                } else if (order.status === 'pending') {
                    statusColorClasses = 'bg-yellow-100 text-yellow-800';
                } else if (order.status === 'paid') {
                    statusColorClasses = 'bg-green-100 text-green-800';
                } else if (order.status === 'split') {
                    const num = order.installmentNumber || 0;
                    const count = order.installmentsCount || 0;
                    if (num === 0) {
                        // ยังไม่ชำระ
                        statusColorClasses = 'bg-red-100 text-red-800';
                    } else if (num > 0 && num === count) {
                        // ชำระครบแล้ว
                        statusColorClasses = 'bg-green-100 text-green-800';
                    } else {
                        // กำลังแบ่งชำระ
                        statusColorClasses = 'bg-blue-100 text-blue-800';
                    }
                }
                if (statusEl) statusEl.className += ' ' + statusColorClasses;

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

        const loadOrders = async (direction = 'first') => {
            const ordersCollectionRef = collection(db, "orders");
            let q;

            // --- Build Query Constraints ---
            const constraints = [];

            // 1. Filtering
            const searchTerm = searchInput.value.toLowerCase().trim();
            const startDate = dateFilterStart.value ? new Date(dateFilterStart.value).getTime() : null;
            const endDate = dateFilterEnd.value ? new Date(dateFilterEnd.value).setHours(23, 59, 59, 999) : null;
            const activeStatusFilter = document.querySelector('[data-status-filter].border-sky-500')?.dataset.statusFilter || 'all';

            if (activeStatusFilter !== 'all') {
                constraints.push(where('status', '==', activeStatusFilter));
            }

            // Note: Client-side filtering for search and date range is necessary
            // because Firestore has limitations on complex queries (e.g., range filters on different fields).
            // We fetch a larger batch and filter locally for these.

            // 2. Sorting
            const sortKeyMap = { 'total': 'installmentAmount', 'fullTotal': 'totalAmount', 'date': 'orderDate', 'id': 'orderNumber' };
            const sortKey = sortKeyMap[currentOrderSortKey] || currentOrderSortKey;
            constraints.push(orderBy(sortKey, currentOrderSortDirection));

            // 3. Pagination
            if (direction === 'next' && lastVisible) {
                constraints.push(startAfter(lastVisible));
            } else if (direction === 'prev' && pageHistory.length > 0) {
                // For 'prev', we need to re-query from the start of the previous page.
                // Firestore's `endBefore` is tricky, so this is a more reliable approach.
                const prevPageStart = pageHistory.pop(); // This is the doc to start *after* on the page before the previous one.
                if (prevPageStart) {
                    constraints.push(startAfter(prevPageStart));
                }
            }
            constraints.push(limit(ORDERS_PER_PAGE));

            // --- Execute Query ---
            try {
                q = query(ordersCollectionRef, ...constraints);
                const documentSnapshots = await getDocs(q);

                let orders = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // --- Apply client-side filters (for search and date) ---
                if (searchTerm) {
                    orders = orders.filter(order =>
                        (order.customerName || '').toLowerCase().includes(searchTerm) ||
                        (order.productName || '').toLowerCase().includes(searchTerm) ||
                        (order.orderNumber || '').toLowerCase().includes(searchTerm)
                    );
                }
                if (startDate || endDate) {
                    orders = orders.filter(order => {
                        const orderTimestamp = order.orderDate ? order.orderDate.seconds * 1000 : 0;
                        const startMatch = startDate ? orderTimestamp >= startDate : true;
                        const endMatch = endDate ? orderTimestamp <= endDate : true;
                        return startMatch && endMatch;
                    });
                }

                renderOrders(orders);

                // --- Update Pagination State ---
                if (!documentSnapshots.empty) {
                    firstVisible = documentSnapshots.docs[0];
                    lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];

                    if (direction === 'next') {
                        pageHistory.push(firstVisible);
                        currentPageNumber++;
                    } else if (direction === 'prev') {
                        currentPageNumber--;
                    } else { // 'first'
                        pageHistory = [];
                        currentPageNumber = 1;
                    }
                }

                // Update button states
                nextPageBtn.disabled = documentSnapshots.docs.length < ORDERS_PER_PAGE;
                prevPageBtn.disabled = currentPageNumber === 1;

                // Update pagination info text
                const startItem = (currentPageNumber - 1) * ORDERS_PER_PAGE + 1;
                const endItem = startItem + orders.length - 1;
                paginationInfoEl.textContent = `${startItem} - ${endItem}`;

            } catch (error) {
                console.error("Error loading orders:", error);
                alert("เกิดข้อผิดพลาดในการโหลดข้อมูลคำสั่งซื้อ อาจจำเป็นต้องสร้าง Index ใน Firestore สำหรับการกรอง/เรียงลำดับนี้");
                ordersTable.innerHTML = `<tr><td colspan="13" class="text-center py-8 text-red-500">ไม่สามารถโหลดข้อมูลได้</td></tr>`;
            }
        };

        // Initial load and event listeners that trigger a new query
        const triggerNewQuery = () => {
            lastVisible = null; // Reset pagination
            loadOrders('first');
        };

        // Search functionality
        searchInput.addEventListener('input', triggerNewQuery);

        // Status Card Filter functionality
        document.querySelectorAll('[data-status-filter]').forEach(card => {
            card.addEventListener('click', () => {
                // Update UI for active card
                document.querySelectorAll('[data-status-filter]').forEach(c => {
                    c.classList.remove('border-sky-500', 'bg-sky-50/50');
                    c.classList.add('border-transparent');
                });
                card.classList.remove('border-transparent');
                card.classList.add('border-sky-500', 'bg-sky-50/50');

                triggerNewQuery();
            });
        });

        // Date Filter functionality
        if (dateFilterStart && dateFilterEnd && clearDateFilterBtn) {
            dateFilterStart.addEventListener('change', triggerNewQuery);
            dateFilterEnd.addEventListener('change', triggerNewQuery);
            clearDateFilterBtn.addEventListener('click', () => {
                dateFilterStart.value = '';
                dateFilterEnd.value = '';
                triggerNewQuery();
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

                triggerNewQuery(); // Re-run query with new sorting
            });
        });

        // Pagination button listeners
        nextPageBtn.addEventListener('click', () => loadOrders('next'));
        prevPageBtn.addEventListener('click', () => loadOrders('prev'));

        const exportOrdersToCSV = () => {
            // This function now exports only the currently visible page.
            // To export all, a different mechanism would be needed (e.g., a Cloud Function).
            if (searchInput.value) {
                alert('ไม่สามารถ Export ได้ขณะใช้การค้นหา กรุณาล้างการค้นหาก่อน');
                return;
            }

            const headers = [
                "รหัสคำสั่งซื้อ", "ลูกค้า", "ชื่อสินค้า", "ประเภท", "จำนวน", "ยอดงวดนี้", "ยอดเต็ม", "สถานะ", "วิธีชำระเงิน", "วันที่สั่ง", "วันที่ชำระล่าสุด"
            ];

            const rows = currentlyRenderedOrders.map(order => {
                const items = order.items || [{ productName: order.productName, productType: order.productType, quantity: order.quantity }];
                const orderId = order.orderNumber || order.id;
                const customerName = order.customerName || 'N/A';
                const productName = items.map(i => i.productName).join('; ');
                const productType = [...new Set(items.map(i => i.productType))].join('; ');
                const quantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
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

        loadOrders('first'); // Initial load
        updateOrderSummaryCards(); // เรียกใช้ฟังก์ชันใหม่เพื่ออัปเดตการ์ดสรุป
    }
}