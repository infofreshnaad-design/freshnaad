const fs = require('fs');
const readline = require('readline');
const path = require('path');

const filePath = path.join(__dirname, '../backups/backup-2026-04-22.sql');

async function main() {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Inspecting backup file: ' + filePath);
  let lineCount = 0;
  const tables = [];
  const copies = [];

  for await (const line of rl) {
    lineCount++;
    if (line.includes('CREATE TABLE')) {
      tables.push({ lineNum: lineCount, text: line });
    }
    if (line.includes('COPY ') || line.includes('INSERT INTO ')) {
      copies.push({ lineNum: lineCount, text: line.substring(0, 100) });
    }
  }

  console.log(`Total Lines: ${lineCount}`);
  console.log(`Found ${tables.length} CREATE TABLE statements:`);
  tables.slice(0, 30).forEach(t => console.log(`  Line ${t.lineNum}: ${t.text}`));
  if (tables.length > 30) console.log(`  ... and ${tables.length - 30} more`);

  console.log(`\nFound ${copies.length} COPY / INSERT statements:`);
  copies.slice(0, 30).forEach(c => console.log(`  Line ${c.lineNum}: ${c.text}`));
  if (copies.length > 30) console.log(`  ... and ${copies.length - 30} more`);
}

main();
