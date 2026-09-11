const prisma = require('../backend/src/config/prisma');

async function testPrismaBulk() {
  try {
    const expensesList = [
      { type: 'GENERAL', amount: 150.0, description: 'Batch Tea & Snacks', date: new Date('2026-09-11') },
      { type: 'GENERAL', amount: 350.0, description: 'Batch Printing', date: new Date('2026-09-11') }
    ];

    const result = await prisma.expense.createMany({
      data: expensesList
    });

    console.log('Successfully inserted bulk expenses via Prisma:', result);

    const fetched = await prisma.expense.findMany({
      where: { description: { startsWith: 'Batch ' } }
    });
    console.log('Fetched inserted expenses:', fetched);

    // Clean up test entries
    await prisma.expense.deleteMany({
      where: { description: { startsWith: 'Batch ' } }
    });
    console.log('Cleaned up test expenses.');
  } catch (err) {
    console.error('Prisma test error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testPrismaBulk();
