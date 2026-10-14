const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

// Prisma Connection Pooling Fix: Ensure stable serverless DB access on Vercel
// Requires ?pgbouncer=true&statement_cache_size=0 in DATABASE_URL

const productRoutes = require('./api/productRoutes');
const orderRoutes = require('./api/orderRoutes');
const customerRoutes = require('./api/customerRoutes');
const reportRoutes = require('./api/reportRoutes');
const expenseRoutes = require('./api/expenseRoutes');
const authRoutes = require('./api/authRoutes');
const categoryRoutes = require('./api/categoryRoutes');
const expenseCategoryRoutes = require('./api/expenseCategoryRoutes');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('dev'));

const syncRoutes = require('./api/syncRoutes');
const inventoryRoutes = require('./api/inventoryRoutes');
const purchaseRoutes = require('./api/purchaseRoutes');
const supplierRoutes = require('./api/supplierRoutes');
const purchaseOrderRoutes = require('./api/purchaseOrderRoutes');

// Routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/expense-categories', expenseCategoryRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales-returns', require('./api/salesReturnRoutes'));
app.use('/api/purchase-returns', require('./api/purchaseReturnRoutes'));
app.use('/api/licenses', require('./api/licenseRoutes'));
app.use('/api/devices', require('./api/deviceRoutes'));
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/ap', require('./api/apRoutes'));

// Health Checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'POS Billing System API is running' });
});

// Emergency DB Recovery Sync Endpoint
app.post('/api/recovery/restore', async (req, res) => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { data } = req.body;
  
  if (!data) {
    return res.status(400).json({ error: 'No backup data provided' });
  }
  
  console.log('--- EMERGENCY DB RECOVERY INITIALIZED ---');
  try {
    let categoryMap = {};
    
    // 1. Restore Categories
    if (data.categories) {
      console.log(`Restoring ${data.categories.length} categories...`);
      for (const cat of data.categories) {
        const restored = await prisma.category.upsert({
          where: { name: cat.name },
          update: {},
          create: { id: cat.id, name: cat.name }
        });
        categoryMap[cat.id] = restored.id;
      }
    }
    
    // 2. Restore Products
    if (data.products) {
      console.log(`Restoring ${data.products.length} products...`);
      for (const prod of data.products) {
        const { orderItems, purchaseItems, salesReturnItems, purchaseReturnItems, inventoryLogs, purchaseOrderItems, category, ...prodClean } = prod;
        if (prodClean.categoryId) {
          prodClean.categoryId = categoryMap[prodClean.categoryId] || prodClean.categoryId;
        }
        await prisma.product.upsert({
          where: { id: prodClean.id },
          update: prodClean,
          create: prodClean
        });
      }
    }
    
    // 3. Restore Customers
    let customerMap = {};
    if (data.customers) {
      console.log(`Restoring ${data.customers.length} customers...`);
      for (const cust of data.customers) {
        const { orders, salesReturns, ...custClean } = cust;
        
        let existing = null;
        if (custClean.phone) {
          existing = await prisma.customer.findUnique({
            where: { phone: custClean.phone }
          });
        }
        
        if (existing) {
          customerMap[custClean.id] = existing.id;
          await prisma.customer.update({
            where: { id: existing.id },
            data: custClean
          });
        } else {
          const restored = await prisma.customer.upsert({
            where: { id: custClean.id },
            update: custClean,
            create: custClean
          });
          customerMap[custClean.id] = restored.id;
        }
      }
    }
    
    // 4. Restore Orders
    if (data.orders) {
      console.log(`Restoring ${data.orders.length} orders...`);
      for (const ord of data.orders) {
        let resolvedCustomerId = ord.customerId ? (customerMap[ord.customerId] || ord.customerId) : null;
        
        if (resolvedCustomerId) {
          const customerExists = await prisma.customer.findUnique({
            where: { id: resolvedCustomerId }
          });
          if (!customerExists) {
            console.log(`⚠️ Customer ID ${resolvedCustomerId} not found in DB. Setting customerId to null for Order #${ord.invoiceNo}.`);
            resolvedCustomerId = null;
          }
        }
        
        const cleanOrder = {
          id: ord.id,
          invoiceNo: ord.invoiceNo,
          customerId: resolvedCustomerId,
          subtotal: parseFloat(ord.subtotal) || 0,
          discount: parseFloat(ord.discount) || 0,
          taxTotal: parseFloat(ord.taxTotal) || 0,
          grandTotal: parseFloat(ord.grandTotal) || 0,
          savings: parseFloat(ord.savings) || 0,
          roundedTotal: parseFloat(ord.roundedTotal) || parseFloat(ord.grandTotal) || 0,
          amountPaid: parseFloat(ord.amountPaid) || 0,
          balance: parseFloat(ord.balance) || 0,
          loyaltyPointsEarned: parseInt(ord.loyaltyPointsEarned) || 0,
          loyaltyPointsRedeemed: parseInt(ord.loyaltyPointsRedeemed) || 0,
          paymentMode: ord.paymentMode,
          orderType: ord.orderType || 'Walk-in',
          status: ord.status || 'COMPLETED',
          isSynced: ord.isSynced !== undefined ? ord.isSynced : true,
          serverId: ord.serverId || null,
          createdAt: ord.createdAt ? new Date(ord.createdAt) : new Date(),
          updatedAt: ord.updatedAt ? new Date(ord.updatedAt) : new Date(),
          creatorId: ord.creatorId || null,
        };

        await prisma.order.upsert({
          where: { id: cleanOrder.id },
          update: cleanOrder,
          create: cleanOrder
        });
        
        if (ord.orderItems && ord.orderItems.length > 0) {
          for (const item of ord.orderItems) {
            const cleanOrderItem = {
              id: item.id,
              orderId: item.orderId || ord.id,
              productId: item.productId || item.id,
              quantity: parseFloat(item.quantity) || 0,
              price: parseFloat(item.price) || 0,
              mrp: parseFloat(item.mrp) || 0,
              discount: parseFloat(item.discount) || 0,
              taxAmount: parseFloat(item.taxAmount) || 0,
              total: parseFloat(item.total) || 0
            };
            
            // Satisfy foreign key constraint if product is missing
            const productExists = await prisma.product.findUnique({
              where: { id: cleanOrderItem.productId }
            });
            
            if (!productExists) {
              console.log(`⚠️ Product ID ${cleanOrderItem.productId} not found in DB. Creating placeholder product.`);
              await prisma.product.create({
                data: {
                  id: cleanOrderItem.productId,
                  name: `Deleted Product (${cleanOrderItem.productId.substring(0, 8)})`,
                  purchasePrice: 0,
                  sellingPrice: cleanOrderItem.price,
                  stockQuantity: 0,
                  unit: 'pcs',
                  is_active: false
                }
              });
            }
            
            await prisma.orderItem.upsert({
              where: { id: cleanOrderItem.id },
              update: cleanOrderItem,
              create: cleanOrderItem
            });
          }
        }
        
        if (ord.payments && ord.payments.length > 0) {
          for (const pay of ord.payments) {
            const cleanPayment = {
              id: pay.id,
              orderId: pay.orderId || ord.id,
              method: pay.method,
              amount: parseFloat(pay.amount) || 0,
              transactionId: pay.transactionId || null,
              status: pay.status || 'SUCCESS',
              createdAt: pay.createdAt ? new Date(pay.createdAt) : new Date()
            };
            
            await prisma.payment.upsert({
              where: { id: cleanPayment.id },
              update: cleanPayment,
              create: cleanPayment
            });
          }
        }
      }
    }
    
    console.log('--- EMERGENCY DB RECOVERY COMPLETED SUCCESSFULLY ---');
    res.json({ success: true, message: 'Emergency data recovery completed successfully!' });
  } catch (err) {
    console.error('Recovery failed:', err);
    res.status(500).json({ error: 'Recovery failed', details: err.message });
  } finally {
    await prisma.$disconnect();
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API with prefix is active' });
});

// Manual/Vercel Cron Backup Trigger
app.get('/api/backup/trigger', (req, res) => {
  const { exec } = require('child_process');
  const path = require('path');
  const backupScript = path.join(__dirname, '../scripts/backup.js');
  
  exec(`node "${backupScript}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup trigger failed: ${error.message}`);
      return res.status(500).json({ status: 'error', message: 'Backup failed', details: error.message });
    }
    res.json({ status: 'ok', message: 'Backup triggered successfully', output: stdout });
  });
});

// Unified Static Frontend Serving (PWA & Client SPA)
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// SPA Client-Side Routing Fallback (All unhandled GET requests return index.html)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path === '/health') {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      next();
    }
  });
});

// Socket.io & Local Cron initialization (Conditional for Local Dev / Persistent Host)
let io;
if (!process.env.VERCEL) {
  const http = require('http');
  const { Server } = require('socket.io');
  const server = http.createServer(app);
  io = new Server(server, {
    cors: { origin: '*' }
  });
  app.set('io', io);

  io.on('connection', (socket) => {
    console.log('Terminal connected:', socket.id);
    socket.on('disconnect', () => console.log('Terminal disconnected'));
  });

  // Start Server Locally
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Enterprise POS is LIVE on Port ${PORT}`);
    console.log(`Local Access: http://localhost:${PORT}`);
    console.log(`Global Strategy: Serving Unified Production Build`);
    
    // Initialize Automated Local Backups
    try {
      const cron = require('node-cron');
      const { exec } = require('child_process');
      const path = require('path');
      const backupScript = path.join(__dirname, '../scripts/backup.js');
      
      // Schedule backup to run Daily at 1:00 AM
      cron.schedule('0 1 * * *', () => {
        console.log(`[${new Date().toISOString()}] Cron trigger: Starting automated backup...`);
        exec(`node "${backupScript}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Automated backup failed: ${error.message}`);
          } else {
            console.log(`Automated backup completed:\n${stdout}`);
          }
        });
      });
      console.log(`Automated Backups Scheduler initialized (Daily at 1:00 AM)`);
    } catch (err) {
      console.log('Automated Backups Scheduler failed to start:', err.message);
    }
  });
} else {
  // In Vercel, we just export the app
  console.log('Vercel Serverless: App instance exported. Use vercel.json cron to hit /api/backup/trigger');
}

module.exports = app;
