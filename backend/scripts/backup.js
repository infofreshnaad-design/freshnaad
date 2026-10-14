const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BACKUP_DIR = path.join(__dirname, '../backups');
const LOG_FILE = path.join(BACKUP_DIR, 'backup.log');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getPgDumpPath() {
  if (process.platform === 'win32') {
    // Check standard Postgres installation paths on Windows
    const standardPaths = [
      'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe'
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) return `"${p}"`;
    }
  }
  return 'pg_dump'; // fallback to PATH
}

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(`[${timestamp}] ${message}`);
  fs.appendFileSync(LOG_FILE, logMessage);
}

async function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function getDatabaseUrl() {
  // Use DIRECT_URL for pg_dump if available, else DATABASE_URL
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('No DATABASE_URL or DIRECT_URL found in .env');
  }
  return url;
}

async function uploadToGoogleDrive(filePath, fileName) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId = process.env.DRIVE_FOLDER_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

  if (!refreshToken || refreshToken === 'your_refresh_token_here') {
    log('GOOGLE_REFRESH_TOKEN not set or is still placeholder, skipping cloud upload.');
    return;
  }
  if (!folderId) {
    log('DRIVE_FOLDER_ID not defined in .env, skipping cloud upload.');
    return;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Check if a backup with the same name already exists to prevent duplicates
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
      fields: 'files(id, name)',
    });

    const isJson = fileName.endsWith('.json');
    const isExcel = fileName.endsWith('.xlsx');
    const mimeType = isJson ? 'application/json' : isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/sql';

    if (res.data.files.length > 0) {
      log(`File ${fileName} already exists in Google Drive. Overwriting...`);
      const fileId = res.data.files[0].id;
      await drive.files.update({
        fileId: fileId,
        media: {
          mimeType: mimeType,
          body: fs.createReadStream(filePath)
        }
      });
      log(`Successfully updated existing backup ${fileName} in Google Drive.`);
      return;
    }

    // Create new file
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };
    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath)
    };

    await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });
    
    log(`Successfully uploaded ${fileName} to Google Drive.`);
  } catch (error) {
    log(`Error uploading to Google Drive: ${error.message}`);
    throw error;
  }
}

function manageRetention() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => (f.startsWith('backup-') && (f.endsWith('.sql') || f.endsWith('.json'))) || (f.startsWith('excel-backup-') && f.endsWith('.xlsx')));

  const backupData = files.map(file => {
    // backup-YYYY-MM-DD.sql or backup-YYYY-MM-DD.json or excel-backup-YYYY-MM-DD.xlsx
    const dateStr = file.replace('excel-backup-', '').replace('backup-', '').replace('.sql', '').replace('.json', '').replace('.xlsx', '');
    const date = new Date(dateStr);
    return { file, date };
  }).filter(b => !isNaN(b.date.getTime()));

  // Sort descending (newest first)
  backupData.sort((a, b) => b.date - a.date);

  const keepFiles = new Set();

  // 1. Keep last 7 daily backups
  const dailies = backupData.slice(0, 14); // Keep last 14 files (both sql/json & xlsx)
  dailies.forEach(b => keepFiles.add(b.file));

  // 2. Keep last 4 weekly backups (Sundays)
  const weeklies = backupData.filter(b => b.date.getDay() === 0).slice(0, 8);
  weeklies.forEach(b => keepFiles.add(b.file));

  // 3. Keep last 3 monthly backups (1st of the month)
  const monthlies = backupData.filter(b => b.date.getDate() === 1).slice(0, 6);
  monthlies.forEach(b => keepFiles.add(b.file));

  // 4. Delete the rest
  let deletedCount = 0;
  backupData.forEach(b => {
    if (!keepFiles.has(b.file)) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, b.file));
        log(`Retention Policy: Deleted old backup ${b.file}`);
        deletedCount++;
      } catch (err) {
        log(`Failed to delete ${b.file}: ${err.message}`);
      }
    }
  });

  if (deletedCount === 0) {
    log('Retention Policy: No old backups needed to be deleted.');
  }
}

async function performPrismaBackup(filePath) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    log('Fetching all database tables via Prisma for cloud backup...');
    const [
      users, licenses, devices, categories, products, suppliers,
      purchaseOrders, purchaseOrderItems, customers, orders, orderItems,
      salesReturns, salesReturnItems, purchaseReturns, purchaseReturnItems,
      inventoryLogs, payments, expenses, purchases, purchasePayments,
      purchaseItems, expenseCategories, userActivities
    ] = await Promise.all([
      prisma.user.findMany().catch(() => []),
      prisma.license.findMany().catch(() => []),
      prisma.device.findMany().catch(() => []),
      prisma.category.findMany().catch(() => []),
      prisma.product.findMany().catch(() => []),
      prisma.supplier.findMany().catch(() => []),
      prisma.purchaseOrder.findMany().catch(() => []),
      prisma.purchaseOrderItem.findMany().catch(() => []),
      prisma.customer.findMany().catch(() => []),
      prisma.order.findMany().catch(() => []),
      prisma.orderItem.findMany().catch(() => []),
      prisma.salesReturn.findMany().catch(() => []),
      prisma.salesReturnItem.findMany().catch(() => []),
      prisma.purchaseReturn.findMany().catch(() => []),
      prisma.purchaseReturnItem.findMany().catch(() => []),
      prisma.inventoryLog.findMany().catch(() => []),
      prisma.payment.findMany().catch(() => []),
      prisma.expense.findMany().catch(() => []),
      prisma.purchase.findMany().catch(() => []),
      prisma.purchasePayment.findMany().catch(() => []),
      prisma.purchaseItem.findMany().catch(() => []),
      prisma.expenseCategory.findMany().catch(() => []),
      prisma.userActivity.findMany().catch(() => [])
    ]);

    const backupObj = {
      timestamp: new Date().toISOString(),
      version: '2.0',
      users,
      licenses,
      devices,
      categories,
      products,
      suppliers,
      purchaseOrders,
      purchaseOrderItems,
      customers,
      orders,
      orderItems,
      salesReturns,
      salesReturnItems,
      purchaseReturns,
      purchaseReturnItems,
      inventoryLogs,
      payments,
      expenses,
      purchases,
      purchasePayments,
      purchaseItems,
      expenseCategories,
      userActivities
    };

    fs.writeFileSync(filePath, JSON.stringify(backupObj, null, 2), 'utf8');
    log(`Successfully generated Prisma JSON backup (${Object.keys(backupObj).length - 2} tables) at ${filePath}`);
  } catch (err) {
    log(`Prisma backup failed: ${err.message}`);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function performBackup() {
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `backup-${dateStr}.sql`;
  const filePath = path.join(BACKUP_DIR, fileName);
  
  log(`Starting database backup for ${dateStr}...`);

  try {
    // If in GitHub Actions, directly use Prisma JSON extraction (avoids IPv6 & pg_dump version issues in CI)
    if (process.env.GITHUB_ACTIONS) {
      log(`Detected GitHub Actions cloud runner: using direct Prisma database extraction...`);
      const jsonFileName = `backup-${dateStr}.json`;
      const jsonFilePath = path.join(BACKUP_DIR, jsonFileName);
      await performPrismaBackup(jsonFilePath);
      manageRetention();
      await uploadToGoogleDrive(jsonFilePath, jsonFileName);
      log(`GitHub Actions cloud backup completed successfully.`);
      return;
    }

    let backupDone = false;
    try {
      const dbUrl = getDatabaseUrl();
      const pgDumpCmd = getPgDumpPath();
      const command = `${pgDumpCmd} --dbname="${dbUrl}" -F p -O -f "${filePath}"`;
      
      await runCommand(command);
      log(`Successfully created pg_dump backup at ${filePath}`);
      backupDone = true;
    } catch (pgErr) {
      log(`pg_dump non-executable or failed (${pgErr.message}), switching to Prisma JS dump...`);
      const jsonFileName = `backup-${dateStr}.json`;
      const jsonFilePath = path.join(BACKUP_DIR, jsonFileName);
      await performPrismaBackup(jsonFilePath);
      
      manageRetention();
      await uploadToGoogleDrive(jsonFilePath, jsonFileName);
      log(`Backup process completed successfully via Prisma JS fallback.`);
      return;
    }

    if (backupDone) {
      manageRetention();
      await uploadToGoogleDrive(filePath, fileName);
      log(`Backup process completed successfully.`);
    }
  } catch (error) {
    log(`Backup process failed: ${error.message}`);
    if (error.stderr) {
      log(`Process Stderr: ${error.stderr}`);
    }
    process.exit(1);
  }
}

// Execute
performBackup();
