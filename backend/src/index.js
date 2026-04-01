const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
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
  res.json({ status: 'ok', message: 'POS Billing System API is running on Vercel' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API with prefix is active' });
});

// Socket.io initialization (Conditional for Local Dev)
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
  });
} else {
  // In Vercel, we just export the app
  console.log('Vercel Serverless: App instance exported');
}

module.exports = app;
