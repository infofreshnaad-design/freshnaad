const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');
const whatsappUtil = require('../utils/whatsappUtil');
const pdfUtil = require('../utils/pdfUtil');

// Local Error Capture for Black Box
const logError = (context, err) => {
  console.error(`[Order API Debug] ${context}:`, err);
};

// GET order as PDF (Public for WhatsApp API - ABSOLUTE TOP PRIORITY)
router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { 
        orderItems: { include: { product: true } }, 
        customer: true,
        payments: true
      }
    });
    
    if (!order) return res.status(404).send('Invoice not found');
    
    // Explicit headers for binary delivery
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${order.invoiceNo}.pdf`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    pdfUtil.generateInvoicePDF(order, res);
  } catch (error) {
    console.error('PDF Error:', error);
    res.status(500).send('Error generating PDF');
  }
});

// --- START CUSTOMER WHATSAPP ROUTES ---
router.get('/test-conn', (req, res) => res.json({ status: 'ok', msg: 'Order API is reachable' }));

// Share order via WhatsApp (Manual trigger from UI)
router.post('/share-whatsapp', auth(['ADMIN', 'MANAGER', 'CASHIER']), async (req, res) => {
  try {
    const { orderId, phone } = req.body;
    console.log(`[WhatsApp Share Request] Order: ${orderId}, Phone: ${phone}`);
    
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: { product: true }
        }
      }
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    // We MUST await this on Vercel to prevent process termination
    const waResult = await whatsappUtil.sendReceipt(order, phone, req.headers.host);

    return res.json({ success: true, message: 'WhatsApp message sent', whatsappStatus: waResult });
  } catch (error) {
    console.error('WhatsApp Share Error:', error);
    return res.status(500).json({ error: error.message });
  }
});
// --- END CUSTOMER WHATSAPP ROUTES ---

// Get order by ID or InvoiceNo (Dual-Lookup Safety)
router.get('/:id', auth(['ADMIN', 'MANAGER', 'CASHIER']), async (req, res) => {
  try {
    const { id } = req.params;
    let order = await prisma.order.findFirst({
      where: { 
        OR: [
          { id: id },
          { invoiceNo: id }
        ]
      },
      include: { 
        orderItems: { include: { product: true } }, 
        customer: true, 
        payments: true 
      }
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new order
router.post('/', auth(['ADMIN', 'MANAGER', 'CASHIER']), async (req, res) => {
  console.log(`[Order API] Starting creation with ${req.body.orderItems?.length} items`);
  const startTime = Date.now();

  try {
    const { customerId, orderItems, subtotal, discount, manualDiscount, taxTotal, grandTotal, roundedTotal, savings, amountPaid, balance, paymentMode, loyaltyPointsRedeemed = 0 } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item.' });
    }

    const order = await prisma.$transaction(async (tx) => {
      // 1. PRE-FETCH ALL PRODUCTS IN ONE GO (HUGE Performance Gain)
      const productIds = [...new Set(orderItems.map(item => item.productId || item.id))];
      const productsFromDb = await tx.product.findMany({
        where: { id: { in: productIds } }
      });
      const productMap = new Map(productsFromDb.map(p => [p.id, p]));

      // 2. Generate Collision-Proof Sequential Invoice Number (RAW SQL MAX)
      const rawMax = await tx.$queryRaw`
        SELECT MAX(CAST("invoiceNo" AS INTEGER)) as "maxNum" 
        FROM "Order" 
        WHERE "invoiceNo" ~ '^[0-9]+$' AND "invoiceNo" NOT LIKE '9%'
      `;
      const maxNum = Number(rawMax[0]?.maxNum) || 99;
      const invoiceNo = (maxNum + 1).toString();

      // 3. Validation & Stock Check
      for (const item of orderItems) {
        const pid = item.productId || item.id;
        const p = productMap.get(pid);
        if (!p) throw new Error(`Product ID ${pid} not found in database.`);
        if (p.stockQuantity < item.quantity) {
          throw new Error(`Insufficient stock for ${p.name}. Available: ${p.stockQuantity}, Requested: ${item.quantity}`);
        }
      }

      // 4. Create Order + Items + Payment in ONE nested call
      const earnRate = 100;
      const loyaltyPointsEarned = Math.floor(grandTotal / earnRate);

      const orderBaseData = {
        invoiceNo,
        customerId,
        subtotal,
        discount,
        taxTotal,
        grandTotal,
        roundedTotal: roundedTotal || Math.floor(grandTotal),
        savings: savings || 0,
        amountPaid: Number(amountPaid) || 0,
        balance: Number(balance) || 0,
        paymentMode,
        loyaltyPointsEarned,
        loyaltyPointsRedeemed,
        status: 'COMPLETED',
        creatorId: req.user?.id || null,
        orderItems: {
          create: orderItems.map((item) => {
            const pid = item.productId || item.id;
            const p = productMap.get(pid);
            const price = item.price || item.sellingPrice || p.sellingPrice;
            const mrp = item.mrp || p.mrp || price;
            const gst = parseFloat(item.gstRate ?? p.gstRate ?? 18);
            
            return {
              productId: pid,
              quantity: item.quantity,
              price: price,
              mrp: mrp,
              discount: item.discount || 0,
              taxAmount: (price * (gst / 100)) * item.quantity,
              total: (price * item.quantity) + ((price * (gst / 100)) * item.quantity)
            };
          })
        },
        payments: {
          create: {
            method: paymentMode,
            amount: Number(amountPaid) || 0,
            status: 'SUCCESS'
          }
        }
      };

      const newOrder = await tx.order.create({
        data: orderBaseData,
        include: { orderItems: { include: { product: true } }, payments: true }
      });

      // 5. Sequential Sledgehammer Stock Updates (Guaranteed execution via Direct SQL)
      // This bypasses Prisma caching/relation bottlenecks
      for (const item of orderItems) {
        const pid = item.productId || item.id;
        const qty = Number(item.quantity) || 0;
        
        // Decrement Product Stock via Raw SQL for maximum reliability
        await tx.$executeRaw`
          UPDATE "Product" 
          SET "stockQuantity" = "stockQuantity" - ${qty} 
          WHERE id = ${pid}
        `;

        // Create Inventory Log
        await tx.inventoryLog.create({
          data: {
            productId: pid,
            type: 'OUT',
            quantity: qty,
            reason: `Order ${invoiceNo}`
          }
        });
      }

      // 6. Record Staff Activity for the Sale
      if (req.user?.id) {
        await tx.userActivity.create({
          data: {
            userId: req.user.id,
            type: 'SALE'
          }
        });
      }

      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            loyaltyPoints: { increment: loyaltyPointsEarned - (loyaltyPointsRedeemed || 0) },
            totalSpent: { increment: Number(grandTotal) },
            creditBalance: { increment: Number(balance) || 0 },
            lastPurchaseDate: new Date()
          }
        });
      }

      // 7. Auto-log Manual Discount as Expense
      if (manualDiscount && manualDiscount > 0) {
        // Find or create 'Discount' Category
        let discountCat = await tx.expenseCategory.findUnique({
          where: { name: 'Discount' }
        });
        
        if (!discountCat) {
          discountCat = await tx.expenseCategory.create({
            data: { name: 'Discount' }
          });
        }
        
        await tx.expense.create({
          data: {
            type: 'Discount',
            amount: Number(manualDiscount),
            description: `Checkout discount for Invoice ${invoiceNo}`
          }
        });
      }

      // 8. Socket Events (Optional Emit)
      const io = req.app.get('io');
      if (io) {
        io.emit('INVENTORY_UPDATE', { items: orderItems });
        io.emit('ORDER_CREATED', newOrder);
      }

      return newOrder;
    }, { timeout: 15000 }); // Increase transaction timeout for large orders

    console.log(`[Order API] Success! Processed in ${Date.now() - startTime}ms`);

    res.json(order);
    
    // Note: WhatsApp messaging has been decoupled. The frontend now independently 
    // triggers the /share-whatsapp endpoint asynchronously after the UI seamlessly transitions.
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Order API] FAILED after ${elapsed}ms:`, error);
    res.status(500).json({ 
      error: error.message || 'Internal Server Error',
      details: error.code || 'TRANSACTION_FAILED'
    });
  }
});

// Update existing order (Full edit with inventory reversal)
router.put('/:id', auth(['ADMIN', 'MANAGER']), async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { orderItems: newItems, subtotal, discount, taxTotal, grandTotal, amountPaid, balance, paymentMode, customerId } = req.body;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Fetch old order with items
      const oldOrder = await tx.order.findUnique({
        where: { id },
        include: { orderItems: true, customer: true }
      });
      if (!oldOrder) throw new Error('Order not found');

      // 2. Pre-fetch ALL products involved (Old and New)
      const allProductIds = [...new Set([
        ...oldOrder.orderItems.map(i => i.productId),
        ...newItems.map(i => i.productId || i.id)
      ])];
      const productsFromDb = await tx.product.findMany({
        where: { id: { in: allProductIds } }
      });
      const productMap = new Map(productsFromDb.map(p => [p.id, p]));

      // 3. REVERSE: Old Loyalty and Spending
      if (oldOrder.customerId) {
        await tx.customer.update({
          where: { id: oldOrder.customerId },
          data: {
            loyaltyPoints: { decrement: oldOrder.loyaltyPointsEarned - (oldOrder.loyaltyPointsRedeemed || 0) },
            totalSpent: { decrement: oldOrder.grandTotal },
            creditBalance: { decrement: oldOrder.balance || 0 }
          }
        });
      }

      // 4. Perform Inventory Updates Sequentially for stability
      // Reverse old items (Increment stock back)
      for (const item of oldOrder.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } }
        });
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            type: 'IN',
            quantity: item.quantity,
            reason: `Edit Reverse: ${oldOrder.invoiceNo}`
          }
        });
      }

      // 5. APPLY: Delete old mapping and prepare new
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.payment.deleteMany({ where: { orderId: id } });

      const earnRate = 100;
      const newLoyaltyPointsEarned = Math.floor(grandTotal / earnRate);

      // Re-apply new items
      for (const item of newItems) {
        const pid = item.productId || item.id;
        if (!pid) continue; // Skip empty lines
        const p = productMap.get(pid);
        if (!p) throw new Error(`Product ${pid} not found`);

        await tx.product.update({
          where: { id: pid },
          data: { stockQuantity: { decrement: item.quantity } }
        });
        await tx.inventoryLog.create({
          data: {
            productId: pid,
            type: 'OUT',
            quantity: item.quantity,
            reason: `Edit Apply: ${oldOrder.invoiceNo}`
          }
        });
      }

      // 6. Final Record Update
      const finalOrder = await tx.order.update({
        where: { id },
        data: {
          customerId,
          subtotal,
          discount,
          taxTotal,
          grandTotal,
          amountPaid: Number(amountPaid) || 0,
          balance: Number(balance) || 0,
          paymentMode,
          loyaltyPointsEarned: newLoyaltyPointsEarned,
          orderItems: {
            create: newItems.map((item) => {
              const pid = item.productId || item.id;
              const p = productMap.get(pid);
              const price = item.price || item.sellingPrice || p.sellingPrice;
              const gst = parseFloat(item.gstRate ?? p.gstRate ?? 18);
              return {
                productId: pid,
                quantity: item.quantity,
                price: price,
                discount: item.discount || 0,
                taxAmount: (price * (gst / 100)) * item.quantity,
                total: (price * item.quantity) + ((price * (gst / 100)) * item.quantity)
              };
            })
          },
          payments: {
            create: {
              method: paymentMode,
              amount: Number(amountPaid) || 0,
              status: 'SUCCESS'
            }
          }
        },
        include: { orderItems: { include: { product: true } }, payments: true }
      });

      // 7. Update new customer loyalty
      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            loyaltyPoints: { increment: newLoyaltyPointsEarned },
            totalSpent: { increment: Number(grandTotal) },
            creditBalance: { increment: Number(balance) || 0 }
          }
        });
      }

      // 8. Emit events
      const io = req.app.get('io');
      if (io) {
          io.emit('INVENTORY_UPDATE', { items: newItems });
          io.emit('ORDER_UPDATED', finalOrder);
      }

      return finalOrder;
    }, { timeout: 30000 });

    console.log(`[Order API] Edit Success in ${Date.now() - startTime}ms`);
    res.json(updatedOrder);
  } catch (error) {
    console.error('[Order API] Edit FAILED:', error);
    res.status(500).json({ error: error.message });
  }
});

// Settle Credit Payment for an order
router.patch('/:id/settle-credit', auth(['ADMIN', 'MANAGER']), async (req, res) => {
  const { id } = req.params;
  const { settleAmount, method } = req.body;

  if (!settleAmount || settleAmount <= 0) {
    return res.status(400).json({ error: 'Valid settlement amount is required.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get the order and lock it
      const order = await tx.order.findUnique({
        where: { id },
        include: { customer: true }
      });

      if (!order) throw new Error('Order not found.');
      if (order.balance <= 0) throw new Error('Order is already fully paid.');
      
      const paymentAmount = Math.min(Number(settleAmount), order.balance);

      // 2. Update Order
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          amountPaid: { increment: paymentAmount },
          balance: { decrement: paymentAmount }
        }
      });

      // 3. Create Payment Record
      await tx.payment.create({
        data: {
          orderId: id,
          method: method || 'CASH',
          amount: paymentAmount,
          status: 'SUCCESS'
        }
      });

      // 4. Update Customer Credit Balance
      if (order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            creditBalance: { decrement: paymentAmount }
          }
        });
      }

      return updatedOrder;
    });

    res.json(result);
  } catch (error) {
    console.error('Settlement Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
