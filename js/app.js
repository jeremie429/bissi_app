


// API Base URL
//const API_URL = 'http://localhost:3000/api';


const API_URL = 'https://bissi-app-server.vercel.app/api';

// Global variables
let currentUser = null;
let quoteCurrency = ""
let currentQuote = [];
let currentPage = 1;
let quotationFlag = ''; // Current flag filter for quotations
let excelEditState = {
    workbook: null,
    sheetName: '',
    headerRowIndex: 0,
    originalFileName: '',
    fileHandle: null,
    originalBytes: null,
    mapping: null
}; // Store mapping/workbook state for edit flow
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

    // Attach auth token if available in currentUser
   /* try {
        if (currentUser && currentUser.token) {
            options.headers['Authorization'] = 'Bearer ' + currentUser.token;
        }
    } catch (e) {
        // ignore
    }*/

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
    //console.log('Login result:', result);
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
    if (!alert) return;
    alert.textContent = message;
    alert.className = 'alert alert-' + type;
    alert.style.display = 'block';
    setTimeout(() => { alert.style.display = 'none'; }, 5000);
}

// ==================== TAB NAVIGATION ====================

/**
 * Initialize tab navigation using event delegation for robustness
 */
const sidebarNav = document.querySelector('.sidebar-nav');
if (sidebarNav) {
    sidebarNav.addEventListener('click', (ev) => {
        const navItem = ev.target.closest('.nav-item');
        if (!navItem) return;

        const tabId = navItem.getAttribute('data-tab');
        if (!tabId) {
            console.warn('Navigation item clicked but no data-tab attribute found');
            return;
        }

        const tabEl = document.getElementById(tabId);
        if (!tabEl) {
            console.warn(`Tab element not found for id: ${tabId}`);
            return;
        }

        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        navItem.classList.add('active');

        // Show the selected tab and hide others
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');

        // Update page title mapping if available
        const titles = {
            'dashboard-home': 'Dashboard',
            'insert-item': 'Insert Item',
            'make-quotation': 'Make Quotation',
            'make-invoice': 'Make Invoice',
            'invoice-history': 'Invoice History',
            'view-items': 'View Items'
        };
        if (titles[tabId]) document.getElementById('pageTitle').textContent = titles[tabId];

        if (tabId === 'invoice-history') {
            renderInvoiceHistory();
        }

        // Close sidebar on mobile after selecting a tab
        toggleSidebar();
    });
}

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
    const existingFlag = document.getElementById('itemFlag').value

    const newItem = {
        code: document.getElementById('itemCode').value,
        name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        unit: document.getElementById('itemUnit').value,
        price: parseFloat(document.getElementById('itemPrice').value),
        description: document.getElementById('itemDescription').value,
        currency: document.getElementById('itemCurrency').value,
        flag:  existingFlag != '' ? existingFlag : 'general'
    };

    const result = await apiRequest('/items', 'POST', newItem);

    if (result.success) {
        showAlert('itemAlert', result.message, 'success');
        document.getElementById('insertItemForm').reset();
        await updateDashboardStats();
        await renderRecentItems();
        await renderItemsTable();
        await initFlagsByDb()
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
            item.price = 0; // Reset price to 0 for re-matching
            const matched = dbItems.find(db => 
                db.name.toLowerCase() === item.name.toLowerCase() && 
                db.unit.toLowerCase() === item.unit.toLowerCase() &&
                (quotationFlag === '' || db.flag === quotationFlag)
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



// 1. PROTECTION-AWARE LOADER
async function handleQuotationUpload() {
    if (!window.showOpenFilePicker) {
        showAlert('quoteAlert', 'Your browser does not support direct save back to the original Excel file. Use Chrome or Edge.', 'warning');
        return;
    }

    try {
        const handles = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: 'Excel Files',
                accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
        });

        if (!handles || handles.length === 0) return;
        const handle = handles[0];

        // Explicitly request write privileges while inside the user click callback
        const opts = { mode: 'readwrite' };
        if ((await handle.queryPermission(opts)) !== 'granted') {
            if ((await handle.requestPermission(opts)) !== 'granted') {
                showAlert('quoteAlert', 'Write permission denied. Cannot save edits back to this file.', 'error');
                return;
            }
        }

        const file = await handle.getFile();
        const array = await file.arrayBuffer();
        const safeUint8Buffer = new Uint8Array(array);

        // USE EXCELJS TO READ: Bypasses cell-lock blocks and reads protected arrays
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(safeUint8Buffer);

        if (workbook.worksheets.length === 0) {
            showAlert('quoteAlert', 'Empty or invalid Excel sheet structure.', 'error');
            return;
        }

        // Target the first active worksheet
        const worksheet = workbook.worksheets[0];
        const sheetName = worksheet.name;

        // Convert the ExcelJS protected layout into flat native matrix arrays manually
        const flatRows = [];
        worksheet.eachRow({ includeEmpty: true }, (row) => {
            const flatRow = [];
            // Read up to column 50 sequentially to ensure list filters aren't dropped
            for (let colIdx = 1; colIdx <= 50; colIdx++) {
                const cell = row.getCell(colIdx);
                // Extract underlying text string value or formula outcomes safely
                const val = cell.value;
                if (val && typeof val === 'object' && val.result !== undefined) {
                    flatRow.push(val.result); // Get evaluated formula strings
                } else {
                    flatRow.push(val ?? '');
                }
            }
            flatRows.push(flatRow);
        });

        const { headerRowIndex, detectedHeaders, row } = detectExcelHeaderRow(flatRows);

        // Retain state parameters for the injector step
        excelEditState = {
            workbook: workbook, // Save the parsed ExcelJS instance directly
            sheetName: sheetName,
            headerRowIndex: headerRowIndex,
            originalFileName: file.name,
            fileHandle: handle,
            originalBytes: array,
            mapping: null,
            row
        };

        // Open your display UI modal using the safely read header values
        openExcelMappingModal(detectedHeaders, workbook, sheetName, headerRowIndex, file.name);
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Quotation upload error:', error);
        showAlert('quoteAlert', 'Failed to open protected file: ' + (error.message || error), 'error');
    }
}

// 2. STABLE MATRIX KEYWORD SCANNER
function detectExcelHeaderRow(rows) {
   // const HEADER_KEYWORDS = ['description','designation','item description','item name','product','qty','quantity', 'qnty','unit price','unit','price','total','amount'];
    const HEADER_KEYWORDS = [
        {name : 'description', value:'designation'},
        {name : 'designation', value:'designation'},
        {name : 'item description', value:'designation'},
        {name : 'item name', value:'designation'},
        {name : 'product', value:'designation'},
        {name : 'qty', value:'quantity'},
        {name : 'quantity', value:'quantity'},
        {name : 'qnty', value:'quantity'},
        {name : 'unit price', value:'unit'},
        {name : 'unit', value:'unit'},
        {name : 'price', value:'unit price'},
        {name : 'u.price', value:'unit price'},
        {name : 'unit price', value:'unit price'},
        {name : 'total', value:'cost'},
        {name : 'cost', value:'cost'},
        {name : 'amount', value:'cost'},
        {name : 'total amount', value:'cost'},
        
        
    ]
    if (!Array.isArray(rows) || rows.length === 0) {
        return { headerRowIndex: 0, detectedHeaders: [] };
    }

    const scanLimit = Math.min(rows.length, 70);

    for (let r = 0; r < scanLimit; r++) {
        const row = rows[r] || [];
        const cells = row.map(c => String(c ?? '').toLowerCase().trim());
        let score = 0;

        let picked = []
        for (const cellText of cells) {
            if (!cellText) continue;
            
            for (const kw of HEADER_KEYWORDS) {
                if (cellText.includes(kw.name)) 
                    {
                        
                        
                        if(picked.includes(kw.value))continue
                    picked.push(kw.value)
                   // console.log({picked})
                    //console.log({cellText})
                    score++;
                    break;
                }
            }
        }

        if (score >= 2) {
            //console.log({row})
            return {
                headerRowIndex: r,
                detectedHeaders: row.map(h => String(h ?? '').trim()),
                row
            };
        }
    }

    const fallbackRow = rows[0] || [];
    return {
        headerRowIndex: 0,
        detectedHeaders: fallbackRow.map(h => String(h ?? '').trim())
    };
}

// 3. PROTECTION-BYPASS WRITER

async function writeWorkbookToHandle(editedRowsMatrix, handle, originalBytes) {
    let writable;
    try {
        // Request immediate File System output connection stream access
        writable = await handle.createWritable({ keepExistingData: true });

        // Retrieve the live ExcelJS memory workbook instance directly from state 
        // This ensures protection structural mappings are already unzipped and loaded
        const templateWorkbook = excelEditState.workbook;
        const worksheet = templateWorkbook.getWorksheet(excelEditState.sheetName);

        // Temporarily turn off protection validation checks during string array injection
        const originalSheetProtection = worksheet.sheetProtection;
        worksheet.sheetProtection = null;

        // Loop through the data changes you mapped from your modal UI grid layout
        editedRowsMatrix.forEach((rowValues, zeroBasedRowIndex) => {
            const targetExcelRowIndex = zeroBasedRowIndex + 1; // Excel is 1-indexed
            const excelRow = worksheet.getRow(targetExcelRowIndex);

            rowValues.forEach((newValue, zeroBasedColIndex) => {
                const targetExcelColIndex = zeroBasedColIndex + 1;
                const cell = excelRow.getCell(targetExcelColIndex);

                 if (cell && cell.value !== undefined && cell.value !== null) {
                    // Check A: Object-type formulas (e.g., { formula: 'A1*B1', result: 10 })
                    if (typeof cell.value === 'object' && cell.value.formula) {
                        return; // 🛑 SKIP! Do not modify formula structures
                    }

                    // Check B: Native/Shared formulas context configurations
                    if (cell.type === ExcelJS.ValueType.Formula) {
                        return; // 🛑 SKIP! Do not overwrite formula object mappings
                    }

                    // Check C: Text representation equations safeguards
                    const currentStringVal = String(cell.value).trim();
                    if (currentStringVal.startsWith('=')) {
                        return; // 🛑 SKIP! Guard string literals treated as calculations
                    }
                }

                // INJECT RAW VALUES directly behind the protection layer
                cell.value = newValue;
            });
        });

        // Re-apply original sheet protection configurations
        if (originalSheetProtection) {
            worksheet.sheetProtection = originalSheetProtection;
        }

        // ================= STRATEGY 1 IMPLEMENTATION =================
        // Ensure workbook application view states are initialized
        if (!templateWorkbook.views || templateWorkbook.views.length === 0) {
            templateWorkbook.views = [
                {
                    x: 0, y: 0, width: 10000, height: 20000,
                    firstSheet: 0, activeTab: 0, visibility: 'visible'
                }
            ];
        }
        
        // Ensure calcProperties structure exists, then flag it to trigger formula updates on open
        if (!templateWorkbook.calcProperties) {
            templateWorkbook.calcProperties = {};
        }
        templateWorkbook.calcProperties.fullCalcOnLoad = true;
        // =============================================================

        // Export data stream back onto target system hard disk paths
        const arrayBuf = await templateWorkbook.xlsx.writeBuffer();
        const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Error writing workbook to handle:', error);
        if (writable) {
            try { await writable.close(); } catch (_) {}
        }
        return false;
    }
}




/*
async function handleQuotationUpload() {
    if (!window.showOpenFilePicker) {
        showAlert('quoteAlert', 'Your browser does not support direct save back to the original Excel file. Use Chrome or Edge.', 'warning');
        return;
    }

    try {
        const handles = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: 'Excel Files',
                accept: {
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                    'application/vnd.ms-excel': ['.xls']
                }
            }]
        });

        if (!handles || handles.length === 0) {
            return;
        }

        const handle = handles[0];

        // --- CRITICAL SECURITY FIX FOR IN-PLACE WRITING ---
        // Explicitly verify and request write permission right inside the user click context
        const opts = { mode: 'readwrite' };
        if ((await handle.queryPermission(opts)) !== 'granted') {
            if ((await handle.requestPermission(opts)) !== 'granted') {
                showAlert('quoteAlert', 'Write permission denied. Cannot save edits back to this file.', 'error');
                return;
            }
        }
        // --------------------------------------------------

        const file = await handle.getFile();
        const array = await file.arrayBuffer();
        
        const workbook = XLSX.read(new Uint8Array(array), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const range = XLSX.utils.decode_range(sheet['!ref']);
        range.s.r = 0;
        range.s.c = 0;

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: "", range: range });

        if (!rows || rows.length === 0) {
            showAlert('quoteAlert', 'Empty or invalid Excel sheet', 'error');
            return;
        }

        const { headerRowIndex, detectedHeaders } = detectExcelHeaderRow(rows);
        
        excelEditState = {
            workbook,
            sheetName,
            headerRowIndex,
            originalFileName: file.name,
            fileHandle: handle,
            originalBytes: array, // This is your clean Excel template array
            mapping: null
        };

        openExcelMappingModal(detectedHeaders, workbook, sheetName, headerRowIndex, file.name);
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Quotation upload error:', error);
        showAlert('quoteAlert', 'Failed to open Excel file: ' + (error.message || error), 'error');
    }
}*/

/*
async function handleQuotationUpload() {
    if (!window.showOpenFilePicker) {
        showAlert('quoteAlert', 'Your browser does not support direct save back to the original Excel file. Use Chrome or Edge.', 'warning');
        return;
    }

    try {
        const handles = await window.showOpenFilePicker({
            multiple: false,
            types: [{
                description: 'Excel Files',
                accept: {
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                    'application/vnd.ms-excel': ['.xls']
                }
            }]
        });

        if (!handles || handles.length === 0) {
            return;
        }

        const handle = handles[0];
        const file = await handle.getFile();
        const array = await file.arrayBuffer();

        // 3. Initialize ExcelJS and load the byte stream
        // (Ensure ExcelJS script is loaded in your project)
       // const workbook = new ExcelJS.Workbook();
        //await workbook.xlsx.load(array);
        
        const workbook = XLSX.read(new Uint8Array(array), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // 2. Decode the existing worksheet boundary range
    // 2. Decode the existing worksheet boundary range
    const range = XLSX.utils.decode_range(sheet['!ref']);

    // 3. Force the starting row (s.r) and starting column (s.c) back to 0 (A1)
    range.s.r = 0;
    range.s.c = 0;

            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: "", range: range });
            //console.log({rowsLength : rows.length})

            if (!rows || rows.length === 0) {
                showAlert('quoteAlert', 'Empty or invalid Excel sheet', 'error');
                return;
            }

            const { headerRowIndex, detectedHeaders } = detectExcelHeaderRow(rows);
            excelEditState = {
                workbook,
                sheetName,
                headerRowIndex,
                originalFileName: file.name,
                fileHandle: handle,
                originalBytes: array,
                mapping: null
            };

            openExcelMappingModal(detectedHeaders, workbook, sheetName, headerRowIndex, file.name);
        } catch (error) {
            // Ignore user cancellation (AbortError)
            if (error.name === 'AbortError') {
                return;
            }
            console.error('Quotation upload error:', error);
            showAlert('quoteAlert', 'Failed to open Excel file: ' + (error.message || error), 'error');
        }
}*/
/*
function detectExcelHeaderRow(rows) {
    const HEADER_KEYWORDS = ['description','designation','item description','item name','product','qty','quantity', 'qnty','unit price','unit','price','total','amount','currency'];
    
    // Ensure rows is a valid array, otherwise stop early
    if (!Array.isArray(rows) || rows.length === 0) {
        return { headerRowIndex: 0, detectedHeaders: [] };
    }

    const scanLimit = Math.min(rows.length, 70);

    for (let r = 0; r < scanLimit; r++) {
        // FIX: Handle sparse arrays/empty row positions caused by list filter boundaries
        const rawRow = rows[r];
        if (!rawRow) continue; 

        // If the row object is parsed as a generic Object instead of an Array, safely convert it
        const row = Array.isArray(rawRow) ? rawRow : Object.values(rawRow);
        
        // Normalize everything into clean string arrays for testing keywords
        const cells = row.map(c => String(c ?? '').toLowerCase().trim());
        let score = 0;

        for (const cellText of cells) {
            // Skip empty cells inside row containers
            if (!cellText) continue;

            for (const kw of HEADER_KEYWORDS) {
                // Perfect substring mapping matches filters seamlessly
                if (cellText.includes(kw)) {
                    score++;
                    break; // Jump to next cell once keyword match hits
                }
            }
        }

        // If at least two keywords match, we found our header position row
        if (score >= 2) {
            return {
                headerRowIndex: r,
                detectedHeaders: row.map(h => String(h ?? '').trim())
            };
        }
    }

    // Fallback block if no explicit layout matched
    const firstRawRow = rows[0] || [];
    const fallbackRow = Array.isArray(firstRawRow) ? firstRawRow : Object.values(firstRawRow);
    
    return {
        headerRowIndex: 0,
        detectedHeaders: fallbackRow.map(h => String(h ?? '').trim())
    };
}*/

/*
function detectExcelHeaderRow(rows) {
    const HEADER_KEYWORDS = ['description','designation','item description','item name','product','qty','quantity', 'qnty','unit price','unit','price','total','amount','currency'];
    const scanLimit = Math.min(Array.isArray(rows) ? rows.length : 0, 70);

    for (let r = 0; r < scanLimit; r++) {
        const row = Array.isArray(rows[r]) ? rows[r] : [];
        const cells = row.map(c => String(c ?? '').toLowerCase());
        //console.log({cells})
        let score = 0;

        for (const cellText of cells) {
            const normalized = String(cellText ?? '');
            for (const kw of HEADER_KEYWORDS) {
                if (typeof kw === 'string' && normalized?.indexOf(kw) !== -1) {
                  //  console.log({normalized})
                    score++;
                    break;
                }
            }
        }

        if (score >= 2) {
           // console.log({r})
            return {
                headerRowIndex: r,
                detectedHeaders: row.map(h => String(h ?? '').trim())
            };
        }
    }

    const fallbackRow = Array.isArray(rows[0]) ? rows[0] : [];
    return {
        headerRowIndex: 0,
        detectedHeaders: fallbackRow.map(h => String(h ?? '').trim())
    };
}*/

function openExcelMappingModal(headers, workbook, sheetName, headerRowIndex = 0, originalFileName = 'Quotation.xlsx') {
    const modal = document.getElementById('excelMappingModal');
    const descSel = document.getElementById('mapDescription');
    const unitSel = document.getElementById('mapUnit');
    const curSel = document.getElementById('mapCurrency');
    const priceSel = document.getElementById('mapPrice');

    excelEditState = {
        workbook,
        sheetName,
        headerRowIndex,
        originalFileName,
        fileHandle: excelEditState ? excelEditState.fileHandle : null,
        originalBytes: excelEditState ? excelEditState.originalBytes : null,
        mapping: null
    };

    [descSel, unitSel, curSel, priceSel].forEach(s => { s.innerHTML = '<option value="">-- None --</option>'; });

    headers.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        [descSel, unitSel, curSel, priceSel].forEach(s => s.appendChild(opt.cloneNode(true)));
    });

    const normalizedHeaders = headers.map(h => String(h || '').trim().toLowerCase());
    const defaults = [
        { field: descSel, prefs: ['Item Description','Description','Item Name','Designation'] },
        { field: unitSel, prefs: ['Unit','Item Unit','UOM'] },
        { field: curSel, prefs: ['Currency','currency'] },
        { field: priceSel, prefs: ['Unit Price','Price','UnitPrice','Price Item'] }
    ];
    defaults.forEach(({ field, prefs }) => {
        for (const pref of prefs) {
            const idx = normalizedHeaders.indexOf(pref.toLowerCase());
            if (idx !== -1) {
                field.value = headers[idx];
                break;
            }
        }
    });

    modal.classList.add('active');

    const downloadBtn = document.getElementById('downloadEditCopyBtn');
    downloadBtn.textContent = 'Auto-fill & Save to File';
    downloadBtn.classList.remove('btn-success');
    downloadBtn.classList.add('btn-primary');
    downloadBtn.onclick = async () => {
        const mapping = {
            description: descSel.value,
            unit: unitSel.value,
            currency: curSel.value,
            price: priceSel.value
        };
        if (!mapping.description || !mapping.unit || !mapping.price) {
            showAlert('quoteAlert', 'Please map Description, Unit, and Price columns before saving.', 'error');
            return;
        }
        excelEditState.mapping = mapping;
        //console.log({excelEditState})
        closeModal('excelMappingModal');
        await fillPricesAndSave();
    };
}

function escapeXmlValue(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}


/**
 * Writes an ExcelJS workbook to a file handle while preserving original images and styling.
 * @param {ExcelJS.Workbook} workbook - The active ExcelJS workbook instance containing your edits.
 * @param {FileSystemFileHandle} handle - The native browser file handle.
 * @param {ArrayBuffer} originalBytes - The raw bytes of the original spreadsheet file.
 */
/**
 * Hybrid function: Takes a SheetJS workbook, reads updates, 
 * and maps them into an ExcelJS instance using originalBytes to preserve files.
 */
/**
 * Hybrid function: Merges SheetJS changes into ExcelJS, 
 * explicitly protecting formulas and original formatting from being overwritten.
 */
/*
async function writeWorkbookToHandle(sheetJsWorkbook, handle, originalBytes) {
    let writable;
    try {
        if (!originalBytes || originalBytes.byteLength === 0) {
            throw new Error("Input template bytes are empty or undefined.");
        }

        const safeUint8Buffer = new Uint8Array(originalBytes);

        // Verify the file signature is a genuine OpenXML ZIP file (.xlsx)
        const isXlsx = safeUint8Buffer[0] === 0x50 && safeUint8Buffer[1] === 0x4B && 
                       safeUint8Buffer[2] === 0x03 && safeUint8Buffer[3] === 0x04;

        if (!isXlsx) {
            throw new Error("The template data is still encoded in old .xls format. Please use 'Save As .xlsx' inside Excel first.");
        }

        // FIX: Force the file stream to preserve the existing file data structure 
        // instead of starting from an empty, blank swap file template.
        writable = await handle.createWritable({ keepExistingData: true });

        const templateWorkbook = new ExcelJS.Workbook();
        await templateWorkbook.xlsx.load(safeUint8Buffer);

        if (templateWorkbook.worksheets.length === 0) {
            throw new Error("ExcelJS parsed the file but found 0 sheets.");
        }

        // Map data from SheetJS changes onto the ExcelJS structure
        for (const name of sheetJsWorkbook.SheetNames) {
            const sheetJsWorksheet = sheetJsWorkbook.Sheets[name];
            if (!sheetJsWorksheet) continue;

            const excelJsWorksheet = templateWorkbook.getWorksheet(name);
            if (!excelJsWorksheet) continue;

            Object.keys(sheetJsWorksheet).forEach(cellAddress => {
                if (cellAddress.startsWith('!')) return; 

                const cellData = sheetJsWorksheet[cellAddress];
                if (!cellData || cellData.v === undefined) return;
                if (cellData.f) return; 

                const excelJsCell = excelJsWorksheet.getCell(cellAddress);
                if (excelJsCell) {
                    // Injecting only raw text or numbers keeps images, styles, and guards safely untouched
                    excelJsCell.value = cellData.v;
                }
            });
        }

        // Compile and completely replace file streams
        const arrayBuf = await templateWorkbook.xlsx.writeBuffer();
        const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        await writable.write(blob);
        await writable.close();
        
        return true;
    } catch (error) {
        console.error('Error writing workbook to handle:', error);
        if (writable) {
            try { await writable.close(); } catch (_) {}
        }
        return false;
    }
}*/

/*
async function writeWorkbookToHandle(sheetJsWorkbook, handle, originalBytes) {
    let writable;
    try {
        if (!originalBytes || originalBytes.byteLength === 0) {
            throw new Error("Input template bytes are empty or undefined.");
        }

        // 1. FIXED DATA LOADER: Wrap raw bytes into an explicit Uint8Array view
        // ExcelJS can fail or read 0 sheets if given a naked ArrayBuffer pointer.
        const safeUint8Buffer = new Uint8Array(originalBytes);

        // Verify the file signature is a genuine OpenXML ZIP file (.xlsx)
        const isXlsx = safeUint8Buffer[0] === 0x50 && safeUint8Buffer[1] === 0x4B && 
                       safeUint8Buffer[2] === 0x03 && safeUint8Buffer[3] === 0x04;

        if (!isXlsx) {
            throw new Error("Mismatched Extension. The template data is still encoded in old .xls format. Please use 'Save As .xlsx' inside Excel.");
        }

        // 2. Request write permissions early to satisfy browser activation
        writable = await handle.createWritable();

        // 3. Load the data using the safe Uint8Array wrapper
        const templateWorkbook = new ExcelJS.Workbook();
        await templateWorkbook.xlsx.load(safeUint8Buffer);

        // Ensure sheets actually successfully loaded
        if (templateWorkbook.worksheets.length === 0) {
            throw new Error("ExcelJS parsed the file but found 0 sheets. Ensure the file is not a renamed .xls file.");
        }

        // 4. Map across SheetJS runtime data structures
        for (const name of sheetJsWorkbook.SheetNames) {
            const sheetJsWorksheet = sheetJsWorkbook.Sheets[name];
            if (!sheetJsWorksheet) continue;

            const excelJsWorksheet = templateWorkbook.getWorksheet(name);
            if (!excelJsWorksheet) continue;

            Object.keys(sheetJsWorksheet).forEach(cellAddress => {
                if (cellAddress.startsWith('!')) return; // Skip sheet metadata

                const cellData = sheetJsWorksheet[cellAddress];
                if (!cellData || cellData.v === undefined) return;

                // PROTECT FORMULAS: Skip if formula fields exist
                if (cellData.f) return; 

                const excelJsCell = excelJsWorksheet.getCell(cellAddress);
                if (excelJsCell) {
                    // Update value; preserves background, shapes, column widths, protection state, and styles
                    excelJsCell.value = cellData.v;
                }
            });
        }

        // 5. Compile output structure
        const arrayBuf = await templateWorkbook.xlsx.writeBuffer();
        const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // 6. Stream out to disk
        await writable.write(blob);
        await writable.close();
        
        return true;
    } catch (error) {
        console.error('Error writing workbook to handle:', error);
        if (writable) {
            try { await writable.close(); } catch (_) {}
        }
        return false;
    }
}*/

/*
async function writeWorkbookToHandle(sheetJsWorkbook, handle, originalBytes) {
    try {
        if (!originalBytes || originalBytes.byteLength === 0) {
            throw new Error("Input template bytes are empty or undefined.");
        }

        const bytesArray = new Uint8Array(originalBytes);

        // Detect File Format Signatures
        const isXls = bytesArray[0] === 0xD0 && bytesArray[1] === 0xCF && 
                      bytesArray[2] === 0x11 && bytesArray[3] === 0xE0;

        const isXlsx = bytesArray[0] === 0x50 && bytesArray[1] === 0x4B && 
                       bytesArray[2] === 0x03 && bytesArray[3] === 0x04;

        // ==========================================
        // PATH A: LEGACY .XLS (SheetJS In-Place Processing)
        // ==========================================
        if (isXls) {
            // Read template directly via SheetJS (Enabling cellStyles option)
            const templateBook = XLSX.read(originalBytes, { type: 'array', cellStyles: true });

            // Merge your runtime edits straight into the target template sheet structure
            sheetJsWorkbook.SheetNames.forEach(name => {
                const sourceSheet = sheetJsWorkbook.Sheets[name];
                const targetSheet = templateBook.Sheets[name];
                if (!sourceSheet || !targetSheet) return;

                Object.keys(sourceSheet).forEach(cellAddress => {
                    if (cellAddress.startsWith('!')) return; // Ignore sheet metadata

                    const cellData = sourceSheet[cellAddress];
                    if (!cellData || cellData.v === undefined) return;

                    // PROTECT FORMULAS: Skip if formula fields exist
                    if (cellData.f) return;

                    // If cell doesn't exist on template yet, initialize it
                    if (!targetSheet[cellAddress]) {
                        targetSheet[cellAddress] = { t: cellData.t || 's' };
                    }

                    // Update value without stripping structural metadata references
                    targetSheet[cellAddress].v = cellData.v;
                    
                    if (cellData.w !== undefined) {
                        targetSheet[cellAddress].w = cellData.w;
                    }
                });
            });

            // Write output file. Notice bookType remains 'xls' to preserve legacy core maps
            const outputBytes = XLSX.write(templateBook, { bookType: 'xls', type: 'array' });
            const blob = new Blob([outputBytes], { type: 'application/vnd.ms-excel' });
            
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        }

        // ==========================================
        // PATH B: MODERN .XLSX (ExcelJS Full Engine Retention)
        // ==========================================
        if (isXlsx) {
            const templateWorkbook = new ExcelJS.Workbook();
            await templateWorkbook.xlsx.load(originalBytes);

            for (const name of sheetJsWorkbook.SheetNames) {
                const sheetJsWorksheet = sheetJsWorkbook.Sheets[name];
                if (!sheetJsWorksheet) continue;

                const excelJsWorksheet = templateWorkbook.getWorksheet(name);
                if (!excelJsWorksheet) continue;

                Object.keys(sheetJsWorksheet).forEach(cellAddress => {
                    if (cellAddress.startsWith('!')) return;

                    const cellData = sheetJsWorksheet[cellAddress];
                    if (!cellData || cellData.v === undefined) return;
                    if (cellData.f) return; 

                    const excelJsCell = excelJsWorksheet.getCell(cellAddress);
                    if (excelJsCell) {
                        // Assignment preserves styles, alignments, backgrounds, and conditional formatting rules
                        excelJsCell.value = cellData.v;
                    }
                });
            }

            const arrayBuf = await templateWorkbook.xlsx.writeBuffer();
            const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        }

        throw new Error("Unsupported binary type array signature.");
    } catch (error) {
        console.error('Error writing workbook to handle:', error);
        return false;
    }
}*/


/*
async function writeWorkbookToHandle(sheetJsWorkbook, handle, originalBytes) {
    try {
        // 1. Load original file bytes into ExcelJS to pull styles, images, and formulas
        const templateWorkbook = new ExcelJS.Workbook();
        await templateWorkbook.xlsx.load(originalBytes);

        // 2. Map across SheetJS structures
        sheetJsWorkbook.SheetNames.forEach(name => {
            const sheetJsWorksheet = sheetJsWorkbook.Sheets[name];
            if (!sheetJsWorksheet) return;

            const excelJsWorksheet = templateWorkbook.getWorksheet(name);
            if (!excelJsWorksheet) return;

            // Loop through cell keys (e.g., "A1", "B5")
            Object.keys(sheetJsWorksheet).forEach(cellAddress => {
                if (cellAddress.startsWith('!')) return; // Skip metadata keys

                const cellData = sheetJsWorksheet[cellAddress];
                if (!cellData) return;

                // PROTECT FORMULAS: If the cell naturally contains an Excel formula, 
                // DO NOT overwrite it. Let the original template handle it natively.
                if (cellData.f) {
                    return; 
                }

                // OPTIONAL OPTIMIZATION: If you are tracking which rows/cells your app edited,
                // check it here. Otherwise, only write raw text/numbers that do not hold equations.
                if (cellData.v !== undefined) {
                    const excelJsCell = excelJsWorksheet.getCell(cellAddress);
                    
                    // Natively assigns raw data values (strings, numbers) 
                    // without wiping out pre-existing column formats, borders, or styles
                    excelJsCell.value = cellData.v;
                }
            });
        });

        // 3. Compile optimized output buffer
        const arrayBuf = await templateWorkbook.xlsx.writeBuffer();
        const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Error writing workbook to handle:', error);
        return false;
    }
}*/


/*
async function writeWorkbookToHandle(sheetJsWorkbook, handle, originalBytes) {
    try {
        // 1. Initialize ExcelJS to load your original file styles and images
        const templateWorkbook = new ExcelJS.Workbook();
        await templateWorkbook.xlsx.load(originalBytes);

        // 2. Parse your SheetJS data map structures manually
        sheetJsWorkbook.SheetNames.forEach(name => {
            const sheetJsWorksheet = sheetJsWorkbook.Sheets[name];
            if (!sheetJsWorksheet) return;

            const excelJsWorksheet = templateWorkbook.getWorksheet(name);
            if (!excelJsWorksheet) return;

            // Loop through the SheetJS data cell keys (e.g., "A1", "B5")
            Object.keys(sheetJsWorksheet).forEach(cellAddress => {
                // Ignore internal structural metadata keys starting with '!'
                if (cellAddress.startsWith('!')) return;

                const cellData = sheetJsWorksheet[cellAddress];
                if (cellData && cellData.v !== undefined) {
                    // Update only the cell value in the ExcelJS template file
                    const excelJsCell = excelJsWorksheet.getCell(cellAddress);
                    excelJsCell.value = cellData.v;
                }
            });
        });

        // 3. Compile output bytes
        const arrayBuf = await templateWorkbook.xlsx.writeBuffer();
        const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Error writing workbook to handle:', error);
        return false;
    }
}*/


/*
async function writeWorkbookToHandle(workbook, handle, originalBytes) {
    try {
        // Recalculate sheet ranges to include any newly written cells
        workbook.SheetNames.forEach(name => {
            const sheet = workbook.Sheets[name];
            if (!sheet) return;

            let range = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
            let hasCell = false;

            Object.keys(sheet).forEach(addr => {
                if (addr[0] === '!') return;
                hasCell = true;
                try {
                    const { r, c } = XLSX.utils.decode_cell(addr);
                    if (r < range.s.r) range.s.r = r;
                    if (c < range.s.c) range.s.c = c;
                    if (r > range.e.r) range.e.r = r;
                    if (c > range.e.c) range.e.c = c;
                } catch (e) { }
            });

            if (hasCell) {
                // CRITICAL FIX: Ensure we preserve index 0 for leading blank rows if needed
                // Forces the start row/col back to 0 so early empty spacing isn't deleted
                range.s.r = 0;
                range.s.c = 0;
                sheet['!ref'] = XLSX.utils.encode_range(range);
            }
        });

        // CRITICAL FIX: Pass options to attempt preservation of original styles/structures
        const arrayBuf = XLSX.write(workbook, { 
            bookType: 'xlsx', 
            type: 'array',
            cellStyles: true,  // Keeps styling rules if they exist in the workbook object
            bookVitals: true,  // Retains internal workbook metadata structures
            sheets: workbook.SheetNames // Ensures all structural sheets map across explicitly
        });

        const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Error writing workbook to handle:', error);
        return false;
    }
}*/


/*async function writeWorkbookToHandle(workbook, handle, originalBytes) {
    try {
        // Recalculate sheet ranges to include any newly written cells
        workbook.SheetNames.forEach(name => {
            const sheet = workbook.Sheets[name];
            if (!sheet) return;
            // If !ref missing, compute from keys
            let range = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
            let hasCell = false;
            Object.keys(sheet).forEach(addr => {
                if (addr[0] === '!') return;
                hasCell = true;
                try {
                    const { r, c } = XLSX.utils.decode_cell(addr);
                    if (r < range.s.r) range.s.r = r;
                    if (c < range.s.c) range.s.c = c;
                    if (r > range.e.r) range.e.r = r;
                    if (c > range.e.c) range.e.c = c;
                } catch (e) { }
            });
            if (hasCell) sheet['!ref'] = XLSX.utils.encode_range(range);
        });

        const arrayBuf = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (error) {
        console.error('Error writing workbook to handle:', error);
        return false;
    }
}*/

function setPriceCellValue(sheet, cellAddr, priceValue) {
    const origCell = sheet[cellAddr];
    const cellType = typeof priceValue === 'number' ? 'n' : 's';

    if (origCell) {
        sheet[cellAddr] = {
            ...origCell,
            v: priceValue,
            t: cellType
        };
    } else {
        sheet[cellAddr] = {
            v: priceValue,
            t: cellType
        };
    }
}

function updateExcelEditProgress(message, percent) {
    const container = document.getElementById('excelEditProgressContainer');
    const text = document.getElementById('excelEditProgressText');
    const percentText = document.getElementById('excelEditProgressPercent');
    const bar = document.getElementById('excelEditProgressBar');

    if (!container || !text || !percentText || !bar) return;

    container.style.display = 'block';
    text.textContent = message;
    percentText.textContent = `${percent}%`;
    bar.style.width = `${percent}%`;
}
/*
async function fillPricesAndSave() {
    if (!excelEditState || !excelEditState.workbook) {
        showAlert('quoteAlert', 'No quotation file is loaded.', 'error');
        return;
    }
    if (!excelEditState.fileHandle) {
        showAlert('quoteAlert', 'Unable to save back: file handle is missing. Re-open the file using the upload button.', 'error');
        return;
    }

    updateExcelEditProgress('Fetching prices from database...', 5);
    const flagParam = quotationFlag ? `?flag=${encodeURIComponent(quotationFlag)}` : quoteCurrency ? `?currency=${encodeURIComponent(quoteCurrency)}` : '';
    if(flagParam !== "" && quoteCurrency !== "") flagParam = `?currency=${encodeURIComponent(quoteCurrency)}`

    const result = await apiRequest(`/items${flagParam}`);
    if (!result.success) {
        showAlert('quoteAlert', 'Unable to fetch items from database.', 'error');
        updateExcelEditProgress('Failed to fetch DB items.', 0);
        return;
    }

    const dbItems = result.items || [];
    updateExcelEditProgress('Filling prices into workbook...', 20);

    const workbook = excelEditState.workbook;

    // Guard check: Ensure the workbook object exists in memory
    if (!workbook || typeof workbook.getWorksheet !== 'function') {
        console.error("Workbook instance is missing or incorrectly structured.");
        return;
    }

    // Safely target the worksheet using ExcelJS native structure
    const sheet = workbook.getWorksheet(excelEditState.sheetName);

    // Guard check: Handle cases where the sheet name is missing or corrupted
    if (!sheet) {
        console.error(`Worksheet "${excelEditState.sheetName}" could not be found in this workbook layout.`);
        // Fallback: Try to get the very first sheet if the exact name match fails
        const fallbackSheet = workbook.worksheets[0];
        if (!fallbackSheet) {
            throw new Error("No valid worksheets found in this Excel file layout.");
        }
        sheet = fallbackSheet;
    }

    const rows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
    const flatRow = [];
    
    // Scan up to column 50 sequentially to ensure hidden/filtered data isn't dropped
    for (let colIdx = 1; colIdx <= 50; colIdx++) {
        const cell = row.getCell(colIdx);
        const val = cell.value;
        
        // Handle formula values safely if any headers or cells use equations
        if (val && typeof val === 'object' && val.result !== undefined) {
            flatRow.push(val.result); 
        } else {
            flatRow.push(val ?? '');
        }
    }
    rows.push(flatRow);
});*/
/*
async function fillPricesAndSave() {
    if (!excelEditState || !excelEditState.workbook) {
        showAlert('quoteAlert', 'No quotation file is loaded.', 'error');
        return;
    }
    if (!excelEditState.fileHandle) {
        showAlert('quoteAlert', 'Unable to save back: file handle is missing. Re-open the file using the upload button.', 'error');
        return;
    }

    updateExcelEditProgress('Fetching prices from database...', 5);
    
    // Fix block scope variable assignment rule error
    let flagParam = quotationFlag ? `?flag=${encodeURIComponent(quotationFlag)}` : '';
    if (quoteCurrency) {
        flagParam = `?currency=${encodeURIComponent(quoteCurrency)}`;
    }

    const result = await apiRequest(`/items${flagParam}`);
    if (!result.success) {
        showAlert('quoteAlert', 'Unable to fetch items from database.', 'error');
        updateExcelEditProgress('Failed to fetch DB items.', 0);
        return;
    }

    const dbItems = result.items || [];
    updateExcelEditProgress('Processing database match array...', 20);

    const workbook = excelEditState.workbook;
    let sheet = workbook.getWorksheet(excelEditState.sheetName);

    if (!sheet) {
        console.warn(`Worksheet "${excelEditState.sheetName}" not found. Triaging structural fallbacks...`);
        sheet = workbook.worksheets[0];
        if (!sheet) {
            showAlert('quoteAlert', 'No valid worksheets found in this Excel file layout.', 'error');
            return;
        }
    }

    // 1. EXTRACT NATIVE EXCELJS MATRIX
    const matrixRows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
        const flatRow = [];
        // Extract every single cell value up to col index 50 (safeguards filters and locks)
        for (let colIdx = 1; colIdx <= 50; colIdx++) {
            const cell = row.getCell(colIdx);
            const val = cell.value;
            
            if (val && typeof val === 'object' && val.result !== undefined) {
                flatRow.push(val.result); 
            } else {
                flatRow.push(val ?? '');
            }
        }
        matrixRows.push(flatRow);
    });

    updateExcelEditProgress('Injecting pricing rules...', 50);

    // 2. MATCH ITEMS AND POPULATE MATRIX
    // Retrieve your layout mapping choices from your UI configuration object
    const mapping = excelEditState.mapping || {}; 
    const descriptionColIndex = mapping.descriptionColumnIndex; // e.g., 1 for Column B
    const priceColIndex = mapping.priceColumnIndex;             // e.g., 3 for Column D
    const headerRowIndex = excelEditState.headerRowIndex;       // Row index where header was found

    // Loop through the data rows starting immediately AFTER the detected header row
    for (let r = headerRowIndex + 1; r < matrixRows.length; r++) {
        const currentRow = matrixRows[r];
        if (!currentRow || descriptionColIndex === undefined || priceColIndex === undefined) continue;

        // Fetch description text securely from the correct index track
        const excelDescription = String(currentRow[descriptionColIndex] ?? '').trim().toLowerCase();
        if (!excelDescription) continue;

        // Query match string against fetched DB entities list array
        const matchedDbItem = dbItems.find(item => {
            const dbName = String(item.name || item.description || '').trim().toLowerCase();
            return dbName === excelDescription;
        });

        if (matchedDbItem) {
            const newPrice = matchedDbItem.price || matchedDbItem.unit_price || 0;
            // Update the raw cell text evaluation coordinate in our matrix memory frame
            matrixRows[r][priceColIndex] = newPrice;
        }
    }

    updateExcelEditProgress('Writing changes safely to disk handle...', 80);

    // 3. PASS PROPER MATRIX ARRAY INTO WRITER
    // By passing 'matrixRows' (which is a valid array), the .forEach error is completely resolved.
    const saveSuccess = await writeWorkbookToHandle(matrixRows, excelEditState.fileHandle, excelEditState.originalBytes);

    if (saveSuccess) {
        updateExcelEditProgress('Complete!', 100);
        showAlert('quoteAlert', 'Quotation workbook saved successfully in-place!', 'success');
    } else {
        updateExcelEditProgress('Failed to write outputs.', 0);
        showAlert('quoteAlert', 'Failed to write pricing rules directly back to the file handle tracking targets.', 'error');
    }
}
*/

async function fillPricesAndSave() {
    if (!excelEditState || !excelEditState.workbook) {
        showAlert('quoteAlert', 'No quotation file is loaded.', 'error');
        return;
    }
    if (!excelEditState.fileHandle) {
        showAlert('quoteAlert', 'Unable to save back: file handle is missing. Re-open the file using the upload button.', 'error');
        return;
    }

    updateExcelEditProgress('Fetching prices from database...', 5);
    
    // Fix block scope variable assignment rule error
    let flagParam = quotationFlag ? `?flag=${encodeURIComponent(quotationFlag)}` : '';
    if (quoteCurrency) {
        flagParam = `?currency=${encodeURIComponent(quoteCurrency)}`;
    }

    //console.log({flagParam})

    const result = await apiRequest(`/items${flagParam}`);
    
    if (!result.success) {
        showAlert('quoteAlert', 'Unable to fetch items from database.', 'error');
        updateExcelEditProgress('Failed to fetch DB items.', 0);
        return;
    }

    const dbItems = result.items || [];
    updateExcelEditProgress('Processing database match array...', 20);
    //console.log({dbItems})
    const workbook = excelEditState.workbook;
    let sheet = workbook.getWorksheet(excelEditState.sheetName);

    if (!sheet) {
        console.warn(`Worksheet "${excelEditState.sheetName}" not found. Triaging structural fallbacks...`);
        sheet = workbook.worksheets[0];
        if (!sheet) {
            showAlert('quoteAlert', 'No valid worksheets found in this Excel file layout.', 'error');
            return;
        }
    }

    // 1. EXTRACT NATIVE EXCELJS MATRIX
    const matrixRows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
        const flatRow = [];
        //console.log({row})
        // Extract every single cell value up to col index 50 (safeguards filters and locks)
        for (let colIdx = 1; colIdx <= 50; colIdx++) {
            const cell = row.getCell(colIdx);
            const val = cell.value;
            
            if (val && typeof val === 'object' && val.result !== undefined) {
                flatRow.push(val.result); 
            } else {
                flatRow.push(val ?? '');
            }
        }
        matrixRows.push(flatRow);
    });

    updateExcelEditProgress('Injecting pricing rules...', 50);

    // 2. MATCH ITEMS AND POPULATE MATRIX
    // Retrieve your layout mapping choices from your UI configuration object
    const mapping = excelEditState.mapping || {}; 
     // 2. DYNAMICALLY DETECT COLUMN INDEXES FROM HEADER ROW
    const headerRowIndex = excelEditState.headerRowIndex; // Row index where headers live
    const headerRowCells = matrixRows[headerRowIndex] || [];

    // Normalize headers to lowercase strings for bulletproof matching
    const normalizedHeaders = headerRowCells.map(h => String(h ?? '').toLowerCase().trim());

    // Get the description column name from your mapping state (or default to 'description')
    const targetDescriptionName = String(excelEditState.mapping?.description || 'description').toLowerCase().trim();

    // Find the exact index of your description column
    let descriptionColIndex = normalizedHeaders.indexOf(targetDescriptionName);

    // If exact lookup fails, do a flexible substring fallback search
    if (descriptionColIndex === -1) {
        descriptionColIndex = normalizedHeaders.findIndex(h => h.includes('description') || h.includes('item') || h.includes('designation'));
    }

    // Dynamically find the Price column index using your common keywords
    let priceColIndex = normalizedHeaders.indexOf('unit price');
    if (priceColIndex === -1) priceColIndex = normalizedHeaders.indexOf('price');
    if (priceColIndex === -1) priceColIndex = normalizedHeaders.indexOf('amount');
    if (priceColIndex === -1) {
        priceColIndex = normalizedHeaders.findIndex(h => h.includes('price') || h.includes('rate'));
    }

    // Safety check: ensure we actually found the columns before running the loop
    if (descriptionColIndex === -1 || priceColIndex === -1) {
        console.error("Mapping Lookup Failed:", { descriptionColIndex, priceColIndex, normalizedHeaders });
        showAlert('quoteAlert', 'Could not locate matching Description or Price columns in this spreadsheet format.', 'error');
        updateExcelEditProgress('Mapping failed.', 0);
        return;
    }       // Row index where header was found
   // console.log({descriptionColIndex})
    // Loop through the data rows starting immediately AFTER the detected header row
    
    for (let r = headerRowIndex + 1; r < matrixRows.length; r++) {
        const currentRow = matrixRows[r];
        //console.log({currentRow})
        if (!currentRow || descriptionColIndex === undefined || priceColIndex === undefined) continue;
       // console.log({descriptionColIndex})

        // Fetch description text securely from the correct index track
        const excelDescription = String(currentRow[descriptionColIndex] ?? '').trim().toLowerCase();
       // console.log({excelDescription})
        if (!excelDescription) continue;

        // Query match string against fetched DB entities list array
        const matchedDbItem = dbItems.find(item => {
            const dbName = String(item.name || item.description || '').trim().toLowerCase();
           // console.log(dbName + "result match with " + excelDescription + "= "+ dbName === excelDescription)
            return dbName === excelDescription;
        });

        if (matchedDbItem) {
            const newPrice = matchedDbItem.price || matchedDbItem.unit_price || 0;
            // Update the raw cell text evaluation coordinate in our matrix memory frame
            matrixRows[r][priceColIndex] = newPrice;
        }else{
           // console.warn(`No matching DB item found for description: ${excelDescription}`);
        matrixRows[r][priceColIndex] = 0; // Optionally set to 0 or leave unchanged
        }
    }

    updateExcelEditProgress('Writing changes safely to disk handle...', 80);

    // 3. PASS PROPER MATRIX ARRAY INTO WRITER
    // By passing 'matrixRows' (which is a valid array), the .forEach error is completely resolved.
    const saveSuccess = await writeWorkbookToHandle(matrixRows, excelEditState.fileHandle, excelEditState.originalBytes);

    if (saveSuccess) {
        updateExcelEditProgress('Complete!', 100);
        showAlert('quoteAlert', 'Quotation workbook saved successfully in-place!', 'success');
    } else {
        updateExcelEditProgress('Failed to write outputs.', 0);
        showAlert('quoteAlert', 'Failed to write pricing rules directly back to the file handle tracking targets.', 'error');
    }
}


      /*  // 2. Decode the existing worksheet boundary range
    const range = XLSX.utils.decode_range(sheet['!ref']);

// 3. Force the starting row (s.r) and starting column (s.c) back to 0 (A1)
range.s.r = 0;
range.s.c = 0;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: range, blankrows : true,  defval: ""});*/
   

function updateQuotationFlag() {
    quotationFlag = document.getElementById('quotationFlag').value;
    // If there's a current quote, re-process it with the new flag
    if (currentQuote.length > 0) {
        renderQuotePreview();
    }
}

function updateQuotationCurrency(){
    quoteCurrency = document.getElementById('quotationCurrency').value;
}

/**
 * Process quotation data from Excel
 * @param {Array} data - Parsed Excel data
 */
async function processQuotation(data) {
    // Get all items from database, filtered by flag if selected
    const param = quotationFlag ? `?flag=${encodeURIComponent(quotationFlag)}` : '';
    if(quoteCurrency !== "" && param !== "") param += `&currency=${encodeURIComponent(quoteCurrency)}`
    if(quoteCurrenc !== "" && param === "") param = `?currency=${encodeURIComponent(quoteCurrency)}`
    const result = await apiRequest(`/items?${param}`);
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
            <td><input type="text" class="invoice-name"  value="${item.name}" oninput="updateQuoteRow(this, ${index})"></td>
            <td><input type="number" class="invoice-quantity"  value="${item.quantity}" oninput="updateQuoteRow(this, ${index})"></td>
            <td><input type="text" class="invoice-unit" value="${item.unit}" oninput="updateQuoteRow(this, ${index})"></td>
            <td><input type="number" class="invoice-price" min="0" step="0.01" value="${item.price}" oninput="updateQuoteRow(this, ${index})"></td>
            <td>${item.currency}</td>
            <td><strong class = "item-total">${item.total.toFixed(2)} </strong></td>
            <td>
                <span class="match-status ${item.found ? 'match-found' : 'match-not-found'}">
                    <i class="fas fa-${item.found ? 'check' : 'times'}"></i>
                    ${item.found ? 'Found' : 'Not Found'}
                </span>
            </td>
            <td class="actions-cell">
                <button class="action-btn action-btn-delete" onclick="deleteQuoteRow(${index})" title="Delete row">
                    <i class="fas fa-trash"></i>
                </button>
                
                <button class="action-btn action-btn-add" onclick="addQuoteRow(${index})" title="Add row before">
                    <i class="fas fa-plus"></i>
                </button>
               
                <button class="action-btn action-btn-secondary" onclick="insertItemIntoDatabase(${index})" title="Insert item into database" style="display: ${item.found ? 'none' : 'inline-block'};">
                    <i class="fas fa-save"></i>
                </button>
            </td>
        </tr>
    `).join('');

    const grandTotal = currentQuote.reduce((sum, item) => sum + item.total, 0);
    document.getElementById('quoteGrandTotal').textContent = grandTotal.toFixed(2) + (currentQuote.length > 0 ? ' ' + currentQuote[0].currency : '');
}

function updateQuoteRow(input, index) {

    setTimeout(() => {
       const row = input.closest('tr');
    const name = row.querySelector('.invoice-name').value;
    const quantity = row.querySelector('.invoice-quantity').value;
    const unit = row.querySelector('.invoice-unit').value;
    const price = row.querySelector('.invoice-price').value;
        ///const currency = row.querySelector('.invoice-currency').value;

    // Update the corresponding item in the quote array
    currentQuote[index].name = name;
    currentQuote[index].quantity = parseFloat(quantity) || 0;
    currentQuote[index].unit = unit;
    currentQuote[index].price = parseFloat(price) || 0;
    ///currentQuote[index].currency = currency;

    // Recalculate the total for this item
    currentQuote[index].total = currentQuote[index].price * currentQuote[index].quantity;

    row.querySelector('.item-total').textContent = currentQuote[index].total.toFixed(2) || '';
     const grandTotal = currentQuote.reduce((sum, item) => sum + item.total, 0);
    document.getElementById('quoteGrandTotal').textContent = grandTotal.toFixed(2) + (currentQuote.length > 0 ? ' ' + currentQuote[0].currency : '');
    // Re-render the quote preview
    //renderQuotePreview(); 
    }, 3000);
    
}

function addQuoteRow(index) {
    const newItem = {
        id: null,
        code: '',
        name: '',
        category: '-',
        unit: '',
        price: 0,
        currency: currentQuote.length > 0 ? currentQuote[0].currency : 'EUR',
        quantity: 1,
        total: 0,
        found: false
    };
    currentQuote.splice(index, 0, newItem);
    renderQuotePreview();
}
 async function insertItemIntoDatabase(index) {
    const item = currentQuote[index];
    if (!item) return;

    // Implementation for inserting item into database
   const result = await apiRequest('/items', 'POST', {
        code: item.code || `ITEM-${Date.now()}`,
        name: item.name,
        category: item.category || 'general',
        unit: item.unit,
        price: item.price,
        currency: item.currency
    });

    if (result.success) {
        showNotification(`Item "${item.name}" inserted into database!`, 'success');
        currentQuote[index].found = true;
        //currentQuote[index].id = result.item._id;
        renderQuotePreview();
        await initFlagsByDb()
    } else {
        showNotification(`Failed to insert item: ${result.message}`, 'error');
    }
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
               // console.log('Matched client ID:', matchedClient._id.toString());
                document.getElementById('clientId').value = matchedClient._id.toString();
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

function addInvoiceRow( item = {}, e = null, position = 'before') {
  
    //console.log('Adding invoice row', { item});
    //console.log('Adding invoice row', {event: e?.parentElement, item});
    const tbody = document.getElementById('invoiceTableBody');
    const rowIndex =  tbody.children.length + 1;
    //console.log
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
       
        <button type="button" class="action-btn action-btn-secondary" onclick="insertItemIntoDatabaseFromInvoice(this)" title="Insert item into database">
            <i class="fas fa-save"></i>
        </button>
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

async function insertItemIntoDatabaseFromInvoice(button) {
    const row = button.closest('tr');
    if (!row) return;
    const designationInput = row.querySelector('.invoice-designation');
    const unitInput = row.querySelector('.invoice-unit');
    const priceInput = row.querySelector('.invoice-unit-price');
    const itemName = designationInput.value.trim();
    const itemUnit = unitInput.value.trim();
    const itemPrice = parseFloat(priceInput.value) || 0;

    if (!itemName || !itemUnit) {
        showAlert('invoiceAlert', 'Item name and unit are required to insert into database', 'error');
        return;
    }

   
        const checkResult = allItems.find(i => i.name.trim().toLowerCase() === itemName.trim().toLowerCase() && i.unit.trim().toLowerCase() === itemUnit.trim().toLowerCase() && i.flag === (document.getElementById('clientNameInput').value || 'general'));


        if (checkResult) {
            showNotification('Item already exists in the database with the same name and flag.', 'error');
            return;
        }
  

    try {
        const result = await apiRequest('/items', 'POST', {
            code: `ITEM-${Date.now()}`,
            name: itemName,
            category: 'general',
            unit: itemUnit,
            price: itemPrice,
            currency: document.getElementById('invoiceCurrency').value,
            flag: document.getElementById('clientNameInput').value || 'general'
        });

        if (result.success) {
            showNotification(`Item "${itemName}" inserted into database! with flag ${document.getElementById('clientNameInput').value || 'general'}`, 'success');
        } else {
            showNotification(`Failed to insert item: ${result.message}`, 'error');
        }
    } catch (error) {
        showNotification('Error inserting item into database', 'error');
    }
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
                
               // console.log('Imported items:', result.items);
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

   
    result.invoices.map((invoice, index) => {
        invoice.invoiceId = invoice._id.toString();
    });
   
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
                <button class="action-btn action-btn-primary" onclick="viewInvoiceDetails('${invoice.invoiceId}')" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn action-btn-secondary" onclick="exportInvoiceToExcel('${invoice.invoiceId}')" title="Export to Excel">
                    <i class="fas fa-file-excel"></i>
                </button>
                <button class="action-btn action-btn-success" onclick="exportInvoiceToPDF('${invoice.invoiceId}')" title="Export to PDF">
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

        //generate qr code with invoice info (invoice number, date, client name, total, items formatted with special character ready to copy paste to excel sheet in each column and row) and add to pdf
            const qrData = `Invoice Number:\t${invoice.invoice_number}\nDate:\t${new Date(invoice.invoice_date).toLocaleDateString('en-GB')}\nClient:\t${invoice.client_name}\nTotal:\t${parseFloat(invoice.total).toFixed(2)} ${invoice.invoice_currency}\n\nItems (Limit 20):\n${items.splice(0,20).map(item => `${item.designation}; ${item.quantity}; ${item.unit}; ${parseFloat(item.unit_price).toFixed(2)}`).join('\n')}`;
       // const qrData = `Invoice Number: ${invoice.invoice_number}\nDate: ${new Date(invoice.invoice_date).toLocaleDateString('en-GB')}\nClient: ${invoice.client_name}\nTotal: ${parseFloat(invoice.total).toFixed(2)} ${invoice.invoice_currency}\n\nItems:\n${items.map(item => `${item.sn}, ${item.designation} , ${item.quantity} ${item.unit} , ${parseFloat(item.unit_price).toFixed(2)} , ${parseFloat(item.total).toFixed(2)}`).join('\n')}`;
        //const qrData = `Invoice Number: ${invoice.invoice_number}\nDate: ${new Date(invoice.invoice_date).toLocaleDateString('en-GB')}\nClient: ${invoice.client_name}\nTotal: ${parseFloat(invoice.total).toFixed(2)} ${invoice.invoice_currency}\n\nItems:\n${items.map(item => `${item.sn}. ${item.designation} - Qty: ${item.quantity} ${item.unit} - Unit Price: ${parseFloat(item.unit_price).toFixed(2)} - Total: ${parseFloat(item.total).toFixed(2)}`).join('\n')}`;
        const qrCodeCanvas = document.createElement('canvas');
        QRCode.toCanvas(qrCodeCanvas, qrData, { width: 100 }, function (error) {
            if (error) {
                console.error('QR code generation error:', error);
            } else {
                const qrImageData = qrCodeCanvas.toDataURL('image/png');
                doc.addImage(qrImageData, 'PNG', 20, 250, 30, 30);
            }
        });

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
    const tbody = document.getElementById('itemsTableBody');
    
    allItems = [];
    const result = await apiRequest('/items');
    
    
    if (!result.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error loading items</td></tr>';
        return;
    }
    
    allItems = result.items;
    
    
    let filteredItems = allItems;
    const searchTerm = document.getElementById('searchItems').value.toLowerCase();
    //get all existing categories from items and populate category filter dropdown
    const categoryFilterSelect = document.getElementById('filterCategory');
    // check if category filter select has options, if not populate it with categories from items
    if(categoryFilterSelect.options.length <= 1) {
    const categories = [...new Set(allItems.map(item => item.category).filter(cat => cat))];
    categoryFilterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    }
    const categoryFilter = categoryFilterSelect.value;

    if (searchTerm) {
        filteredItems = filteredItems.filter(item => 
            item.name.toLowerCase().includes(searchTerm) 
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
                <td class="price-cell">${parseFloat(item.price).toFixed(2)} ${item.currency}</td>
                <td><span class="badge badge-flag">${item.flag || 'general'}</span></td>
                <td class="action-btns">
                    ${currentUser.role === 'admin' ? `
                        <button class="action-btn action-btn-edit" onclick="openEditPrice('${item._id.toString()}')" title="Edit Price">
                            <i class="fas fa-edit"></i>
                        </button>
                        
                        <button class="action-btn action-btn-delete" onclick="deleteItem('${item._id.toString()}')" title="Delete Item">
                            <i class="fas fa-trash"></i>
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

async function deleteItem(itemId) {
    if (!confirm(`Are you sure you want to delete item ${allItems.find(i => i._id.toString() === itemId)?.name }?`)) return;

    const result = await apiRequest(`/items/${itemId}`, 'DELETE');
    if (result.success) {   
        showNotification(result.message, 'success');
        allItems = allItems.filter(item => item._id.toString() !== itemId);
        renderItemsTable();
        updateDashboardStats();
        renderRecentItems();
    } else {
        showAlert(result.message, 'error');
    }
}
/**
 * Open edit price modal
 * @param {string} itemId - The ID of the item to edit
 */
function openEditPrice(itemId) {
    const item = allItems.find(i => i._id.toString() == itemId);
    if (!item) return;

    document.getElementById('editItemId').value = item._id.toString();
    document.getElementById('editItemCode').value = item.code;
    document.getElementById('editItemName').value = item.name;
    document.getElementById('editCurrentPrice').value =  parseFloat(item.price).toFixed(2);
    document.getElementById('editCurrentCurrency').value = item.currency || 'EUR';
    document.getElementById('editNewPrice').value = item.price;
    document.getElementById('editItemFlag').value = item.flag || 'general';
    document.getElementById('editItemCategory').value = item.category || '';
    document.getElementById('editItemUnit').value = item.unit || '';
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
    const itemFlag = document.getElementById('editItemFlag').value;
    const itemUnit = document.getElementById('editItemUnit').value;
    const itemCategory = document.getElementById('editItemCategory').value;

    const result = await apiRequest(`/items/${itemId}/price`, 'PUT', { price: newPrice, name: itemName, code: itemCode, currency: newCurrency, flag:itemFlag, unit: itemUnit, category:itemCategory });

    if (result.success) {
        showAlert('priceAlert', result.message, 'success');
        allItems = allItems.map(item => item._id.toString() === itemId ? { ...item, price: newPrice, currency: newCurrency, name: itemName, code: itemCode, flag: itemFlag, unit: itemUnit, category: itemCategory } : item);
       showNotification(`Item ${itemName} updated to ${newCurrency} ${newPrice.toFixed(2)}`, 'success');
        setTimeout(() => {
            closeModal('editPriceModal');
            renderItemsTable();
            updateDashboardStats();
            renderRecentItems();
        }, 1500);
    } else {
        showAlert(result.message, 'error');
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
        ['IMPA Code', 'Name', 'Category', 'Unit', 'Price', 'Currency', 'Flag', 'Description'],
        ['11.01.01', 'Admiralty Anchor 10kg', 'Anchors & Mooring', 'PCS', '150.00', 'EUR', 'general', ''],
        ['17.02.05', 'Polypropylene Rope 10mm', 'Ropes & Lines', 'MTR', '2.50', 'EUR', 'general', ''],
        ['21.05.01', 'Dock Fender 500mm', 'Fenders', 'PCS', '85.00', 'EUR', 'general', '']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'Insert_Items_Template.xlsx');
}

function downloadInvoiceTemplate(){
    const templateData = [
        [  'designation', 'quantity', 'unit', 'price', 'Currency'],
        ['Admiralty Anchor 10kg', '2', 'PCS', '150.00', 'EUR'],
        ['Polypropylene Rope 10mm', '50', 'MTR', '2.50', 'EUR'],
        ['Dock Fender 500mm', '4', 'PCS', '85.00', 'EUR']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, 'Invoice_Template.xlsx');

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
            const price = parseFloat(row['Price'] || row['price'])
            const flag = row['Flag'] || row['flag'] || 'general'
            ;

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
                flag: flag?.trim() || 'general',
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
            await initFlagsByDb();
            
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

        await showDashboard()
        return 

        // Validate the session with backend (try common endpoints). If valid, proceed to dashboard.
      /*  const validateEndpoints = ['/auth/validate', '/auth/me', '/users/me', '/me'];
        let valid = false;
        for (const ep of validateEndpoints) {
            try {
                const res = await apiRequest(ep);
                if (!res) continue;
                if (res.success || res.user || res.data || res.id) {
                    valid = true;
                    break;
                }
            } catch (e) {
                // ignore and try next
            }
        }

        if (valid) {
            try {
                await showDashboard();
                return;
            } catch (e) {
                console.warn('showDashboard failed:', e);
            }
        } else {
            console.log('Stored session not validated; staying on login page.');
        }*/
    }

    // Ensure login UI is visible and other pages are hidden on load
    const loginPage = document.getElementById('loginPage');
    const signupPage = document.getElementById('signupPage');
    if (loginPage) loginPage.style.display = 'flex';
    if (signupPage) signupPage.style.display = 'none';
});

/**
 * Show Dashboard view and initialize data
 * Ensures dashboard-related UI elements are visible and refreshed
 */
async function showDashboard() {
    document.getElementById("loginPage").style.display ='none'
    document.getElementById('signupPage').style.display = 'none';
    document.getElementById("dashboard").style.display = "block"
    try {
        // Activate dashboard tab if present
        const dashboardTab = document.getElementById('dashboard-home');
        if (dashboardTab) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            dashboardTab.classList.add('active');
        }

        // Mark nav active
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const dashNav = document.querySelector('.nav-item[data-tab="dashboard-home"]');
        if (dashNav) dashNav.classList.add('active');

        // Update page title
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = 'Dashboard';

        // Refresh dashboard stats and recent items (non-blocking)
        updateDashboardStats().catch(err => console.warn('updateDashboardStats failed', err));
        renderRecentItems().catch(err => console.warn('renderRecentItems failed', err));
        await renderItemsTable();
        await initInvoiceForm();
        await initFlagsByDb()
    } catch (error) {
        console.error('showDashboard error:', error);
    }
}
function initFlagsByDb() {
    apiRequest('/flags').then(result => {
        if (result.success) {
            const flagSelect = document.getElementById('quotationFlag');
           
            flagSelect.innerHTML = '<option value="">All Flags</option>';
            result.flags.forEach(flag => {
                const option = document.createElement('option');
                option.value = flag;
                option.textContent = flag;
                flagSelect.appendChild(option);
             
            });
        }
    });
}

/**
 * Update dashboard stats placeholders. Safe no-op if elements missing.
 */
async function updateDashboardStats() {
    try {
        // Try to fetch stats endpoint if available
        let stats = null;
        try {
            const res = await apiRequest('/stats');
            if (res && res.success) stats = res.stats || res.data || null;
        } catch (e) {
            // ignore - server may not expose /stats
        }

        // Fill placeholders if present
        const statsMap = {
            totalItems: stats?.totalItems ?? null,
            totalInvoices: stats?.totalInvoices ?? null,
            totalQuotes: stats?.totalQuotes ?? null,
            totalUsers: stats?.totalUsers ?? null,
        };

        Object.keys(statsMap).forEach(key => {
            const el = document.getElementById(key);
            if (el && statsMap[key] !== null && statsMap[key] !== undefined) el.textContent = statsMap[key];
        });
    } catch (error) {
        console.error('updateDashboardStats error:', error);
    }
}

/**
 * Render a short list of recent items in the dashboard if UI exists.
 */
async function renderRecentItems() {
    try {
        const listEl = document.getElementById('recentItemsList');
        if (!listEl) return;

        let items = [];
        try {
            const res = await apiRequest('/items?limit=6');
            if (res && res.success) items = res.items || [];
        } catch (e) {
            // fallback to allItems if populated
            items = allItems.slice(0, 6);
        }

        if (!items || items.length === 0) {
            listEl.innerHTML = '<div class="empty-state">No recent items</div>';
            return;
        }

        listEl.innerHTML = items.map(it => `<div class="recent-item"><strong>${it.code}</strong> ${it.name} <span class="price">${parseFloat(it.price||0).toFixed(2)} ${it.currency||''}</span></div>`).join('');
    } catch (error) {
        console.error('renderRecentItems error:', error);
    }
}

/**
 * Show small notification. Uses `globalAlert` or falls back to `showAlert` if available.
 */
function showNotification(message, type = 'info') {
    const global = document.getElementById('globalAlert') || document.getElementById('notification');
    if (global) {
        global.textContent = message;
        global.className = 'alert alert-' + (type === 'info' ? 'info' : type);
        global.style.display = 'block';
        setTimeout(() => { global.style.display = 'none'; }, 4000);
    } else if (typeof showAlert === 'function') {
        // Use quoteAlert as a generic fallback
        showAlert('quoteAlert', message, type === 'info' ? 'success' : type);
    } else {
        console.log(type.toUpperCase() + ':', message);
    }
}

// ESC key to close modals
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
});