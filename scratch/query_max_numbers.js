const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    const pMax = await prisma.$queryRaw`
      SELECT "invoiceNo" FROM "Purchase"
    `;
    const poMax = await prisma.$queryRaw`
      SELECT "poNumber" FROM "PurchaseOrder"
    `;
    const prMax = await prisma.$queryRaw`
      SELECT "returnNo" FROM "PurchaseReturn"
    `;
    const srMax = await prisma.$queryRaw`
      SELECT "returnNo" FROM "SalesReturn"
    `;
    
    console.log('Purchases:', pMax);
    console.log('PurchaseOrders:', poMax);
    console.log('PurchaseReturns:', prMax);
    console.log('SalesReturns:', srMax);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
