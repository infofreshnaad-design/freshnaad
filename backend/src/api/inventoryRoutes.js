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

        const validItems = items
            .map(item => ({
                productId: item.productId,
                quantity: parseFloat(item.quantity)
            }))
            .filter(item => item.productId && !isNaN(item.quantity) && item.quantity > 0);

        if (validItems.length === 0) {
            return res.status(400).json({ error: 'No valid items with positive quantity provided' });
        }

        const productIds = [...new Set(validItems.map(i => i.productId))];

        // 1. Bulk pre-fetch all products in a single database round-trip
        const existingProducts = await prisma.product.findMany({
            where: { id: { in: productIds } }
        });
        const existingProductIds = new Set(existingProducts.map(p => p.id));

        const logsToInsert = validItems
            .filter(i => existingProductIds.has(i.productId))
            .map(i => ({
                productId: i.productId,
                type: 'IN',
                quantity: i.quantity,
                reason: 'Stock Procurement Entry'
            }));

        if (logsToInsert.length === 0) {
            return res.status(404).json({ error: 'Specified products do not exist' });
        }

        // Aggregate quantities per product for clean atomic updates
        const qtyByProduct = {};
        for (const item of validItems) {
            if (existingProductIds.has(item.productId)) {
                qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + item.quantity;
            }
        }

        // 2. Perform atomic database updates inside transaction
        const updatedProducts = await prisma.$transaction(async (tx) => {
            // A. Create inventory log entries
            await tx.inventoryLog.createMany({
                data: logsToInsert
            });

            // B. Increment stockQuantity for each product in DB
            for (const [productId, quantity] of Object.entries(qtyByProduct)) {
                await tx.product.update({
                    where: { id: productId },
                    data: {
                        stockQuantity: { increment: quantity }
                    }
                });
            }

            // C. Return updated products
            return await tx.product.findMany({
                where: { id: { in: productIds } }
            });
        }, { timeout: 15000 });

        res.json({ message: 'Stock procurement entry processed successfully', products: updatedProducts });
    } catch (error) {
        console.error('[Procurement API Error]', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
