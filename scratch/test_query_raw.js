const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    const result = await prisma.$queryRaw`
      SELECT MAX(CAST("invoiceNo" AS INTEGER)) as "maxNum" 
      FROM "Purchase" 
      WHERE "invoiceNo" ~ '^[0-9]+$'
    `;
    console.log('Result for Purchase table:', result);
    console.log('maxNum:', result[0]?.maxNum);
    const maxNum = result[0]?.maxNum || 1000;
    console.log('Final maxNum + 1:', maxNum + 1);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
