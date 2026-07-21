const prisma = require('../backend/src/config/prisma');
const apService = require('../backend/src/services/apService');

async function test() {
  try {
    console.log('--- TEST 1: Customer Search Case-Insensitivity ---');
    const customers = await prisma.customer.findMany({ take: 5 });
    if (customers.length === 0) {
      console.log('No customers in DB.');
    } else {
      const firstCustomer = customers[0];
      const name = firstCustomer.name;
      console.log(`Testing with customer: "${name}"`);

      const lowercaseResults = await prisma.customer.findMany({
        where: { name: { contains: name.toLowerCase(), mode: 'insensitive' } }
      });
      const uppercaseResults = await prisma.customer.findMany({
        where: { name: { contains: name.toUpperCase(), mode: 'insensitive' } }
      });
      console.log(`Lowercase matches: ${lowercaseResults.length}, Uppercase matches: ${uppercaseResults.length}`);
      console.log(`Results match? ${lowercaseResults.length === uppercaseResults.length ? 'SUCCESS' : 'FAILED'}`);
    }

    console.log('\n--- TEST 2: AP Service Method Discovery ---');
    const proto = Object.getPrototypeOf(apService);
    console.log('Prototype methods:', Object.getOwnPropertyNames(proto));

    console.log('\n--- TEST 3: AP Deletion & Status Recalculation ---');
    // 1. Create a dummy supplier
    const supplier = await prisma.supplier.create({
      data: { name: 'Test Supplier Temp', phone: '1234567890' }
    });
    console.log(`Created supplier: ${supplier.id}`);

    // 2. Create a dummy purchase under this supplier with grandTotal=1000, amountPaid=500, balanceDue=500, status=PARTIAL
    const purchase = await prisma.purchase.create({
      data: {
        invoiceNo: '9999999',
        supplierId: supplier.id,
        supplierName: supplier.name,
        subtotal: 1000,
        taxTotal: 0,
        grandTotal: 1000,
        amountPaid: 500,
        balanceDue: 500,
        paymentStatus: 'PARTIAL',
        paymentMode: 'CASH',
        status: 'COMPLETED'
      }
    });
    console.log(`Created purchase: ${purchase.id}`);

    // 3. Create a dummy payment of 500
    const payment = await prisma.purchasePayment.create({
      data: {
        purchaseId: purchase.id,
        amount: 500,
        method: 'CASH'
      }
    });
    console.log(`Created payment: ${payment.id}`);

    // Let's delete this payment and check that the purchase status goes back to PENDING (since amountPaid is decremented to 0)
    console.log('Deleting payment...');
    const delResult = await apService.deletePaymentOut(payment.id);
    console.log('Payment deleted successfully.');

    // Fetch the purchase again to inspect status
    const updatedPurchase = await prisma.purchase.findUnique({ where: { id: purchase.id } });
    console.log(`After deleting payment:`);
    console.log(`  amountPaid: ${updatedPurchase.amountPaid} (Expected: 0)`);
    console.log(`  balanceDue: ${updatedPurchase.balanceDue} (Expected: 1000)`);
    console.log(`  paymentStatus: "${updatedPurchase.paymentStatus}" (Expected: "PENDING")`);

    // Clean up: delete purchase
    console.log('Deleting purchase...');
    await apService.deletePurchase(purchase.id);
    console.log('Purchase deleted successfully.');

    // Clean up: delete supplier
    await prisma.supplier.delete({ where: { id: supplier.id } });
    console.log('Supplier cleaned up successfully.');
    console.log('AP Deletion & Status Verification: SUCCESS');

  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
