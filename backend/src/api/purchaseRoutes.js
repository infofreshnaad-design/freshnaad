const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');

// Get count of purchases
router.get('/count', auth(['ADMIN', 'MANAGER', 'CASHIER']), async (req, res) => {
  try {
    const count = await prisma.purchase.count();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unique supplier names for suggestions
router.get('/suppliers/suggestions', auth(['ADMIN', 'MANAGER', 'CASHIER']), async (req, res) => {
  try {
    const purchases = await prisma.purchase.findMany({
      select: { supplierName: true },
      distinct: ['supplierName'],
    });
    const suppliers = purchases.map(p => p.supplierName).filter(Boolean);
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new purchase (Stock In)
router.post('/', auth(['ADMIN', 'MANAGER'], 'PURCHASE_ENTRY'), async (req, res) => {
  try {
    const { 
      supplierId,
      supplierName, 
      purchaseItems, 
      paymentMode, 
      paymentStatus,
      date 
    } = req.body;

    const subtotal = Number(req.body.subtotal) || 0;
    const taxTotal = Number(req.body.taxTotal) || 0;
    const totalDiscount = Number(req.body.totalDiscount) || 0;
    const grandTotal = Number(req.body.grandTotal) || 0;
    const amountPaid = Number(req.body.amountPaid) || 0;
    const balanceDue = Number(req.body.balanceDue) || 0;

    const purchase = await prisma.$transaction(async (tx) => {
      // Generate Simple Sequential Purchase Invoice Number safely
      const result = await tx.$queryRaw`
        SELECT MAX(CAST("invoiceNo" AS INTEGER)) as "maxNum" 
        FROM "Purchase" 
        WHERE "invoiceNo" ~ '^[0-9]+$'
      `;
      const maxNum = result[0]?.maxNum || 1000;
      const invoiceNo = (maxNum + 1).toString();

      // 1. Create the purchase record
      const newPurchase = await tx.purchase.create({
        data: {
          invoiceNo,
          supplierId,
          supplierName,
          subtotal,
          taxTotal,
          totalDiscount: totalDiscount || 0,
          grandTotal,
          amountPaid: amountPaid || 0,
          balanceDue: balanceDue || 0,
          paymentMode: paymentMode || 'CASH',
          paymentStatus: paymentStatus || 'PAID',
          date: date ? new Date(date) : new Date(),
          status: 'COMPLETED',
          purchaseItems: {
            create: (purchaseItems || []).map((item) => ({
              productId: item.productId || null,
              productName: item.name || item.productName || "",
              quantity: Number(item.quantity) || 0,
              price: Number(item.price) || 0,
              discount: item.discount || 0,
              discountPercent: item.discountPercent || 0,
              taxAmount: item.taxAmount || 0,
              total: item.total
            }))
          },
          payments: amountPaid > 0 ? {
            create: {
              amount: amountPaid,
              method: paymentMode || 'CASH',
              date: date ? new Date(date) : new Date()
            }
          } : undefined
        }
      });

      // 2. Update Product Purchase Price & Log Purchase (Stock quantity increment is bypassed)
      const validItems = (purchaseItems || []).filter(item => item.productId);
      for (const item of validItems) {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        if (price > 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { purchasePrice: price }
          });
        }
        if (qty > 0) {
          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              type: 'IN',
              quantity: qty,
              reason: `Purchase ${invoiceNo}`
            }
          });
        }
      }

      return newPurchase;
    }, { timeout: 15000, maxWait: 5000 });

    res.json(purchase);
  } catch (error) {
    console.error('Purchase Error:', error);
    res.status(500).json({ error: error.message });
  }
});
// Add payment to an existing purchase
router.post('/:id/payments', auth(['ADMIN', 'MANAGER'], 'PURCHASE_ENTRY'), async (req, res) => {
  try {
    const { id } = req.params;
    const amount = Number(req.body.amount);
    const { method, transactionId, date } = req.body;

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid payment amount' });
    }
    const updatedPurchase = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ 
        where: { id },
        include: { payments: true }
      });

      if (!purchase) throw new Error('Purchase not found');
      if (amount > purchase.balanceDue) throw new Error('Payment exceeds balance due');

      const newPaid = purchase.amountPaid + amount;
      const newBalance = purchase.grandTotal - newPaid;

      // Create payment record
      await tx.purchasePayment.create({
        data: {
          purchaseId: id,
          amount,
          method: method || 'CASH',
          transactionId,
          date: date ? new Date(date) : new Date()
        }
      });

      // Update purchase totals
      return await tx.purchase.update({
        where: { id },
        data: {
          amountPaid: newPaid,
          balanceDue: newBalance,
          paymentStatus: newBalance <= 0 ? 'PAID' : 'PARTIAL'
        }
      });
    });

    res.json(updatedPurchase);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get purchase by ID
router.get('/:id', auth(['ADMIN', 'MANAGER'], 'PURCHASE_ENTRY'), async (req, res) => {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: req.params.id },
      include: { purchaseItems: { include: { product: true } } }
    });
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    res.json(purchase);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update purchase bill (with inventory reconciliation)
router.put('/:id', auth(['ADMIN', 'MANAGER'], 'PURCHASE_ENTRY'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      supplierId,
      supplierName, 
      purchaseItems: newItems, 
      subtotal, 
      taxTotal, 
      totalDiscount,
      grandTotal, 
      amountPaid, 
      balanceDue, 
      paymentMode, 
      paymentStatus,
      date 
    } = req.body;

    const updatedPurchase = await prisma.$transaction(async (tx) => {
      const oldPurchase = await tx.purchase.findUnique({
        where: { id },
        include: { purchaseItems: true }
      });

      if (!oldPurchase) throw new Error('Purchase not found');

      // 1. Validate and Filter items
      const validNewItems = (newItems || []).filter(item => item.productId || item.id || item.name || item.productName);

      // 2. Delete old items and record the update
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

      return await tx.purchase.update({
        where: { id },
        data: {
          supplierId,
          supplierName,
          subtotal,
          taxTotal,
          totalDiscount: totalDiscount || 0,
          grandTotal,
          amountPaid: amountPaid || 0,
          balanceDue: balanceDue || 0,
          paymentMode: paymentMode || 'CASH',
          paymentStatus: paymentStatus || 'PAID',
          date: date ? new Date(date) : undefined,
          purchaseItems: {
            create: validNewItems.map(item => ({
              productId: item.productId || item.id || null,
              productName: item.name || item.productName || "",
              quantity: Number(item.quantity) || 0,
              price: Number(item.price) || 0,
              discount: item.discount || 0,
              discountPercent: item.discountPercent || 0,
              taxAmount: item.taxAmount || 0,
              total: item.total
            }))
          }
        },
        include: { purchaseItems: { include: { product: true } } }
      });
    }, { timeout: 30000 });

    res.json(updatedPurchase);
  } catch (error) {
    console.error('Update Purchase Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
