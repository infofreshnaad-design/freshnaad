const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    const purchases = await prisma.purchase.findMany({
      select: {
        id: true,
        invoiceNo: true,
        supplierName: true,
        grandTotal: true,
        createdAt: true
      },
      orderBy: {
        invoiceNo: 'asc'
      }
    });
    console.log('Existing Purchases:');
    console.log(JSON.stringify(purchases, null, 2));
    console.log('Total Count:', purchases.length);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
