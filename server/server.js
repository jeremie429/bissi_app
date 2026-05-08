/* ==================== BISSI APP - Node.js Server with MySQL ==================== */

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const { CanvasFactory } = require( "pdf-parse/worker"); 
const { PDFParse } = require('pdf-parse');
// or equivalent for your PDF library



const Tesseract = require('tesseract.js');
const fs = require('fs');
const { log } = require('console');
const path = require('path');
const { createWorker } = require ('tesseract.js');

const {MongoClient} = require('mongodb');
const {ObjectId} = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = 3000;

const client = new MongoClient(uri);

// Middleware - increased limit for PDF base64 data
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));



// Source - https://stackoverflow.com/a/46529810
// Posted by Parkar, modified by community. See post 'Timeline' for change history
// Retrieved 2026-05-06, License - CC BY-SA 4.0

/*
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Or restrict to 'http://localhost:8080'
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});*/


// MySQL Connection Configuration
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'jeremie',
    password: 'jeremie',
    database: 'bissi_app',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create connection pool
let pool;

// Initialize database and tables
async function initDatabase() {
    try {
        // First connect without database to create it
        const tempConfig = { ...dbConfig, database: undefined };
        const tempPool = mysql.createPool(tempConfig);
        
        await tempPool.execute(`CREATE DATABASE IF NOT EXISTS bissi_app`);
        console.log('✓ Database "bissi_app" created or already exists');
        
        await tempPool.end();
        
        // Now connect to the database
        pool = mysql.createPool(dbConfig);
        
        // Create users table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'staff') DEFAULT 'staff',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Users table created');
        
        // Create items table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                unit VARCHAR(50) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                flag VARCHAR(50) DEFAULT 'general',
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Items table created');
        
        // Create quotations table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS quotations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                quote_number VARCHAR(100) UNIQUE NOT NULL,
                total DECIMAL(10, 2) NOT NULL,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
        console.log('✓ Quotations table created');
        
        // Create quotation_items table (junction table)
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS quotation_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                quotation_id INT NOT NULL,
                item_id INT,
                item_code VARCHAR(100),
                item_name VARCHAR(255),
                unit_price DECIMAL(10, 2),
                quantity INT NOT NULL,
                total DECIMAL(10, 2),
                found BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
            )
        `);
        console.log('✓ Quotation_items table created');

        // Create clients table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS clients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                line1 VARCHAR(255),
                line2 VARCHAR(255),
                line3 VARCHAR(255),
                line4 VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Clients table created');

        // Create invoices table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS invoices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                invoice_number VARCHAR(100) UNIQUE NOT NULL,
                invoice_date DATE NOT NULL,
                client_id INT,
                client_name VARCHAR(255) NOT NULL,
                client_line1 VARCHAR(255),
                client_line2 VARCHAR(255),
                client_line3 VARCHAR(255),
                client_line4 VARCHAR(255),
                po_ref VARCHAR(255),
                subtotal DECIMAL(10, 2) NOT NULL,
                discount_percent DECIMAL(5, 2) DEFAULT 0,
                total DECIMAL(10, 2) NOT NULL,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);
        console.log('✓ Invoices table created');

        // Create invoice_items table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS invoice_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                invoice_id INT NOT NULL,
                sn INT NOT NULL,
                designation VARCHAR(255) NOT NULL,
                quantity DECIMAL(10, 2) NOT NULL,
                unit VARCHAR(50),
                unit_price DECIMAL(10, 2) NOT NULL,
                total DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
            )
        `);
        console.log('✓ Invoice_items table created');
        
        // Insert sample items if empty
        const [items] = await pool.execute('SELECT COUNT(*) as count FROM items');
        if (items[0].count === 0) {
            const sampleItems = [
                ['11.01.01', 'Admiralty Anchor 50kg', 'Anchors & Mooring', 'PCS', 450.00, 'High quality admiralty anchor'],
                ['12.05.02', 'Nylon Mooring Rope 20mm', 'Ropes & Lines', 'MTR', 12.50, '20mm diameter nylon rope'],
                ['13.08.02', 'Cylindrical Fender 600mm', 'Fenders', 'PCS', 280.00, '600mm cylindrical boat fender'],
                ['21.03.01', 'Life Ring 400mm', 'Safety Equipment', 'PCS', 85.00, 'Orange life ring with rope'],
                ['25.12.02', 'Anti-Fouling Paint 5L', 'Paint & Coatings', 'LTR', 125.00, 'Marine anti-fouling paint']
            ];
            
            for (const item of sampleItems) {
                await pool.execute(
                    'INSERT INTO items (code, name, category, unit, price, description) VALUES (?, ?, ?, ?, ?, ?)',
                    item
                );
            }
            console.log('✓ Sample items inserted');
        }
        
        console.log('✓ Database initialization complete\n');
        
    } catch (error) {
        console.error('✗ Database initialization error:', error.message);
        process.exit(1);
    }
}

const userSchema = {
            name: String,
            email: String,
            password: String,
            role: String,
            created_at: Date,
            updated_at: Date
        };
        const clientSchema = {
            name: String,
            line1: String,
            line2: String,
            line3: String,
            line4: String,
            created_at: Date,
            updated_at: Date
        };

        const invoiceSchema = {
            invoice_number: String,
            invoice_date: Date,
            client_id: String,
            client_name: String,
            client_line1: String,
            client_line2: String,
            client_line3: String,
            client_line4: String,
            po_ref: String,
            subtotal: Number,
            discount_percent: Number,
            total: Number,
            created_by: String,
            created_at: Date
        };

        const invoiceItemSchema = {
            invoice_id: String,
            sn: Number,
            designation: String,
            quantity: Number,
            unit: String,
            unit_price: Number,
            total: Number
        };
        const itemsSchema = {
            code: String,
            name: String,
            category: String,
            unit: String,
            price: Number,
            flag: String,
            description: String,
            created_at: Date,
            updated_at: Date
        };

        const quotationSchema = {
            quote_number: String,
            total: Number,
            created_by: String,
            created_at: Date
        };

        const quotationItemSchema = {
            quotation_id: String,
            item_id: String,
            item_code: String,
            item_name: String,
            unit_price: Number,
            quantity: Number,
            total: Number,
            found: Boolean
        };

//initialize mongodb database and tables with the same structure of msql database
async function initializetMongoDatabase() {
    try {   

        

        await client.connect();
        const db = client.db('bissi_app');
        // Create collections if they don't exist
        await db.createCollection('users', { validator: { $jsonSchema: userSchema } });
        await db.createCollection('clients', { validator: { $jsonSchema: clientSchema } });
        await db.createCollection('invoices', { validator: { $jsonSchema: invoiceSchema } });
        await db.createCollection('invoice_items', { validator: { $jsonSchema: invoiceItemSchema } });
        await db.createCollection('items', { validator: { $jsonSchema: itemsSchema } });
        await db.createCollection('quotations', { validator: { $jsonSchema: quotationSchema } });
        await db.createCollection('quotation_items', { validator: { $jsonSchema: quotationItemSchema } });
        console.log('✓ MongoDB database and collections initialized');
    } catch (error) {
        console.error('✗ MongoDB initialization error:', error.message);
    } 
}

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check for demo account
        
            //const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
           try {
             await client.connect();
                const db = client.db('bissi_app');
                const collection = db.collection('users');
                    const mongoUser = await collection.findOne({ email: email });
                    if (!mongoUser) {
                        /*await collection.insertOne({
                            name: 'Super Admin',
                            email: email,
                            password: password,
                            role: 'admin',
                            created_at: new Date(),
                            updated_at: new Date()
                        });*/
                        return res.status(401).json({ success: false, message: 'Invalid credentials' });

                    }
                    if (mongoUser.password !== password) {
                        return res.status(401).json({ success: false, message: 'Invalid credentials' });
                    }
                    const user = {
                        id: mongoUser._id,
                        name: mongoUser.name,
                        email: mongoUser.email,
                        role: mongoUser.role
                    }
                    res.json({
                        success: true,
                        user: user
                    });
                    console.log('✓ User logged in:', email);
           } catch (error) {
            console.error('MongoDB login error:', error);
            res.status(500).json({ success: false, message: 'Mongo Db error' });
           }
           
           


            /*if (users.length === 0) {
                // Create demo user
                await pool.execute(
                    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                    ['Super Admin', email, password, 'admin']
                );
            }*/
        
        /*
        const [users] = await pool.execute(
            'SELECT * FROM users WHERE email = ? AND password = ?',
            [email, password]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
            console.log('✗ Login failed for email:', email);
        }
        
        const user = users[0];
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
        console.log('✓ User logged in:', email);*/
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        try{
        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('users');

        const existingUser = await collection.findOne({ email: email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        await collection.insertOne({
            name: name,
            email: email,
            password: password,
            role: role,
            created_at: new Date(),
            updated_at: new Date()
        });
        return res.json({ success: true, message: 'Account created successfully' });

        }catch(error){
            console.error('MongoDB register error:', error);
            res.status(500).json({ success: false, message: 'Mongo Db error' });
        }
        // Check if email exists
      /*  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        
        await pool.execute(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, password, role]
        );
        
        res.json({ success: true, message: 'Account created successfully' });*/
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== ITEM ROUTES ====================

// Get all items
app.get('/api/items', async (req, res) => {
    try {
        const { flag } = req.query;
       /* let sql = 'SELECT * FROM items';
        const params = [];
        
        if (flag) {
            sql += ' WHERE flag = ?';
            params.push(flag);
        }*/
        
        //sql += ' ORDER BY created_at DESC';
        try {
            await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('items');
        const items = await collection.find(flag ? { flag: flag } : {}).sort({ created_at: -1 }).toArray();
        //const [items] = await pool.execute(sql, params);
        res.json({ success: true, items });
        } catch (error) {
            console.error('Get items error:', error);
            res.status(500).json({ success: false, message: 'MongoDB error' });
        }
        
    } catch (error) {
        console.error('Get items error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get all available flags
app.get('/api/flags', async (req, res) => {
    try {
        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('items');
        const flags = await collection.distinct('flag');
        //const [flags] = await pool.execute('SELECT DISTINCT flag FROM items ORDER BY flag');
        //const flagList = flags.map(f => f.flag);
        res.json({ success: true, flags: flags });
    } catch (error) {
        console.error('Get flags error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Search items for autocompletion
app.get('/api/items/search', async (req, res) => {
    try {
        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('items');
        const { q } = req.query;

       // console.log('Search query:', q);
        if (!q || q.length < 2) {

            return res.json({ success: true, items: [] });
        }
        /*
        const sql = `
            SELECT id, code, name, category, unit, price, description 
            FROM items 
            WHERE code LIKE ? OR name LIKE ? OR category LIKE ?
            ORDER BY 
                CASE 
                    WHEN code LIKE ? THEN 1
                    WHEN name LIKE ? THEN 2
                    ELSE 3
                END,
                code, name
            LIMIT 20
        `;*/
        const searchTerm = `%${q}%`;
        const exactMatch = `${q}%`;
        const items = await collection.find({
            $or: [
                
                { name: { $regex: q, $options: 'i' } },
                { code: { $regex: q, $options: 'i' } },
                { category: { $regex: q, $options: 'i' } }
            ]        }).sort({ created_at: -1 }).limit(20).toArray();
       /* */
        //const [items] = await pool.execute(sql, [searchTerm, searchTerm, searchTerm, exactMatch, exactMatch]);
        //console.log('Search results:', items);
        res.json({ success: true, items });
    } catch (error) {
        console.error('Search items error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add new item
app.post('/api/items', async (req, res) => {
    try {
        const { code, name, category, unit, price, description, currency, flag } = req.body;
        
        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('items');
        const existing = await collection.findOne({ name: name, currency: currency });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Item with same name and currency already exists' });
        }
        
        await collection.insertOne({
            code,
            name,
            category,
            unit,
            price,
            description: description || '',
            currency: currency || 'EUR',
            flag: flag || 'general'
        });
        
        
        res.json({ success: true, message: 'Item added successfully' });
        
    } catch (error) {
        console.error('Add item error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Bulk import items from Excel
app.post('/api/items/bulk', async (req, res) => {
    try {
        const { items } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'No items provided' });
        }
        
        const results = {
            success: [],
            failed: [],
            duplicates: []
        };
        
        /*const impaPattern = /^(\d{2})\.(\d{2})\.(\d{2})$|^(\d{4})-(\d{2})-(\d{2})$/;
        */
        for (const item of items) {
            const code = item.code || item['Item Code'] || item['IMPA Code'] || item['Code']|| '';
            const name = item.name || item['Item Name'] || item['Name'] || item['Description'];
            const category = item.category || item['Category'] || 'Other';
            const unit = item.unit || item['Unit'] || 'PCS';
            const price = parseFloat(item.price || item['Price'] || item['Unit Price'] || 0);
            const description = item.description || item['Description'] || item['Remarks'] || '';
            const currency = item.currency || item['Currency'] || 'EUR';
            const flag = item.flag || item['Flag'] || 'general';
            // Validate IMPA code
            /*if (!code || !impaPattern.test(code)) {
                results.failed.push({ code, name, reason: 'Invalid IMPA code format' });
                continue;
            }*/

                await client.connect();
        const db = client.db('bissi_app');
            const collection = db.collection('items');
            const existing = await collection.findOne({ name: name, currency: currency });

            if(existing){
                results.duplicates.push({ code, name, reason: 'Item already exists' });
                continue;
            }
            // Check for duplicates
          //  const [existing] = await pool.execute('SELECT id FROM items WHERE name = ? AND currency = ?', [name, currency]);
            /*if (existing.length > 0) {
                results.duplicates.push({ code, name, reason: 'Item already exists' });
                continue;
            }*/
            
            // Insert item
            await collection.insertOne({
                code,
                name,
                category,
                unit,
                price,
                description: description || '',
                currency: currency || 'EUR',
                flag: flag || 'general'
            });
            
            results.success.push({ code, name });
        }
        
        res.json({ 
            success: true, 
            message: `Import complete: ${results.success.length} added, ${results.duplicates.length} duplicates, ${results.failed.length} failed`,
            results 
        });
        
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});

// Search IMPA code online (web scraping)
app.post('/api/impa/search', async (req, res) => {
    try {
        const { searchTerm } = req.body;
        
        if (!searchTerm) {
            return res.status(400).json({ success: false, message: 'Search term required' });
        }
        
        // Using local IMPA database (in production would scrape real IMPA guide)
        const impaData = getIMPAData(searchTerm);
        
        res.json({ success: true, results: impaData });
        
    } catch (error) {
        console.error('IMPA search error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper function to get IMPA data (simulated - in production would scrape real IMPA guide)
function getIMPAData(query) {
    const impaDatabase = [
        { code: '11.01.01', name: 'Admiralty Pattern Anchor - 10kg', category: 'Anchors & Mooring', unit: 'PCS', price: 180.00, description: 'High-grade cast iron admiralty anchor, 10kg weight' },
        { code: '11.01.02', name: 'Admiralty Pattern Anchor - 20kg', category: 'Anchors & Mooring', unit: 'PCS', price: 320.00, description: 'High-grade cast iron admiralty anchor, 20kg weight' },
        { code: '11.01.03', name: 'Admiralty Pattern Anchor - 30kg', category: 'Anchors & Mooring', unit: 'PCS', price: 450.00, description: 'High-grade cast iron admiralty anchor, 30kg weight' },
        { code: '11.01.04', name: 'Admiralty Pattern Anchor - 50kg', category: 'Anchors & Mooring', unit: 'PCS', price: 680.00, description: 'Heavy-duty admiralty anchor, 50kg weight' },
        { code: '12.05.01', name: 'Nylon Mooring Rope 12mm', category: 'Ropes & Lines', unit: 'MTR', price: 8.50, description: '12mm diameter twisted nylon rope, UV resistant' },
        { code: '12.05.02', name: 'Nylon Mooring Rope 16mm', category: 'Ropes & Lines', unit: 'MTR', price: 12.50, description: '16mm diameter twisted nylon rope, UV resistant' },
        { code: '12.05.03', name: 'Nylon Mooring Rope 20mm', category: 'Ropes & Lines', unit: 'MTR', price: 18.00, description: '20mm diameter twisted nylon rope, heavy duty' },
        { code: '13.08.01', name: 'Cylindrical Fender 400mm', category: 'Fenders', unit: 'PCS', price: 180.00, description: '400mm cylindrical boat fender, blue vinyl' },
        { code: '13.08.02', name: 'Cylindrical Fender 600mm', category: 'Fenders', unit: 'PCS', price: 280.00, description: '600mm cylindrical boat fender, blue vinyl' },
        { code: '13.08.03', name: 'Cylindrical Fender 800mm', category: 'Fenders', unit: 'PCS', price: 420.00, description: '800mm cylindrical boat fender, heavy duty' },
        { code: '21.03.01', name: 'Life Ring 400mm with rope', category: 'Safety Equipment', unit: 'PCS', price: 65.00, description: 'Orange life ring with 15m grab line' },
        { code: '21.03.02', name: 'Life Ring 450mm with rope', category: 'Safety Equipment', unit: 'PCS', price: 85.00, description: 'Orange life ring with 20m grab line' },
        { code: '21.05.01', name: 'Life Jacket Adult', category: 'Safety Equipment', unit: 'PCS', price: 120.00, description: 'SOLAS approved life jacket, adult size' },
        { code: '21.05.02', name: 'Life Jacket Child', category: 'Safety Equipment', unit: 'PCS', price: 85.00, description: 'SOLAS approved life jacket, child size' },
        { code: '25.12.01', name: 'Anti-Fouling Paint 2.5L', category: 'Paint & Coatings', unit: 'LTR', price: 85.00, description: 'Self-polishing anti-fouling paint, 2.5L tin' },
        { code: '25.12.02', name: 'Anti-Fouling Paint 5L', category: 'Paint & Coatings', unit: 'LTR', price: 145.00, description: 'Self-polishing anti-fouling paint, 5L tin' },
        { code: '25.15.01', name: 'Epoxy Primer 4L', category: 'Paint & Coatings', unit: 'LTR', price: 95.00, description: 'Two-component epoxy primer, 4L kit' },
        { code: '31.02.01', name: 'Stainless Steel Shackle', category: 'Hardware', unit: 'PCS', price: 12.00, description: 'A4 grade stainless steel bow shackle' },
        { code: '31.05.01', name: 'Turnbuckle 12mm', category: 'Hardware', unit: 'PCS', price: 18.00, description: 'Stainless steel turnbuckle, 12mm' },
        { code: '32.01.01', name: 'Ball Valve 1/2"', category: 'Plumbing', unit: 'PCS', price: 25.00, description: 'Brass ball valve, 1/2 inch, chrome plated' },
        { code: '32.01.02', name: 'Ball Valve 1"', category: 'Plumbing', unit: 'PCS', price: 45.00, description: 'Brass ball valve, 1 inch, chrome plated' },
        { code: '33.08.01', name: 'Navigation Light LED', category: 'Electrical', unit: 'PCS', price: 150.00, description: 'LED navigation light, 360 degree, IP67' },
        { code: '33.12.01', name: 'Marine Battery 12V', category: 'Electrical', unit: 'PCS', price: 280.00, description: 'Deep cycle marine battery, 12V 100Ah' },
        { code: '41.05.01', name: 'Deck Brush Set', category: 'Cleaning', unit: 'SET', price: 35.00, description: '3-piece deck brush set with handle' },
        { code: '41.08.01', name: 'Marine Cleaner 5L', category: 'Cleaning', unit: 'LTR', price: 45.00, description: 'Heavy-duty marine surface cleaner' },
    ];
    
    const queryLower = query.toLowerCase();
    return impaDatabase.filter(item => 
        item.code.toLowerCase().includes(queryLower) ||
        item.name.toLowerCase().includes(queryLower) ||
        item.category.toLowerCase().includes(queryLower)
    );
}

// Update item price
app.put('/api/items/:id/price', async (req, res) => {
    try {
        const { id } = req.params;
        const { price } = req.body;
        const { name } = req.body;
        const { code } = req.body;

          
        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('items');
            const existing = await collection.findOne({ _id: new ObjectId(id) });
            if (!existing) {
                return res.status(404).json({ success: false, message: 'Item not found' });
            }
            await collection.updateOne({ _id: new ObjectId(id) }, { $set: { price: price, name: name, code: code } });
/*
        await pool.execute('UPDATE items SET price = ?, name = ?, code = ? WHERE id = ?', [price, name, code, id]);*/
        
        res.json({ success: true, message: 'Item updated successfully' });
        
    } catch (error) {
        console.error('Update item error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== QUOTATION ROUTES ====================

// Get all quotations
app.get('/api/quotations', async (req, res) => {
    try {
        await client.connect();
        const db = client.db('bissi_app');
        const quotationsCollection = db.collection('quotations');
        const usersCollection = db.collection('users');
        const quotations = await quotationsCollection.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'created_by',
                    foreignField: '_id',
                    as: 'user'
                }
            }
        ]).toArray();
        res.json({ success: true, quotations });
    } catch (error) {
        console.error('Get quotations error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create quotation
app.post('/api/quotations', async (req, res) => {
    try {
        const { items, createdBy } = req.body;
        await client.connect();
        const db = client.db('bissi_app');
        const quotationsCollection = db.collection('quotations');
        const usersCollection = db.collection('users');
            // Generate quote number
        const count = await quotationsCollection.countDocuments();
        const quoteNumber = `QUOTE-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
        // Calculate total
        const total = items.reduce((sum, item) => sum + (item.total || 0), 0);
        const result = await quotationsCollection.insertOne({
            quote_number: quoteNumber,
            total: total,
            created_by: createdBy
        });
        // Insert quotation items
        const quotationId = result.insertedId;
        const quotationItemsCollection = db.collection('quotation_items');
        for (const item of items) {
            await quotationItemsCollection.insertOne({
                quotation_id: quotationId,
                item_id: item.id || null,
                item_code: item.code,
                item_name: item.name,
                unit_price: item.price,
                quantity: item.quantity,
                total: item.total,
                found: item.found
            });
        }

        // ... (rest of the code)
        res.json({ success: true, message: 'Quotation saved successfully', quoteNumber });
        // res.json({ success: true, quotations });
    } catch (error) {
        console.error('Get quotations error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
/*
// Create quotation
app.post('/api/quotations', async (req, res) => {
    try {
        const { items, createdBy } = req.body;
        
        // Generate quote number
        const [count] = await pool.execute('SELECT COUNT(*) as count FROM quotations');
        const quoteNumber = `QUOTE-${new Date().getFullYear()}-${String(count[0].count + 1).padStart(3, '0')}`;
        
        // Calculate total
        const total = items.reduce((sum, item) => sum + (item.total || 0), 0);
        
        // Insert quotation
        const [result] = await pool.execute(
            'INSERT INTO quotations (quote_number, total, created_by) VALUES (?, ?, ?)',
            [quoteNumber, total, createdBy]
        );
        
        const quotationId = result.insertId;
        
        // Insert quotation items
        for (const item of items) {
            await pool.execute(
                'INSERT INTO quotation_items (quotation_id, item_id, item_code, item_name, unit_price, quantity, total, found) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [quotationId, item.id || null, item.code, item.name, item.price, item.quantity, item.total, item.found]
            );
        }
        
        res.json({ success: true, message: 'Quotation saved successfully', quoteNumber });
        
    } catch (error) {
        console.error('Create quotation error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});*/

// Save or update client
app.post('/api/clients', async (req, res) => {
    try {
        const { id, name, line1, line2, line3, line4 } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Client name is required' });
        }

        await client.connect();
            const db = client.db('bissi_app');
            const collection = db.collection('clients');
        if (id) {
            
            await collection.updateOne({ _id: new ObjectId(id) }, { $set: { name, line1: line1 || '', line2: line2 || '', line3: line3 || '', line4: line4 || '' } });

            /*await pool.execute(
                'UPDATE clients SET name = ?, line1 = ?, line2 = ?, line3 = ?, line4 = ? WHERE id = ?',
                [name, line1 || '', line2 || '', line3 || '', line4 || '', id]
            );*/
            return res.json({ success: true, client: { id, name, line1, line2, line3, line4 } });
        }
       const result =  await collection.insertOne({
            name,
            line1: line1 || '',
            line2: line2 || '',
            line3: line3 || '',
            line4: line4 || ''
        });

        res.json({ success: true, client: { id: result.insertedId, name, line1, line2, line3, line4 } });
       /* const [result] = await pool.execute(
            'INSERT INTO clients (name, line1, line2, line3, line4) VALUES (?, ?, ?, ?, ?)',
            [name, line1 || '', line2 || '', line3 || '', line4 || '']
        );*/
        /*res.json({ success: true, client: { id: result.insertId, name, line1, line2, line3, line4 } });*/
    } catch (error) {
        console.error('Save client error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Search clients by name or address
app.get('/api/clients/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.json({ success: true, clients: [] });
        }

        const searchValue = `%${query}%`;
        /*const [clients] = await pool.execute(
            'SELECT * FROM clients WHERE name LIKE ? OR line1 LIKE ? OR line2 LIKE ? OR line3 LIKE ? OR line4 LIKE ? ORDER BY updated_at DESC LIMIT 10',
            [searchValue, searchValue, searchValue, searchValue, searchValue]
        );*/
        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('clients');
        const mongoClients = await collection.find({
            $or: [
                { name: { $regex: searchValue, $options: 'i' } },
                { line1: { $regex: searchValue, $options: 'i' } },
                { line2: { $regex: searchValue, $options: 'i' } },
                { line3: { $regex: searchValue, $options: 'i' } },
                { line4: { $regex: searchValue, $options: 'i' } }

            ]
        }).toArray();

        console.log('Client search for query:', query, 'found:', mongoClients.length);

        res.json({ success: true, clients: mongoClients });
    } catch (error) {
        console.error('Client search error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get next invoice number for current month and year
app.get('/api/invoices/next-number', async (req, res) => {
    try {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const searchPattern = `%/${month}/${year}`;
/*
        const [rows] = await pool.execute(
            'SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1',
            [searchPattern]
        );*/

        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('invoices');
        const mongoInvoice = await collection.find({ invoice_number: { $regex: searchPattern } }).sort({ _id: -1 }).limit(1).toArray();


        let nextIndex = 1;
        if(mongoInvoice.length > 0){
            const lastNumber = mongoInvoice[0].invoice_number.split('/')[0];
            nextIndex = parseInt(lastNumber,10) + 1;
        }
        /*if (rows.length > 0) {
            const lastNumber = rows[0].invoice_number.split('/')[0];
            nextIndex = parseInt(lastNumber, 10) + 1;
        }*/

        const invoiceNumber = `${String(nextIndex).padStart(3, '0')}/${month}/${year}`;
        res.json({ success: true, invoiceNumber });
    } catch (error) {
        console.error('Invoice number error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// List invoices and support search
app.get('/api/invoices', async (req, res) => {
    try {
        const { query } = req.query;
        let sql = 'SELECT id, invoice_number, invoice_date, client_name, subtotal, discount_percent, total, po_ref FROM invoices';
        const params = [];

        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('invoices');
        /*
        if (query) {
            const searchValue = `%${query}%`;
            sql += ' WHERE invoice_number LIKE ? OR client_name LIKE ?';
            params.push(searchValue, searchValue);
        }

        sql += ' ORDER BY id DESC LIMIT 200';
        const [invoices] = await pool.execute(sql, params);*/
        const mongoInvoices = await collection.find(query ? {
            $or: [
                { invoice_number: { $regex: `%${query}%`, $options: 'i' } },
                { client_name: { $regex: `%${query}%`, $options: 'i' } }
            ]
        } : {}).sort({ _id: -1 }).limit(200).toArray();
        res.json({ success: true, invoices: mongoInvoices });
    } catch (error) {
        console.error('Invoice list error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get invoice details by ID
app.get('/api/invoices/:id', async (req, res) => {
    try {
        const invoiceId = req.params.id;
        /*const [invoices] = await pool.execute(
            'SELECT * FROM invoices WHERE id = ?',


            [invoiceId]
        );*/

       // console.log('Fetching items for invoice ID:', invoiceId);
        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('invoices');
            const mongoInvoice = await collection.find({ _id: new ObjectId(invoiceId) }).toArray();
            if(mongoInvoice.length === 0){
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            }

       /* if (invoices.length === 0) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }*/

        /*const [items] = await pool.execute(
            'SELECT sn, designation, quantity, unit, unit_price, total FROM invoice_items WHERE invoice_id = ? ORDER BY sn',
            [invoiceId]
        );*/

        
        const items = await db.collection('invoice_items').find({ invoice_id: new ObjectId(invoiceId) }).sort({ sn: 1 }).toArray();
        const invoice = mongoInvoice[0];
        invoice.id = invoice._id.toString();
        //console.log({invoice, items});
        res.json({ success: true, invoice, items });
    } catch (error) {
        console.error('Invoice detail error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create invoice
app.post('/api/invoices', async (req, res) => {
    try {
        const { invoiceNumber, invoiceDate, clientId, clientName, clientLine1, clientLine2, clientLine3, clientLine4, discountPercent, items, poRef } = req.body;
        if (!invoiceNumber || !invoiceDate || !clientName || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Missing invoice data' });
        }

        const subTotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
        const total = parseFloat((subTotal - subTotal * ((discountPercent || 0) / 100)).toFixed(2));
        
        // Handle createdBy - convert to integer or null
        let createdBy = null;
        if (req.body.createdBy) {
            const parsed = parseInt(req.body.createdBy, 10);
            createdBy = isNaN(parsed) ? null : parsed;
        }

        /*const [result] = await pool.execute(
            'INSERT INTO invoices (invoice_number, invoice_date, client_id, client_name, client_line1, client_line2, client_line3, client_line4, subtotal, discount_percent, total, created_by, po_ref, invoice_currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [invoiceNumber, invoiceDate, clientId || null, clientName, clientLine1 || '', clientLine2 || '', clientLine3 || '', clientLine4 || '', subTotal, discountPercent || 0, total, createdBy, poRef || '', req.body.invoiceCurrency || 'EUR']
        );*/

        await client.connect();
        const db = client.db('bissi_app');
        const collection = db.collection('invoice_items');
        const result = await db.collection('invoices').insertOne({
            invoice_number: invoiceNumber,
            invoice_date: invoiceDate,
            client_id: clientId ? new ObjectId(clientId) : null,
            client_name: clientName,
            client_line1: clientLine1 || '',
            client_line2: clientLine2 || '',
            client_line3: clientLine3 || '',
            client_line4: clientLine4 || '',
            subtotal: subTotal,
            discount_percent: discountPercent || 0,
            total: total,
            created_by: createdBy,
            po_ref: poRef || '',
            invoice_currency: req.body.invoiceCurrency || 'EUR'
        });
        const invoiceId = result.insertedId;

      //  const invoiceId = result.insertId;
        for (const item of items) {
            /*await pool.execute(
                'INSERT INTO invoice_items (invoice_id, sn, designation, quantity, unit, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [invoiceId, item.sn, item.designation, item.quantity, item.unit, item.unitPrice, item.total]
            );*/
            await collection.insertOne({
                invoice_id: invoiceId,
                sn: item.sn,
                designation: item.designation,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unitPrice,
                total: item.total
            });

        }

        res.json({ success: true, message: 'Invoice saved successfully', invoiceNumber });
       // res.json({ success: true, message: 'Invoice saved successfully', invoiceNumber });
    } catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== DASHBOARD STATS ====================

app.get('/api/stats', async (req, res) => {
    try {
       /* 
        const [itemsCount] = await pool.execute('SELECT COUNT(*) as count FROM items');
        const [quotesCount] = await pool.execute('SELECT COUNT(*) as count FROM quotations');
        const [usersCount] = await pool.execute('SELECT COUNT(*) as count FROM users');
        const [totalValue] = await pool.execute('SELECT SUM(price) as total FROM items');*/
        await client.connect();

        const db = client.db('bissi_app');
            const itemsCount = await db.collection('items').countDocuments();
        const quotesCount = await db.collection('quotations').countDocuments();
        const usersCount = await db.collection('users').countDocuments();
        const totalValueAgg = await db.collection('items').aggregate([
            { $group: { _id: null, total: { $sum: '$price' } } }
        ]).toArray();
        const totalValue = totalValueAgg[0] ? totalValueAgg[0].total : 0;

        res.json({
            success: true,
                stats: {
                totalItems: itemsCount,
                totalQuotes: quotesCount,
                totalUsers: usersCount || 1,
                totalValue: totalValue || 0
            }
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== PDF IMPORT ROUTES ====================

// Header detection patterns - priority order
const HEADER_PATTERNS = {
    description: /description|designation|item\s+description|item\s+name|product|article|descr/i,
    quantity: /quantity|qty|amount|pieces?|nos?|number\s+of/i,
    unit: /unit|uom|measure|pack|pcs|pieces/i,
    price: /price|rate|unit\s*price|u\.price|amount|total|value/i
};

/**
 * Detect if PDF is a scanned document (image-based) vs text-based
 * Scanned documents often have: poor text extraction, many special characters, fragmented lines
 */
function detectScannedDocument(text) {
    const lines = text.split('\n').filter(l => l.trim());
    
    // Calculate text quality metrics
    const totalChars = text.length;
    const alphanumericChars = text.replace(/[^a-zA-Z0-9]/g, '').length;
    const ratio = totalChars > 0 ? alphanumericChars / totalChars : 0;
    
    // Check for common scanned document indicators
    const hasManySpecialChars = (text.match(/[^\x00-\x7F]/g) || []).length > totalChars * 0.1;
    const hasFragmentedLines = lines.filter(l => l.length < 10).length > lines.length * 0.5;
    const hasLowWordCount = lines.filter(l => l.split(/\s/).length < 3).length > lines.length * 0.6;
    
    // Calculate confidence score
    let scannedScore = 0;
    if (ratio < 0.5) scannedScore += 30;
    if (hasManySpecialChars) scannedScore += 25;
    if (hasFragmentedLines) scannedScore += 25;
    if (hasLowWordCount) scannedScore += 20;
    
    return {
        isScanned: scannedScore >= 50,
        confidence: Math.min(scannedScore, 100),
        indicators: {
            lowTextQuality: ratio < 0.5,
            manySpecialChars : hasManySpecialChars,
            fragmentedLines : hasFragmentedLines,
            lowWordCount: hasLowWordCount
        },
        textQuality: ratio
    };
}

/**
 * Detect table headers from PDF text and map to standard fields
 */
function detectHeadersAndMapRows(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    // First detect if document is scanned
    const scanResult = detectScannedDocument(text);
    console.log('Document scan analysis:', scanResult);
    
    // Find header row
    let headerRow = null;
    let headerStartIndex = 0;
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        let matches = 0;
        for(const word of lines[i].split(/\s{1,}|\t/)) {
         //console.log(`Checking header candidate: "${word}" against patterns`);
         Object.keys(HEADER_PATTERNS).forEach(field => {   
            const pattern = HEADER_PATTERNS[field];
            //console.log(`Testing pattern for field "${field}":`, pattern);
             if (pattern.test(word.toLowerCase())) {
                matches++;
                console.log(`Matched header pattern for field "${field}" in word "${word}"`);
             }
         })
        }
    
        
        if (matches >= 2) { // At least 2 fields matched = likely header
            headerRow = lines[i];
            headerStartIndex = i + 1;
            break;
        }
        }
    
    
    // Map columns based on header positions
    const columnMap = {};
    if (headerRow) {
        const headers = headerRow.split(/\s{2,}|\t/).filter(h => h.trim());
        headers.forEach((header, index) => {
            const lower = header.toLowerCase();
            for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
                if (pattern.test(lower)) {
                    columnMap[field] = index;
                }
            }
        });
    }
    
    // Parse data rows - skip merged cells and invalid rows
    const items = [];
    const dataRows = lines.slice(headerStartIndex);
    
    for (const row of dataRows) {
        // Skip empty or very short lines (likely merged cell artifacts)
        if (!row || row.length < 3) continue;
        
        // Skip lines that are likely headers or separators
        const lowerRow = row.toLowerCase();
        if (/^(item|description|qty|quantity|price|unit|total|subtotal|grand|page)/.test(lowerRow)) continue;
        
        const cells = row.split(/\s{2,}|\t/).filter(c => c.trim());
        
        // Skip rows with too few or too many cells (merged cell issues)
        if (cells.length < 2 || cells.length > 8) continue;
        
        const item = {
            description: '',
            quantity: 1,
            unit: 'PCS',
            price: 0
        };
        
        // Map cells to fields based on column positions
        if (columnMap.description !== undefined && cells[columnMap.description]) {
            item.description = cells[columnMap.description].trim();
        }
        if (columnMap.quantity !== undefined && cells[columnMap.quantity]) {
            item.quantity = parseInt(cells[columnMap.quantity].replace(/[^\d]/g, '')) || 1;
        }
        if (columnMap.unit !== undefined && cells[columnMap.unit]) {
            item.unit = cells[columnMap.unit].trim().toUpperCase() || 'PCS';
        }
        if (columnMap.price !== undefined && cells[columnMap.price]) {
            item.price = parseFloat(cells[columnMap.price].replace(/[$,]/g, '')) || 0;
        }
        
        // Fallback: heuristic detection if no clear headers
        if (!item.description && cells[0]) {
            item.description = cells[0].trim();
            if (cells.length > 1) {
                item.quantity = parseInt(cells[1].replace(/[^\d]/g, '')) || 1;
            }
            if (cells.length > 2) {
                item.unit = cells[2].toUpperCase() || 'PCS';
            }
            if (cells.length > 3) {
                item.price = parseFloat(cells[3].replace(/[$,]/g, '')) || 0;
            }
        }
        
        // Only add valid items with description and price
        if (item.description && item.description.length > 2) {
            items.push(item);
        }
    }
    
    // Limit items to prevent "quantity too large" error
    const maxItems = 200;
    const limitedItems = items.slice(0, maxItems);
    const skippedCount = items.length - maxItems;
    
    return { 
        items: limitedItems, 
        totalFound: items.length,
        skipped: skippedCount
    };
}

// Import PDF
app.post('/api/import/pdf', async (req, res) => {
    try {
        const { filePath, base64 } = req.body;
        
        let pdfBuffer;
        if (base64) {
            pdfBuffer = Buffer.from(base64, 'base64');
        } else if (filePath) {
            pdfBuffer = fs.readFileSync(filePath);
        } else {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }
        //CanvasFactory.setCanvasFactory(new NodeCanvasFactory());

        const pdfParser = new PDFParse({url: filePath, data: pdfBuffer, CanvasFactory: CanvasFactory });
        const rest = await pdfParser.getText();
        const text = rest.text;
       /* const table = (await pdfParser.getTable()).pages[0].tables[0];
       for(const row of table) {
            text += row.join(' ') + '\n';
        }*/
       // console.log('Extracted text from PDF:\n', text);

        
        // Detect if scanned document
        const scanAnalysis = detectScannedDocument(text);
        
        // Extract items using header detection
        const result = detectHeadersAndMapRows(text);
        const items = result.items;
        
        if (items.length === 0) {
            // Provide detailed feedback for scanned documents
            if (scanAnalysis.isScanned) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Scanned PDF detected. Text extraction may be limited. Try using a text-based PDF or OCR-processed document.',
                    isScanned: true,
                    scanAnalysis: scanAnalysis
                });
            }
            return res.status(400).json({ 
                success: false, 
                message: 'No tabular data found in PDF. Ensure the PDF contains a table with Item Description, Quantity, Unit, and Price columns.',
                isScanned: false
            });
        }
        
        // Build message with skipped info
        let message = `Extracted ${items.length} items from PDF`;
        if (result.skipped > 0) {
            message += ` (${result.skipped} additional rows skipped)`;
        }
        if (scanAnalysis.isScanned) {
            message += ' - scanned document';
        }
        
        res.json({ 
            success: true, 
            message: message,
            items: items,
            totalFound: result.totalFound,
            isScanned: scanAnalysis.isScanned,
            scanAnalysis: scanAnalysis
        });
        
    } catch (error) {
        console.error('PDF import error:', error);
        res.status(500).json({ success: false, message: 'Failed to parse PDF: ' + error.message });
    }
});

// ==================== OCR IMPORT ROUTES (Tesseract.js) ====================

/**
 * Process image/PDF with OCR using Tesseract.js
 * For scanned documents and images containing text
 */
app.post('/api/import/ocr', async (req, res) => {
    try {
        const {fileURLToPath, base64, fileType, language = 'eng' } = req.body;
        
        if (!base64) {
            return res.status(400).json({ success: false, message: 'No file data provided' });
        }
        
        console.log('Starting OCR processing...');
        
        // Determine MIME type from base64 or provided fileType
        let mimeType = fileType || 'image/png';
        if (base64.startsWith('/9j/')) mimeType = 'image/jpeg';
        else if (base64.startsWith('iVBOR')) mimeType = 'image/png';
        else if (base64.startsWith('JVBER')) mimeType = 'application/pdf';
        
        // Create data URL
      /*  const imageBuffer = Buffer.from(base64, 'base64');

        const worker = createWorker('eng');


    console.log("Recognizing...");
     const result = await worker.recognize(fileURLToPath)
    console.log("Recognized text:", result.data.text);
    await worker.terminate();*/

    
       
        const dataUrl = `data:${mimeType};base64,${base64}`;
        // 1. Remove the metadata header (e.g., "data:image/png;base64,")
    //const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    
    // 2. Define a temp file path
    const tempPath = path.join(__dirname, `temp_${Date.now()}.png`);

    // 3. Write the buffer to disk
    
        fs.writeFileSync(tempPath, base64, { encoding: 'base64' });
        const result = await Tesseract.recognize(tempPath, language, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

         // 5. Clean up the temp file
        fs.unlinkSync(tempPath);
   

        //const base64Image = dataUrl.split(';base64,').pop();
        
        /*
        // Perform OCR with Tesseract
        const result = await Tesseract.recognize(imageBuffer, language, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });*/
        
        const extractedText = result.data.text;
        console.log('OCR completed. Extracted text :', extractedText);
        
        // Analyze the extracted text
        const scanAnalysis = detectScannedDocument(extractedText);
        
        // Parse the OCR text into items
        const parseResult = detectHeadersAndMapRows(extractedText);
        const items = parseResult.items;
        
        if (items.length === 0) {
            return res.json({
                success: true,
                message: 'OCR completed but no tabular data found',
                extractedText: extractedText.substring(0, 2000), // First 2000 chars
                items: [],
                totalFound: 0,
                isScanned: true,
                ocrPerformed: true,
                scanAnalysis: scanAnalysis
            });
        }
        
        let message = `OCR extracted ${items.length} items from scanned document`;
        if (parseResult.skipped > 0) {
            message += ` (${parseResult.skipped} additional rows skipped)`;
        }
        
        res.json({
            success: true,
            message: message,
            items: items,
            totalFound: parseResult.totalFound,
            isScanned: true,
            ocrPerformed: true,
            scanAnalysis: scanAnalysis,
            confidence: result.data.confidence
        });
        
    } catch (error) {
        console.error('OCR import error:', error);
        res.status(500).json({ success: false, message: 'Failed to process OCR: ' + error.message });
    }
});

/**
 * Detect if document needs OCR (for scanned/image-based PDFs)
 */
app.post('/api/analyze/document', async (req, res) => {
    try {
        const { base64, fileType } = req.body;
        
        if (!base64) {
            return res.status(400).json({ success: false, message: 'No file data provided' });
        }
        
        // Determine file type
        let mimeType = fileType || 'image/png';
        if (base64.startsWith('/9j/')) mimeType = 'image/jpeg';
        else if (base64.startsWith('iVBOR')) mimeType = 'image/png';
        else if (base64.startsWith('JVBER')) mimeType = 'application/pdf';
        
        const isImage = mimeType.startsWith('image/');
        const isPdf = mimeType === 'application/pdf';
        
        // For images, we need OCR
        // For PDFs, we'll do a quick text extraction test
        let needsOcr = isImage;
        
        if (isPdf) {
            try {
                const pdfBuffer = Buffer.from(base64, 'base64');
                const pdfParser = new PDFParse({ data: pdfBuffer,CanvasFactory: CanvasFactory });
                const pdfResult = await pdfParser.getText();
                const text = pdfResult.text;
                
                // Test if text extraction is poor
                const scanAnalysis = detectScannedDocument(text);
                needsOcr = scanAnalysis.isScanned || text.trim().length < 100;
            } catch (e) {
                needsOcr = true; // Assume scanned if parsing fails
            }
        }
        
        res.json({
            success: true,
            needsOcr: needsOcr,
            fileType: mimeType,
            recommendation: needsOcr 
                ? 'Use OCR endpoint (/api/import/ocr) for this document'
                : 'Use standard PDF endpoint (/api/import/pdf) for this document'
        });
        
    } catch (error) {
        console.error('Document analysis error:', error);
        res.status(500).json({ success: false, message: 'Failed to analyze document: ' + error.message });
    }
});

// Import invoice from Excel
app.post('/api/invoices/import', async (req, res) => {
    try {
        const { base64 } = req.body;
        
        if (!base64) {
            return res.status(400).json({ success: false, message: 'No Excel file data provided' });
        }
        
        const XLSX = require('xlsx');
        const buffer = Buffer.from(base64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        
        // Assume first sheet contains invoice data
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
            return res.status(400).json({ success: false, message: 'Excel file must contain at least a header row and one data row' });
        }
        
        // Expected columns: Item Designation, Quantity, Unit, Unit Price
        const headers = jsonData[0].map(h => h ? h.toString().toLowerCase().trim() : '');
        const requiredColumns = ['designation', 'quantity', 'unit', 'price'];
        
        // Find column indices
        const columnIndices = {};
        requiredColumns.forEach(col => {
            const index = headers.findIndex(h => 
                h.includes(col) || 
                (col === 'designation' && (h.includes('item') || h.includes('name'))) ||
                (col === 'price' && (h.includes('unit price') || h.includes('u.price')))
            );
            if (index !== -1) {
                columnIndices[col] = index;
            }
        });
        
        // Check if all required columns are found
        const missingColumns = requiredColumns.filter(col => !(col in columnIndices));
        if (missingColumns.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Missing required columns: ${missingColumns.join(', ')}. Expected: Item Designation, Quantity, Unit, Unit Price` 
            });
        }
        
        // Parse invoice items
        const items = [];
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;
            
            const designation = row[columnIndices.designation] ? row[columnIndices.designation].toString().trim() : '';
            const quantity = parseFloat(row[columnIndices.quantity]) || 0;
            const unit = row[columnIndices.unit] ? row[columnIndices.unit].toString().trim() : '';
            const unitPrice = parseFloat(row[columnIndices.price]) || 0;
            
            if (designation && quantity > 0) {
                items.push({
                    designation,
                    quantity,
                    unit,
                    unitPrice,
                    total: (quantity * unitPrice).toFixed(2)
                });
            }
        }
        
        if (items.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid invoice items found in Excel file' });
        }
        
        res.json({
            success: true,
            message: `Successfully imported ${items.length} invoice items from Excel`,
            items: items
        });
        
    } catch (error) {
        console.error('Excel import error:', error);
        res.status(500).json({ success: false, message: 'Failed to import Excel file: ' + error.message });
    }
});

// Export invoice to Excel
app.get('/api/invoices/:id/export', async (req, res) => {
    try {
        const { id } = req.params;
        const XLSX = require('xlsx');
        
       /* // Get invoice details
        const [invoiceRows] = await pool.execute(`
            SELECT i.*, c.name as client_name, c.line1, c.line2, c.line3, c.line4
            FROM invoices i
            LEFT JOIN clients c ON i.client_id = c.id
            WHERE i.id = ?
        `, [id]);*/

        await client.connect();
        const db = client.db('bissi_app');
        const invoiceData = await db.collection('invoices').find({ _id: new ObjectId(id) }).toArray();
        if(invoiceData.length === 0){
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        
        
        const invoice = invoiceData[0];
        
        // Get invoice items
      /*  const [itemRows] = await pool.execute(`
            SELECT designation, quantity, unit, unit_price as unitPrice, total
            FROM invoice_items
            WHERE invoice_id = ?
            ORDER BY id
        `, [id]);*/

        const itemsRows = await db.collection('invoice_items').find({ invoice_id: new ObjectId(id) }).sort({ sn: 1 }).toArray();
        
        // Create Excel workbook
        const workbook = XLSX.utils.book_new();
        
        // Combine all data into single sheet
        const allData = [
            ['Invoice Information'],
            ['Invoice Number', invoice.invoice_number],
            ['Invoice Date', invoice.invoice_date],
            ['Client Name', invoice.client_name || invoice.client_name],
            ['Client Address', invoice.client_line1 || ''],
            ['', invoice.client_line2 || ''],
            ['', invoice.client_line3 || ''],
            ['', invoice.client_line4 || ''],
            [],
            ['S/N', 'Item Designation', 'Quantity', 'Unit', 'Unit Price', 'Total']
        ];
        
        itemsRows.forEach((item, index) => {
            allData.push([
                index + 1,
                item.designation,
                item.quantity,
                item.unit,
                parseFloat(item.unitPrice).toFixed(2),
                parseFloat(item.total).toFixed(2)
            ]);
        });
        
        // Add summary after items
        allData.push([]);
        allData.push(['', '', '', '', 'Subtotal', parseFloat(invoice.subtotal).toFixed(2)]);
        allData.push(['', '', '', '', 'Discount %', parseFloat(invoice.discount_percent).toFixed(2)]);
        allData.push(['', '', '', '', 'Total', parseFloat(invoice.total).toFixed(2)]);
        
        const sheet = XLSX.utils.aoa_to_sheet(allData);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Invoice');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice_${invoice.invoice_number}.xlsx"`);
        
        res.send(excelBuffer);
        
    } catch (error) {
        console.error('Excel export error:', error);
        res.status(500).json({ success: false, message: 'Failed to export invoice: ' + error.message });
    }
});

app.get('/api/test', async (req, res) => {
    res.json({ success: true, message: 'API is working' });
});

// ==================== START SERVER ====================

async function startServer() {
    await initializetMongoDatabase();
  
    app.listen(PORT, () => {
        console.log(`========================================`);
        console.log(`  BISSI APP Server Running`);
        console.log(`  http://localhost:${PORT}`);
        console.log(`========================================\n`);
    });
}

startServer();