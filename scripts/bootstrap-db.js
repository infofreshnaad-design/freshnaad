const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('--- 🚀 POS-BILLING DATABASE BOOTSTRAPPER ---');

const schemaPath = path.join(__dirname, '..', 'backend', 'prisma', 'schema.prisma');

try {
    console.log('1. Checking Schema Path...');
    if (!fs.existsSync(schemaPath)) {
        throw new Error(`Prisma schema not found at: ${schemaPath}`);
    }

    console.log('2. Pushing Schema to Supabase...');
    console.log('Note: Ensure your current IP is whitelisted in Supabase Settings > Network.');
    
    // Using npx with the explicit schema path
    execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss`, { stdio: 'inherit' });

    console.log('3. Generating Prisma Client...');
    execSync(`npx prisma generate --schema="${schemaPath}"`, { stdio: 'inherit' });

    console.log('\n--- ✅ DATABASE INITIALIZED SUCCESSFULLY! ---');
    console.log('You can now log in at your Vercel URL with:');
    console.log('User: admin');
    console.log('Pass: admin123');

} catch (error) {
    console.error('\n--- ❌ BOOTSTRAP FAILED ---');
    console.error(error.message);
    console.log('\n💡 Tip: If you see "Prisma not found", run: npm install prisma --save-dev');
}
