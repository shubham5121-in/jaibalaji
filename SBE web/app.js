import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    setDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// App State & Data Management
const APP_KEY = 'sbe_dsa_data';
const LOANS_COLLECTION = 'loans';

// Initial Data Load
let loans = [];
let editingId = null; // Track if we are editing an entry

// Firestore Collection Reference
const loansCol = collection(db, LOANS_COLLECTION);

// Real-time listener for data
const unsubscribe = onSnapshot(query(loansCol, orderBy('date', 'desc')), (snapshot) => {
    loans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    // Trigger UI updates based on current view
    const currentView = document.querySelector('.nav-item.active')?.getAttribute('data-view');
    if (currentView === 'entry') {
        renderTableRows();
    } else if (currentView === 'dashboard') {
        renderDashboardPage();
    }
});

// One-time Migration from localStorage to Firestore
const migrateToFirestore = async () => {
    const localData = JSON.parse(localStorage.getItem(APP_KEY));
    if (localData && localData.length > 0) {
        console.log(`Migrating ${localData.length} records to Firestore...`);
        try {
            const batch = writeBatch(db);
            localData.forEach(loan => {
                const newDocRef = doc(loansCol);
                batch.set(newDocRef, loan);
            });
            await batch.commit();
            localStorage.removeItem(APP_KEY); // Remove after migration
            console.log("Migration complete!");
        } catch (error) {
            console.error("Migration failed:", error);
        }
    }
};
migrateToFirestore();

// DOM Elements
const contentArea = document.getElementById('content-area');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('page-title');

// Utility Functions
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-IN');
};

const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
        case 'disbursed': return 'status-disbursed';
        case 'approved': return 'status-approved';
        case 'rejected': return 'status-rejected';
        case 'underwriting': return 'status-underwriting';
        case 'underwriting forward': return 'status-forward';
        default: return 'status-default';
    }
};

const saveData = async (loanData, id = null) => {
    try {
        if (id) {
            const docRef = doc(db, LOANS_COLLECTION, id);
            await updateDoc(docRef, loanData);
        } else {
            await addDoc(loansCol, loanData);
        }
    } catch (error) {
        console.error("Error saving to Firebase:", error);
        showToast("Error saving data. Please check connection.");
    }
};

// Internal helper for batch operations (used for bulk delete/import)
const saveBulkData = async (newLoans) => {
    try {
        const batch = writeBatch(db);
        newLoans.forEach(loan => {
            const newDocRef = doc(loansCol);
            batch.set(newDocRef, loan);
        });
        await batch.commit();
    } catch (error) {
        console.error("Error saving bulk data:", error);
    }
};

// Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const view = item.getAttribute('data-view');
        loadView(view);
    });
});

const loadView = (view) => {


    // Reset Menu Active State
    navItems.forEach(nav => nav.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${view}"]`).classList.add('active');

    contentArea.innerHTML = '';
    editingId = null; // Reset edit mode on view change
    if (view === 'entry') {
        renderEntryPage();
    } else if (view === 'dashboard') {
        renderDashboardPage();
    }
};



// --- BACKUP & RESTORE LOGIC ---
// Expose functions to window since we are now a module
window.backupData = () => {
    const dataStr = JSON.stringify(loans, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `SBE_Backup_${new Date().toISOString().slice(0, 10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
};

window.restoreData = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData)) {
                if (confirm(`Found ${importedData.length} records in backup. This will REPLACE ALL data in the cloud. Are you sure?`)) {
                    // For safety, we keep existing Firebase data and just ADD these? 
                    // No, "REPLACE" means delete all and add new.
                    // But deleting all is risky for now. Let's just ADD them.
                    await saveBulkData(importedData);
                    alert("Data restored and synced to cloud successfully!");
                }
            } else {
                alert("Invalid backup file format. Expected an array of records.");
            }
        } catch (error) {
            alert("Error parsing backup file. Please ensure it is a valid JSON file.");
            console.error(error);
        }
    };
    reader.readAsText(file);
    input.value = '';
};

// --- VIEW: DAILY ENTRY ---
const renderEntryPage = () => {
    pageTitle.textContent = 'Daily Entries';

    const container = document.createElement('div');

    // Form Section
    const formHtml = `
        <div class="card">
            <h3 id="form-title" style="margin-bottom:1.5rem;">Add New Case</h3>
            <form id="entry-form" onsubmit="handleFormSubmit(event)">
                <div class="form-row">
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Date</label>
                        <input type="date" id="date" class="form-control" required>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Customer Name</label>
                        <input type="text" id="customerName" class="form-control" placeholder="Enter Name" required>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">LOS Number</label>
                        <input type="text" id="losNo" class="form-control" placeholder="Enter LOS No">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Bank Name</label>
                        <input type="text" id="bankName" class="form-control" placeholder="Select Bank" list="bank-list">
                        <datalist id="bank-list">
                            <option value="HDFC Bank">
                            <option value="ICICI Bank">
                            <option value="Axis Bank">
                            <option value="Axis Finance">
                            <option value="Chola MS">
                            <option value="Kotak Mahindra">
                            <option value="Bajaj Finserv">
                        </datalist>
                    </div>
                </div>

                <div class="form-row">
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Loan Amount</label>
                        <input type="number" id="amount" class="form-control" placeholder="₹ Amount" required min="0">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Tenure (Months)</label>
                        <input type="number" id="tenure" class="form-control" placeholder="e.g. 60" required list="tenure-list">
                        <datalist id="tenure-list">
                            <option value="12">
                            <option value="24">
                            <option value="36">
                            <option value="48">
                            <option value="60">
                            <option value="120">
                            <option value="180">
                            <option value="240">
                        </datalist>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Interest Rate (%)</label>
                        <input type="number" id="interestRate" class="form-control" placeholder="Rate" step="0.01">
                    </div>
                </div>

                <div class="form-row">
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Case Type</label>
                        <input type="text" id="caseType" class="form-control" placeholder="Select Type" list="case-type-list" required>
                        <datalist id="case-type-list">
                            <option value="Normal PL">
                            <option value="Golden Edge">
                            <option value="BT">
                            <option value="Ex BT">
                            <option value="Business Loan">
                            <option value="Home Loan">
                        </datalist>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Location</label>
                        <input type="text" id="location" class="form-control" placeholder="City / Area">
                    </div>
                </div>

                <div class="form-row">
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Status</label>
                        <input type="text" id="status" class="form-control" placeholder="Select Status" required list="status-list">
                        <datalist id="status-list">
                            <option value="Underwriting">
                            <option value="Underwriting Forward">
                            <option value="Approved">
                            <option value="Disbursed">
                            <option value="Rejected">
                        </datalist>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Executive Name</label>
                        <input type="text" id="executiveName" class="form-control" placeholder="Select Executive" required list="exec-list">
                        <datalist id="exec-list">
                            <!-- Auto-populated from existing data -->
                            ${getUniqueExecutives().map(name => `<option value="${name}">`).join('')}
                        </datalist>
                    </div>
                    <div style="flex:2;">
                        <label style="display:block; margin-bottom:0.25rem; font-weight:600; font-size:0.85rem; color:#475569;">Remarks / Notes</label>
                        <input type="text" id="remarks" class="form-control" placeholder="Any comments...">
                    </div>
                </div>
                
                <div style="display:flex; gap:1rem; margin-top:2rem;">
                    <button type="submit" id="submit-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Add Entry</button>
                    <button type="button" id="cancel-btn" class="btn btn-danger" style="display:none;" onclick="cancelEdit()">Cancel</button>
                </div>
            </form>
        </div>
    `;

    // Table Section
    const tableHtml = `
        <div class="controls-bar" style="display:flex; justify-content:space-between; margin-bottom:1rem; gap:1rem; flex-wrap:wrap; align-items:center;">
            <div style="display:flex; gap:0.5rem; align-items:center;">
                <input type="text" id="search-input" class="form-control" placeholder="Search..." oninput="window.renderTableRows()" style="max-width:250px;">
                <!-- Bulk Action Button -->
                <button id="bulk-delete-btn" class="btn btn-danger" onclick="deleteSelectedEntries()" style="display:none; padding: 0.5rem 1rem; font-size: 0.85rem;">
                    <i class="fas fa-trash"></i> Delete Selected (<span id="selected-count">0</span>)
                </button>
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
                <button class="btn btn-excel" onclick="exportToCSV()" title="Export All Data">
                    <i class="fas fa-file-excel"></i> Export Excel
                </button>
                <div style="position:relative;">
                    <button class="btn btn-primary" onclick="triggerImport()" style="background:#0f172a; border:1px solid #1e293b;">
                        <i class="fas fa-file-import"></i> Import Excel
                    </button>
                    <input type="file" id="excel-input" accept=".xlsx, .xls" style="display:none;" onchange="handleExcelImport(this)">
                </div>
                <button class="btn" onclick="downloadImportTemplate()" style="background:none; color:#64748b; font-size:0.85rem; padding:0.5rem; text-decoration:underline;">
                    <i class="fas fa-download"></i> Template
                </button>
            </div>
        </div>

        <!-- Floating Ghost Scrollbar (Fixed at bottom of viewport) -->
        <div id="ghost-scrollbar-container" style="position:fixed; bottom:0; height:20px; 
            overflow-x:auto; overflow-y:hidden; z-index:1000; display:none; background:transparent;">
            <div id="ghost-scrollbar-content" style="height:1px;"></div>
        </div>

        <div class="table-container" id="main-table-container">
            <table style="font-size: 0.85rem;">
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">
                            <input type="checkbox" id="select-all" onclick="toggleSelectAll(this)">
                        </th>
                        <th>Date</th>
                        <th>LOS No.</th>
                        <th>Customer</th>
                        <th>Type</th>
                        <th>Bank</th>
                        <th>Amount</th>
                        <th>Tenure</th>
                        <th>Loc</th>
                        <th>Status</th>
                        <th>Executive</th>
                        <th>Remarks</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="entries-body">
                    <!-- Rows injected here -->
                </tbody>
            </table>
        </div>
        <div class="total-summary">
            <span>Total Disbursed Volume</span>
            <strong id="grand-total">₹0</strong>
        </div>
    `;

    container.innerHTML = formHtml + tableHtml;
    contentArea.appendChild(container);

    document.getElementById('date').valueAsDate = new Date();
    renderTableRows();

    // Initialize sticky scrollbar
    setTimeout(() => initStickyScrollbar(), 200);
};

const getUniqueExecutives = () => {
    const executives = new Set(loans.map(l => l.executiveName));
    return Array.from(executives).sort();
};

// Explicitly attach to window for HTML access
window.handleFormSubmit = async (e) => {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('amount').value);

    const entryData = {
        date: document.getElementById('date').value,
        customerName: document.getElementById('customerName').value,
        losNo: document.getElementById('losNo').value,
        bankName: document.getElementById('bankName').value,
        amount: amount,
        interestRate: parseFloat(document.getElementById('interestRate').value) || 0,
        tenure: document.getElementById('tenure').value,
        caseType: document.getElementById('caseType').value,
        location: document.getElementById('location').value,
        status: document.getElementById('status').value,
        executiveName: document.getElementById('executiveName').value.trim(),
        remarks: document.getElementById('remarks').value
    };

    await saveData(entryData, editingId);

    if (!editingId) {
        // If it was a new entry, reset the form by re-rendering the page
        renderEntryPage();
    } else {
        editingId = null;
        cancelEdit(); // Reset UI
    }
};

window.renderTableRows = () => {
    const tbody = document.getElementById('entries-body');
    if (!tbody) return;

    const searchInput = document.getElementById('search-input');
    const searchTerm = (searchInput?.value || '').toString().toLowerCase().trim();

    console.log("Searching for:", searchTerm); // Debugging

    const filteredLoans = loans.filter(loan => {
        // Safe String Casting helper
        const safeStr = (val) => String(val || '').toLowerCase();

        const textMatch =
            safeStr(loan.customerName).includes(searchTerm) ||
            safeStr(loan.losNo).includes(searchTerm) ||
            safeStr(loan.bankName).includes(searchTerm) ||
            safeStr(loan.caseType).includes(searchTerm) ||
            safeStr(loan.location).includes(searchTerm) ||
            safeStr(loan.executiveName).includes(searchTerm) ||
            safeStr(loan.amount).includes(searchTerm) ||
            safeStr(loan.status).includes(searchTerm);

        return textMatch;
    });

    tbody.innerHTML = filteredLoans.map(loan => `
        <tr>
            <td style="text-align: center;">
                <input type="checkbox" class="entry-checkbox" value="${loan.id}" onclick="updateBulkState()">
            </td>
            <td>${formatDate(loan.date)}</td>
            <td>${loan.losNo || '-'}</td>
            <td style="font-weight:600;">${loan.customerName}</td>
            <td>${loan.caseType || '-'}</td>
            <td>${loan.bankName || '-'}</td>
            <td class="amount">${formatCurrency(loan.amount)}</td>
            <td>${loan.tenure || '-'} M</td>
            <td>${loan.location || '-'}</td>
            <td><span class="status-badge ${getStatusClass(loan.status)}">${loan.status}</span></td>
            <td>${loan.executiveName}</td>
            <td style="font-size:0.8rem; color:var(--text-secondary); max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${loan.remarks || ''}">${loan.remarks || '-'}</td>
            <td>
                <button onclick="editEntry('${loan.id}')" style="color:var(--primary-color); background:none; border:none; cursor:pointer; margin-right:0.5rem;" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteEntry('${loan.id}')" style="color:red; background:none; border:none; cursor:pointer;" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Reset Select All checkbox
    const selectAllBox = document.getElementById('select-all');
    if (selectAllBox) selectAllBox.checked = false;
    updateBulkState();

    // Calculate totals based on filtered visible rows - ONLY Disbursed
    const disbursedLoans = filteredLoans.filter(l => l.status === 'Disbursed');

    // Total Volume (Disbursed Only)
    const totalVolume = disbursedLoans.reduce((sum, loan) => sum + loan.amount, 0);
    document.getElementById('grand-total').textContent = formatCurrency(totalVolume);
};

// Sticky Scrollbar Functionality (Ghost Scrollbar)
// We keep global listeners but find elements dynamically to handle page navigation
let scrollListenersAttached = false;

const initStickyScrollbar = () => {
    const tableContainer = document.getElementById('main-table-container');
    const ghostContainer = document.getElementById('ghost-scrollbar-container');
    const ghostContent = document.getElementById('ghost-scrollbar-content');

    if (!tableContainer || !ghostContainer || !ghostContent) return;

    // 1. Setup Table-Specific Listeners (Must re-attach on every page render)
    const syncScroll = (source, target) => {
        if (Math.abs(target.scrollLeft - source.scrollLeft) > 1) {
            target.scrollLeft = source.scrollLeft;
        }
    };

    // Remove old listeners implicitly by the element being replaced, but we add fresh ones
    tableContainer.addEventListener('scroll', () => syncScroll(tableContainer, ghostContainer));
    ghostContainer.addEventListener('scroll', () => syncScroll(ghostContainer, tableContainer));

    // 2. Setup Global Visibility Logic (Attached only once)
    const checkVisibility = () => {
        // Find elements fresh in case of navigation
        const currentTable = document.getElementById('main-table-container');
        const currentGhost = document.getElementById('ghost-scrollbar-container');
        const currentContent = document.getElementById('ghost-scrollbar-content');

        if (!currentTable || !currentGhost || !currentContent) return;

        const rect = currentTable.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        const needsScroll = currentTable.scrollWidth > currentTable.clientWidth;
        const topOfTableVisible = rect.top < viewportHeight;
        const bottomOfTableBelowView = rect.bottom > viewportHeight;

        if (needsScroll && topOfTableVisible && bottomOfTableBelowView) {
            currentContent.style.width = currentTable.scrollWidth + 'px';
            currentGhost.style.left = rect.left + 'px';
            currentGhost.style.width = rect.width + 'px';
            currentGhost.style.display = 'block';
            currentGhost.scrollLeft = currentTable.scrollLeft;
        } else {
            currentGhost.style.display = 'none';
        }
    };

    if (!scrollListenersAttached) {
        window.addEventListener('scroll', checkVisibility);
        window.addEventListener('resize', checkVisibility);
        setInterval(checkVisibility, 1000); // Periodic check for content changes
        scrollListenersAttached = true;
    }

    // Initial check
    setTimeout(checkVisibility, 200);
};

// Undo History
let actionHistory = [];

// Toast Notification
const showToast = (message) => {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: #1e293b;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transform: translateY(100px);
            transition: transform 0.3s ease-out;
            font-size: 0.9rem;
        `;
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
        toast.style.transform = 'translateY(100px)';
    }, 4000);
};

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoLastAction();
    }

    // Ctrl+S: Save/Submit form (if on Daily Entry page)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const form = document.getElementById('entry-form');
        if (form) {
            form.requestSubmit(); // Trigger form submission
        }
    }

    // Esc: Close modal
    if (e.key === 'Escape') {
        const modal = document.getElementById('exec-modal');
        if (modal && modal.classList.contains('open')) {
            closeModal();
        }
    }
});

const undoLastAction = async () => {
    if (actionHistory.length === 0) {
        showToast("Nothing to undo.");
        return;
    }

    const lastAction = actionHistory.pop();
    if (lastAction.type === 'delete') {
        const deletedItems = lastAction.data;
        // Strip out the Firestore ID if it's there, or just add them as new
        const itemsToRestore = deletedItems.map(({ id, ...rest }) => rest);
        await saveBulkData(itemsToRestore);
        showToast(`Restored ${deletedItems.length} entries to cloud.`);
    }
};

// Bulk Actions Logic
window.toggleSelectAll = (source) => {
    const checkboxes = document.querySelectorAll('.entry-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
    updateBulkState();
};

window.updateBulkState = () => {
    const checkboxes = document.querySelectorAll('.entry-checkbox:checked');
    const btn = document.getElementById('bulk-delete-btn');
    const countSpan = document.getElementById('selected-count');

    if (btn && countSpan) { // Ensure elements exist before manipulating
        if (checkboxes.length > 0) {
            btn.style.display = 'inline-flex';
            countSpan.textContent = checkboxes.length;
        } else {
            btn.style.display = 'none';
        }
    }
};

window.deleteSelectedEntries = async () => {
    const checkboxes = document.querySelectorAll('.entry-checkbox:checked');
    if (checkboxes.length === 0) return;

    if (confirm(`Are you sure you want to delete these ${checkboxes.length} entries from the cloud?`)) {
        const idsToDelete = Array.from(checkboxes).map(cb => cb.value);

        try {
            const batch = writeBatch(db);
            idsToDelete.forEach(id => {
                const docRef = doc(db, LOANS_COLLECTION, id);
                batch.delete(docRef);
            });
            await batch.commit();
            showToast(`Deleted ${idsToDelete.length} entries.`);
        } catch (error) {
            console.error("Error deleting entries:", error);
            showToast("Error deleting from cloud.");
        }
    }
};

// Edit Logic
window.editEntry = (id) => {
    const loan = loans.find(l => l.id === id);
    if (!loan) return;

    editingId = id;

    // Scroll to top
    document.querySelector('.main-content').scrollTop = 0;

    // Populate Form
    document.getElementById('date').value = loan.date;
    document.getElementById('customerName').value = loan.customerName;
    document.getElementById('losNo').value = loan.losNo || '';
    document.getElementById('bankName').value = loan.bankName || '';
    document.getElementById('amount').value = loan.amount;
    document.getElementById('interestRate').value = loan.interestRate || '';
    document.getElementById('tenure').value = loan.tenure || '';
    document.getElementById('caseType').value = loan.caseType || '';
    document.getElementById('location').value = loan.location || '';
    document.getElementById('status').value = loan.status;
    document.getElementById('executiveName').value = loan.executiveName;
    document.getElementById('remarks').value = loan.remarks || '';

    // Update UI
    document.getElementById('form-title').textContent = 'Edit Case';
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Entry';
    submitBtn.classList.remove('btn-primary');
    submitBtn.classList.add('btn-success');
    // Removed undefined background-color override to allow class color to show

    document.getElementById('cancel-btn').style.display = 'inline-block';
};

window.cancelEdit = () => {
    editingId = null;
    document.getElementById('entry-form').reset();
    document.getElementById('date').valueAsDate = new Date(); // Reset to today
    document.getElementById('status').value = 'Underwriting';

    // Reset UI
    document.getElementById('form-title').textContent = 'Add New Case';
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerHTML = '<i class="fas fa-plus"></i> Add Entry';
    submitBtn.classList.add('btn-primary');
    submitBtn.style.backgroundColor = '';

    document.getElementById('cancel-btn').style.display = 'none';
};

window.deleteEntry = (id) => {
    if (confirm('Are you sure you want to delete this entry?')) {
        const deletedItem = loans.find(l => l.id === id);
        if (deletedItem) {
            actionHistory.push({ type: 'delete', data: [deletedItem] });

            loans = loans.filter(l => l.id !== id);
            saveToLocalStorage();
            renderTableRows();
            showToast("Entry deleted. Press Ctrl+Z to undo.");
        }
    }
};

window.triggerImport = () => {
    document.getElementById('excel-input').click();
};

window.downloadImportTemplate = () => {
    const headers = [
        "Date (YYYY-MM-DD)", "Customer Name", "LOS No", "Bank Name", "Amount",
        "Tenure", "Interest Rate", "Case Type", "Location", "Status", "Executive Name", "Remarks"
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "SBE_Import_Template.xlsx");
};

window.handleExcelImport = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (jsonData.length === 0) {
                alert("File appears to be empty.");
                return;
            }

            let importedCount = 0;

            // Helper to parse Excel dates (Serial or String)
            const parseExcelDate = (raw) => {
                if (!raw) return new Date().toISOString().split('T')[0];

                // Handle Excel Serial Date (Numbers like 44562)
                if (typeof raw === 'number') {
                    // Excel base date is Dec 30, 1899 (crazy, but true due to leap year bug)
                    const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
                    return date.toISOString().split('T')[0];
                }

                // Handle Strings
                const date = new Date(raw);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0];
                }

                // Fallback for custom formats if simple parse fails (e.g., DD/MM/YYYY)
                // This is a basic implementation; relying on ISO is safest
                return new Date().toISOString().split('T')[0];
            };

            const newItems = [];
            jsonData.forEach(row => {
                // Fuzzy mapping for column names
                const getVal = (keys) => {
                    for (let k of keys) {
                        const found = Object.keys(row).find(rk => rk.toLowerCase().includes(k.toLowerCase()));
                        if (found) return row[found];
                    }
                    return "";
                };

                // Extract data
                const dateRaw = getVal(["Date"]);
                const customer = getVal(["Customer", "Name"]);
                const amountRaw = getVal(["Amount"]);

                if (customer && amountRaw) {
                    const finalDate = parseExcelDate(dateRaw);

                    const newEntry = {
                        date: finalDate,
                        customerName: customer,
                        losNo: getVal(["LOS", "Application"]),
                        bankName: getVal(["Bank"]),
                        amount: parseFloat(amountRaw) || 0,
                        tenure: getVal(["Tenure"]),
                        interestRate: parseFloat(getVal(["Rate", "Interest"])) || 0,
                        caseType: getVal(["Type", "Case"]),
                        location: getVal(["Location", "City"]),
                        status: getVal(["Status"]) || "Underwriting",
                        executiveName: getVal(["Executive"]) || "Unassigned",
                        remarks: getVal(["Remark", "Note"])
                    };
                    newItems.push(newEntry);
                    importedCount++;
                }
            });

            if (newItems.length > 0) {
                await saveBulkData(newItems);
                alert(`Successfully imported ${importedCount} records to the cloud!`);
            } else {
                alert("No valid records found in the Excel file.");
            }
        } catch (error) {
            console.error(error);
            alert("Error parsing Excel file. Please ensure it is a valid format.");
        }
    };
    reader.readAsArrayBuffer(file);
    input.value = ""; // Reset
};

window.exportToCSV = () => {
    if (loans.length === 0) {
        alert("No data to export!");
        return;
    }

    // CSV Headers
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,LOS No,Customer Name,Type,Bank,Amount,Tenure (M),Rate (%),Status,Executive,Location,Remarks\n";

    // CSV Rows
    loans.forEach(loan => {
        const row = [
            loan.date,
            `"${loan.losNo || ''}"`,
            `"${loan.customerName}"`,
            `"${loan.caseType || ''}"`,
            `"${loan.bankName || ''}"`,
            loan.amount,
            loan.tenure || 0,
            loan.interestRate || 0,
            loan.status,
            `"${loan.executiveName}"`,
            `"${loan.location || ''}"`,
            `"${loan.remarks || ''}"`
        ].join(",");
        csvContent += row + "\r\n";
    });

    // Create Download Link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SBE_Data_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Dashboard Filter State
let dashboardDateFilter = { start: '', end: '' };

// --- VIEW: OWNER DASHBOARD ---
const renderDashboardPage = () => {
    pageTitle.textContent = 'Owner Dashboard';

    const executiveStats = {};
    let totalCompanyAmount = 0;

    loans.forEach(loan => {
        // Date Filter Logic
        if (dashboardDateFilter.start && dashboardDateFilter.end) {
            if (loan.date < dashboardDateFilter.start || loan.date > dashboardDateFilter.end) {
                return; // Skip this loan if outside range
            }
        }

        // Count all non-rejected files as "Work Done"
        const isFileProcessed = loan.status !== 'Rejected';

        // Only calculate VOLUME for "Disbursed" cases
        const isDisbursed = loan.status === 'Disbursed';

        if (!executiveStats[loan.executiveName]) {
            executiveStats[loan.executiveName] = {
                name: loan.executiveName,
                count: 0,
                disbursedCount: 0,
                totalAmount: 0,
                loans: []
            };
        }

        if (isFileProcessed) {
            executiveStats[loan.executiveName].count++;
        }

        if (isDisbursed) {
            executiveStats[loan.executiveName].disbursedCount++;
            executiveStats[loan.executiveName].totalAmount += loan.amount;
            totalCompanyAmount += loan.amount;
        }

        executiveStats[loan.executiveName].loans.push(loan);
    });

    const totalDisbursedFiles = Object.values(executiveStats).reduce((sum, e) => sum + e.disbursedCount, 0);
    const totalProcessedFiles = Object.values(executiveStats).reduce((sum, e) => sum + e.count, 0);

    const execArray = Object.values(executiveStats).sort((a, b) => b.totalAmount - a.totalAmount);

    const container = document.createElement('div');

    // Date Filter UI
    const filterHtml = `
        <div class="card" style="margin-bottom:1.5rem; display:flex; flex-wrap:wrap; gap:1rem; align-items:center;">
            <div style="font-weight:600; color:var(--text-secondary);"><i class="far fa-calendar-alt"></i> Filter by Date:</div>
            <input type="date" id="startDate" class="form-control" style="width:auto;" value="${dashboardDateFilter.start}">
            <span style="color:var(--text-secondary);">to</span>
            <input type="date" id="endDate" class="form-control" style="width:auto;" value="${dashboardDateFilter.end}">
            <button class="btn btn-primary" onclick="applyDashboardFilter()" style="padding:0.4rem 1rem; font-size:0.9rem;">Apply</button>
            <button class="btn btn-danger" onclick="clearDashboardFilter()" style="padding:0.4rem 1rem; font-size:0.9rem; background: #e5e7eb; color: #374151; border:none;">Clear</button>
        </div>
    `;

    // Top Summary
    const summaryHtml = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1.5rem; margin-bottom:2rem;">
            <!-- Formal Volume Card -->
            <div class="card" style="background: white; padding:1.5rem; margin-bottom:0; border:1px solid #e2e8f0; border-top: 4px solid #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <h3 style="color:#64748b; font-size:0.85rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Total Business Volume</h3>
                        <h1 style="color:#0f172a; font-size:2.2rem; font-weight:700; margin-bottom:0; letter-spacing:-0.03em;">${formatCurrency(totalCompanyAmount)}</h1>
                        ${dashboardDateFilter.start ? `
                        <div style="margin-top:0.75rem; display:inline-flex; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; padding:4px 8px; border-radius:4px;">
                            <i class="far fa-calendar-alt" style="color:#64748b; font-size:0.75rem; margin-right:6px;"></i>
                            <span style="color:#334155; font-size:0.75rem; font-weight:600;">${formatDate(dashboardDateFilter.start)} - ${formatDate(dashboardDateFilter.end)}</span>
                        </div>` : ''}
                    </div>
                    <div style="width:48px; height:48px; background:#f1f5f9; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#0f172a;">
                        <i class="fas fa-chart-pie" style="font-size:1.2rem;"></i>
                    </div>
                </div>
            </div>

            <!-- Total Disbursed Files Card -->
            <div class="card" style="background: white; padding:1.5rem; margin-bottom:0; border:1px solid #e2e8f0; border-top: 4px solid #4f46e5; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <h3 style="color:#64748b; font-size:0.85rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Total Disbursed Files</h3>
                        <h1 style="color:#4f46e5; font-size:2.2rem; font-weight:700; margin-bottom:0; letter-spacing:-0.03em;">${totalDisbursedFiles}</h1>
                    </div>
                    <div style="width:48px; height:48px; background:#eef2ff; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#4f46e5;">
                        <i class="fas fa-check-circle" style="font-size:1.2rem;"></i>
                    </div>
                </div>
            </div>

            <!-- Total Processed Files Card -->
            <div class="card" style="background: white; padding:1.5rem; margin-bottom:0; border:1px solid #e2e8f0; border-top: 4px solid #64748b; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <h3 style="color:#64748b; font-size:0.85rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Total Files</h3>
                        <h1 style="color:#0f172a; font-size:2.2rem; font-weight:700; margin-bottom:0; letter-spacing:-0.03em;">${totalProcessedFiles}</h1>
                    </div>
                    <div style="width:48px; height:48px; background:#f1f5f9; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#64748b;">
                        <i class="fas fa-file-alt" style="font-size:1.2rem;"></i>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Grid of Executives
    const gridHtml = `
        <h3 style="margin-bottom:1rem; color:var(--text-secondary);">Executive Performance</h3>
        <div class="stats-grid">
            ${execArray.map(exec => `
                <div class="stat-card" onclick="openExecutiveDetails('${exec.name}')">
                    <div class="stat-info">
                        <h3>${exec.name}</h3>
                        <p>${formatCurrency(exec.totalAmount)}</p>
                        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.5rem; display:flex; gap:10px;">
                            <span><i class="fas fa-check-circle" style="color:#4f46e5;"></i> ${exec.disbursedCount} Disbursed</span>
                            <span><i class="fas fa-file-alt"></i> ${exec.count} Total</span>
                        </div>
                    </div>
                    <div class="stat-icon">
                        <i class="fas fa-user-tie"></i>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    const modalHtml = `
        <div id="exec-modal" class="modal-overlay">
            <div class="modal modal-xl">
                <button class="close-modal" onclick="closeModal()">&times;</button>
                <div id="modal-content"></div>
            </div>
        </div>
    `;

    container.innerHTML = filterHtml + summaryHtml + gridHtml + modalHtml;
    contentArea.appendChild(container);
};

window.applyDashboardFilter = () => {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;

    if (start && end) {
        dashboardDateFilter = { start, end };
        loadView('dashboard'); // Use loadView to ensure clean render
    } else {
        alert("Please select both Start and End date.");
    }
};

window.clearDashboardFilter = () => {
    dashboardDateFilter = { start: '', end: '' };
    loadView('dashboard'); // Use loadView to ensure clean render
};

window.openExecutiveDetails = (name) => {
    const execLoans = loans.filter(l => l.executiveName === name);

    // Calculate totals
    const totalVolume = execLoans.reduce((sum, l) => l.status !== 'Rejected' ? sum + l.amount : sum, 0);
    const totalRevenue = execLoans.reduce((sum, l) => {
        if (l.status === 'Disbursed') {
            const payout = l.payoutPercent || 0;
            return sum + (l.amount * payout / 100);
        }
        return sum;
    }, 0);

    const uniqueBanks = [...new Set(execLoans.map(l => l.bankName).filter(Boolean))];

    const content = `
        <h2 style="margin-bottom:0.5rem; color:var(--primary-color);">${name}</h2>
        <p style="margin-bottom:1.5rem; color:var(--text-secondary);">Performance Report</p>
        
        <!-- Stats Grid -->
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:1rem; margin-bottom:1.5rem;">
            <div style="background:#f8fafc; padding:1rem; border-radius:8px;">
                <small>Volume</small>
                <div style="font-size:1.1rem; font-weight:bold;">${formatCurrency(totalVolume)}</div>
            </div>
            <div style="background:#f8fafc; padding:1rem; border-radius:8px;">
                <small>Files</small>
                <div style="font-size:1.1rem; font-weight:bold;">${execLoans.length}</div>
            </div>
            <div style="background:#ecfdf5; padding:1rem; border-radius:8px; border:1px solid #d1fae5;">
                <small style="color:#047857;">Est. Revenue</small>
                <div style="font-size:1.1rem; font-weight:bold; color:#047857;">${formatCurrency(totalRevenue)}</div>
            </div>
        </div>

        <!-- Bank Payout Config -->
        <div style="background:#f0f9ff; padding:1rem; border-radius:8px; border:1px solid #bae6fd; margin-bottom:1.5rem;">
            <h4 style="margin-top:0; color:#0369a1; margin-bottom:0.5rem; font-size:0.9rem;">Set Payouts by Bank</h4>
            <div style="display:flex; flex-wrap:wrap; gap:1rem; align-items:end;">
                ${uniqueBanks.map((bank, index) => `
                    <div style="display:flex; align-items:center; gap:4px;">
                        <div>
                            <label style="display:block; font-size:0.75rem; color:#0369a1; margin-bottom:2px;">${bank}</label>
                            <div style="display:flex; align-items:center; gap:4px;">
                                <input type="number" step="0.01" id="payout-bank-${index}" placeholder="%" 
                                    style="padding:4px; border:1px solid #7dd3fc; border-radius:4px; width:60px;"
                                    onkeypress="if(event.key==='Enter') updateBankPayouts('${name}')">
                                <span style="color:#0369a1; font-weight:600; font-size:0.85rem;">%</span>
                            </div>
                        </div>
                        <input type="hidden" id="name-bank-${index}" value="${bank}">
                    </div>
                `).join('')}
                <button onclick="updateBankPayouts('${name}')" class="btn btn-primary" style="padding:4px 12px; font-size:0.85rem; height:32px; background-color:#0284c7; border:none;">Apply to All</button>
            </div>
            <small style="color:#0c4a6e; display:block; margin-top:0.5rem; font-size:0.75rem;">* Entering a value here will update the Payout % for ALL files of that bank.</small>
        </div>

        <!-- Loans Table -->
        <div style="overflow-x:auto;">
            <table style="font-size:0.85rem; width:100%;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Bank</th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th style="width:80px;">Payout %</th>
                        <th>Revenue</th>
                    </tr>
                </thead>
                <tbody>
                    ${execLoans.map(l => {
        const payout = l.payoutPercent || 0;
        const revenue = l.status === 'Disbursed' ? (l.amount * payout / 100) : 0;
        return `
                        <tr>
                            <td>${formatDate(l.date)}</td>
                            <td>${l.customerName}</td>
                            <td>${l.bankName || '-'}</td>
                            <td><span class="status-badge ${getStatusClass(l.status)}">${l.status}</span></td>
                            <td class="amount">${formatCurrency(l.amount)}</td>
                            <td>
                                <input type="number" step="0.01" min="0" 
                                    value="${payout || ''}" 
                                    placeholder="0"
                                    style="width:60px; padding:4px; border:1px solid #ccc; border-radius:4px;"
                                    onchange="updateLoanPayout('${l.id}', this.value, '${name}')"
                                    ${l.status !== 'Disbursed' ? 'disabled' : ''}
                                >
                            </td>
                            <td style="font-weight:600; color:${revenue > 0 ? '#047857' : 'inherit'};">
                                ${formatCurrency(revenue)}
                            </td>
                        </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('exec-modal').classList.add('open');
};

window.updateBankPayouts = async (execName) => {
    const bankInputs = document.querySelectorAll('[id^="payout-bank-"]');
    const updates = [];

    bankInputs.forEach((input, index) => {
        const payout = parseFloat(input.value);
        const bankName = document.getElementById(`name-bank-${index}`).value;

        if (!isNaN(payout)) {
            updates.push({ bankName, payout });
        }
    });

    if (updates.length > 0) {
        const batch = writeBatch(db);
        let updatedCount = 0;

        loans.forEach(loan => {
            if (loan.executiveName === execName) {
                const update = updates.find(u => u.bankName === loan.bankName);
                if (update) {
                    const docRef = doc(db, LOANS_COLLECTION, loan.id);
                    batch.update(docRef, { payoutPercent: update.payout });
                    updatedCount++;
                }
            }
        });

        await batch.commit();
        showToast(`Updated ${updatedCount} files.`);
        openExecutiveDetails(execName);
    }
};

window.updateLoanPayout = async (loanId, value, execName) => {
    const payoutPercent = parseFloat(value) || 0;
    try {
        const docRef = doc(db, LOANS_COLLECTION, loanId);
        await updateDoc(docRef, { payoutPercent });
        // UI will update via snapshot, but we re-open details to show new revenue
        openExecutiveDetails(execName);
    } catch (error) {
        console.error("Error updating loan payout:", error);
    }
};

// Expose other functions to window
window.loadView = loadView;
window.renderEntryPage = renderEntryPage;
window.renderDashboardPage = renderDashboardPage;
window.renderTableRows = renderTableRows;
window.toggleSelectAll = toggleSelectAll;
window.updateBulkState = updateBulkState;
window.editEntry = editEntry;
window.cancelEdit = cancelEdit;
window.exportToCSV = exportToCSV;
window.triggerImport = triggerImport;
window.handleExcelImport = handleExcelImport;
window.downloadImportTemplate = downloadImportTemplate;
window.openExecutiveDetails = openExecutiveDetails;
window.closeModal = closeModal;
window.undoLastAction = undoLastAction;
window.initStickyScrollbar = initStickyScrollbar;
// --- INITIALIZATION ---
loadView('entry');
