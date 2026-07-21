const prisma = require('../backend/src/config/prisma');
const apService = require('../backend/src/services/apService');

async function test() {
  try {
    // 1. Get an active supplier
    const supplier = await prisma.supplier.findFirst();
    if (!supplier) {
      console.log('No supplier found.');
      return;
    }
    console.log(`Using supplier: ${supplier.name}`);

    // 2. Process a purchase with a payment
    const purchase = await apService.processPurchase({
      invoiceNo: `TEST-PUR-${Date.now()}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      subtotal: 100,
      grandTotal: 100,
      amountPaid: 40,
      paymentMode: 'CASH',
      date: new Date(),
      items: [{ name: 'Test Product', quantity: 2, price: 50 }]
    });
    console.log('Purchase created:', purchase);

    // 3. Find the created purchase payment
    const payment = await prisma.purchasePayment.findFirst({
      where: {
        purchaseId: purchase.id
      }
    });

    if (!payment) {
      throw new Error('Created payment was not found');
    }
    console.log('Found linked payment:', payment);

    // 4. Try to delete the payment
    console.log('Attempting to delete linked payment...');
    const deleteResult = await apService.deletePaymentOut(payment.id);
    console.log('Linked payment deleted successfully:', deleteResult);

    // 5. Clean up purchase
    console.log('Cleaning up purchase...');
    await apService.deletePurchase(purchase.id);
    console.log('Cleaned up successfully.');

  } catch (error) {
    console.error('CRITICAL ERROR DURING LINKED FLOW:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
