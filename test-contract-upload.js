// Test script for contract upload functionality
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testContractUpload() {
  console.log('🧪 Testing Contract Upload API...\n');

  // Read test PDF
  const testPdfPath = path.join(__dirname, 'test-contract.pdf');
  if (!fs.existsSync(testPdfPath)) {
    console.error('❌ Test PDF not found at:', testPdfPath);
    return;
  }

  const pdfBuffer = fs.readFileSync(testPdfPath);
  const base64 = pdfBuffer.toString('base64');
  const dataUrl = `data:application/pdf;base64,${base64}`;

  // Prepare payload
  const payload = {
    folder: 'contracts',
    name: 'test-contract.pdf',
    dataUrl: dataUrl
  };

  console.log('📤 Uploading contract...');
  console.log('   File:', payload.name);
  console.log('   Size:', pdfBuffer.length, 'bytes');
  console.log('   Folder:', payload.folder);
  console.log('   Data URL length:', dataUrl.length);

  try {
    // First, try to login to get a token
    console.log('\n🔐 Attempting to login...');
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'password123'
      })
    });

    if (!loginResponse.ok) {
      console.error('❌ Login failed:', loginResponse.status, loginResponse.statusText);
      const errorText = await loginResponse.text();
      console.error('   Error:', errorText);
      console.log('\n⚠️  Cannot test upload without authentication token.');
      console.log('   Please ensure you have a user account in the database.');
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.data?.accessToken || loginData.accessToken;

    if (!token) {
      console.error('❌ No access token in login response');
      console.log('   Response:', JSON.stringify(loginData, null, 2));
      return;
    }

    console.log('✅ Login successful');
    console.log('   Token:', token.substring(0, 20) + '...');

    // Now test the file upload
    console.log('\n📤 Testing file upload API...');
    const uploadResponse = await fetch('http://localhost:3000/api/files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    console.log('   Status:', uploadResponse.status, uploadResponse.statusText);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ Upload failed');
      console.error('   Error:', errorText);
      try {
        const errorJson = JSON.parse(errorText);
        console.error('   Details:', JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error('   Raw response:', errorText);
      }
      return;
    }

    const uploadData = await uploadResponse.json();
    console.log('✅ Upload successful!');
    console.log('\n📥 Response:');
    console.log(JSON.stringify(uploadData, null, 2));

    // Check the response structure
    const fileUrl = uploadData.data?.url || uploadData.url;
    if (fileUrl) {
      console.log('\n✅ File URL:', fileUrl);
      
      // Verify file was saved
      const filePath = path.join(__dirname, 'uploads', 'contracts', path.basename(fileUrl));
      if (fs.existsSync(filePath)) {
        console.log('✅ File saved to:', filePath);
        const savedFileSize = fs.statSync(filePath).size;
        console.log('   Saved file size:', savedFileSize, 'bytes');
        if (savedFileSize === pdfBuffer.length) {
          console.log('✅ File size matches original!');
        } else {
          console.warn('⚠️  File size mismatch:', savedFileSize, 'vs', pdfBuffer.length);
        }
      } else {
        console.warn('⚠️  File not found at expected path:', filePath);
      }
    } else {
      console.error('❌ No URL in response');
    }

  } catch (error) {
    console.error('❌ Test failed with error:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testContractUpload();

