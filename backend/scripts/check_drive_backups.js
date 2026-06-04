const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
const folderId = process.env.DRIVE_FOLDER_ID;
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

async function listDriveFiles() {
  if (!refreshToken || refreshToken === 'your_refresh_token_here') {
    console.log('❌ GOOGLE_REFRESH_TOKEN not set or is placeholder.');
    return;
  }
  if (!folderId) {
    console.log('❌ DRIVE_FOLDER_ID not set.');
    return;
  }

  console.log(`Checking Google Drive Folder ID: ${folderId}`);
  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, size, createdTime, modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    console.log(`\nFound ${res.data.files.length} files in Google Drive:`);
    res.data.files.forEach(f => {
      console.log(` - Name: ${f.name}`);
      console.log(`   ID: ${f.id}`);
      console.log(`   Size: ${f.size} bytes`);
      console.log(`   Created: ${f.createdTime}`);
      console.log(`   Modified: ${f.modifiedTime}`);
      console.log(`   -----------------------------------`);
    });
  } catch (error) {
    console.error('❌ Error listing Google Drive files:', error.message);
  }
}

listDriveFiles();
