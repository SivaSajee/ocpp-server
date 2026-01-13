const fs = require('fs');

// Create .env file with proper content
const envContent = `PORT=9000
NODE_ENV=development
MONGODB_URI=mongodb+srv://admin:TaskFlow2026@cluster0.wtt8v10.mongodb.net/ocpp?retryWrites=true&w=majority&appName=Cluster0`;

fs.writeFileSync('.env', envContent, 'utf8');
console.log('✅ .env file created!');
console.log('\nContent:');
console.log(envContent);
