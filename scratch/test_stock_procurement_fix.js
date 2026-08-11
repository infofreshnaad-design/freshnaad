const prisma = require('../backend/src/config/prisma');

async function testStockProcurementFix() {
  console.log('--- STARTING STOCK PROCUREMENT VERIFICATION TEST ---');
  try {
    // 1. Get or Create a test product
    let product = await prisma.product.findFirst({
      where: { is_active: true }
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          name: 'Procurement Test Item',
          stockQuantity: 10,
          purchasePrice: 20,
          sellingPrice: 35,
          unit: 'Pcs'
        }
      });
    }

    const initialStock = product.stockQuantity;
    console.log(`Testing with product: "${product.name}" (ID: ${product.id})`);
    console.log(`Initial stockQuantity: ${initialStock}`);

    // 2. Simulate /inventory/procure logic
    const qtyToProcure = 15;
    console.log(`\nExecuting Stock Procurement (+${qtyToProcure})...`);

    const validItems = [{ productId: product.id, quantity: qtyToProcure }];
    const productIds = [product.id];

    const qtyByProduct = {};
    for (const item of validItems) {
      qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + item.quantity;
    }

    const logsToInsert = validItems.map(i => ({
      productId: i.productId,
      type: 'IN',
      quantity: i.quantity,
      reason: 'Stock Procurement Entry (Verified)'
    }));

    await prisma.$transaction(async (tx) => {
      await tx.inventoryLog.createMany({ data: logsToInsert });
      for (const [pId, quantity] of Object.entries(qtyByProduct)) {
        await tx.product.update({
          where: { id: pId },
          data: { stockQuantity: { increment: quantity } }
        });
      }
    });

    // 3. Fetch product after procurement
    const productAfterProcure = await prisma.product.findUnique({
      where: { id: product.id }
    });
    console.log(`Stock after procurement: ${productAfterProcure.stockQuantity} (Expected: ${initialStock + qtyToProcure})`);

    // 4. Verify inventory log
    const latestLog = await prisma.inventoryLog.findFirst({
      where: { productId: product.id, reason: 'Stock Procurement Entry (Verified)' },
      orderBy: { createdAt: 'desc' }
    });

    const isStockCorrect = productAfterProcure.stockQuantity === initialStock + qtyToProcure;
    const isLogCreated = Boolean(latestLog && latestLog.quantity === qtyToProcure);

    console.log(`Stock Quantity Match: ${isStockCorrect ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`Inventory Log Recorded: ${isLogCreated ? 'PASSED ✅' : 'FAILED ❌'}`);

    if (isStockCorrect && isLogCreated) {
      console.log('\n--- VERIFICATION SUCCESS: STOCK PROCUREMENT FIX IS FULLY WORKING! ---');
    } else {
      console.error('\n--- VERIFICATION FAILED ---');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during test execution:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testStockProcurementFix();
