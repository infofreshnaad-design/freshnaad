const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    // Get or create product for testing
    let product = await prisma.product.findFirst();
    if (!product) {
      product = await prisma.product.create({
        data: { name: 'Test Product Stock Update', stockQuantity: 10, sellingPrice: 50, purchasePrice: 30 }
      });
    }

    const startStock = product.stockQuantity;
    console.log(`Test Product ID: ${product.id}`);
    console.log(`Initial stockQuantity: ${startStock}`);

    // --- TEST 1: Stock Procurement Simulation ---
    const procureQty = 15;
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: { stockQuantity: { increment: procureQty } }
      });
      await tx.inventoryLog.create({
        data: {
          productId: product.id,
          type: 'IN',
          quantity: procureQty,
          reason: 'Stock Procurement Test'
        }
      });
    });

    let pAfterProcurement = await prisma.product.findUnique({ where: { id: product.id } });
    console.log(`Stock after Procurement (+15): ${pAfterProcurement.stockQuantity} (Expected: ${startStock + 15})`);

    // --- TEST 2: Purchase Entry Simulation ---
    const purchaseQty = 20;
    const newPrice = 35;
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: {
          stockQuantity: { increment: purchaseQty },
          purchasePrice: newPrice
        }
      });
      await tx.inventoryLog.create({
        data: {
          productId: product.id,
          type: 'IN',
          quantity: purchaseQty,
          reason: 'Purchase Invoice Test'
        }
      });
    });

    let pAfterPurchase = await prisma.product.findUnique({ where: { id: product.id } });
    console.log(`Stock after Purchase (+20): ${pAfterPurchase.stockQuantity} (Expected: ${startStock + 15 + 20})`);
    console.log(`Purchase price after Purchase: ${pAfterPurchase.purchasePrice} (Expected: 35)`);

    const passProcurement = pAfterProcurement.stockQuantity === startStock + 15;
    const passPurchase = pAfterPurchase.stockQuantity === startStock + 35 && pAfterPurchase.purchasePrice === 35;

    console.log(`\nOverall Verification: ${passProcurement && passPurchase ? 'SUCCESS' : 'FAILED'}`);

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
