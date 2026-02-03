const WebSocket = require('ws');

// Configuration
const CHARGER_ID = process.argv[2] || 'CP_SIMULATOR';
const SERVER_URL = `ws://localhost:9000/${CHARGER_ID}`;

let ws;
let isCharging = false;
let transactionId = null;
let meterInterval = null;
let currentMeterValue = 0;

// Connect to server
function connect() {
    console.log('🔌 Connecting OCPP Charger Simulator...');
    ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log('✅ Simulator connected to server');
        sendBootNotification();
    });

    ws.on('message', (message) => {
        handleMessage(message);
    });

    ws.on('close', () => {
        console.log('🔌 Disconnected from server');
        setTimeout(connect, 5000); // Reconnect after 5 seconds
    });

    ws.on('error', (error) => {
        console.error('❌ Connection error:', error.message);
    });
}

// Send OCPP messages
function sendMessage(messageType, uniqueId, action, payload) {
    const message = [messageType, uniqueId, action, payload];
    ws.send(JSON.stringify(message));
}

function sendBootNotification() {
    console.log('📤 Sending BootNotification...');
    sendMessage(2, 'boot-' + Date.now(), 'BootNotification', {
        chargePointVendor: 'SimulatorVendor',
        chargePointModel: 'SimulatorModel',
        chargePointSerialNumber: 'SIM-001',
        firmwareVersion: '1.0.0'
    });

    // Start meter values and dlb reporting immediately
    startMeterValues();
}

function sendStatusNotification(status) {
    console.log(`📊 Sending StatusNotification: ${status}`);
    sendMessage(2, 'status-' + Date.now(), 'StatusNotification', {
        connectorId: 1,
        errorCode: 'NoError',
        status: status,
        timestamp: new Date().toISOString()
    });
}

function sendHeartbeat() {
    sendMessage(2, 'heartbeat-' + Date.now(), 'Heartbeat', {
        timestamp: new Date().toISOString()
    });
}

function startTransaction() {
    if (isCharging) return;

    transactionId = Date.now();
    isCharging = true;
    currentMeterValue = 0;

    console.log('⚡ Starting transaction:', transactionId);

    // Send StartTransaction
    sendMessage(2, 'start-' + Date.now(), 'StartTransaction', {
        connectorId: 1,
        idTag: 'SimulatedUser',
        meterStart: currentMeterValue,
        timestamp: new Date().toISOString(),
        transactionId: transactionId
    });

    // Change status to Charging
    setTimeout(() => {
        sendStatusNotification('Charging');
        startMeterValues();
    }, 1000);
}

function stopTransaction() {
    if (!isCharging) return;

    console.log('🛑 Stopping transaction:', transactionId);

    // Stop meter values
    if (meterInterval) {
        clearInterval(meterInterval);
        meterInterval = null;
    }

    // Send StopTransaction
    sendMessage(2, 'stop-' + Date.now(), 'StopTransaction', {
        transactionId: transactionId,
        meterStop: currentMeterValue,
        timestamp: new Date().toISOString(),
        reason: 'Remote'
    });

    isCharging = false;
    transactionId = null;

    // Change status to Available
    setTimeout(() => {
        sendStatusNotification('Available');
    }, 1000);
}

function startMeterValues() {
    // Send meter values every 10 seconds
    meterInterval = setInterval(() => {
        // Standard charging values only simulate power if charging
        const voltage = isCharging ? (230 + (Math.random() * 10 - 5)) : 0; // 0V when idle
        const current = isCharging ? (15 + (Math.random() * 5)) : 0;
        const power = isCharging ? (voltage * current) : 0;

        // Increment meter value (energy in Wh)
        if (isCharging) {
            currentMeterValue += (power * 10) / 3600;
        }

        // === DLB MEASURANDS (Simulating DLB Box CT Clamp Readings) ===

        // PV Power (time-based solar generation)
        const hour = new Date().getHours();
        const isPeakSolar = hour >= 10 && hour <= 14; // Peak solar hours
        const isSolarHours = hour >= 6 && hour <= 18;
        let pvPower = 0;
        if (isSolarHours) {
            const solarFactor = isPeakSolar ? 0.8 : 0.4;
            pvPower = Math.floor(10000 * solarFactor + Math.random() * 1000); // 0-10kW based on time
        }

        // Home Load (varies 3-8kW)
        const homeLoad = Math.floor(3000 + Math.random() * 5000);

        // Grid Power (Calculated: Home + Charger - PV)
        // Positive = Import (Buying from Grid)
        // Negative = Export (Selling to Grid)
        let gridExchange = (homeLoad + power) - pvPower;
        const gridPower = gridExchange;

        console.log(`📊 Meter: ${voltage.toFixed(1)}V, ${current.toFixed(1)}A, ${(power / 1000).toFixed(2)}kW, ${(currentMeterValue / 1000).toFixed(2)}kWh`);
        console.log(`   DLB: Grid=${(gridPower / 1000).toFixed(1)}kW, PV=${(pvPower / 1000).toFixed(1)}kW, Home=${(homeLoad / 1000).toFixed(1)}kW`);

        sendMessage(2, 'meter-' + Date.now(), 'MeterValues', {
            connectorId: 1,
            transactionId: isCharging ? transactionId : undefined,
            meterValue: [{
                timestamp: new Date().toISOString(),
                sampledValue: [
                    // Standard charging measurands
                    { value: voltage.toFixed(2), measurand: 'Voltage', unit: 'V' },
                    { value: current.toFixed(2), measurand: 'Current.Import', unit: 'A' },
                    { value: power.toFixed(2), measurand: 'Power.Active.Import', unit: 'W' },
                    { value: currentMeterValue.toFixed(2), measurand: 'Energy.Active.Import.Register', unit: 'Wh' },

                    // DLB measurands (from DLB box CT clamps)
                    { value: gridPower.toFixed(2), measurand: 'Power.Active.Import.Grid', unit: 'W' },
                    { value: pvPower.toFixed(2), measurand: 'Power.Active.Import.PV', unit: 'W' },
                    { value: homeLoad.toFixed(2), measurand: 'Power.Active.Import.Home', unit: 'W' }
                ]
            }]
        });
    }, 10000); // Every 10 seconds
}

function handleMessage(message) {
    let data;
    try {
        data = JSON.parse(message);
    } catch (e) {
        return;
    }

    const msgType = data[0];
    const uniqueId = data[1];
    const action = data[2];
    const payload = data[3];

    console.log(`📩 Received: ${action || 'Response'}`);

    // Handle RemoteStartTransaction
    if (action === 'RemoteStartTransaction') {
        console.log('🚀 RemoteStartTransaction received');

        // Send response
        ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' }]));

        // Simulate vehicle connection after 2 seconds
        setTimeout(() => {
            console.log('🚗 Simulating vehicle connection...');
            sendStatusNotification('Preparing');

            // Start charging after 3 seconds
            setTimeout(() => {
                startTransaction();
            }, 3000);
        }, 2000);
    }

    // Handle RemoteStopTransaction
    else if (action === 'RemoteStopTransaction') {
        console.log('🛑 RemoteStopTransaction received');

        // Send response
        ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' }]));

        // Stop charging
        setTimeout(() => {
            stopTransaction();
        }, 1000);
    }

    // Handle ChangeConfiguration
    else if (action === 'ChangeConfiguration') {
        console.log(`⚙️ ChangeConfiguration: ${payload.key} = ${payload.value}`);
        ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' }]));
    }

    // Handle GetConfiguration
    else if (action === 'GetConfiguration') {
        console.log(`🔍 GetConfiguration received`);
        ws.send(JSON.stringify([3, uniqueId, {
            configurationKey: [
                { key: 'AuthorizeRemoteTxRequests', value: 'true', readonly: false },
                { key: 'ChargeProfileMaxStackLevel', value: '10', readonly: true },
                { key: 'ChargingScheduleAllowedChargingRateUnit', value: 'Current,Power', readonly: true },
                { key: 'MaxChargingProfilesInstalled', value: '20', readonly: true },
                { key: 'SupportedFeatureProfiles', value: 'Core,FirmwareManagement,LocalAuthListManagement,Reservation,SmartCharging,RemoteTrigger', readonly: true }
            ]
        }]));
    }

    // Handle SetChargingProfile (Z-BOX Workaround)
    else if (action === 'SetChargingProfile') {
        console.log(`⚡ SetChargingProfile received`);

        // Check if this is a "stop" profile (0A or 0W limit)
        const profile = payload.csChargingProfiles;
        const limit = profile?.chargingSchedule?.chargingSchedulePeriod?.[0]?.limit;
        const unit = profile?.chargingSchedule?.chargingRateUnit;

        if (limit === 0) {
            console.log(`🛑 STOP PROFILE DETECTED: 0${unit} limit - Stopping transaction...`);
            ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' }]));

            // Stop the transaction after accepting the profile
            setTimeout(() => {
                stopTransaction();
            }, 1000);
        } else {
            console.log(`📊 Charging profile set: ${limit}${unit}`);
            ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' }]));
        }
    }
}

// Start heartbeat
setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendHeartbeat();
    }
}, 30000); // Every 30 seconds

// Connect to server
connect();

console.log('🎮 OCPP Charger Simulator Started');
console.log('📊 Charger ID:', CHARGER_ID);
console.log('🔗 Server URL:', SERVER_URL);
console.log('');
console.log('💡 The simulator will:');
console.log('   1. Connect to your server');
console.log('   2. Wait for RemoteStartTransaction');
console.log('   3. Simulate vehicle connection (2 seconds)');
console.log('   4. Start charging with realistic data');
console.log('   5. Send meter values every 10 seconds');
console.log('');
