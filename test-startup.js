/**
 * Test script to verify server starts and health endpoint works
 */

const http = require('http');

console.log('🧪 Testing Noir Factory startup...\n');

// Start the server
console.log('1️⃣  Starting server...');
require('./src/server.js');

// Wait for server to start
setTimeout(() => {
  console.log('\n2️⃣  Testing health endpoint...');
  
  const req = http.get('http://localhost:8080/api/health', (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ Health check passed!');
        console.log('   Status Code:', res.statusCode);
        console.log('   Response:', data);
        console.log('\n🎉 Server startup test SUCCESS!\n');
        process.exit(0);
      } else {
        console.error('❌ Health check failed!');
        console.error('   Status Code:', res.statusCode);
        console.error('   Response:', data);
        process.exit(1);
      }
    });
  });
  
  req.on('error', (err) => {
    console.error('❌ Health check request failed:', err.message);
    console.error('\n💥 Server startup test FAILED!\n');
    process.exit(1);
  });
  
  req.setTimeout(5000, () => {
    console.error('❌ Health check timeout (5s)');
    process.exit(1);
  });
  
}, 3000); // Wait 3 seconds for server to start
