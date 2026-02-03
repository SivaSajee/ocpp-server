// Test all possible RemoteStopTransaction variations
// Run this while charger is actively charging

const WebSocket = require('ws');

const CHARGER_ID = 'CP001';
const SERVER_URL = `ws://localhost:9000/${CHARGER_ID}`;

console.log('🧪 RemoteStopTransaction Variation Tester');
console.log('==========================================');
console.log('');
console.log('⚠️  IMPORTANT: Start charging FIRST, then run this script');
console.log('');

// Wait for user to start charging
setTimeout(() => {
    console.log('🔌 Connecting to server as test client...');

    const ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log('✅ Connected');
        console.log('');
        console.log('📤 Testing different RemoteStopTransaction formats...');
        console.log('');

        // Get the current timestamp for transaction ID
        const now = Date.now();

        // Variation 1: Standard OCPP 1.6 format
        setTimeout(() => {
            console.log('Test 1: Standard OCPP 1.6');
            const cmd1 = [2, "test-1-" + Date.now(), "RemoteStopTransaction", {
                transactionId: now
            }];
            console.log('   Sending:', JSON.stringify(cmd1));
            ws.send(JSON.stringify(cmd1));
        }, 1000);

        // Variation 2: With string transactionId
        setTimeout(() => {
            console.log('Test 2: String transactionId');
            const cmd2 = [2, "test-2-" + Date.now(), "RemoteStopTransaction", {
                transactionId: String(now)
            }];
            console.log('   Sending:', JSON.stringify(cmd2));
            ws.send(JSON.stringify(cmd2));
        }, 3000);

        // Variation 3: With connectorId
        setTimeout(() => {
            console.log('Test 3: With connectorId');
            const cmd3 = [2, "test-3-" + Date.now(), "RemoteStopTransaction", {
                transactionId: now,
                connectorId: 1
            }];
            console.log('   Sending:', JSON.stringify(cmd3));
            ws.send(JSON.stringify(cmd3));
        }, 5000);

        // Variation 4: CancelReservation (alternative command)
        setTimeout(() => {
            console.log('Test 4: CancelReservation');
            const cmd4 = [2, "test-4-" + Date.now(), "CancelReservation", {
                reservationId: 1
            }];
            console.log('   Sending:', JSON.stringify(cmd4));
            ws.send(JSON.stringify(cmd4));
        }, 7000);

        // Variation 5: Reset (soft reset)
        setTimeout(() => {
            console.log('Test 5: Reset (Soft)');
            const cmd5 = [2, "test-5-" + Date.now(), "Reset", {
                type: "Soft"
            }];
            console.log('   Sending:', JSON.stringify(cmd5));
            ws.send(JSON.stringify(cmd5));
        }, 9000);

        // Variation 6: UnlockConnector
        setTimeout(() => {
            console.log('Test 6: UnlockConnector');
            const cmd6 = [2, "test-6-" + Date.now(), "UnlockConnector", {
                connectorId: 1
            }];
            console.log('   Sending:', JSON.stringify(cmd6));
            ws.send(JSON.stringify(cmd6));
        }, 11000);

        setTimeout(() => {
            console.log('');
            console.log('✅ All tests sent');
            console.log('📊 Check your server logs to see which one worked!');
            console.log('');
            ws.close();
            process.exit(0);
        }, 13000);
    });

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data[0] === 3) { // Response
                console.log('   ✅ Response:', JSON.stringify(data[2]));
            }
        } catch (e) {
            console.log('   📩 Message:', msg.toString());
        }
    });

    ws.on('error', (err) => {
        console.error('❌ Error:', err.message);
    });

}, 1000);

console.log('⏳ Waiting 1 second before starting tests...');
