const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { connectDB, saveChargingSession, getSessionsByPeriod } = require('./database');

const PORT = process.env.PORT || 9000;

// 1. HTTP SERVER
const server = http.createServer(async (req, res) => {
    // Dashboard page
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'dashboard.html'), (err, data) => {
            if (err) { res.writeHead(500); res.end('Error loading dashboard'); }
            else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(data); }
        });
    }
    // History API endpoint
    else if (req.url.startsWith('/api/history')) {
        const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
        const period = urlParams.get('period') || '2026-01'; // YYYY-MM or YYYY
        const viewType = urlParams.get('type') || 'month'; // 'month' or 'year'

        try {
            // Fetch sessions from MongoDB
            const filteredSessions = await getSessionsByPeriod(period, viewType);

            // Calculate total energy
            const totalEnergy = filteredSessions.reduce((sum, s) => sum + (s.energyKwh || 0), 0);

            // Calculate daily/monthly data for chart
            const chartData = {};
            filteredSessions.forEach(s => {
                const key = viewType === 'month'
                    ? parseInt(s.startTime.substring(8, 10)) // Day of month
                    : parseInt(s.startTime.substring(5, 7));  // Month of year
                chartData[key] = (chartData[key] || 0) + (s.energyKwh || 0);
            });

            const response = {
                period,
                viewType,
                totalEnergy: totalEnergy.toFixed(2),
                chartData: Object.entries(chartData).map(([key, value]) => ({
                    label: parseInt(key),
                    energy: value.toFixed(2)
                }))
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
        } catch (error) {
            console.error('❌ Error fetching history:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch history' }));
        }
    }
    else {
        res.writeHead(200);
        res.end('Server Online');
    }
});

// 2. WEBSOCKET SERVER
const wss = new WebSocket.Server({ server });

let dashboardSocket = null;
let chargerSocket = null;
let activeSessions = {}; // Track active charging sessions
let currentChargerId = null; // Store current charger ID

wss.on('connection', (ws, req) => {
    const url = req.url;

    // --- A. DASHBOARD CONNECTS ---
    if (url.includes('dashboard-ui')) {
        dashboardSocket = ws;
        console.log("💻 Dashboard Connected");

        // Send current charger status if charger is already connected
        if (chargerSocket && chargerSocket.readyState === WebSocket.OPEN) {
            const chargerId = Object.keys(wss.clients).find(client => client !== ws) || 'Charger01';
            ws.send(JSON.stringify({ type: 'status', status: 'Online', id: currentChargerId || 'Charger01' }));
            console.log("📤 Sent charger status to dashboard");
        }

        // Listen for "Start/Stop" clicks from the Dashboard
        ws.on('message', (message) => {
            const command = JSON.parse(message);

            if (command.action === "START" && chargerSocket) {
                console.log("🚀 Sending Remote Start to Charger...");
                // OCPP Command: RemoteStartTransaction
                const remoteStart = [2, "cmd-" + Date.now(), "RemoteStartTransaction", { idTag: "AdminUser" }];
                chargerSocket.send(JSON.stringify(remoteStart));
            }

            if (command.action === "STOP" && chargerSocket) {
                console.log("🛑 Sending Remote Stop to Charger...");
                // OCPP Command: RemoteStopTransaction (Requires Transaction ID, simplifying here)
                // Note: In a real app, you save the transaction ID from the StartTransaction response.
                const remoteStop = [2, "cmd-" + Date.now(), "RemoteStopTransaction", { transactionId: 1 }];
                chargerSocket.send(JSON.stringify(remoteStop));
            }
        });
        return;
    }

    // --- B. CHARGER CONNECTS ---
    const chargerId = url.replace('/', '');
    currentChargerId = chargerId; // Store the charger ID globally
    chargerSocket = ws; // Save the charger connection
    console.log(`🔌 CHARGER CONNECTED: ${chargerId}`);

    if (dashboardSocket && dashboardSocket.readyState === WebSocket.OPEN) {
        dashboardSocket.send(JSON.stringify({ type: 'status', status: 'Online', id: chargerId }));
        console.log("📤 Sent charger status to dashboard");
    } else {
        console.log("⚠️ Dashboard not connected yet");
    }

    // Configure charger to send MeterValues
    setTimeout(() => {
        // Set MeterValueSampleInterval to 10 seconds
        const configInterval = [2, "config-" + Date.now(), "ChangeConfiguration", {
            key: "MeterValueSampleInterval",
            value: "10"
        }];
        ws.send(JSON.stringify(configInterval));
        console.log("⚙️ Configuring MeterValueSampleInterval to 10 seconds");

        // Set MeterValuesSampledData to include all measurands
        setTimeout(() => {
            const configMeasurands = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "MeterValuesSampledData",
                value: "Energy.Active.Import.Register,Power.Active.Import,Current.Import,Voltage"
            }];
            ws.send(JSON.stringify(configMeasurands));
            console.log("⚙️ Configuring MeterValuesSampledData measurands");
        }, 1000);
    }, 2000);

    ws.on('message', async (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }

        const msgType = data[0];
        const uniqueId = data[1];
        const action = data[2];
        const payload = data[3];

        console.log(`📩 ${action}`);

        // 1. BootNotification
        if (action === 'BootNotification') {
            ws.send(JSON.stringify([3, uniqueId, { "status": "Accepted", "currentTime": new Date().toISOString(), "interval": 30 }]));
        }

        // 2. MeterValues (Update Dashboard)
        if (action === 'MeterValues') {
            const values = payload.meterValue[0].sampledValue;
            let voltage = 0, current = 0, power = 0;
            values.forEach(v => {
                if (v.measurand === 'Voltage') voltage = parseFloat(v.value);
                if (v.measurand === 'Current.Import') current = parseFloat(v.value);
                if (v.measurand === 'Power.Active.Import') power = parseFloat(v.value);
            });

            console.log(`⚡ MeterValues: ${power}W, ${voltage}V, ${current}A`);

            if (dashboardSocket && dashboardSocket.readyState === WebSocket.OPEN) {
                dashboardSocket.send(JSON.stringify({ type: 'meter', voltage, current, power }));
                console.log(`📤 Sent meter data to dashboard`);
            }
            ws.send(JSON.stringify([3, uniqueId, {}]));
        }

        // 3. StartTransaction - Track session start
        if (action === 'StartTransaction') {
            const transactionId = payload.transactionId || Date.now();
            activeSessions[transactionId] = {
                chargerId,
                transactionId,
                startTime: new Date().toISOString(),
                startMeterValue: payload.meterStart || 0
            };
            console.log(`⚡ Session Started: Transaction ${transactionId}`);
            ws.send(JSON.stringify([3, uniqueId, {
                "currentTime": new Date().toISOString(),
                "idTagInfo": { "status": "Accepted" },
                "transactionId": transactionId
            }]));
        }

        // 4. StopTransaction - Save session to MongoDB
        else if (action === 'StopTransaction') {
            const transactionId = payload.transactionId;
            const session = activeSessions[transactionId];

            if (session) {
                const endTime = new Date();
                const startTime = new Date(session.startTime);
                const duration = Math.floor((endTime - startTime) / 1000 / 60); // minutes
                const energyKwh = ((payload.meterStop || 0) - session.startMeterValue) / 1000; // Wh to kWh

                // Save to MongoDB
                try {
                    await saveChargingSession({
                        chargerId: session.chargerId,
                        transactionId,
                        startTime: session.startTime,
                        endTime: endTime.toISOString(),
                        energyKwh: parseFloat(energyKwh.toFixed(2)),
                        duration
                    });
                    console.log(`🔋 Session Saved to MongoDB: ${energyKwh.toFixed(2)} kWh`);
                } catch (error) {
                    console.error('❌ Error saving session:', error);
                }

                delete activeSessions[transactionId];
            }

            ws.send(JSON.stringify([3, uniqueId, {
                "currentTime": new Date().toISOString(),
                "idTagInfo": { "status": "Accepted" }
            }]));
        }

        // 5. Heartbeat / Status
        else if (action === 'Heartbeat' || action === 'StatusNotification') {
            ws.send(JSON.stringify([3, uniqueId, { "currentTime": new Date().toISOString(), "idTagInfo": { "status": "Accepted" } }]));
        }

        // 4. Handle RemoteStart Response
        if (msgType === 3) {
            console.log("✅ Charger accepted command");
        }
    });
});

// Connect to MongoDB and start server
connectDB()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`✅ Server Running on Port ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('❌ Failed to connect to MongoDB:', error);
        console.log('⚠️  Server will not start without database connection');
        process.exit(1);
    });