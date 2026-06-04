const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const jsonPath = path.join(__dirname, '../backups/pos-recovery.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Recovery file not found at: ${jsonPath}`);
    console.error('Please place the downloaded "pos-recovery.json" file in the "backend/backups/" folder.');
    process.exit(1);
  }

  console.log('--- STARTING RESTORE FROM JSON FILE ---');
  try {
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(rawData);

    let categoryMap = {};
    
    // 1. Restore Categories
    if (data.categories && data.categories.length > 0) {
      console.log(`Restoring ${data.categories.length} categories...`);
      for (const cat of data.categories) {
        const restored = await prisma.category.upsert({
          where: { name: cat.name },
          update: {},
          create: { id: cat.id, name: cat.name }
        });
        categoryMap[cat.id] = restored.id;
      }
    }
    
    // 2. Restore Products
    if (data.products && data.products.length > 0) {
      console.log(`Restoring ${data.products.length} products...`);
      for (const prod of data.products) {
        const { orderItems, purchaseItems, salesReturnItems, purchaseReturnItems, inventoryLogs, purchaseOrderItems, category, ...prodClean } = prod;
        if (prodClean.categoryId) {
          prodClean.categoryId = categoryMap[prodClean.categoryId] || prodClean.categoryId;
        }
        await prisma.product.upsert({
          where: { id: prodClean.id },
          update: prodClean,
          create: prodClean
        });
      }
    }
    
    // 3. Restore Customers
    let customerMap = {};
    if (data.customers && data.customers.length > 0) {
      console.log(`Restoring ${data.customers.length} customers...`);
      for (const cust of data.customers) {
        const { orders, salesReturns, ...custClean } = cust;
        
        let existing = null;
        if (custClean.phone) {
          existing = await prisma.customer.findUnique({
            where: { phone: custClean.phone }
          });
        }
        
        if (existing) {
          customerMap[custClean.id] = existing.id;
          await prisma.customer.update({
            where: { id: existing.id },
            data: custClean
          });
        } else {
          const restored = await prisma.customer.upsert({
            where: { id: custClean.id },
            update: custClean,
            create: custClean
          });
          customerMap[custClean.id] = restored.id;
        }
      }
    }
    
    // 4. Restore Orders
    if (data.orders && data.orders.length > 0) {
      console.log(`Restoring ${data.orders.length} orders...`);
      let orderCount = 0;
      for (const ord of data.orders) {
        let resolvedCustomerId = ord.customerId ? (customerMap[ord.customerId] || ord.customerId) : null;
        
        if (resolvedCustomerId) {
          const customerExists = await prisma.customer.findUnique({
            where: { id: resolvedCustomerId }
          });
          if (!customerExists) {
            console.log(`⚠️ Customer ID ${resolvedCustomerId} not found in DB. Setting customerId to null for Order #${ord.invoiceNo}.`);
            resolvedCustomerId = null;
          }
        }
        
        const cleanOrder = {
          id: ord.id,
          invoiceNo: ord.invoiceNo,
          customerId: resolvedCustomerId,
          subtotal: parseFloat(ord.subtotal) || 0,
          discount: parseFloat(ord.discount) || 0,
          taxTotal: parseFloat(ord.taxTotal) || 0,
          grandTotal: parseFloat(ord.grandTotal) || 0,
          savings: parseFloat(ord.savings) || 0,
          roundedTotal: parseFloat(ord.roundedTotal) || parseFloat(ord.grandTotal) || 0,
          amountPaid: parseFloat(ord.amountPaid) || 0,
          balance: parseFloat(ord.balance) || 0,
          loyaltyPointsEarned: parseInt(ord.loyaltyPointsEarned) || 0,
          loyaltyPointsRedeemed: parseInt(ord.loyaltyPointsRedeemed) || 0,
          paymentMode: ord.paymentMode,
          orderType: ord.orderType || 'Walk-in',
          status: ord.status || 'COMPLETED',
          isSynced: ord.isSynced !== undefined ? ord.isSynced : true,
          serverId: ord.serverId || null,
          createdAt: ord.createdAt ? new Date(ord.createdAt) : new Date(),
          updatedAt: ord.updatedAt ? new Date(ord.updatedAt) : new Date(),
          creatorId: ord.creatorId || null,
        };

        await prisma.order.upsert({
          where: { id: cleanOrder.id },
          update: cleanOrder,
          create: cleanOrder
        });
        
        if (ord.orderItems && ord.orderItems.length > 0) {
          for (const item of ord.orderItems) {
            const cleanOrderItem = {
              id: item.id,
              orderId: item.orderId || ord.id,
              productId: item.productId || item.id,
              quantity: parseFloat(item.quantity) || 0,
              price: parseFloat(item.price) || 0,
              mrp: parseFloat(item.mrp) || 0,
              discount: parseFloat(item.discount) || 0,
              taxAmount: parseFloat(item.taxAmount) || 0,
              total: parseFloat(item.total) || 0
            };
            
            // Satisfy foreign key constraint if product is missing
            const productExists = await prisma.product.findUnique({
              where: { id: cleanOrderItem.productId }
            });
            
            if (!productExists) {
              console.log(`⚠️ Product ID ${cleanOrderItem.productId} not found in DB. Creating placeholder product.`);
              await prisma.product.create({
                data: {
                  id: cleanOrderItem.productId,
                  name: `Deleted Product (${cleanOrderItem.productId.substring(0, 8)})`,
                  purchasePrice: 0,
                  sellingPrice: cleanOrderItem.price,
                  stockQuantity: 0,
                  unit: 'pcs',
                  is_active: false
                }
              });
            }
            
            await prisma.orderItem.upsert({
              where: { id: cleanOrderItem.id },
              update: cleanOrderItem,
              create: cleanOrderItem
            });
          }
        }
        
        if (ord.payments && ord.payments.length > 0) {
          for (const pay of ord.payments) {
            const cleanPayment = {
              id: pay.id,
              orderId: pay.orderId || ord.id,
              method: pay.method,
              amount: parseFloat(pay.amount) || 0,
              transactionId: pay.transactionId || null,
              status: pay.status || 'SUCCESS',
              createdAt: pay.createdAt ? new Date(pay.createdAt) : new Date()
            };
            
            await prisma.payment.upsert({
              where: { id: cleanPayment.id },
              update: cleanPayment,
              create: cleanPayment
            });
          }
        }
        orderCount++;
      }
      console.log(`✅ Successfully restored ${orderCount} orders!`);
    }
    
    console.log('--- RESTORE COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('❌ Restore failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
