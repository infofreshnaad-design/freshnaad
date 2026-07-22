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

                // Inventory stock updates are bypassed to keep procurement disconnected from stock levels
                const prod = await tx.product.findUnique({
                    where: { id: item.productId }
                });

                if (prod) {
                    await tx.inventoryLog.create({
                        data: {
                            productId: item.productId,
                            type: 'IN',
                            quantity: qty,
                            reason: 'Stock Procurement Entry'
                        }
                    });
                    results.push(prod);
                }
            }

            return results;
        });

        res.json({ message: 'Stock procurement entry processed successfully', products: updatedProducts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
