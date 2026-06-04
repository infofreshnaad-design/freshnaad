require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: true }
    });
    const products = await prisma.product.findMany({
      take: 5
    });
    const customers = await prisma.customer.findMany({
      take: 5
    });
    
    console.log('--- LATEST ORDERS ---');
    console.log(JSON.stringify(orders, null, 2));
    
    console.log('--- PRODUCTS SAMPLE ---');
    console.log(JSON.stringify(products, null, 2));

    console.log('--- CUSTOMERS SAMPLE ---');
    console.log(JSON.stringify(customers, null, 2));
    
  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
