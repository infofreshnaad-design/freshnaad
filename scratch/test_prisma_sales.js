const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const sales = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: new Date('2026-07-30T18:30:00.000Z'),
          lte: new Date('2026-07-31T18:30:00.000Z')
        }
      },
      include: { customer: true, payments: true },
      orderBy: { createdAt: 'desc' }
    });
    console.log("Success! Found", sales.length, "sales.");
  } catch (error) {
    console.error("Prisma Failed:", error.message);
  }
}

main().finally(() => prisma.$disconnect());
