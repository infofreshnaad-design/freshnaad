const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: new Date('2026-07-31T18:30:00.000Z'), // Aug 1 00:00 IST
          lte: new Date('2026-08-01T18:29:59.999Z')  // Aug 1 23:59 IST
        }
      },
      select: {
        invoiceNo: true,
        grandTotal: true,
        createdAt: true,
        paymentMode: true
      },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`Found ${orders.length} bills for 01/08/2026:`);
    orders.forEach(o => {
      console.log(`Invoice: ${o.invoiceNo} | Total: ₹${o.grandTotal} | Date: ${o.createdAt.toISOString()}`);
    });
  } catch (error) {
    console.error("Error querying database:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
