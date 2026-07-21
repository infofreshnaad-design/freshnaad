const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    const triggers = await prisma.$queryRaw`
      SELECT 
        trigger_name, 
        event_manipulation, 
        event_object_table, 
        action_statement, 
        action_timing
      FROM 
        information_schema.triggers;
    `;
    console.log('Database Triggers:', JSON.stringify(triggers, null, 2));
  } catch (error) {
    console.error('Error querying triggers:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
