const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');
const whatsappUtil = require('../utils/whatsappUtil');
const pdfUtil = require('../utils/pdfUtil');

// GET order as PDF (Public for WhatsApp API - ABSOLUTE TOP PRIORITY)
router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { 
        orderItems: { include: { product: true } }, 
        customer: true 
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

// Get order by ID
router.get('/:id', auth(['ADMIN', 'MANAGER', 'CASHIER']), async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { orderItems: { include: { product: true } }, customer: true, payments: true }
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
    const { customerId, orderItems, subtotal, discount, taxTotal, grandTotal, roundedTotal, savings, paymentMode, loyaltyPointsRedeemed = 0 } = req.body;

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

      // 2. Generate Sequential Invoice Number
      const latestOrder = await tx.order.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { invoiceNo: true }
      });
      
      let nextNum = 1001;
      if (latestOrder) {
        const match = latestOrder.invoiceNo.match(/\d+/);
        if (match) nextNum = parseInt(match[0]) + 1;
      }
      const invoiceNo = `${nextNum}`;

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

      const newOrder = await tx.order.create({
        data: {
          invoiceNo,
          customerId,
          subtotal,
          discount,
          taxTotal,
          grandTotal,
          roundedTotal: roundedTotal || Math.floor(grandTotal),
          savings: savings || 0,
          paymentMode,
          loyaltyPointsEarned,
          loyaltyPointsRedeemed,
          status: 'COMPLETED',
          orderItems: {
            create: orderItems.map((item) => {
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
              amount: grandTotal,
              status: 'SUCCESS'
            }
          }
        },
        include: {
          orderItems: { include: { product: true } },
          payments: true
        }
      });

      // 5. Consolidated Updates (Stock & Logs)
      // Parallelize update promises to resolve faster
      const updatePromises = orderItems.map(item => {
        const pid = item.productId || item.id;
        return [
          tx.product.update({
            where: { id: pid },
            data: { stockQuantity: { decrement: item.quantity } }
          }),
          tx.inventoryLog.create({
            data: {
              productId: pid,
              type: 'OUT',
              quantity: item.quantity,
              reason: `Order ${invoiceNo}`
            }
          })
        ];
      }).flat();

      if (customerId) {
        updatePromises.push(
          tx.customer.update({
            where: { id: customerId },
            data: {
              loyaltyPoints: { increment: loyaltyPointsEarned - (loyaltyPointsRedeemed || 0) },
              totalSpent: { increment: Number(grandTotal) },
              lastPurchaseDate: new Date()
            }
          })
        );
      }

      await Promise.all(updatePromises);

      // 6. Socket Events (Optional Emit)
      const io = req.app.get('io');
      if (io) {
        io.emit('INVENTORY_UPDATE', { items: orderItems });
        io.emit('ORDER_CREATED', newOrder);
      }

      return newOrder;
    }, { timeout: 15000 }); // Increase transaction timeout for large orders

    console.log(`[Order API] Success! Processed in ${Date.now() - startTime}ms`);

    // 7. IMMEDIATE RELEASE: release the client before background tasks
    res.json(order);

    // 8. Truly Background Messaging
    if (order && order.customerId) {
        prisma.customer.findUnique({ where: { id: order.customerId } })
            .then(customer => {
                if (customer && customer.phone) {
                    return whatsappUtil.sendReceipt(order, customer.phone, req.headers.host);
                }
            })
            .catch(err => console.error('Background WhatsApp Logic Error:', err));
    }
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
    const { orderItems: newItems, subtotal, discount, taxTotal, grandTotal, paymentMode, customerId } = req.body;

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
            totalSpent: { decrement: oldOrder.grandTotal }
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
              amount: grandTotal,
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
            totalSpent: { increment: Number(grandTotal) }
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

module.exports = router;
