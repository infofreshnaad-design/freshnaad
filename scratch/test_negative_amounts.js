const prisma = require('../backend/src/config/prisma');
const apService = require('../backend/src/services/apService');

async function test() {
  try {
    const supplier = await prisma.supplier.findFirst();
    if (!supplier) {
      console.log('No supplier found.');
      return;
    }

    // 1. Process a purchase with 40 paid
    const purchase = await apService.processPurchase({
      invoiceNo: `TEST-NEG-${Date.now()}`,
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

    // 2. Insert a purchase payment of 70.8 linked to this purchase (simulating mismatch)
    const payment = await prisma.purchasePayment.create({
      data: {
        purchaseId: purchase.id,
        amount: 70.8,
        method: 'CASH',
        date: new Date()
      }
    });
    console.log('Payment created with mismatching amount 70.8:', payment);

    // 3. Attempt to delete this payment (which will try to decrement 70.8 from 40, resulting in -30.8)
    console.log('Attempting to delete payment (expecting decrement to negative)...');
    const deleteResult = await apService.deletePaymentOut(payment.id);
    console.log('Payment deleted successfully:', deleteResult);

    // 4. Clean up purchase
    console.log('Cleaning up purchase...');
    await apService.deletePurchase(purchase.id);
    console.log('Cleaned up successfully.');

  } catch (error) {
    console.error('CRITICAL ERROR DURING NEGATIVE FLOW:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
