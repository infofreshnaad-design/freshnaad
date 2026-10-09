const prisma = require('../src/config/prisma');

async function healOrders() {
  console.log('[Heal Orders] Starting database order integrity audit and healing...');

  try {
    const orders = await prisma.order.findMany({
      include: {
        orderItems: {
          include: { product: true }
        },
        payments: true
      }
    });

    console.log(`[Heal Orders] Auditing ${orders.length} orders...`);

    let healedCount = 0;

    for (const order of orders) {
      if (!order.orderItems || order.orderItems.length === 0) continue;

      let itemsSubtotal = 0;
      let itemsTax = 0;
      let itemsSavings = 0;
      let needsOrderItemMrpUpdate = false;

      for (const item of order.orderItems) {
        const price = Number(item.price || item.sellingPrice || item.product?.sellingPrice || 0);
        const mrp = Number(item.mrp || item.product?.mrp || price);
        const gstRate = Number(item.gstRate || item.product?.gstRate || 0);
        const qty = Number(item.quantity || 0);
        const taxAmount = (price * (gstRate / 100)) * qty;
        const total = (price * qty) + taxAmount;

        itemsSubtotal += price * qty;
        itemsTax += taxAmount;
        itemsSavings += Math.max(0, mrp - price) * qty;

        if (Number(item.mrp || 0) <= 0 && mrp > 0) {
          needsOrderItemMrpUpdate = true;
          await prisma.orderItem.update({
            where: { id: item.id },
            data: { mrp: mrp }
          });
        }
      }

      const discount = Number(order.discount || 0);
      const expectedSubtotal = itemsSubtotal > 0 ? itemsSubtotal : Number(order.subtotal || 0);
      const expectedTax = itemsTax > 0 ? itemsTax : Number(order.taxTotal || 0);
      const expectedGrandTotal = Math.max(0, expectedSubtotal + expectedTax - discount);
      const expectedRoundedTotal = Math.floor(expectedGrandTotal);
      const expectedSavings = Math.max(Number(order.savings || 0), itemsSavings + discount);

      const isCredit = order.paymentMode === 'CREDIT';
      const needsHealing = 
        Math.abs(Number(order.roundedTotal) - expectedRoundedTotal) > 1 ||
        Math.abs(Number(order.grandTotal) - expectedGrandTotal) > 1 ||
        Math.abs(Number(order.subtotal) - expectedSubtotal) > 1 ||
        (expectedSavings > Number(order.savings || 0) && itemsSavings > 0);

      if (needsHealing) {
        console.log(`\n--- Healing Order Invoice #${order.invoiceNo} (ID: ${order.id}) ---`);
        console.log(`BEFORE: subtotal=${order.subtotal}, grand=${order.grandTotal}, rounded=${order.roundedTotal}, savings=${order.savings}, paid=${order.amountPaid}, balance=${order.balance}`);

        const actualPaid = isCredit 
          ? Math.min(Number(order.amountPaid || 0), expectedRoundedTotal)
          : (Number(order.amountPaid) === Number(order.roundedTotal) ? expectedRoundedTotal : Number(order.amountPaid || expectedRoundedTotal));
        const actualBalance = isCredit ? Math.max(0, expectedRoundedTotal - actualPaid) : 0;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            subtotal: expectedSubtotal,
            taxTotal: expectedTax,
            grandTotal: expectedGrandTotal,
            roundedTotal: expectedRoundedTotal,
            savings: expectedSavings,
            amountPaid: actualPaid,
            balance: actualBalance
          }
        });

        // Update payment record if needed
        if (!isCredit && order.payments && order.payments.length > 0) {
          const firstPayment = order.payments[0];
          if (firstPayment.amount === order.roundedTotal || firstPayment.amount < expectedRoundedTotal) {
            await prisma.payment.update({
              where: { id: firstPayment.id },
              data: { amount: actualPaid }
            });
            console.log(`  Updated Payment ID ${firstPayment.id} amount to ${actualPaid}`);
          }
        }

        console.log(`AFTER : subtotal=${expectedSubtotal}, grand=${expectedGrandTotal}, rounded=${expectedRoundedTotal}, savings=${expectedSavings}, paid=${actualPaid}, balance=${actualBalance}`);
        healedCount++;
      }
    }

    console.log(`\n[Heal Orders] Audit completed! Total inconsistent orders healed: ${healedCount}`);

    // Verify invoice 9876 specifically
    const ord9876 = await prisma.order.findFirst({
      where: { invoiceNo: '9876' },
      include: { orderItems: true, payments: true }
    });
    if (ord9876) {
      console.log('\n[Verification] Invoice 9876 State Now:');
      console.log(JSON.stringify({
        invoiceNo: ord9876.invoiceNo,
        subtotal: ord9876.subtotal,
        discount: ord9876.discount,
        grandTotal: ord9876.grandTotal,
        roundedTotal: ord9876.roundedTotal,
        savings: ord9876.savings,
        amountPaid: ord9876.amountPaid,
        balance: ord9876.balance,
        itemsCount: ord9876.orderItems.length,
        payments: ord9876.payments.map(p => ({ method: p.method, amount: p.amount }))
      }, null, 2));
    }

  } catch (error) {
    console.error('[Heal Orders] Error during healing:', error);
  } finally {
    await prisma.$disconnect();
  }
}

healOrders();
