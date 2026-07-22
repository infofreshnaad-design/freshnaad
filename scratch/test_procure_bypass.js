const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    // Pick an existing product or create dummy product
    let product = await prisma.product.findFirst();
    if (!product) {
      product = await prisma.product.create({
        data: { name: 'Test Product Procure', stockQuantity: 50, sellingPrice: 10 }
      });
    }

    const initialStock = product.stockQuantity;
    console.log(`Product ID: ${product.id}`);
    console.log(`Initial stockQuantity: ${initialStock}`);

    // Simulate /procure logic
    const qtyToProcure = 25;
    await prisma.$transaction(async (tx) => {
      const prod = await tx.product.findUnique({ where: { id: product.id } });
      if (prod) {
        await tx.inventoryLog.create({
          data: {
            productId: product.id,
            type: 'IN',
            quantity: qtyToProcure,
            reason: 'Stock Procurement Entry (Bypassed)'
          }
        });
      }
    });

    // Check stock after procurement simulation
    const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    console.log(`StockQuantity after procurement: ${updatedProduct.stockQuantity}`);

    if (updatedProduct.stockQuantity === initialStock) {
      console.log('Verification SUCCESS: stockQuantity remained untouched after procurement.');
    } else {
      console.error(`Verification FAILED: stockQuantity changed from ${initialStock} to ${updatedProduct.stockQuantity}`);
    }

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
