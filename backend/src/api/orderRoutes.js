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

// Create new order
router.post('/', auth(['ADMIN', 'MANAGER', 'CASHIER']), async (req, res) => {
  try {
    const { customerId, orderItems, subtotal, discount, taxTotal, grandTotal, paymentMode, loyaltyPointsRedeemed = 0 } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item.' });
    }

    const order = await prisma.$transaction(async (tx) => {
      // 1. Generate Sequential Invoice Number INSIDE transaction (Prevent collisions)
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

      // 2. Calculate points earned (1 point per ₹100 of grandTotal)
      const earnRate = 100;
      const loyaltyPointsEarned = Math.floor(grandTotal / earnRate);

      // 3. Verify points if redeeming
      if (customerId && loyaltyPointsRedeemed > 0) {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new Error('Customer not found');
        if (customer.loyaltyPoints < loyaltyPointsRedeemed) throw new Error('Insufficient loyalty points');
      }

      // 4. Validate and Check Stock Levels
      for (const item of orderItems) {
        const pid = item.productId || item.id;
        const product = await tx.product.findUnique({ where: { id: pid } });
        if (!product) throw new Error(`Product ${item.name || pid} not found`);
        if (product.stockQuantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stockQuantity}`);
        }
      }

      // 5. Create the order
      const newOrder = await tx.order.create({
        data: {
          invoiceNo,
          customerId,
          subtotal,
          discount,
          taxTotal,
          grandTotal,
          paymentMode,
          loyaltyPointsEarned,
          loyaltyPointsRedeemed,
          status: 'COMPLETED',
          orderItems: {
            create: orderItems.map((item) => {
              const pid = item.productId || item.id;
              const price = item.price || item.sellingPrice;
              const gst = parseFloat(item.gstRate ?? 18);
              
              if (!pid) throw new Error("Missing Product ID for item");
              if (price === undefined || price === null) throw new Error(`Missing price for product: ${item.name}`);

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

      // 6. Deduct inventory and log it
      for (const item of orderItems) {
        const pid = item.productId || item.id;
        await tx.product.update({
          where: { id: pid },
          data: { stockQuantity: { decrement: item.quantity } }
        });

        await tx.inventoryLog.create({
          data: {
            productId: pid,
            type: 'OUT',
            quantity: item.quantity,
            reason: `Order ${invoiceNo}`
          }
        });
      }

      // 7. Update customer loyalty points and total spent
      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            loyaltyPoints: { increment: loyaltyPointsEarned - (loyaltyPointsRedeemed || 0) },
            totalSpent: { increment: Number(grandTotal) },
            lastPurchaseDate: new Date()
          }
        });
      }

      // 8. Emit real-time events
      const io = req.app.get('io');
      if (io) {
        io.emit('INVENTORY_UPDATE', { items: orderItems });
        io.emit('ORDER_CREATED', newOrder);
      }

      return newOrder;
    });

    // 9. Automated WhatsApp Messaging (Background)
    if (order && order.customerId) {
        prisma.customer.findUnique({ where: { id: order.customerId } })
            .then(customer => {
                if (customer && customer.phone) {
                    return whatsappUtil.sendReceipt(order, customer.phone, req.headers.host);
                }
            })
            .catch(err => console.error('Background WhatsApp Logic Error:', err));
    }

    res.json(order);
  } catch (error) {
    console.error('CRITICAL: Order Creation Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error during order creation' });
  }
});

// Update existing order (Full edit with inventory reversal)
router.put('/:id', auth(['ADMIN', 'MANAGER']), async (req, res) => {
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

      // 2. REVERSE: Increment inventory for old items
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

      // 3. REVERSE: Loyalty and Spending
      if (oldOrder.customerId) {
        await tx.customer.update({
          where: { id: oldOrder.customerId },
          data: {
            loyaltyPoints: { decrement: oldOrder.loyaltyPointsEarned - (oldOrder.loyaltyPointsRedeemed || 0) },
            totalSpent: { decrement: oldOrder.grandTotal }
          }
        });
      }

      // 4. APPLY: Delete old items
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.payment.deleteMany({ where: { orderId: id } });

      // 5. APPLY: Create new items and update stock
      const earnRate = 100;
      const newLoyaltyPointsEarned = Math.floor(grandTotal / earnRate);

      for (const item of newItems) {
        // Double check stock for new quantities
        const pid = item.productId || item.id;
        const product = await tx.product.findUnique({ where: { id: pid } });
        if (!product) throw new Error(`Product not found`);
        
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

      // 6. UPDATE Order Record
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
              const price = item.price || item.sellingPrice;
              const gst = parseFloat(item.gstRate || 18);
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

      // 7. Update new customer loyalty/spent
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
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Update Order Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
