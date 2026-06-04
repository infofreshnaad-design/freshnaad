require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        invoiceNo: true,
        createdAt: true,
        grandTotal: true
      }
    });
    console.log(`Total Orders: ${orders.length}`);
    console.log('Orders:');
    orders.forEach(o => {
      console.log(` - Invoice #${o.invoiceNo}: ${o.createdAt.toISOString()} (Total: ${o.grandTotal})`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
