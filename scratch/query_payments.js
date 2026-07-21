const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    const payments = await prisma.purchasePayment.findMany();
    console.log('Total purchase payments count:', payments.length);
    payments.forEach(p => {
      console.log(`ID: ${p.id}, Amount: ${p.amount}, Purchase ID: ${p.purchaseId}, Supplier ID: ${p.supplierId}`);
    });
  } catch (error) {
    console.error('Error querying payments:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
