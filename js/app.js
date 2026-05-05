


// API Base URL
const API_URL = 'http://localhost:3000/api';

// Global variables
let currentUser = null;
let currentQuote = [];
let currentPage = 1;
let quotationFlag = ''; // Current flag filter for quotations
const itemsPerPage = 10;
let itemSearchTimer = null; // Timer for item search debouncing

// ==================== API FUNCTIONS ====================

/**
 * Make API request
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} data - Request body
 */
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, options);
    return await response.json();
}

// ==================== AUTH FUNCTIONS ====================

/**
 * Show signup page
 */
function showSignup() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('signupPage').style.display = 'flex';
}

/**
 * Show login page
 */
function showLogin() {
    document.getElementById('signupPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
}

/**
 * Handle login form submission
 */
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    const result = await apiRequest('/login', 'POST', { email, password });
    console.log('Login result:', result);
    if (result.success) {
        currentUser = result.user;
        localStorage.setItem('sc_currentUser', JSON.stringify(currentUser));
        showDashboard();
    } else {
        showAlert('loginAlert', result.message, 'error');
    }
});

/**
 * Handle signup form submission
 */
document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const role = document.getElementById('signupRole').value;

    if (password !== confirmPassword) {
        showAlert('signupAlert', 'Passwords do not match', 'error');
        return;
    }

    const result = await apiRequest('/register', 'POST', { name, email, password, role });

    if (result.success) {
        document.getElementById('signupSuccess').textContent = result.message;
        document.getElementById('signupSuccess').style.display = 'block';
        document.getElementById('signupAlert').style.display = 'none';
        
        setTimeout(() => {
            showLogin();
            document.getElementById('signupForm').reset();
            document.getElementById('signupSuccess').style.display = 'none';
        }, 2000);
    } else {
        showAlert('signupAlert', result.message, 'error');
    }
});

/**
 * Show alert message
 * @param {string} alertId - The ID of the alert element
 * @param {string} message - The message to display
 * @param {string} type - The type of alert (error, success, warning)
 */
function showAlert(alertId, message, type) {
    const alert = document.getElementById(alertId);
    alert.textContent = message;
    alert.className = 'alert alert-' + type;
    alert.style.display = 'block';
    setTimeout(() => { alert.style.display = 'none'; }, 5000);
}

/**
 * Show floating notification
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Auto remove after 4 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 4000);
}

// ==================== DASHBOARD ====================

/**
 * Show dashboard after successful login
 */
async function showDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('signupPage').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    
    const user = JSON.parse(localStorage.getItem('sc_currentUser'));
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userRole').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
    
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    await updateDashboardStats();
    await renderRecentItems();
    await renderItemsTable();
    await initInvoiceForm();
}

/**
 * Logout user and redirect to login
 */
function logout() {
    localStorage.removeItem('sc_currentUser');
    currentUser = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('loginForm').reset();
}

/**
 * Update dashboard statistics
 */
async function updateDashboardStats() {
    const result = await apiRequest('/stats');
    
    if (result.success) {
        document.getElementById('totalItems').textContent = result.stats.totalItems;
        document.getElementById('totalQuotes').textContent = result.stats.totalQuotes;
        document.getElementById('totalUsers').textContent = result.stats.totalUsers;
        document.getElementById('totalValue').textContent = '$' + parseFloat(result.stats.totalValue).toFixed(2);
    }
}

/**
 * Render recent items in dashboard
 */
async function renderRecentItems() {
    const result = await apiRequest('/items');
    const tbody = document.getElementById('recentItemsTable');
    
    if (!result.success || result.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No items yet</td></tr>';
        return;
    }
    
    const recentItems = result.items.slice(0, 5);
    
    tbody.innerHTML = recentItems.map(item => `
        <tr>
            <td><strong>${item.code}</strong></td>
            <td>${item.name}</td>
            <td><span class="category-tag">${item.category}</span></td>
            <td>${item.unit}</td>
            <td class="price-cell">$${parseFloat(item.price).toFixed(2)}</td>
        </tr>
    `).join('');
}

// ==================== TAB NAVIGATION ====================

/**
 * Initialize tab navigation
 */
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        const tabId = this.getAttribute('data-tab');
        
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        
        const titles = {
            'dashboard-home': 'Dashboard',
            'insert-item': 'Insert Item',
            'make-quotation': 'Make Quotation',
            'make-invoice': 'Make Invoice',
            'invoice-history': 'Invoice History',
            'view-items': 'View Items'
        };
        document.getElementById('pageTitle').textContent = titles[tabId];
        if (tabId === 'invoice-history') {
            renderInvoiceHistory();
        }
    });
});

/**
 * Toggle sidebar on mobile
 */
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ==================== INSERT ITEM ====================

/**
 * Handle insert item form submission
 */
document.getElementById('insertItemForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (currentUser.role !== 'admin') {
        showAlert('itemAlert', 'Only admins can insert items', 'error');
        return;
    }

    const newItem = {
        code: document.getElementById('itemCode').value,
        name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        unit: document.getElementById('itemUnit').value,
        price: parseFloat(document.getElementById('itemPrice').value),
        description: document.getElementById('itemDescription').value,
        currency: document.getElementById('itemCurrency').value,
        flag: document.getElementById('itemFlag').value
    };

    const result = await apiRequest('/items', 'POST', newItem);

    if (result.success) {
        showAlert('itemAlert', result.message, 'success');
        document.getElementById('insertItemForm').reset();
        await updateDashboardStats();
        await renderRecentItems();
        await renderItemsTable();
    } else {
        showAlert('itemAlert', result.message, 'error');
    }
});

// ==================== PDF IMPORT ====================
let UrlPrefix = '';
/**
 * Import PDF file and extract items
 */
async function importPDF() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('pdf', file);
        
        try {
            const response = await fetch(`${API_URL}/import/pdf`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            if (result.success) {
                displayExtractedItems(result.items);
            } else {
                showAlert('quoteAlert', result.message, 'error');
            }
        } catch (error) {
            console.error('PDF import error:', error);
            showAlert('quoteAlert', 'Failed to import PDF', 'error');
        }
    };
    
    input.click();
}

// ==================== OCR IMPORT (Tesseract.js) ====================

/**
 * Import scanned document (image or scanned PDF) using OCR
 * Supports: PNG, JPG, JPEG, BMP, WebP, PDF
 */
async function importOCR() {
    const input = document.createElement('input');
    input.type = 'file';
    // Accept images and scanned PDFs
    input.accept = '.png,.jpg,.jpeg,.bmp,.webp,.pdf';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        console.log('Selected file for OCR:', file);
        const alert = document.getElementById('quoteAlert');
        alert.textContent = 'Processing document with OCR... This may take a moment.';
        alert.className = 'alert alert-info';
        alert.style.display = 'block';
        
        try {
            // Convert file to base64
            const base64 = await fileToBase64(file);
            //console.log({UrlPrefix, base64Snippet: base64.substring(0, 30) + '...'});
           
            // Determine file type
            let fileType = 'image/png';
            if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg')) {
                fileType = 'image/jpeg';
            } else if (file.type === 'image/bmp' || file.name.toLowerCase().endsWith('.bmp')) {
                fileType = 'image/bmp';
            } else if (file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')) {
                fileType = 'image/webp';
            } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                fileType = 'application/pdf';
            }
            
            // Send to OCR endpoint
            const response = await fetch(`${API_URL}/import/ocr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    base64: base64,
                    fileType: fileType,
                    file
                      // Pass file path for better OCR processing on server
                    
                })
            });
            
            const result = await response.json();
            
            if (result.success && result.items && result.items.length > 0) {
                displayExtractedItems(result.items, result.totalFound, result.skipped || 0);
                
                // Show OCR-specific message
                const ocrAlert = document.getElementById('quoteAlert');
                let ocrMessage = `OCR extracted ${result.items.length} items from scanned document`;
                if (result.confidence) {
                    ocrMessage += ` (Confidence: ${Math.round(result.confidence)}%)`;
                }
                ocrAlert.textContent = ocrMessage;
                ocrAlert.className = 'alert alert-success';
            } else if (result.success && result.items && result.items.length === 0) {
                showAlert('quoteAlert', 'OCR completed but no tabular data found. The document may not contain a recognizable table structure.', 'warning');
            } else {
                showAlert('quoteAlert', result.message || 'OCR processing failed', 'error');
            }
        } catch (error) {
            console.error('OCR import error:', error);
            showAlert('quoteAlert', 'Failed to process document with OCR: ' + error.message, 'error');
        }
    };
    
    input.click();
}

/**
 * Convert file to base64 string
 * @param {File} file - The file to convert
 * @returns {Promise<string>} Base64 encoded string
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Remove data URL prefix to get pure base64
            const result = reader.result;
             UrlPrefix = result.split(',')[0];
            const base64 = result.split(',')[1];
           
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Analyze document to determine if OCR is needed
 * Useful for automatically detecting scanned documents
 */
async function analyzeDocument() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg,.bmp,.webp,.pdf';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const base64 = await fileToBase64(file);
            
            const response = await fetch(`${API_URL}/analyze/document`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    base64: base64,
                    fileType: file.type || 'application/octet-stream'
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                const alert = document.getElementById('quoteAlert');
                alert.textContent = `Document Analysis: ${result.recommendation}`;
                alert.className = result.needsOcr ? 'alert alert-warning' : 'alert alert-success';
                alert.style.display = 'block';
                
                // Optionally auto-process based on analysis
                if (result.needsOcr) {
                    // User can choose to proceed with OCR
                    console.log('Document needs OCR processing');
                }
            }
        } catch (error) {
            console.error('Document analysis error:', error);
            showAlert('quoteAlert', 'Failed to analyze document', 'error');
        }
    };
    
    input.click();
}

/**
 * Display extracted items from PDF for review
 */
function displayExtractedItems(items, totalFound = null, skipped = 0) {
    const tbody = document.getElementById('quoteTableBody');
    document.getElementById('quotePreview').style.display = 'block';
    
    // Convert extracted items to quote format
    currentQuote = items.map((item, index) => ({
        id: null,
        code: `PDF-${index + 1}`,
        name: item.description,
        category: '-',
        unit: item.unit,
        price: item.price,
        currency: item.currency || 'EUR',
        quantity: item.quantity,
        total: item.price * item.quantity,
        found: false,
        fromPDF: true
    }));
    
    renderQuotePreview();
    
    const alert = document.getElementById('quoteAlert');
    let message = `Extracted ${items.length} items from PDF. Review and delete wrong rows, then click "Fetch Quotation" to match with database.`;
    if (totalFound && totalFound > items.length) {
        message += ` (Showing ${items.length} of ${totalFound} total rows)`;
    }
    if (skipped > 0) {
        message += ` ${skipped} rows skipped due to format issues.`;
    }
    alert.textContent = message;
    alert.className = 'alert alert-warning';
    alert.style.display = 'block';
    setTimeout(() => { alert.style.display = 'none'; }, 10000);
}

/**
 * Delete a row from the quotation preview
 * @param {number} index - The index of the row to delete
 */
function deleteQuoteRow(index) {
    if (currentQuote[index]) {
        const deletedItem = currentQuote[index].name;
        currentQuote.splice(index, 1);
        renderQuotePreview();
        
        const alert = document.getElementById('quoteAlert');
        alert.textContent = `Deleted: ${deletedItem}. ${currentQuote.length} items remaining.`;
        alert.className = 'alert alert-info';
        alert.style.display = 'block';
        setTimeout(() => { alert.style.display = 'none'; }, 3000);
    }
}

/**
 * Fetch quotation - match PDF items with database
 */
async function fetchQuotation() {
    if (currentQuote.length === 0) {
        showAlert('quoteAlert', 'No items to process', 'error');
        return;
    }

    const alert = document.getElementById('quoteAlert');
    alert.textContent = 'Matching items with database...';
    alert.className = 'alert alert-info';
    alert.style.display = 'block';

    try {
        // Get all items from database
        const result = await apiRequest('/items');
        const dbItems = result.items;
        
        let foundCount = 0;
        let notFound = [];

        // Match items by name and unit
        currentQuote = currentQuote.map(item => {
            const matched = dbItems.find(db => 
                db.name.toLowerCase() === item.name.toLowerCase() && 
                db.unit.toLowerCase() === item.unit.toLowerCase()
            );
            
            if (matched) {
                foundCount++;
                return {
                    ...matched,
                    quantity: item.quantity,
                    total: matched.price * item.quantity,
                    found: true
                };
            } else {
                notFound.push(item.name);
                return {
                    ...item,
                    found: false
                };
            }
        });

        renderQuotePreview();
        
        if (notFound.length > 0) {
            alert.innerHTML = `<strong>Match complete:</strong> ${foundCount} matched, ${notFound.length} not found in database.<br><small>Not found: ${notFound.slice(0, 5).join(', ')}${notFound.length > 5 ? '...' : ''}</small>`;
            alert.className = 'alert alert-warning';
        } else {
            alert.textContent = `All ${foundCount} items matched successfully with database!`;
            alert.className = 'alert alert-success';
        }
        alert.style.display = 'block';
        setTimeout(() => { alert.style.display = 'none'; }, 8000);
        
    } catch (error) {
        console.error('Fetch quotation error:', error);
        alert.textContent = 'Error matching items. Please try again.';
        alert.className = 'alert alert-error';
        alert.style.display = 'block';
    }
}

// ==================== QUOTATION ====================

/**
 * Download Excel template for quotation
 */
function downloadTemplate() {
    const templateData = [
        ['Item Description', 'Item Unit','Quantity'],
        ['BEEF ROUNDS BONELESS', 'KG', '20'],
        ['FRANKFURTER SAUSAGES', 'KG', '5'],
        ['L & M CIGARETTES (50 CRTN/BOX)', 'CRTN', '725']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quotation');
    XLSX.writeFile(wb, 'Quotation_Template.xlsx');
}

/**
 * Handle Excel file upload
 * @param {Event} event - The change event from file input
 */
async function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);

        processQuotation(jsonData);
    };
    reader.readAsArrayBuffer(file);
}

function updateQuotationFlag() {
    quotationFlag = document.getElementById('quotationFlag').value;
    // If there's a current quote, re-process it with the new flag
    if (currentQuote.length > 0) {
        renderQuotePreview();
    }
}

/**
 * Process quotation data from Excel
 * @param {Array} data - Parsed Excel data
 */
async function processQuotation(data) {
    // Get all items from database, filtered by flag if selected
    const flagParam = quotationFlag ? `?flag=${encodeURIComponent(quotationFlag)}` : '';
    const result = await apiRequest(`/items${flagParam}`);
    const dbItems = result.items;
    
    currentQuote = [];
    let notFound = [];

    data.forEach(row => {
        const itemName = row['Item Description'] || row['Description'] || row['Item Name'] || row['Items'] || row['Item Names'] ;
        const itemUnit = row['Item Unit'] || row['Unit'] || row['Units'];
        const quantity = parseInt(row['Quantity'] || row['quantity'] || 1);
        const itemCurrency = row['Currency'] || row['currency'] || '';
        
        if (itemName && itemUnit) {
            const item = dbItems.find(i => i.name.trim().toLowerCase() === itemName.trim().toLowerCase() && i.unit.trim().toLowerCase() === itemUnit.trim().toLowerCase() && i.currency.trim().toLowerCase() === itemCurrency.trim().toLowerCase());
            if (item) {
                currentQuote.push({
                    ...item,
                    quantity,
                    total: item.price * quantity,
                    found: true
                });
            } else {
                currentQuote.push({
                    id: null,
                    code: itemCode,
                    name: itemName.trim(),
                    category: '-',
                    unit: itemUnit,
                    price: 0,
                    currency: itemCurrency,
                    quantity,
                    total: 0,
                    found: false
                });
                notFound.push(itemName);
            }
        }
    });

    renderQuotePreview();
    
    const alert = document.getElementById('quoteAlert');
    if (notFound.length > 0) {
        alert.textContent = `Warning: Items not found in database: ${notFound.join(', ')}`;
        alert.className = 'alert alert-warning';
    } else {
        alert.textContent = 'All items matched successfully!';
        alert.className = 'alert alert-success';
    }
    alert.style.display = 'block';
    setTimeout(() => { alert.style.display = 'none'; }, 8000);
}

/**
 * Render quotation preview table
 */
function renderQuotePreview() {
    document.getElementById('quotePreview').style.display = 'block';
    
    const tbody = document.getElementById('quoteTableBody');
    tbody.innerHTML = currentQuote.map((item, index) => `
        <tr>
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${item.unit}</td>
            <td class="price-cell">${item.price}${item.currency}</td>
            <td>${item.currency}</td>
            <td><strong>${item.total.toFixed(2)} ${item.currency}</strong></td>
            <td>
                <span class="match-status ${item.found ? 'match-found' : 'match-not-found'}">
                    <i class="fas fa-${item.found ? 'check' : 'times'}"></i>
                    ${item.found ? 'Found' : 'Not Found'}
                </span>
            </td>
            <td>
                <button class="action-btn action-btn-delete" onclick="deleteQuoteRow(${index})" title="Delete row">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');

    const grandTotal = currentQuote.reduce((sum, item) => sum + item.total, 0);
    document.getElementById('quoteGrandTotal').textContent = grandTotal.toFixed(2) + (currentQuote.length > 0 ? ' ' + currentQuote[0].currency : '');
}

/**
 * Export quotation to Excel file
 */
function exportQuotation() {
    if (currentQuote.length === 0) return;

    const exportData = currentQuote.map(item => ({
        'Item Code': item.code,
        'Item Name': item.name,
        'Category': item.category,
        'Unit': item.unit,
        'Unit Price': item.price,
        'Currency': item.currency,
        'Quantity': item.quantity,
        'Total': item.total,
        'Status': item.found ? 'Found' : 'Not Found'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quotation');
    
    // Add total row
    const grandTotal = currentQuote.reduce((sum, item) => sum + item.total, 0);
    XLSX.utils.sheet_add_aoa(ws, [['', '', '', '', '', 'Grand Total', grandTotal]], { origin: -1 });
    
    const quoteNum = 'QUOTE-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    XLSX.writeFile(wb, `${quoteNum}.xlsx`);
}

/**
 * Save quotation to database
 */
async function saveQuotation() {
    if (currentQuote.length === 0) return;

    const result = await apiRequest('/quotations', 'POST', {
        items: currentQuote,
        createdBy: currentUser.id
    });

    const alert = document.getElementById('quoteAlert');
    if (result.success) {
        alert.textContent = `Quotation saved! ${result.quoteNumber}`;
        alert.className = 'alert alert-success';
        alert.style.display = 'block';
        setTimeout(() => { alert.style.display = 'none'; }, 5000);
        await updateDashboardStats();
    } else {
        alert.textContent = result.message;
        alert.className = 'alert alert-error';
        alert.style.display = 'block';
    }
}

// ==================== INVOICE MANAGEMENT ====================

let invoiceSearchTimer = null;

async function initInvoiceForm() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('invoiceDate').value = today;
    document.getElementById('invoiceNumber').value = '';
    document.getElementById('clientId').value = '';
    document.getElementById('clientNameInput').value = '';
    document.getElementById('clientLine1').value = '';
    document.getElementById('clientLine2').value = '';
    document.getElementById('clientLine3').value = '';
    document.getElementById('clientLine4').value = '';
    document.getElementById('invoiceDiscount').value = '0';
    document.getElementById('invoiceSubTotal').textContent = '0.00';
    document.getElementById('invoiceTotalAmount').textContent = '0.00';
    document.getElementById('invoiceAlert').style.display = 'none';
    document.getElementById('clientSaveAlert').style.display = 'none';
    document.getElementById('invoiceTableBody').innerHTML = '';
    document.getElementById('exportExcelBtn').style.display = 'none';
    addInvoiceRow();
    await loadInvoiceNextNumber();
}

async function loadInvoiceNextNumber() {
    try {
        const result = await apiRequest('/invoices/next-number');
        if (result.success && result.invoiceNumber) {
            document.getElementById('invoiceNumber').value = result.invoiceNumber;
        }
    } catch (error) {
        console.error('Unable to load next invoice number', error);
    }
}

function handleClientSearch(event) {
    const query = event.target.value.trim();
    if (invoiceSearchTimer) clearTimeout(invoiceSearchTimer);
    if (!query) return;
    invoiceSearchTimer = setTimeout(() => searchClients(query), 300);
}

async function searchClients(query) {
    try {
        const result = await apiRequest(`/clients/search?query=${encodeURIComponent(query)}`);
        const datalist = document.getElementById('clientSuggestions');
        datalist.innerHTML = '';
        if (result.success && result.clients.length > 0) {
            result.clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.name;
                datalist.appendChild(option);
            });

            const matchedClient = result.clients.find(client => client.name.toLowerCase() === query.toLowerCase());
            if (matchedClient) {
                document.getElementById('clientId').value = matchedClient.id;
                document.getElementById('clientLine1').value = matchedClient.line1 || '';
                document.getElementById('clientLine2').value = matchedClient.line2 || '';
                document.getElementById('clientLine3').value = matchedClient.line3 || '';
                document.getElementById('clientLine4').value = matchedClient.line4 || '';
            }
        }
    } catch (error) {
        console.error('Client search failed', error);
    }
}

// Item autocompletion functions
function setupItemAutocomplete(input, dropdown) {
    let currentFocus = -1;
    
    input.addEventListener('input', function(e) {
        const query = e.target.value.trim();
        if (itemSearchTimer) clearTimeout(itemSearchTimer);
        
        if (!query || query.length < 2) {
            dropdown.style.display = 'none';
            return;
        }
        
        itemSearchTimer = setTimeout(() => searchItems(query, dropdown, input), 300);
    });
    
    input.addEventListener('keydown', function(e) {
        const items = dropdown.querySelectorAll('.autocomplete-item');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus = currentFocus < items.length - 1 ? currentFocus + 1 : 0;
            highlightItem(items, currentFocus);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus = currentFocus > 0 ? currentFocus - 1 : items.length - 1;
            highlightItem(items, currentFocus);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus >= 0 && items[currentFocus]) {
                selectItem(items[currentFocus], input, dropdown);
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
            currentFocus = -1;
        }
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            currentFocus = -1;
        }
    });
}

async function searchItems(query, dropdown, input) {
    try {
        const result = await apiRequest(`/items/search?q=${encodeURIComponent(query)}`);
        
        if (result.success && result.items.length > 0) {
            dropdown.innerHTML = '';
            
            result.items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'autocomplete-item';
                itemDiv.innerHTML = `
                    <div class="item-info">
                        <strong>${item.name}</strong>
                        <small>${item.code} • ${item.category} • ${item.unit}</small>
                    </div>
                    <div class="item-price">$${item.price}</div>
                `;
                
                itemDiv.addEventListener('click', () => selectItem(itemDiv, input, dropdown, item));
                dropdown.appendChild(itemDiv);
            });
            
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    } catch (error) {
        console.error('Item search failed', error);
        dropdown.style.display = 'none';
    }
}

function highlightItem(items, index) {
    items.forEach(item => item.classList.remove('highlighted'));
    if (items[index]) {
        items[index].classList.add('highlighted');
        items[index].scrollIntoView({ block: 'nearest' });
    }
}

function selectItem(itemDiv, input, dropdown, item = null) {
    if (item) {
        // If item data is provided, fill in the row
        input.value = item.name;
        const row = input.closest('tr');
        if (row) {
            const unitInput = row.querySelector('.invoice-unit');
            const priceInput = row.querySelector('.invoice-unit-price');
            const quantityInput = row.querySelector('.invoice-quantity');
            
            if (unitInput) unitInput.value = item.unit;
            if (priceInput) priceInput.value = item.price;
            if (quantityInput) quantityInput.value = 1; // Default quantity
            
            // Update the total
            updateInvoiceRow(priceInput || quantityInput);
        }
    } else {
        // Just set the text if no item data
        const itemName = itemDiv.querySelector('strong').textContent;
        input.value = itemName;
    }
    
    dropdown.style.display = 'none';
}

async function saveClient() {
    const clientName = document.getElementById('clientNameInput').value.trim();
    const line1 = document.getElementById('clientLine1').value.trim();
    const line2 = document.getElementById('clientLine2').value.trim();
    const line3 = document.getElementById('clientLine3').value.trim();
    const line4 = document.getElementById('clientLine4').value.trim();
    const clientId = document.getElementById('clientId').value;

    if (!clientName) {
        showAlert('clientSaveAlert', 'Client name is required', 'error');
        return;
    }

    try {
        const payload = {
            name: clientName,
            line1,
            line2,
            line3,
            line4,
            id: clientId || null
        };
        const result = await apiRequest('/clients', 'POST', payload);
        if (result.success) {
            document.getElementById('clientId').value = result.client.id;
            showAlert('clientSaveAlert', 'Client saved successfully', 'success');
        } else {
            showAlert('clientSaveAlert', result.message, 'error');
        }
    } catch (error) {
        showAlert('clientSaveAlert', 'Unable to save client', 'error');
    }
}

function addInvoiceRow(e, item={}) {
  
    
    //console.log('Adding invoice row', {event: e?.parentElement, item});
    const tbody = document.getElementById('invoiceTableBody');
    const rowIndex =  tbody.children.length + 1;
    
    const designation = item.designation || '';
    const quantity = item.quantity || 1;
    const unit = item.unit || '';
    const unitPrice = item.unitPrice || 0;
    const total = (quantity * unitPrice).toFixed(2);

    const row = document.createElement('tr');
    row.classList.add('invoice-row');
    row.setAttribute('data-row-index', rowIndex);
    row.innerHTML = `
        <td class="sn-cell">${rowIndex}</td>
        <td>
            <div class="autocomplete-container">
                <input type="text" class="invoice-designation" value="${designation}" placeholder="Item designation">
                <div class="autocomplete-dropdown" style="display: none;"></div>
            </div>
        </td>
        <td><input type="number" class="invoice-quantity" min="0" value="${quantity}" oninput="updateInvoiceRow(this)"></td>
        <td><input type="text" class="invoice-unit" value="${unit}" placeholder="Unit"></td>
        <td><input type="number" class="invoice-unit-price" min="0" step="0.01" value="${unitPrice}" oninput="updateInvoiceRow(this)"></td>
        <td class="invoice-total-cell">${total}</td>
        <td class="invtab-btnwrapper"><button type="button" class="action-btn action-btn-delete" onclick="removeInvoiceRow(this)"><i class="fas fa-trash"></i></button>
        <input type="button" class="action-btn action-btn-add" value="+" onclick="addInvoiceRow(this)"></input>
        </td>
    `;
    
    
    if(e && e.parentElement) {
       
       // console.log('Inserting row before', e.parentElement.parentElement);
        tbody.insertBefore(row, e.parentElement.parentElement);
        tbody.querySelectorAll('tr').forEach((r, idx) => {
            r.getElementsByClassName('sn-cell')[0].textContent = idx + 1;
             r.setAttribute('data-row-index', idx + 1);
        });
       // console.log( row.getAttribute('data-row-index'));
    } else {
    tbody.appendChild(row);
    }
   // tbody.appendChild(row);
    
    // Add autocompletion to the designation input
    const designationInput = row.querySelector('.invoice-designation');
    const dropdown = row.querySelector('.autocomplete-dropdown');
    setupItemAutocomplete(designationInput, dropdown);
    
    recalculateInvoiceSummary();
    
    // Show export button when there are rows
    document.getElementById('exportExcelBtn').style.display = 'inline-block';
}
function addInvoiceRowBeforeIndex(index) {
    const tbody = document.getElementById('invoiceTableBody');
    const rows = tbody.querySelectorAll('tr');
    
    const referenceRow = rows.find(row => parseInt(row.getAttribute('data-row-index')) === index);
    if (referenceRow) {
        addInvoiceRow(position=index);
    }
}

function updateInvoiceRow(element) {
    const row = element.closest('tr');
    if (!row) return;
    const quantity = parseFloat(row.querySelector('.invoice-quantity').value) || 0;
    const unitPrice = parseFloat(row.querySelector('.invoice-unit-price').value) || 0;
    const total = quantity * unitPrice;
    row.querySelector('.invoice-total-cell').textContent = total.toFixed(2);
    recalculateInvoiceSummary();
}

function removeInvoiceRow(button) {
    const tbody = document.getElementById('invoiceTableBody');
    const row = button.closest('tr');
    if (row) row.remove();
    rebuildInvoiceRowNumbers();
    recalculateInvoiceSummary();
    
    // Hide export button if no rows remain
    if (tbody.children.length === 0) {
        document.getElementById('exportExcelBtn').style.display = 'none';
    }
}

function rebuildInvoiceRowNumbers() {
    document.querySelectorAll('#invoiceTableBody tr').forEach((row, index) => {
        row.querySelector('.sn-cell').textContent = index + 1;
    });
}

function recalculateInvoiceSummary() {
    const rows = document.querySelectorAll('#invoiceTableBody tr');
    let subTotal = 0;
    rows.forEach(row => {
        const rowTotal = parseFloat(row.querySelector('.invoice-total-cell').textContent) || 0;
        subTotal += rowTotal;
    });

    const discountPercent = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    const discountAmount = subTotal * (discountPercent / 100);
    const totalAmount = subTotal - discountAmount;

    document.getElementById('invoiceSubTotal').textContent = subTotal.toFixed(2);
    document.getElementById('invoiceTotalAmount').textContent = totalAmount.toFixed(2);
}

function resetInvoiceForm() {
    initInvoiceForm();
}

async function saveInvoice() {
    const invoiceNumber = document.getElementById('invoiceNumber').value.trim();
    const invoiceDate = document.getElementById('invoiceDate').value;
    const clientId = document.getElementById('clientId').value || null;
    const clientName = document.getElementById('clientNameInput').value.trim();
    const line1 = document.getElementById('clientLine1').value.trim();
    const line2 = document.getElementById('clientLine2').value.trim();
    const line3 = document.getElementById('clientLine3').value.trim();
    const line4 = document.getElementById('clientLine4').value.trim();
    const poRef = document.getElementById('poRef').value.trim();
    const invoiceCurrency = document.getElementById('invoiceCurrency').value;
    const discountPercent = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    const rows = document.querySelectorAll('#invoiceTableBody tr');

    if (!invoiceNumber) {
        showAlert('invoiceAlert', 'Invoice number is required', 'error');
        return;
    }

    if (!invoiceDate) {
        showAlert('invoiceAlert', 'Invoice date is required', 'error');
        return;
    }

    if (!clientName) {
        showAlert('invoiceAlert', 'Client name is required', 'error');
        return;
    }

    const items = [];
    rows.forEach((row, index) => {
        const designation = row.querySelector('.invoice-designation').value.trim();
        const quantity = parseFloat(row.querySelector('.invoice-quantity').value) || 0;
        const unit = row.querySelector('.invoice-unit').value.trim();
        const unitPrice = parseFloat(row.querySelector('.invoice-unit-price').value) || 0;
        const total = parseFloat(row.querySelector('.invoice-total-cell').textContent) || 0;

        if (designation) {
            items.push({
                sn: index + 1,
                designation,
                quantity,
                unit,
                unitPrice,
                total
            });
        }
    });

    if (items.length === 0) {
        showAlert('invoiceAlert', 'Add at least one invoice item', 'error');
        return;
    }

    const payload = {
        invoiceNumber,
        invoiceDate,
        clientId,
        clientName,
        clientLine1: line1,
        clientLine2: line2,
        clientLine3: line3,
        clientLine4: line4,
        poRef,
        discountPercent,
        invoiceCurrency,
        items,
        createdBy: currentUser?.id || null
    };

    try {
        const result = await apiRequest('/invoices', 'POST', payload);
        if (result.success) {
            showAlert('invoiceAlert', `Invoice saved as ${result.invoiceNumber}`, 'success');
            await initInvoiceForm();
            await updateDashboardStats();
        } else {
            showAlert('invoiceAlert', result.message, 'error');
        }
    } catch (error) {
        showAlert('invoiceAlert', 'Unable to save invoice', 'error');
    }
}

// Excel import/export functions
async function importInvoiceFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Convert to base64 for server
            const base64 = btoa(String.fromCharCode(...data));
            
            const result = await apiRequest('/invoices/import', 'POST', { base64 });
            
            if (result.success) {
                showNotification(`Successfully imported ${result.items.length} invoice items`, 'success');
                
                // Clear existing rows
                document.getElementById('invoiceTableBody').innerHTML = '';
                
                // Add imported items
                result.items.forEach(item => {
                    addInvoiceRow(item);
                });
                
                // Show export button
                document.getElementById('exportExcelBtn').style.display = 'inline-block';
            } else {
                showAlert('invoiceAlert', result.message, 'error');
            }
        };
        
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('Excel import error:', error);
        showAlert('invoiceAlert', 'Failed to import Excel file', 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

async function exportDraftInvoiceToExcel() {
    const rows = document.querySelectorAll('#invoiceTableBody tr');
    if (rows.length === 0) {
        showAlert('invoiceAlert', 'No invoice items to export', 'error');
        return;
    }
    
    try {
        // Create Excel workbook
        const workbook = XLSX.utils.book_new();
        
        // Invoice info
        const invoiceNumber = document.getElementById('invoiceNumber').value.trim();
        const invoiceDate = document.getElementById('invoiceDate').value;
        const poRef = document.getElementById('poRef').value.trim();
        const clientName = document.getElementById('clientNameInput').value.trim();
        const clientLine1 = document.getElementById('clientLine1').value.trim();
        const clientLine2 = document.getElementById('clientLine2').value.trim();
        const clientLine3 = document.getElementById('clientLine3').value.trim();
        const clientLine4 = document.getElementById('clientLine4').value.trim();
        const invoiceCurrency = document.getElementById('invoiceCurrency').value;
        const discountPercent = document.getElementById('invoiceDiscount').value;
        const subtotal = document.getElementById('invoiceSubTotal').textContent;
        const total = document.getElementById('invoiceTotalAmount').textContent;
        
        // Combine all data into single sheet
        const allData = [
            ['Invoice Information'],
            ['Invoice Number', invoiceNumber],
            ['Invoice Date', invoiceDate],
            ['Client Name', clientName],
            ['Client Address', clientLine1],
            ['', clientLine2],
            ['', clientLine3],
            ['', clientLine4],
            [],
            ['PO Reference', poRef],
            ['Invoice Currency', invoiceCurrency],

            ['S/N', 'Item Designation', 'Quantity', 'Unit', 'Unit Price', 'Total']
        ];
        
        rows.forEach((row, index) => {
            const designation = row.querySelector('.invoice-designation').value.trim();
            const quantity = parseFloat(row.querySelector('.invoice-quantity').value) || 0;
            const unit = row.querySelector('.invoice-unit').value.trim();
            const unitPrice = parseFloat(row.querySelector('.invoice-unit-price').value) || 0;
            const total = parseFloat(row.querySelector('.invoice-total-cell').textContent) || 0;
            
            allData.push([
                index + 1,
                designation,
                quantity,
                unit,
                unitPrice.toFixed(2),
                total.toFixed(2)
            ]);
        });
        
        // Add summary after items
        allData.push([]);
        allData.push(['', '', '', '', 'Subtotal', subtotal]);
        allData.push(['', '', '', '', 'Discount %', discountPercent]);
        allData.push(['', '', '', '', `Total Amount in ${invoiceCurrency}`, total]);
        
        const sheet = XLSX.utils.aoa_to_sheet(allData);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Invoice');
        
        // Generate and download file
        XLSX.writeFile(workbook, `Invoice_${invoiceNumber || 'Draft'}.xlsx`);
        showNotification('Invoice exported to Excel successfully', 'success');
        
    } catch (error) {
        console.error('Excel export error:', error);
        showAlert('invoiceAlert', 'Failed to export invoice', 'error');
    }
}

async function renderInvoiceHistory() {
    const searchTerm = document.getElementById('searchInvoices')?.value.trim() || '';
    const query = searchTerm ? `?query=${encodeURIComponent(searchTerm)}` : '';
    const result = await apiRequest(`/invoices${query}`);
    const tbody = document.getElementById('invoiceHistoryTableBody');
    const emptyState = document.getElementById('invoiceHistoryEmpty');
    const detailsPanel = document.getElementById('invoiceDetailsPanel');

    if (!result.success || !Array.isArray(result.invoices) || result.invoices.length === 0) {
        tbody.innerHTML = '';
        emptyState.textContent = 'No invoices found. Save an invoice to see history here.';
        emptyState.style.display = 'block';
        if (detailsPanel) detailsPanel.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    tbody.innerHTML = result.invoices.map(invoice => `
        <tr>
            <td>${invoice.invoice_number}</td>
            <td>${new Date(invoice.invoice_date).toLocaleDateString('en-GB')}</td>
            <td>${invoice.client_name}</td>
            <td>${parseFloat(invoice.subtotal).toFixed(2)}</td>
            <td>${parseFloat(invoice.discount_percent).toFixed(2)}%</td>
            <td>${parseFloat(invoice.total).toFixed(2)}</td>
            <td>
                <button class="action-btn action-btn-primary" onclick="viewInvoiceDetails(${invoice.id})" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn action-btn-secondary" onclick="exportInvoiceToExcel(${invoice.id})" title="Export to Excel">
                    <i class="fas fa-file-excel"></i>
                </button>
                <button class="action-btn action-btn-success" onclick="exportInvoiceToPDF(${invoice.id})" title="Export to PDF">
                    <i class="fas fa-file-pdf"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function viewInvoiceDetails(invoiceId) {
    const result = await apiRequest(`/invoices/${invoiceId}`);
    const detailsPanel = document.getElementById('invoiceDetailsPanel');
    const detailsContent = document.getElementById('invoiceDetailsContent');

    if (!result.success || !result.invoice) {
        showAlert('invoiceAlert', 'Unable to load invoice details', 'error');
        return;
    }

    const invoice = result.invoice;
    const items = result.items || [];

    detailsContent.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
            <div><strong>Invoice #</strong><br>${invoice.invoice_number}</div>
            <div><strong>Date</strong><br>${new Date(invoice.invoice_date).toLocaleDateString('en-GB')}</div>
            <div><strong>Client</strong><br>${invoice.client_name}</div>
            <div><strong>Subtotal</strong><br>${parseFloat(invoice.subtotal).toFixed(2)}</div>
            <div><strong>Discount</strong><br>${parseFloat(invoice.discount_percent).toFixed(2)}%</div>
            <div><strong>Total</strong><br>${parseFloat(invoice.total).toFixed(2)}</div>
        </div>
        <div style="margin-bottom: 16px;">
            <strong>Client Address</strong>
            <p style="margin: 8px 0 0 0;">${invoice.client_line1 || ''}</p>
            <p style="margin: 8px 0 0 0;">${invoice.client_line2 || ''}</p>
            <p style="margin: 8px 0 0 0;">${invoice.client_line3 || ''}</p>
            <p style="margin: 8px 0 0 0;">${invoice.client_line4 || ''}</p>
        </div>
        <table class="data-table" style="width:100%; margin-top: 8px;">
            <thead>
                <tr>
                    <th>S/N</th>
                    <th>Designation</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${item.sn}</td>
                        <td>${item.designation}</td>
                        <td>${item.quantity}</td>
                        <td>${item.unit || ''}</td>
                        <td>${parseFloat(item.unit_price).toFixed(2)}</td>
                        <td>${parseFloat(item.total).toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    if (detailsPanel) {
        detailsPanel.style.display = 'block';
        detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function exportInvoiceToExcel(invoiceId) {
    try {
        const result = await apiRequest(`/invoices/${invoiceId}`);
        if (!result.success) {
            showNotification('Failed to load invoice data', 'error');
            return;
        }

        const invoice = result.invoice;
        const items = result.items || [];

        // Prepare Excel data
        const excelData = [
            ['BISSI APP - Invoice'],
            [''],
            ['Invoice Number:', invoice.invoice_number],
            ['Invoice Date:', new Date(invoice.invoice_date).toLocaleDateString('en-GB')],
            ['Client:', invoice.client_name],
            [''],
            ['Client Address:'],
            [invoice.client_line1 || ''],
            [invoice.client_line2 || ''],
            [invoice.client_line3 || ''],
            [invoice.client_line4 || ''],
            [''],
            ['PO Reference:', invoice.po_ref || ''],
            ['Invoice Currency:', invoice.invoice_currency],
            [''],
            ['S/N', 'Designation', 'Quantity', 'Unit', 'Unit Price', 'Total']
        ];

        // Add invoice items
        items.forEach(item => {
            excelData.push([
                item.sn,
                item.designation,
                item.quantity,
                item.unit || '',
                parseFloat(item.unit_price).toFixed(2),
                parseFloat(item.total).toFixed(2)
            ]);
        });

        // Add summary
        excelData.push([''], ['Subtotal:', '', '', '', '', parseFloat(invoice.subtotal).toFixed(2)]);
        excelData.push(['Discount:', '', '', '', '', `${parseFloat(invoice.discount_percent).toFixed(2)}%`]);
        excelData.push([`Total Amount in ${invoice.invoice_currency}:`, '', '', '', '', parseFloat(invoice.total).toFixed(2)]);

        // Create and download Excel file
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
        XLSX.writeFile(wb, `Invoice_${invoice.invoice_number.replace(/\//g, '-')}.xlsx`);

        // Show success notification
        showNotification(`Invoice ${invoice.invoice_number} exported to Excel successfully!`, 'success');

    } catch (error) {
        console.error('Excel export error:', error);
        showNotification('Failed to export invoice to Excel', 'error');
    }
}

async function exportInvoiceToPDF(invoiceId) {
    try {
        const result = await apiRequest(`/invoices/${invoiceId}`);
        if (!result.success) {
            showNotification('Failed to load invoice data', 'error');
            return;
        }

        const invoice = result.invoice;
        const items = result.items || [];

        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Set up fonts and colors
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(0, 51, 102); // Dark blue
        doc.text('BISSI SHIP SUPPLY & SERVICES', 20, 30);
        doc.setFontSize(10);
        doc.text('S.A.R.L.', doc.getTextDimensions('BISSI SHIP SUPPLY & SERVICES').w + 80, 30 );
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('SHIP CHANDLER', 20, 40);
        doc.text('Phone: +237 699 52 39 24', 20, 45);
        doc.text('Email: marinaservice2001@yahoo.fr', 20, 50);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('INVOICE', 20, 70);

        // Invoice details
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Invoice Number: ${invoice.invoice_number}`, 20, 80);
        doc.text(`Invoice Currency: ${invoice.invoice_currency}`, 20, 85);
        doc.text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString('en-GB')}`, 20, 90);
        doc.setFont('helvetica', 'normal');
        doc.text("To:" , 20, 95);
        doc.setFont('helvetica', 'bold');
         doc.text(invoice.client_name, 20, 100);

        // Client address - combine all lines into one row
        let yPos = 105;
        let page = 1;
        doc.setFont('helvetica', 'normal');
      
        
        // Combine all address lines into one string
        const addressLines = [];
        if (invoice.client_line1) addressLines.push(invoice.client_line1);
        if (invoice.client_line2) addressLines.push(invoice.client_line2);
        if (invoice.client_line3) addressLines.push(invoice.client_line3);
        if (invoice.client_line4) addressLines.push(invoice.client_line4);
        
        if (addressLines.length > 0) {
            for (let i = 0; i < addressLines.length; i++) {
                doc.text(addressLines[i], 20, yPos);
                yPos += 5;
            }
            
        }

        yPos += 10;
        doc.text(`PO Reference: ${invoice.po_ref || ''}`, 20, yPos);

        // Invoice items table
        yPos += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(240, 240, 240);
        doc.rect(20, yPos - 5, 170, 10, 'F');
        doc.text('S/N', 25, yPos + 2);
        doc.text('Designation', 45, yPos + 2);
        doc.text('Qty', 120, yPos + 2);
        doc.text('Unit', 135, yPos + 2);
        doc.text('Unit Price', 150, yPos + 2);
        doc.text('Total', 175, yPos + 2);

        yPos += 15;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        items.forEach(item => {
            
            let startPosY = yPos;
            let endPosY = yPos;
            // Handle long designations
            let designation =  ''
            if(item.designation.length > 35) {
                let words = item.designation.split(' ');
                let line = '';
                
                for(let word of words) {
                    if((line + word).length > 35) {
                        doc.text(line, 45, yPos);
                        yPos += 5;
                        line = '';
                        endPosY = yPos;
                    }
                    line += word + ' ';
                }
                doc.text(line, 45, yPos);
            } else {
                designation = item.designation;
                doc.text(designation, 45, yPos);
            }
            if (endPosY > startPosY) {
                yPos = endPosY - (endPosY - startPosY) / 2; // Center vertically if multiple lines
            }
            doc.text(String(item.sn), 25, yPos);
            doc.text(String(item.quantity), 120, yPos);
            doc.text(item.unit || '', 135, yPos);
            doc.text(parseFloat(item.unit_price).toFixed(2), 150, yPos);
            doc.text(parseFloat(item.total).toFixed(2), 175, yPos);
            endPosY > yPos ? yPos = endPosY + 8: yPos += 8;
            

            // Add page break if needed
            if (yPos > 270) {
                doc.addPage();
                yPos = 30;
                page++;
            }
        });
doc.setTextColor(128, 128, 128);
doc.setFontSize(8);
        for(let i=0 ; i<page; i++) {
            doc.setPage(i+1);
            doc.text(`Page ${i+1} of ${page}`, 170, 285);
            doc.setFontSize(6);
            doc.text(`Invoice N° ${invoice.invoice_number}`, 170, 290);
        }
doc.setTextColor(0, 0, 0);
        // Summary
        yPos += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        if(invoice.discount_percent > 0) {
        doc.text(`Sub total in ${invoice.invoice_currency}: ${parseFloat(invoice.subtotal).toFixed(2)}`, 120, yPos);
        doc.text(`Discount: ${parseFloat(invoice.discount_percent).toFixed(2)}%`, 120, yPos + 10);
       
    }
    else{
        yPos -= 20; // Move up if no discount to keep total closer to subtotal
    }
        doc.setFontSize(13);
        doc.setTextColor(0, 51, 102);
        doc.text(`Total Amount in ${invoice.invoice_currency}: ${parseFloat(invoice.total).toFixed(2)}`, 120, yPos + 19);

        // Footer
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(0, 51, 102); // Dark blue;//rgb(11, 170, 181)
    
        doc.text('BP: 2859 Douala - Cameroun - RC/DLA/2020/B/5609 - NIU: M122015266790J', 20, 285);
        
        doc.setFontSize(7)
        doc.setTextColor(128, 128, 128);
        doc.text('Generated by BISSI APP - Ship Chandler Management System', 20, 290);

        // Download PDF
        doc.save(`Invoice_${invoice.invoice_number.replace(/\//g, '-')}.pdf`);

        // Show success notification
        showNotification(`Invoice ${invoice.invoice_number} exported to PDF successfully!`, 'success');

    } catch (error) {
        console.error('PDF export error:', error);
        showNotification('Failed to export invoice to PDF', 'error');
    }
}

async function exportAllInvoicesToExcel() {
    try {
        const result = await apiRequest('/invoices');
        if (!result.success || !Array.isArray(result.invoices) || result.invoices.length === 0) {
            alert('No invoices found to export');
            return;
        }

        const invoices = result.invoices;
        const excelData = [
            ['BISSI APP - All Invoices Export'],
            ['Generated on:', new Date().toLocaleString()],
            [''],
            ['Invoice #', 'Date', 'Client', 'Subtotal', 'Discount %', 'Total']
        ];

        // Add invoice summary data
        invoices.forEach(invoice => {
            excelData.push([
                invoice.invoice_number,
                new Date(invoice.invoice_date).toLocaleDateString('en-GB'),
                invoice.client_name,
                parseFloat(invoice.subtotal).toFixed(2),
                parseFloat(invoice.discount_percent).toFixed(2),
                parseFloat(invoice.total).toFixed(2)
            ]);
        });

        // Add totals row
        const totalSubtotal = invoices.reduce((sum, inv) => sum + parseFloat(inv.subtotal), 0);
        const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.total), 0);
        excelData.push([''], ['TOTALS:', '', totalSubtotal.toFixed(2), '', totalAmount.toFixed(2)]);

        // Create and download Excel file
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'All_Invoices');
        XLSX.writeFile(wb, `BISSI_All_Invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);

        showNotification(`Successfully exported ${invoices.length} invoices to Excel!`, 'success');

    } catch (error) {
        console.error('Bulk Excel export error:', error);
        showNotification('Failed to export all invoices to Excel', 'error');
    }
}

// ==================== VIEW ITEMS ====================

let allItems = [];

/**
 * Render items table with pagination and filters
 */
async function renderItemsTable() {
    const result = await apiRequest('/items');
    const tbody = document.getElementById('itemsTableBody');
    
    if (!result.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error loading items</td></tr>';
        return;
    }
    
    allItems = result.items;
    
    let filteredItems = allItems;
    const searchTerm = document.getElementById('searchItems').value.toLowerCase();
    const categoryFilter = document.getElementById('filterCategory').value;

    if (searchTerm) {
        filteredItems = filteredItems.filter(item => 
            item.name.toLowerCase().includes(searchTerm) || 
            item.code.toLowerCase().includes(searchTerm)
        );
    }

    if (categoryFilter) {
        filteredItems = filteredItems.filter(item => item.category === categoryFilter);
    }

    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredItems.slice(start, start + itemsPerPage);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-boxes"></i><p>No items found</p></td></tr>';
    } else {
        tbody.innerHTML = paginatedItems.map(item => `
            <tr>
                <td><strong>${item.code}</strong></td>
                <td>${item.name}</td>
                <td><span class="category-tag">${item.category}</span></td>
                <td>${item.unit}</td>
                <td class="price-cell">$${parseFloat(item.price).toFixed(2)}</td>
                <td><span class="badge badge-flag">${item.flag || 'general'}</span></td>
                <td class="action-btns">
                    ${currentUser.role === 'admin' ? `
                        <button class="action-btn action-btn-edit" onclick="openEditPrice('${item.id}')" title="Edit Price">
                            <i class="fas fa-edit"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    }

    renderPagination(totalPages);
}

/**
 * Render pagination controls
 * @param {number} totalPages - Total number of pages
 */
function renderPagination(totalPages) {
    const pagination = document.getElementById('itemsPagination');
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    pagination.innerHTML = html;
}

/**
 * Go to specific page
 * @param {number} page - Page number
 */
function goToPage(page) {
    currentPage = page;
    renderItemsTable();
}

/**
 * Filter items based on search and category
 */
function filterItems() {
    currentPage = 1;
    renderItemsTable();
}

/**
 * Open edit price modal
 * @param {string} itemId - The ID of the item to edit
 */
function openEditPrice(itemId) {
    const item = allItems.find(i => i.id == itemId);
    if (!item) return;

    document.getElementById('editItemId').value = item.id;
    document.getElementById('editItemCode').value = item.code;
    document.getElementById('editItemName').value = item.name;
    document.getElementById('editCurrentPrice').value = '$' + parseFloat(item.price).toFixed(2);
    document.getElementById('editCurrentCurrency').value = item.currency || 'EUR';
    document.getElementById('editNewPrice').value = item.price;

    document.getElementById('editPriceModal').classList.add('active');
}

/**
 * Handle edit price form submission
 */
document.getElementById('editPriceForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const itemId = document.getElementById('editItemId').value;
    const newPrice = parseFloat(document.getElementById('editNewPrice').value);
    const itemCode = document.getElementById('editItemCode').value;
    const itemName = document.getElementById('editItemName').value;
    const newCurrency = document.getElementById('editNewCurrency').value;

    const result = await apiRequest(`/items/${itemId}/price`, 'PUT', { price: newPrice, name: itemName, code: itemCode, currency: newCurrency });

    if (result.success) {
        showAlert('priceAlert', result.message, 'success');
        setTimeout(() => {
            closeModal('editPriceModal');
            renderItemsTable();
            updateDashboardStats();
            renderRecentItems();
        }, 1500);
    } else {
        showAlert('priceAlert', result.message, 'error');
    }
});

/**
 * Close modal
 * @param {string} modalId - The ID of the modal to close
 */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

// ==================== BULK IMPORT ====================

/**
 * Download Excel template for bulk items import
 */
function downloadItemsTemplate() {
    const templateData = [
        ['IMPA Code', 'Name', 'Category', 'Unit', 'Price', 'Currency'],
        ['11.01.01', 'Admiralty Anchor 10kg', 'Anchors & Mooring', 'PCS', '150.00', 'EUR'],
        ['17.02.05', 'Polypropylene Rope 10mm', 'Ropes & Lines', 'MTR', '2.50', 'EUR'],
        ['21.05.01', 'Dock Fender 500mm', 'Fenders', 'PCS', '85.00', 'EUR']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'Items_Template.xlsx');
}

/**
 * Handle bulk items Excel upload
 * @param {Event} event - The change event from file input
 */
async function handleBulkItemsUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);

        // Validate and process items
        const items = [];
        const errors = [];
        
        jsonData.forEach((row, index) => {
            const code = row['IMPA Code'] || row['IMPA code'] || row['impa code'];
            const name = row['Name'] || row['name'];
            const category = row['Category'] || row['category'];
            const currency = row['Currency'] || row['currency'] || 'EUR';
            const unit = row['Unit'] || row['unit'];
            const price = parseFloat(row['Price'] || row['price']);

            // Validate IMPA code format (XX.XX.XX)
           /* const impaPattern = /^(\d{2})\.(\d{2})\.(\d{2})$/;
            if (!code || !impaPattern.test(code)) {
                errors.push(`Row ${index + 2}: Invalid IMPA code "${code}" - must be XX.XX.XX format`);
                return;
            }*/
            if (!name) {
                errors.push(`Row ${index + 2}: Missing item name`);
                return;
            }
           /* if (!category) {
                errors.push(`Row ${index + 2}: Missing category`);
                return;
            }*/
            if (!unit) {
                errors.push(`Row ${index + 2}: Missing unit`);
                return;
            }
            if (isNaN(price) || price < 0) {
                errors.push(`Row ${index + 2}: Invalid price "${row['Price'] || row['price']}"`);
                return;
            }

            items.push({
                code: code?.trim(),
                name: name.trim(),
                category: category?.trim(),
                unit: unit.trim(),
                price: price,
                currency: currency?.trim(),
                description: row['Description'] || row['description'] || ''
            });
        });

        const alert = document.getElementById('bulkImportAlert');
        
        if (errors.length > 0) {
            alert.textContent = 'Validation errors: ' + errors.slice(0, 3).join('; ') + (errors.length > 3 ? '...' : '');
            alert.className = 'alert alert-error';
            alert.style.display = 'block';
            return;
        }

        if (items.length === 0) {
            alert.textContent = 'No valid items found in the file';
            alert.className = 'alert alert-error';
            alert.style.display = 'block';
            return;
        }

        // Send to server for bulk import
        const result = await apiRequest('/items/bulk', 'POST', { items });

        if (result.success) {
            alert.textContent = `Successfully imported ${result.imported} items! ${result.failed > 0 ? `(${result.failed} failed)` : ''}`;
            alert.className = 'alert alert-success';
            alert.style.display = 'block';
            
            // Refresh data
            await updateDashboardStats();
            await renderRecentItems();
            await renderItemsTable();
            
            // Reset file input
            document.getElementById('bulkItemsFile').value = '';
        } else {
            alert.textContent = result.message;
            alert.className = 'alert alert-error';
            alert.style.display = 'block';
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==================== IMPA SEARCH ====================

/**
 * Search IMPA codes from internet
 */
async function searchIMPA() {
    const searchTerm = document.getElementById('itemName').value.trim();
    if (!searchTerm) {
        showAlert('itemAlert', 'Please enter a product name to search', 'warning');
        return;
    }

    // Show loading
    const resultsContainer = document.getElementById('impaSearchResults');
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Searching IMPA codes...</div>';
    document.getElementById('impaSearchModal').classList.add('active');

    try {
        const result = await apiRequest('/impa/search', 'POST', { searchTerm });
        
        if (result.success && result.results.length > 0) {
            resultsContainer.innerHTML = result.results.map(item => `
                <div style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer;" onclick="selectIMPA('${item.code}', '${item.name}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: var(--accent);">${item.code}</strong>
                        <span class="category-tag">${item.category}</span>
                    </div>
                    <div style="margin-top: 4px; color: var(--text-primary);">${item.name}</div>
                    ${item.description ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${item.description}</div>` : ''}
                </div>
            `).join('');
        } else {
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                    <i class="fas fa-search"></i>
                    <p>No IMPA codes found for "${searchTerm}"</p>
                    <p style="font-size: 0.85rem;">Try a different search term</p>
                </div>
            `;
        }
    } catch (error) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error searching IMPA codes</p>
            </div>
        `;
    }
}

/**
 * Select an IMPA code from search results
 * @param {string} code - The IMPA code
 * @param {string} name - The item name
 */
function selectIMPA(code, name) {
    document.getElementById('itemCode').value = code;
    if (!document.getElementById('itemName').value) {
        document.getElementById('itemName').value = name;
    }
    closeModal('impaSearchModal');
}

// ==================== PDF IMPORT ====================

/**
 * Handle PDF file upload and extract items via server
 * @param {Event} event - The change event from file input
 */
async function handlePDFUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const alert = document.getElementById('pdfImportAlert');
    const progressContainer = document.getElementById('pdfProgressContainer');
    const progressBar = document.getElementById('pdfProgressBar');
    const progressText = document.getElementById('pdfProgressText');
    const progressPercent = document.getElementById('pdfProgressPercent');
    
    // Check file type
    if (file.type !== 'application/pdf') {
        alert.textContent = 'Please upload a PDF file';
        alert.className = 'alert alert-error';
        alert.style.display = 'block';
        return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert.textContent = 'File too large. Maximum size is 10MB';
        alert.className = 'alert alert-error';
        alert.style.display = 'block';
        return;
    }

    // Show progress container
    alert.textContent = 'Starting PDF processing...';
    alert.className = 'alert alert-info';
    alert.style.display = 'block';
    progressContainer.style.display = 'block';
    progressBar.style.width = '10%';
    progressText.textContent = 'Reading file...';
    progressPercent.textContent = '10%';

    try {
        // Update progress: File read
        progressBar.style.width = '20%';
        progressText.textContent = 'Converting to base64...';
        progressPercent.textContent = '20%';

        // Convert file to base64
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                progressBar.style.width = '30%';
                progressText.textContent = 'Sending to server...';
                progressPercent.textContent = '30%';
                resolve(reader.result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        // Update progress: Sending to server
        progressBar.style.width = '40%';
        progressText.textContent = 'Processing PDF text...';
        progressPercent.textContent = '40%';

        // Send to server for processing
        const response = await fetch(`${API_URL}/import/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64 })
        });

        // Update progress: Server processing
        progressBar.style.width = '70%';
        progressText.textContent = 'Extracting table data...';
        progressPercent.textContent = '70%';

        // Parse response - handle non-JSON responses
        let result;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            const text = await response.text();
            result = { success: false, message: text };
        }
        
        // Update progress: Complete
        progressBar.style.width = '100%';
        progressText.textContent = 'Complete!';
        progressPercent.textContent = '100%';
        
        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';
        }, 2000);
        
        if (result.success) {
            const scanWarning = result.isScanned ? 
                ' ⚠️ Scanned document detected - results may be incomplete' : '';
            alert.textContent = result.message + scanWarning;
            alert.className = result.isScanned ? 'alert alert-warning' : 'alert alert-success';
            alert.style.display = 'block';
            
            // Display extracted items with totalFound and skipped info
            displayExtractedItems(result.items, result.totalFound, result.skipped);
        } else {
            // Show specific error for scanned documents
            if (result.isScanned) {
                alert.textContent = result.message;
                alert.className = 'alert alert-warning';
                alert.innerHTML += '<div style="margin-top: 8px; font-size: 0.85rem;">💡 Tip: For scanned documents, try using OCR software first or export to a text-based PDF.</div>';
            } else {
                alert.textContent = result.message;
                alert.className = 'alert alert-error';
            }
            alert.style.display = 'block';
        }
    } catch (error) {
        console.error('PDF import error:', error);
        progressContainer.style.display = 'none';
        let errorMessage = 'Failed to process PDF. Please try again.';
        
        // Check if it's a network/JSON parsing error
        if (error.message.includes('JSON')) {
            errorMessage = 'Server error. Please ensure the server is running.';
        }
        
        alert.textContent = errorMessage;
        alert.className = 'alert alert-error';
        alert.style.display = 'block';
    }
}

// ==================== INITIALIZATION ====================

// Check for existing session on page load
window.addEventListener('load', async function() {
    const user = localStorage.getItem('sc_currentUser');
    if (user) {
        currentUser = JSON.parse(user);
        await showDashboard();
    }
});

// ESC key to close modals
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
});