const { PrismaClient } = require('@prisma/client');

const projectId = "genbvbumxbmslhakulkz";
const passwords = ["Freshnaad@009", "Freshnaad%40009", "POSFreshnaad123", "admin123", "Freshnaad123", "Admin123"];

async function checkDb() {
  for (const password of passwords) {
    // We try both direct and pooled URLs
    const decodedPassword = decodeURIComponent(password);
    const urls = [
      `postgresql://postgres.${projectId}:${encodeURIComponent(decodedPassword)}@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&statement_cache_size=0`,
      `postgresql://postgres:${encodeURIComponent(decodedPassword)}@db.genbvbumxbmslhakulkz.supabase.co:5432/postgres`
    ];

    for (const url of urls) {
      console.log(`Trying URL: ${url.replace(/:[^:@]+@/, ':***@')}`);
      const prisma = new PrismaClient({
        datasources: { db: { url } }
      });

      try {
        await prisma.$queryRaw`SELECT 1`;
        console.log(`✅ CONNECTION SUCCESSFUL with password: ${decodedPassword}`);
        
        // Let's count some tables!
        try {
          const orders = await prisma.order.count();
          const products = await prisma.product.count();
          const customers = await prisma.customer.count();
          console.log(`📊 Data Found:`);
          console.log(`   - Orders: ${orders}`);
          console.log(`   - Products: ${products}`);
          console.log(`   - Customers: ${customers}`);
        } catch (err) {
          console.log(`⚠️ Connection worked, but failed to count tables (maybe schema not loaded):`, err.message);
        }
        
        await prisma.$disconnect();
        return;
      } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
        await prisma.$disconnect();
      }
    }
  }
  console.log('Finished checking all passwords.');
}

checkDb();
