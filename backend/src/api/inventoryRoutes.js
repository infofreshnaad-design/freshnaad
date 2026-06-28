const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// Simple in-memory lock (for production use Redis or DB-based lock)
const locks = new Map();

const auth = require('../middleware/auth');

router.post('/lock/:productId', (req, res) => {
    const { productId } = req.params;
    const { terminalId } = req.body;

    const existingLock = locks.get(productId);
    if (existingLock && existingLock.terminalId !== terminalId && Date.now() - existingLock.timestamp < 30000) {
        return res.status(423).json({ message: 'Product is being billed on another terminal' });
    }

    locks.set(productId, { terminalId, timestamp: Date.now() });
    res.json({ status: 'locked' });
});

router.post('/unlock/:productId', (req, res) => {
    const { productId } = req.params;
    const { terminalId } = req.body;

    const existingLock = locks.get(productId);
    if (existingLock && existingLock.terminalId === terminalId) {
        locks.delete(productId);
    }
    res.json({ status: 'unlocked' });
});

router.post('/procure', auth(['ADMIN', 'MANAGER'], 'STOCK_PROCUREMENT'), async (req, res) => {
    try {
        const { items } = req.body; // array of { productId, quantity }
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Items list required' });
        }

        const updatedProducts = await prisma.$transaction(async (tx) => {
            const results = [];
            for (const item of items) {
                const qty = parseFloat(item.quantity);
                if (isNaN(qty) || qty <= 0) {
                    throw new Error(`Invalid quantity for product ${item.productId}`);
                }

                const prod = await tx.product.update({
                    where: { id: item.productId },
                    data: { stockQuantity: { increment: qty } }
                });

                await tx.inventoryLog.create({
                    data: {
                        productId: item.productId,
                        type: 'IN',
                        quantity: qty,
                        reason: 'Stock Procurement'
                    }
                });

                results.push(prod);
            }

            // Emit real-time events for other terminals
            const io = req.app.get('io');
            if (io) {
                io.emit('INVENTORY_UPDATE', { items: items.map(i => ({ id: i.productId, quantity: parseFloat(i.quantity) })) });
            }

            return results;
        });

        res.json({ message: 'Stock updated successfully', products: updatedProducts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
