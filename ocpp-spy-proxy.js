const WebSocket = require('ws');
const http = require('http');

// Configuration
const PROXY_PORT = 9001;           // Proxy listens here
const TARGET_SERVER = 'localhost'; // Your actual OCPP server
const TARGET_PORT = 9000;          // Your actual OCPP server port

console.log('🕵️ OCPP SPY PROXY STARTING...');
console.log('📡 Proxy will listen on port:', PROXY_PORT);
console.log('🎯 Will forward to:', `${TARGET_SERVER}:${TARGET_PORT}`);
console.log('');

// Create HTTP server for the proxy
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('OCPP Spy Proxy Online');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (clientSocket, req) => {
    const chargerId = req.url.replace('/', '');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`🔌 NEW CONNECTION: ${chargerId}`);
    console.log(`📍 From: ${req.socket.remoteAddress}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Connect to the actual OCPP server
    const targetUrl = `ws://${TARGET_SERVER}:${TARGET_PORT}${req.url}`;
    console.log(`🔗 Connecting to target: ${targetUrl}`);

    const serverSocket = new WebSocket(targetUrl);

    // Forward messages from client (Z-BOX) to server
    clientSocket.on('message', (message) => {
        const timestamp = new Date().toISOString();
        console.log('');
        console.log('┌─────────────────────────────────────────────────────┐');
        console.log(`│ 📤 CLIENT → SERVER [${timestamp}]`);
        console.log('└─────────────────────────────────────────────────────┘');

        try {
            const data = JSON.parse(message);
            console.log('📋 Parsed Message:');
            console.log(JSON.stringify(data, null, 2));

            // Highlight stop-related commands
            if (data[2] === 'RemoteStopTransaction') {
                console.log('');
                console.log('🛑🛑🛑 STOP COMMAND DETECTED! 🛑🛑🛑');
                console.log('Command:', data[2]);
                console.log('Parameters:', JSON.stringify(data[3], null, 2));
                console.log('🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑');
                console.log('');
            }

            if (data[2] === 'SetChargingProfile') {
                console.log('');
                console.log('⚡⚡⚡ CHARGING PROFILE COMMAND DETECTED! ⚡⚡⚡');
                console.log('Command:', data[2]);
                console.log('Parameters:', JSON.stringify(data[3], null, 2));
                console.log('⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡');
                console.log('');
            }
        } catch (e) {
            console.log('📋 Raw Message:', message.toString());
        }

        // Forward to server
        if (serverSocket.readyState === WebSocket.OPEN) {
            serverSocket.send(message);
        }
    });

    // Forward messages from server to client (Z-BOX)
    serverSocket.on('message', (message) => {
        const timestamp = new Date().toISOString();
        console.log('');
        console.log('┌─────────────────────────────────────────────────────┐');
        console.log(`│ 📥 SERVER → CLIENT [${timestamp}]`);
        console.log('└─────────────────────────────────────────────────────┘');

        try {
            const data = JSON.parse(message);
            console.log('📋 Parsed Message:');
            console.log(JSON.stringify(data, null, 2));
        } catch (e) {
            console.log('📋 Raw Message:', message.toString());
        }

        // Forward to client
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(message);
        }
    });

    // Handle disconnections
    clientSocket.on('close', () => {
        console.log('');
        console.log('❌ Client disconnected');
        serverSocket.close();
    });

    serverSocket.on('close', () => {
        console.log('');
        console.log('❌ Server connection closed');
        clientSocket.close();
    });

    serverSocket.on('error', (error) => {
        console.error('❌ Server connection error:', error.message);
        clientSocket.close();
    });

    clientSocket.on('error', (error) => {
        console.error('❌ Client connection error:', error.message);
        serverSocket.close();
    });

    serverSocket.on('open', () => {
        console.log('✅ Connected to target server');
        console.log('🕵️ Spy mode active - all messages will be logged');
        console.log('');
    });
});

server.listen(PROXY_PORT, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║         🕵️ OCPP SPY PROXY READY 🕵️                  ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📡 Listening on: ws://localhost:' + PROXY_PORT);
    console.log('🎯 Forwarding to: ws://' + TARGET_SERVER + ':' + TARGET_PORT);
    console.log('');
    console.log('📝 INSTRUCTIONS:');
    console.log('1. Keep your OCPP server running on port 9000');
    console.log('2. Configure Z-BOX to connect to port 9001 (this proxy)');
    console.log('3. Use Z-BOX to start and stop charging');
    console.log('4. Watch this console for the STOP command');
    console.log('5. Copy the exact command format to use in your server');
    console.log('');
    console.log('🔍 Waiting for connections...');
    console.log('');
});
