const prisma = require('../backend/src/config/prisma');

// Simulating the rewritten deletePaymentOut logic
async function simulateDeletePaymentOut(id) {
  const payment = await prisma.purchasePayment.findUnique({
    where: { id },
    include: { purchase: true }
  });

  if (!payment) throw new Error('Payment not found');

  const operations = [];

  if (payment.purchaseId && payment.purchase) {
    const purchase = payment.purchase;
    const newAmountPaid = Math.max(0, purchase.amountPaid - payment.amount);
    const newBalanceDue = Math.max(0, purchase.grandTotal - newAmountPaid);
    const newPaymentStatus = newAmountPaid <= 0 ? 'PENDING' : 'PARTIAL';

    operations.push(
      prisma.purchase.update({
        where: { id: payment.purchaseId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
          paymentStatus: newPaymentStatus
        }
      })
    );
  }

  operations.push(
    prisma.purchasePayment.delete({ where: { id } })
  );

  const results = await prisma.$transaction(operations);
  return results[results.length - 1];
}

async function test() {
  try {
    const supplier = await prisma.supplier.findFirst();
    if (!supplier) {
      console.log('No supplier found.');
      return;
    }

    // 1. Create purchase and payment
    const purchase = await prisma.purchase.create({
      data: {
        invoiceNo: `TEST-NEW-${Date.now()}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        subtotal: 100,
        taxTotal: 0,
        totalDiscount: 0,
        grandTotal: 100,
        amountPaid: 100,
        balanceDue: 0,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        status: 'COMPLETED',
        payments: {
          create: {
            amount: 100,
            method: 'CASH'
          }
        }
      },
      include: { payments: true }
    });
    console.log('Created test purchase & payment:', purchase);

    const payment = purchase.payments[0];

    // 2. Run simulation
    console.log('Running simulateDeletePaymentOut on:', payment.id);
    const result = await simulateDeletePaymentOut(payment.id);
    console.log('Delete result:', result);

    // Verify purchase status after deleting the payment
    const updatedPurchase = await prisma.purchase.findUnique({
      where: { id: purchase.id }
    });
    console.log('Updated purchase in DB:', updatedPurchase);

    // 3. Clean up
    await prisma.purchase.delete({ where: { id: purchase.id } });
    console.log('Cleaned up test purchase.');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
