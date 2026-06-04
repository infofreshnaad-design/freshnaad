const fs = require('fs');
const readline = require('readline');
const path = require('path');

const filePath = path.join(__dirname, '../backups/backup-2026-04-12.sql');

async function main() {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Inspecting backup public data: ' + filePath);
  let lineCount = 0;
  let capturing = false;
  let currentTable = '';
  let lineBuffer = [];

  for await (const line of rl) {
    lineCount++;
    if (line.startsWith('COPY public.')) {
      if (capturing) {
        console.log(`Table: ${currentTable} (${lineBuffer.length} records)`);
        if (lineBuffer.length > 0) {
          console.log('  Sample:', lineBuffer[0].substring(0, 150));
        }
      }
      capturing = true;
      currentTable = line;
      lineBuffer = [];
      continue;
    }
    if (capturing) {
      if (line.startsWith('\\.')) {
        console.log(`Table: ${currentTable} (${lineBuffer.length} records)`);
        if (lineBuffer.length > 0) {
          console.log('  Sample:', lineBuffer[0].substring(0, 150));
        }
        capturing = false;
        currentTable = '';
      } else {
        lineBuffer.push(line);
      }
    }
  }
}

main();
