const fs = require('fs');
const path = require('path');

try {
  const filePath = path.join(__dirname, '../vercel-error.txt');
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf16le');
    console.log('Vercel error log contents:');
    console.log(content);
  } else {
    console.log('vercel-error.txt does not exist.');
  }
} catch (error) {
  console.error('Error reading log:', error);
}
