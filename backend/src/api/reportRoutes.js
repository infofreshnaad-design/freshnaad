const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');
const whatsappUtil = require('../utils/whatsappUtil');

// Helper to handle date filters
const getDateRange = (filter, startDate, endDate) => {
  const now = new Date();
  let start = new Date();
  start.setHours(0, 0, 0, 0);
  let end = new Date();
  end.setHours(23, 59, 59, 999);

  if (filter === 'Today') {
    // Keep start and end as today
  } else if (filter === 'Week') {
    start.setDate(now.getDate() - 7);
  } else if (filter === 'Month') {
    start.setDate(now.getDate() - 30);
  } else if (filter === 'Custom' && startDate && endDate) {
    start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  } else {
    // Default All Time roughly
    start = new Date('2020-01-01');
  }
  return { gte: start, lte: end };
};

// 0. Dashboard Summary for Admin
router.get('/summary', async (req, res) => {
  try {
    const totalRevenue = await prisma.order.aggregate({
      _sum: { grandTotal: true }
    });
    const totalOrders = await prisma.order.count();
    const lowStockAlerts = await prisma.product.count({
      where: { stockQuantity: { lt: 10 } }
    });
    const activeTerminals = await prisma.device.count({
      where: { authorized: true }
    });
    const recentOrders = await prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { 
        orderItems: { include: { product: true } },
        payments: true 
      }
    });

    // Top Selling Categories for Distribution
    const categorySales = await prisma.orderItem.findMany({
      include: { product: { include: { category: true } } }
    });

    const distributionMap = {};
    categorySales.forEach(item => {
      const catName = item.product?.category?.name || 'Uncategorized';
      distributionMap[catName] = (distributionMap[catName] || 0) + item.total;
    });

    const distribution = Object.entries(distributionMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    res.json({
      totalRevenue: totalRevenue._sum?.grandTotal || 0,
      totalOrders,
      lowStockAlerts,
      activeTerminals,
      recentOrders,
      distribution,
      lastSync: recentOrders[0]?.createdAt || new Date()
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 1. Sale Report
router.get('/sales', async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    const dateRange = getDateRange(filter, startDate, endDate);
    
    const sales = await prisma.order.findMany({
      where: { createdAt: dateRange },
      include: { customer: true, payments: true }
    });
    
    const summary = {
      totalSales: sales.reduce((sum, order) => sum + order.grandTotal, 0),
      totalTax: sales.reduce((sum, order) => sum + order.taxTotal, 0),
      billCount: sales.length,
      cashReceived: sales.filter(o => o.paymentMode === 'CASH').reduce((sum, o) => sum + o.grandTotal, 0),
      upiReceived: sales.filter(o => o.paymentMode === 'UPI').reduce((sum, o) => sum + o.grandTotal, 0),
      cardReceived: sales.filter(o => o.paymentMode === 'CARD').reduce((sum, o) => sum + o.grandTotal, 0)
    };
    res.json({ summary, details: sales });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 2. Purchase Report
router.get('/purchase', async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    const dateRange = getDateRange(filter, startDate, endDate);
    
    // Using try/catch locally since Purchase might not exist remotely yet
    const purchases = await prisma.purchase.findMany({
      where: { createdAt: dateRange }
    }).catch(() => []); // Fallback if table missing during sync
    
    const summary = {
      totalPurchases: purchases.reduce((sum, p) => sum + p.grandTotal, 0),
      totalTax: purchases.reduce((sum, p) => sum + p.taxTotal, 0),
      billCount: purchases.length,
    };
    
    // grouped by supplier
    const supplierWise = purchases.reduce((acc, p) => {
      acc[p.supplierName] = (acc[p.supplierName] || 0) + p.grandTotal;
      return acc;
    }, {});

    res.json({ summary, supplierWise, details: purchases });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 3. Profit & Loss
router.get('/profit-loss', async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    const dateRange = getDateRange(filter, startDate, endDate);
    
    const totalSales = await prisma.order.aggregate({
      where: { createdAt: dateRange },
      _sum: { subtotal: true }
    });
    
    // We assume COGS (Cost of goods sold) via items
    const orderItems = await prisma.orderItem.findMany({
      where: { order: { createdAt: dateRange } },
      include: { product: true }
    });
    const cogs = orderItems.reduce((sum, item) => sum + (item.product?.purchasePrice || 0) * item.quantity, 0);
    const grossProfit = (totalSales._sum.subtotal || 0) - cogs;
    
    const expenses = await prisma.expense.aggregate({
      where: { createdAt: dateRange },
      _sum: { amount: true }
    });
    
    const totalExpense = expenses._sum.amount || 0;
    const netProfit = grossProfit - totalExpense;
    
    res.json({
      salesAmount: totalSales._sum.subtotal || 0,
      cogs,
      grossProfit,
      expenses: totalExpense,
      netProfit
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 4. Day Book & 5. All Transactions (Combined Logically)
router.get('/daybook', async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    const dateFilter = filter === 'Custom' ? filter : 'Today'; // Default DayBook to Today
    const dateRange = getDateRange(dateFilter, startDate, endDate);

    const sales = await prisma.order.findMany({ where: { createdAt: dateRange } });
    const expenses = await prisma.expense.findMany({ where: { createdAt: dateRange } });
    
    // 1. Fetch Purchase Events (Invoices created during this period)
    const purchases = await prisma.purchase.findMany({ where: { date: dateRange } }).catch(() => []);

    // 2. Fetch Individual Payments made towards purchases during this period
    const purchasePayments = await prisma.purchasePayment.findMany({ 
      where: { date: dateRange },
      include: { purchase: true }
    }).catch(() => []);
    
    const transactions = [
      ...sales.map(s => ({ id: s.id, type: 'SALE', amount: s.grandTotal, date: s.createdAt, details: `Bill: ${s.invoiceNo}`, customerId: s.customerId })),
      
      // Show the bill creation event as ₹0 (Record keeping)
      ...purchases.map(p => ({
        id: p.id,
        type: 'PURCHASE',
        amount: 0, 
        date: p.date || p.createdAt,
        details: `Inv: ${p.invoiceNo}${p.paymentStatus === 'PENDING' ? ' (PENDING)' : p.paymentStatus === 'PARTIAL' ? ' (PARTIAL)' : ''}`
      })),

      // Show the actual cash out (Payment event)
      ...purchasePayments.map(pp => ({ 
        id: pp.id, 
        type: 'PURCHASE_PAYMENT', 
        amount: -pp.amount, 
        date: pp.date, 
        details: `Inv: ${pp.purchase.invoiceNo} (Payment)` 
      })),

      ...expenses.map(e => ({ id: e.id, type: 'EXPENSE', amount: -e.amount, date: e.createdAt, details: e.type }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const cashIn = sales.reduce((sum, s) => sum + s.grandTotal, 0);
    const cashOut = purchasePayments.reduce((sum, pp) => sum + pp.amount, 0) + expenses.reduce((sum, e) => sum + e.amount, 0);
    
    res.json({
      transactions,
      cashIn: Number(cashIn) || 0,
      cashOut: Number(cashOut) || 0,
      netBalance: Number(cashIn - cashOut) || 0
    });
  } catch (error) {
    console.error('Daybook Error:', error);
    res.json({ transactions: [], cashIn: 0, cashOut: 0, netBalance: 0, error: error.message });
  }
});

// 6. Cashflow (Simplified to In/Out matching daybook)
router.get('/cashflow', async (req, res) => {
  // Alias to DayBook logic but formatted for high level cashflow
  res.redirect('/api/reports/daybook?filter=' + req.query.filter);
});

// 7. Balance Sheet (Summary snapshot)
router.get('/balance-sheet', async (req, res) => {
  try {
    const products = await prisma.product.findMany();
    const inventoryValue = products.reduce((sum, p) => sum + (p.stockQuantity * p.purchasePrice), 0);
    
    const customers = await prisma.customer.findMany();
    const receivables = customers.reduce((sum, c) => sum + c.creditBalance, 0);
    
    res.json({
      assets: {
        inventoryValue,
        receivables,
        totalAssets: inventoryValue + receivables
      },
      liabilities: {} // Simplified for POS
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 8. Party Reports (All Parties)
router.get('/parties', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { totalSpent: 'desc' }
    });
    res.json(customers);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 9. Party Statement (Customer)
router.get('/party-statement/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({ where: { id }, include: { orders: true } });
    if (!customer) return res.status(404).json({ message: 'Not found' });
    res.json(customer);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 9.1 All Suppliers
router.get('/suppliers', async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      include: {
        purchases: { select: { grandTotal: true, balanceDue: true, createdAt: true } },
        purchaseReturns: { select: { totalAmount: true } }
      }
    });

    const report = suppliers.map(s => {
      const totalPurchased = s.purchases.reduce((sum, p) => sum + p.grandTotal, 0);
      const totalReturned = s.purchaseReturns.reduce((sum, r) => sum + r.totalAmount, 0);
      const totalBalance = s.purchases.reduce((sum, p) => sum + p.balanceDue, 0);
      const lastPurchase = s.purchases.length > 0 ? s.purchases[0].createdAt : s.createdAt;

      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        totalPurchases: totalPurchased,
        totalReturned,
        totalBalance: totalBalance - totalReturned, // Simplified balance
        lastPurchase
      };
    });

    res.json(report);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 9.2 Supplier Ledger (Enhanced)
router.get('/supplier-ledger', async (req, res) => {
  try {
    const { supplierId, supplierName } = req.query;
    if (!supplierId && !supplierName) return res.status(400).json({ error: 'Supplier ID or Name required' });

    let supplier;
    if (supplierId) {
      supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        include: {
          purchases: { include: { payments: true } },
          purchaseReturns: true
        }
      });
    } else {
      supplier = await prisma.supplier.findFirst({
        where: { name: supplierName },
        include: {
          purchases: { include: { payments: true } },
          purchaseReturns: true
        }
      });
    }

    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    // Construct unified transaction list
    let transactions = [];
    
    // 1. Opening Balance
    transactions.push({
      date: supplier.createdAt,
      type: 'OPENING',
      description: 'Opening Balance',
      amount: supplier.openingBalance,
      reference: 'Initial'
    });

    // 2. Purchases
    supplier.purchases.forEach(p => {
      transactions.push({
        date: p.date,
        type: 'PURCHASE',
        description: `Invoice: ${p.invoiceNo}`,
        amount: p.grandTotal,
        reference: p.invoiceNo
      });

      // 3. Individual Payments
      p.payments?.forEach(pay => {
        transactions.push({
          date: pay.date,
          type: 'PAYMENT',
          description: `Payment via ${pay.method}`,
          amount: -pay.amount,
          reference: p.invoiceNo
        });
      });
    });

    // 4. Returns
    supplier.purchaseReturns.forEach(r => {
      transactions.push({
        date: r.date,
        type: 'RETURN',
        description: `Return: ${r.returnNo}`,
        amount: -r.totalAmount,
        reference: r.returnNo
      });
    });

    // Sort and calculate balance
    transactions.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let runningBalance = 0;
    const ledger = transactions.map(t => {
      runningBalance += t.amount;
      return { ...t, runningBalance };
    });

    res.json({
      supplier: { id: supplier.id, name: supplier.name, openingBalance: supplier.openingBalance },
      summary: {
        currentBalance: runningBalance,
        totalPurchases: supplier.purchases.reduce((s, p) => s + p.grandTotal, 0),
        totalReturns: supplier.purchaseReturns.reduce((s, r) => s + r.totalAmount, 0),
        totalPayments: supplier.purchases.reduce((s, p) => s + p.amountPaid, 0)
      },
      transactions: ledger.reverse() // Newest first
    });
  } catch (error) { 
    console.error('Ledger Error:', error);
    res.status(500).json({ error: error.message }); 
  }
});

// 10. Party Wise Profit & Loss
router.get('/party-profit', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: { customer: true, orderItems: { include: { product: true } } }
    });
    
    const profitByParty = orders.reduce((acc, order) => {
      if (!order.customer) return acc;
      const cid = order.customer.id;
      if (!acc[cid]) acc[cid] = { id: cid, name: order.customer.name, totalSales: 0, cogs: 0, profit: 0, points: order.customer.loyaltyPoints };
      
      const sales = order.subtotal;
      const cogs = order.orderItems.reduce((sum, item) => sum + ((item.product?.purchasePrice || 0) * item.quantity), 0);
      
      acc[cid].totalSales += sales;
      acc[cid].cogs += cogs;
      acc[cid].profit += (sales - cogs);
      return acc;
    }, {});
    
    res.json(Object.values(profitByParty));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 11. Stock Summary Report
router.get('/stock-summary', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { is_active: true }
    });
    
    const summary = {
      totalItems: products.length,
      totalStockValue: products.reduce((sum, p) => sum + (p.stockQuantity * p.purchasePrice), 0),
      totalRetailValue: products.reduce((sum, p) => sum + (p.stockQuantity * p.sellingPrice), 0),
    };
    
    res.json({ summary, details: products });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 12. Item Wise Profit & Loss
router.get('/item-profit', async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    const dateRange = getDateRange(filter, startDate, endDate);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: dateRange
        }
      },
      include: { product: true }
    });
    
    const itemProfit = orderItems.reduce((acc, item) => {
      if (!item.product) return acc;
      const name = item.product.name;
      if (!acc[name]) acc[name] = { qtySold: 0, revenue: 0, cost: 0, profit: 0 };
      
      const rev = item.price * item.quantity;
      const cost = item.product.purchasePrice * item.quantity;
      
      acc[name].qtySold += item.quantity;
      acc[name].revenue += rev;
      acc[name].cost += cost;
      acc[name].profit += (rev - cost);
      return acc;
    }, {});
    
    res.json(Object.entries(itemProfit).map(([name, data]) => ({ name, ...data })).sort((a,b) => b.profit - a.profit));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 13. Expense Reports 
router.get('/expenses', async (req, res) => {
  try {
    const { filter, startDate, endDate } = req.query;
    const dateRange = getDateRange(filter, startDate, endDate);
    
    const expenses = await prisma.expense.findMany({
      where: { createdAt: dateRange },
      orderBy: { createdAt: 'desc' }
    });
    
    const totalByCat = expenses.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + e.amount;
      return acc;
    }, {});
    
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    res.json({ total, categorySummary: totalByCat, details: expenses });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 14. All Transactions alias
router.get('/transactions', async (req, res) => {
  res.redirect('/api/reports/daybook?filter=' + req.query.filter);
});

// 15. Stock Detail
router.get('/stock-detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { inventoryLogs: { orderBy: { createdAt: 'desc' } } }
    });
    if (!product) return res.status(404).json({ message: 'Not found' });
    res.json(product);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Test WhatsApp Configuration
router.post('/test-whatsapp', auth(['ADMIN']), async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    // Mock order object for testing
    const mockOrder = {
      invoiceNo: 'TEST-CONNECTION',
      createdAt: new Date(),
      subtotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      orderItems: []
    };

    const apiURL = whatsappUtil.getFormattedURL(process.env.WHATSAPP_API_URL);
    const apiKey = process.env.WHATSAPP_API_KEY;

    if (!apiURL || !apiKey) {
      return res.status(400).json({ 
        error: 'Missing environment variables',
        details: { url: !!apiURL, key: !!apiKey }
      });
    }

    // Attempt to send
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const formattedPhone = `91${cleanPhone}`;
    
    const params = new URLSearchParams();
    params.append('token', apiKey);
    params.append('to', formattedPhone);
    params.append('body', message || 'POS Pro WhatsApp Connection Test: SUCCESS');

    const axios = require('axios');
    const response = await axios.post(apiURL, params, { 
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000 
    });

    res.json({ 
        success: true, 
        message: 'Test message triggered', 
        providerResponse: response.data 
    });
  } catch (error) {
    res.status(500).json({ 
        success: false, 
        error: error.message, 
        details: error.response?.data 
    });
  }
});

module.exports = router;
