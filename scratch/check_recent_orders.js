const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      invoiceNo: true,
      createdAt: true,
      grandTotal: true
    }
  });
  console.log("Recent Orders:");
  console.table(orders);
}

main().catch(console.error).finally(() => prisma.$disconnect());
