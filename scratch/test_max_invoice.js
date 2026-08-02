const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const rawMax = await prisma.$queryRaw`
      SELECT MAX(CAST("invoiceNo" AS INTEGER)) as "maxNum" 
      FROM "Order" 
      WHERE "invoiceNo" ~ '^[0-9]+$'
    `;
    console.log("Current Max Invoice Number in DB:", rawMax);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
