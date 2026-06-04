const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BACKUP_DIR = path.join(__dirname, '../backups');

function getPsqlPath() {
  if (process.platform === 'win32') {
    const standardPaths = [
      'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe'
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) return `"${p}"`;
    }
  }
  return 'psql';
}

function getDatabaseUrl() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('No DATABASE_URL or DIRECT_URL found in .env');
  }
  return url;
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

async function main() {
  const backupFile = process.argv[2];
  if (!backupFile) {
    console.error('❌ Please specify a backup file name as an argument. Example: node restore_backup_direct.js backup-2026-04-22.sql');
    process.exit(1);
  }

  const filePath = path.join(BACKUP_DIR, backupFile);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Backup file not found at: ${filePath}`);
    process.exit(1);
  }

  console.log(`Starting non-interactive restore from: ${backupFile}`);
  console.log(`Target Database: ${getDatabaseUrl().replace(/:[^:@]+@/, ':***@')}`);

  try {
    const dbUrl = getDatabaseUrl();
    const psqlCmd = getPsqlPath();
    const command = `${psqlCmd} --dbname="${dbUrl}" -f "${filePath}"`;
    
    console.log('Running restore command... This may take a minute...');
    const { stdout, stderr } = await runCommand(command);
    
    console.log('✅ Database restore completed successfully!');
    if (stdout) console.log('Stdout:', stdout);
    if (stderr) console.log('Stderr:', stderr);
  } catch (error) {
    console.error('❌ Failed to restore database:');
    console.error(error.message);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

main();
