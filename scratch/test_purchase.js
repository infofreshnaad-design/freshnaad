const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    const product = await prisma.product.findFirst();
    const supplier = await prisma.supplier.findFirst();
    
    console.log('Using Product:', product ? product.name : 'NONE');
    console.log('Using Supplier:', supplier ? supplier.name : 'NONE');
    
    if (!product || !supplier) {
      console.log('Please make sure you have at least one product and supplier in the database.');
      return;
    }
    
    const purchaseData = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      purchaseItems: [
        {
          productId: product.id,
          quantity: 2,
          price: 10,
          total: 20
        }
      ],
      subtotal: 20,
      totalDiscount: 0,
      taxTotal: 0,
      grandTotal: 20,
      amountPaid: 20,
      balanceDue: 0,
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      date: new Date().toISOString()
    };
    
    const { 
      supplierId,
      supplierName, 
      purchaseItems, 
      paymentMode, 
      paymentStatus,
      date 
    } = purchaseData;

    const subtotal = Number(purchaseData.subtotal) || 0;
    const taxTotal = Number(purchaseData.taxTotal) || 0;
    const totalDiscount = Number(purchaseData.totalDiscount) || 0;
    const grandTotal = Number(purchaseData.grandTotal) || 0;
    const amountPaid = Number(purchaseData.amountPaid) || 0;
    const balanceDue = Number(purchaseData.balanceDue) || 0;

    console.log('Starting purchase transaction');
    
    const purchase = await prisma.$transaction(async (tx) => {
      // Generate Simple Sequential Purchase Invoice Number safely
      const result = await tx.$queryRaw`
        SELECT MAX(CAST("invoiceNo" AS INTEGER)) as "maxNum" 
        FROM "Purchase" 
        WHERE "invoiceNo" ~ '^[0-9]+$'
      `;
      const maxNum = result[0]?.maxNum || 1000;
      const invoiceNo = (maxNum + 1).toString();

      console.log('Generated Invoice Number:', invoiceNo);

      // 1. Create the purchase record
      const newPurchase = await tx.purchase.create({
        data: {
          invoiceNo,
          supplierId,
          supplierName,
          subtotal,
          taxTotal,
          totalDiscount: totalDiscount || 0,
          grandTotal,
          amountPaid: amountPaid || 0,
          balanceDue: balanceDue || 0,
          paymentMode: paymentMode || 'CASH',
          paymentStatus: paymentStatus || 'PAID',
          date: date ? new Date(date) : new Date(),
          status: 'COMPLETED',
          purchaseItems: {
            create: purchaseItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              discount: item.discount || 0,
              discountPercent: item.discountPercent || 0,
              taxAmount: item.taxAmount || 0,
              total: item.total
            }))
          },
          payments: amountPaid > 0 ? {
            create: {
              amount: amountPaid,
              method: paymentMode || 'CASH',
              date: date ? new Date(date) : new Date()
            }
          } : undefined
        }
      });

      // 2. Parallel Inventory Updates
      const inventoryUpdates = purchaseItems.map(item => [
        tx.product.update({
          where: { id: item.productId },
          data: { 
            stockQuantity: { increment: item.quantity },
            purchasePrice: item.price // Update master inventory price
          }
        }),
        tx.inventoryLog.create({
          data: {
            productId: item.productId,
            type: 'IN',
            quantity: item.quantity,
            reason: `Purchase ${invoiceNo}`
          }
        })
      ]).flat();

      await Promise.all(inventoryUpdates);
      
      return newPurchase;
    });

    console.log('Purchase created successfully:', purchase);
  } catch (error) {
    console.error('CRITICAL PURCHASE ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
