const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    let product = await prisma.product.findFirst();
    if (!product) {
      product = await prisma.product.create({
        data: { name: 'Test Decoupled Product', stockQuantity: 10, sellingPrice: 50, purchasePrice: 30 }
      });
    }

    const startStock = product.stockQuantity;
    console.log(`Product ID: ${product.id}`);
    console.log(`Initial stockQuantity: ${startStock}`);

    // --- TEST 1: Stock Procurement Simulation (Decoupled) ---
    const procureQty = 25;
    await prisma.$transaction(async (tx) => {
      const prod = await tx.product.findUnique({ where: { id: product.id } });
      if (prod) {
        await tx.inventoryLog.create({
          data: {
            productId: product.id,
            type: 'IN',
            quantity: procureQty,
            reason: 'Stock Procurement Entry (Decoupled)'
          }
        });
      }
    });

    let pAfterProcurement = await prisma.product.findUnique({ where: { id: product.id } });
    console.log(`Stock after Procurement: ${pAfterProcurement.stockQuantity} (Expected: ${startStock})`);

    // --- TEST 2: Purchase Entry Simulation (Decoupled) ---
    const purchaseQty = 30;
    const newPrice = 40;
    await prisma.$transaction(async (tx) => {
      if (newPrice > 0) {
        await tx.product.update({
          where: { id: product.id },
          data: { purchasePrice: newPrice }
        });
      }
      await tx.inventoryLog.create({
        data: {
          productId: product.id,
          type: 'IN',
          quantity: purchaseQty,
          reason: 'Purchase Invoice Test (Decoupled)'
        }
      });
    });

    let pAfterPurchase = await prisma.product.findUnique({ where: { id: product.id } });
    console.log(`Stock after Purchase: ${pAfterPurchase.stockQuantity} (Expected: ${startStock})`);
    console.log(`Purchase Price after Purchase: ${pAfterPurchase.purchasePrice} (Expected: 40)`);

    const passProcurement = pAfterProcurement.stockQuantity === startStock;
    const passPurchase = pAfterPurchase.stockQuantity === startStock && pAfterPurchase.purchasePrice === 40;

    console.log(`\nOverall Verification: ${passProcurement && passPurchase ? 'SUCCESS' : 'FAILED'}`);

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
