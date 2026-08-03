const prisma = require('../backend/src/config/prisma');

async function testBatchProcure() {
    try {
        console.log('Fetching sample products...');
        const products = await prisma.product.findMany({ take: 3 });
        if (products.length === 0) {
            console.log('No products found to test.');
            return;
        }

        const validItems = products.map((p, idx) => ({
            productId: p.id,
            quantity: (idx + 1) * 5
        }));

        const productIds = [...new Set(validItems.map(i => i.productId))];

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
                reason: 'Test Batch Procurement'
            }));

        console.log(`Inserting ${logsToInsert.length} log records via createMany...`);
        const result = await prisma.inventoryLog.createMany({
            data: logsToInsert
        });

        console.log(`Success! Inserted ${result.count} inventory log entries.`);
    } catch (err) {
        console.error('Batch Procure Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testBatchProcure();
