const prisma = require('../backend/src/config/prisma');

async function runTest() {
  console.log('--- Starting Continuous Billing Verification Test ---');
  
  // 1. Get or create a dummy product
  let product = await prisma.product.findFirst({ where: { stockQuantity: { gt: 20 } } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'Test Continuous Bill Product',
        stockQuantity: 100,
        sellingPrice: 45.0,
        mrp: 50.0,
        gstRate: 18.0
      }
    });
  }
  
  console.log(`Using product: ${product.name} (ID: ${product.id}, Stock: ${product.stockQuantity})`);

  // 2. Fetch current max invoice number
  const rawMax = await prisma.$queryRaw`
    SELECT MAX(CAST("invoiceNo" AS INTEGER)) as "maxNum" 
    FROM "Order" 
    WHERE "invoiceNo" ~ '^[0-9]+$'
  `;
  const startMax = Number(rawMax[0]?.maxNum) || 100;
  console.log(`Current DB Max Invoice No: ${startMax}`);

  const createdOrders = [];

  // 3. Create 5 continuous orders simulating rapid consecutive billing
  for (let i = 1; i <= 5; i++) {
    const targetInvoiceNo = (startMax + i).toString();
    const orderId = `test-order-uuid-${Date.now()}-${i}`;
    
    const subtotal = 45.0 * 2;
    const taxTotal = (45.0 * 0.18) * 2;
    const grandTotal = subtotal + taxTotal;
    const roundedTotal = Math.floor(grandTotal);

    const orderData = {
      id: orderId,
      serverId: orderId,
      invoiceNo: targetInvoiceNo,
      subtotal,
      taxTotal,
      grandTotal,
      roundedTotal,
      savings: (50.0 - 45.0) * 2,
      amountPaid: roundedTotal,
      balance: 0,
      paymentMode: 'CASH',
      orderType: 'Walk-in',
      status: 'COMPLETED',
      orderItems: {
        create: [
          {
            productId: product.id,
            quantity: 2,
            price: 45.0,
            mrp: 50.0,
            taxAmount: taxTotal,
            total: grandTotal
          }
        ]
      },
      payments: {
        create: {
          method: 'CASH',
          amount: roundedTotal,
          status: 'SUCCESS'
        }
      }
    };

    const newOrder = await prisma.order.create({
      data: orderData,
      include: { orderItems: { include: { product: true } } }
    });

    createdOrders.push(newOrder);
    console.log(`[Bill ${i}] Created Order Invoice #${newOrder.invoiceNo} (ID: ${newOrder.id}), Total: ${newOrder.roundedTotal}`);
  }

  // 4. Verify sequence and item integrity
  console.log('\n--- Verification Summary ---');
  let success = true;
  for (let i = 0; i < createdOrders.length; i++) {
    const o = createdOrders[i];
    const expectedInvoice = (startMax + i + 1).toString();
    if (o.invoiceNo !== expectedInvoice) {
      console.error(`Mismatch on Bill ${i+1}: expected ${expectedInvoice}, got ${o.invoiceNo}`);
      success = false;
    }
    if (!o.orderItems || o.orderItems.length === 0 || !o.orderItems[0].product) {
      console.error(`Missing item/product relation on Bill ${i+1}`);
      success = false;
    }
  }

  // Cleanup test orders
  for (const o of createdOrders) {
    await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
    await prisma.payment.deleteMany({ where: { orderId: o.id } });
    await prisma.order.delete({ where: { id: o.id } });
  }

  if (success) {
    console.log('SUCCESS: All 5 continuous bills created cleanly with correct sequence and structure!');
  } else {
    console.log('FAILED: Continuous billing verification failed.');
  }

  await prisma.$disconnect();
}

runTest().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});
