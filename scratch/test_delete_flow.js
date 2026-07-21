const prisma = require('../backend/src/config/prisma');
const apService = require('../backend/src/services/apService');

async function test() {
  try {
    // 1. Get an active supplier
    const supplier = await prisma.supplier.findFirst();
    if (!supplier) {
      console.log('No supplier found to test with.');
      return;
    }
    console.log(`Using supplier: ${supplier.name} (${supplier.id})`);

    // 2. Create a payment out (general settlement)
    const paymentResult = await apService.processPaymentOut({
      supplierId: supplier.id,
      amount: 70.8,
      method: 'CASH',
      transactionId: 'TEST-123',
      date: new Date()
    });
    console.log('Payment created:', paymentResult);

    // 3. Find the created payment
    const payment = await prisma.purchasePayment.findFirst({
      where: {
        supplierId: supplier.id,
        amount: 70.8,
        transactionId: 'TEST-123'
      }
    });

    if (!payment) {
      throw new Error('Created payment could not be found');
    }
    console.log('Created payment record:', payment);

    // 4. Try to delete the payment using apService.deletePaymentOut
    console.log('Attempting to delete payment...');
    const deleteResult = await apService.deletePaymentOut(payment.id);
    console.log('Payment deleted successfully:', deleteResult);

  } catch (error) {
    console.error('CRITICAL ERROR DURING FLOW:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
