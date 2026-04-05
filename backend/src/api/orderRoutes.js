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

    // Safer Sequential Invoice Generation (Handles deletions correctly)
    const latestOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNo: true }
    });
    
    let nextNum = 1001;
    if (latestOrder) {
      const match = latestOrder.invoiceNo.match(/\d+/);
      if (match) nextNum = parseInt(match[0]) + 1;
    }
    const invoiceNo = `${nextNum}`;


    const order = await prisma.$transaction(async (tx) => {
      // 1. Calculate points earned (1 point per ₹100 of grandTotal)
      const earnRate = 100;
      const loyaltyPointsEarned = Math.floor(grandTotal / earnRate);

      // 2. Verify points if redeeming
      if (customerId && loyaltyPointsRedeemed > 0) {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new Error('Customer not found');
        if (customer.loyaltyPoints < loyaltyPointsRedeemed) throw new Error('Insufficient loyalty points');
      }

      // 3. Check Stock Levels (Guard against negative stock)
      for (const item of orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.id } });
        if (!product) throw new Error(`Product ${item.name} not found`);
        if (product.stockQuantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stockQuantity}`);
        }
      }

      // 4. Create the order
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
              const gst = parseFloat(item.gstRate ?? item.product?.gstRate ?? 18);
              return {
                productId: item.id,
                quantity: item.quantity,
                price: item.sellingPrice,
                discount: item.discount || 0,
                taxAmount: (item.sellingPrice * (gst / 100)) * item.quantity,
                total: (item.sellingPrice * item.quantity) + ((item.sellingPrice * (gst / 100)) * item.quantity)
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
          orderItems: {
            include: {
              product: true
            }
          },
          payments: true
        }
      });

      // 5. Deduct inventory and log it
      for (const item of orderItems) {
        await tx.product.update({
          where: { id: item.id },
          data: {
            stockQuantity: {
              decrement: item.quantity
            }
          }
        });

        await tx.inventoryLog.create({
          data: {
            productId: item.id,
            type: 'OUT',
            quantity: item.quantity,
            reason: `Order ${invoiceNo}`
          }
        });
      }

      // 6. Update customer loyalty points and total spent
      if (customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            loyaltyPoints: {
              increment: loyaltyPointsEarned - (loyaltyPointsRedeemed || 0)
            },
            totalSpent: {
              increment: Number(grandTotal)
            },
            lastPurchaseDate: new Date()
          }
        });
      }

      // 7. Emit real-time events for other terminals
      const io = req.app.get('io');
      if (io) {
        io.emit('INVENTORY_UPDATE', { items: orderItems });
        io.emit('ORDER_CREATED', newOrder);
      }

      return newOrder;
    });

    // 8. Automated WhatsApp Messaging (Background - Non-blocking for terminal speed)
    if (order && order.customerId) {
        // Fire and forget - don't await so the terminal gets an instant response
        prisma.customer.findUnique({ where: { id: order.customerId } })
            .then(customer => {
                if (customer && customer.phone) {
                    return whatsappUtil.sendReceipt(order, customer.phone, req.headers.host);
                }
            })
            .then(waResult => {
                if (waResult) order.whatsappStatus = waResult;
            })
            .catch(err => console.error('Background WhatsApp Automation Error:', err));
    }

    res.json(order);
  } catch (error) {
    console.error('Order Error:', error);
    res.status(500).json({ error: error.message });
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
