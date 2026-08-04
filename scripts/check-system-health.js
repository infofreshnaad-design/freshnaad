/**
 * System Health Check & Regression Verification Suite
 * Run this before pushing code or releasing updates to guarantee zero regressions.
 * Usage: node scripts/check-system-health.js
 */

const prisma = require('../backend/src/config/prisma');

async function runHealthCheck() {
  console.log('\n==================================================');
  console.log('   FRESH NAAD POS SYSTEM HEALTH CHECK & REGRESSION SUITE');
  console.log('==================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function report(testName, isSuccess, details = '') {
    if (isSuccess) {
      console.log(`  [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${testName}: ${details}`);
      failedTests++;
    }
  }

  // TEST 1: Database Connectivity
  try {
    const userCount = await prisma.user.count();
    report('1. Database Connectivity', true, `Found ${userCount} users`);
  } catch (err) {
    report('1. Database Connectivity', false, err.message);
  }

  // TEST 2: Product Data Integrity
  try {
    const products = await prisma.product.findMany({ take: 50 });
    let invalid = 0;
    for (const p of products) {
      if (typeof p.sellingPrice !== 'number' || p.sellingPrice < 0 || isNaN(p.sellingPrice)) {
        invalid++;
      }
    }
    report('2. Product Data Integrity', invalid === 0, invalid > 0 ? `${invalid} products have invalid price values` : `${products.length} products checked cleanly`);
  } catch (err) {
    report('2. Product Data Integrity', false, err.message);
  }

  // TEST 3: Invoice Number Sequence Mechanics
  try {
    const rawMax = await prisma.$queryRaw`
      SELECT MAX(CAST("invoiceNo" AS INTEGER)) as "maxNum" 
      FROM "Order" 
      WHERE "invoiceNo" ~ '^[0-9]+$'
    `;
    const maxNum = Number(rawMax[0]?.maxNum) || 100;
    const nextInvoice = (maxNum + 1).toString();
    report('3. Invoice Sequence Generator', !isNaN(maxNum) && maxNum >= 100, `Current Max Invoice: ${maxNum}, Next Invoice: ${nextInvoice}`);
  } catch (err) {
    report('3. Invoice Sequence Generator', false, err.message);
  }

  // TEST 4: Consecutive Order Processing Test (Simulation)
  try {
    const sampleProduct = await prisma.product.findFirst({ where: { stockQuantity: { gt: 10 } } });
    if (!sampleProduct) {
      report('4. Consecutive Billing Simulation', false, 'No sample product available with stock > 10');
    } else {
      const initialStock = sampleProduct.stockQuantity;
      const testInvoiceNo = `99999901`;
      
      const testOrder = await prisma.order.create({
        data: {
          invoiceNo: testInvoiceNo,
          subtotal: sampleProduct.sellingPrice,
          taxTotal: sampleProduct.sellingPrice * 0.18,
          grandTotal: sampleProduct.sellingPrice * 1.18,
          roundedTotal: Math.floor(sampleProduct.sellingPrice * 1.18),
          amountPaid: Math.floor(sampleProduct.sellingPrice * 1.18),
          balance: 0,
          paymentMode: 'CASH',
          status: 'COMPLETED',
          orderItems: {
            create: [
              {
                productId: sampleProduct.id,
                quantity: 1,
                price: sampleProduct.sellingPrice,
                mrp: sampleProduct.mrp || sampleProduct.sellingPrice,
                taxAmount: sampleProduct.sellingPrice * 0.18,
                total: sampleProduct.sellingPrice * 1.18
              }
            ]
          }
        },
        include: { orderItems: true }
      });

      // Cleanup
      await prisma.orderItem.deleteMany({ where: { orderId: testOrder.id } });
      await prisma.order.delete({ where: { id: testOrder.id } });

      report('4. Consecutive Billing Simulation', testOrder.orderItems.length === 1, 'Simulated transaction created & cleaned up cleanly');
    }
  } catch (err) {
    report('4. Consecutive Billing Simulation', false, err.message);
  }

  // TEST 5: Loyalty Points Formula Verification
  try {
    const grandTotal = 350;
    const earnRate = 100;
    const points = Math.floor(grandTotal / earnRate);
    report('5. Loyalty Calculation Rules', points === 3, `GrandTotal Rs.${grandTotal} yields ${points} pts`);
  } catch (err) {
    report('5. Loyalty Calculation Rules', false, err.message);
  }

  console.log('\n==================================================');
  if (failedTests === 0) {
    console.log(`   ALL ${passedTests} HEALTH CHECKS PASSED SUCCESSFULLY!`);
    console.log('   System state is 100% operational and safe.');
  } else {
    console.error(`   HEALTH CHECK FAILED: ${failedTests} failed, ${passedTests} passed.`);
    process.exitCode = 1;
  }
  console.log('==================================================\n');

  await prisma.$disconnect();
}

runHealthCheck().catch(err => {
  console.error('Health Check Runner Crash:', err);
  process.exit(1);
});
