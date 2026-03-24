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
        chargePointVendor: 'EVCharger Pro',
        chargePointModel: 'ECP-7000',
        chargePointSerialNumber: `SN-${CHARGER_ID}-2024`,
        firmwareVersion: 'v2.1.4-stable'
    });

    // Start meter values and dlb reporting immediately
    startMeterValues();
}

function sendStatusNotification(status, errorCode = 'NoError', info = '') {
    console.log(`📊 Sending StatusNotification: ${status} (Error: ${errorCode})`);
    sendMessage(2, 'status-' + Date.now(), 'StatusNotification', {
        connectorId: 1,
        errorCode: errorCode,
        info: info,
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
        
        // Specific handling for NetWorkSetting
        if (payload.key === 'NetWorkSetting') {
            if (payload.value === '5') console.log('📶 SIMULATOR: Switching to Offline (Plug & Play) mode');
            if (payload.value === '6') console.log('📶 SIMULATOR: Switching to Offline (RFID) mode');
        }

        ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' }]));
    }

    // Handle Reset
    else if (action === 'Reset') {
        const type = payload.type || 'Soft';
        console.log(`🔄 Reset requested: ${type}`);
        ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' }]));
        
        // Simulate reboot
        console.log('🔌 SIMULATOR: Rebooting in 2 seconds...');
        setTimeout(() => {
            console.log('🔌 SIMULATOR: Closing connection for reboot');
            ws.close();
        }, 1000);
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

    // Handle SetChargingProfile (DLB & Stop Commands)
    else if (action === 'SetChargingProfile') {
        const profile = payload.csChargingProfiles;
        const limit = profile?.chargingSchedule?.chargingSchedulePeriod?.[0]?.limit;
        const unit = profile?.chargingSchedule?.chargingRateUnit;
        const purpose = profile?.chargingProfilePurpose;

        // Convert to Amps for display if in Watts
        const limitAmps = unit === 'W' ? (limit / 230).toFixed(1) : limit;
        const limitWatts = unit === 'A' ? (limit * 230).toFixed(0) : limit;

        if (limit === 0) {
            console.log(`🛑 STOP PROFILE: 0${unit} - Stopping transaction...`);
            ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' }]));

            // Stop the transaction after accepting the profile
            setTimeout(() => {
                stopTransaction();
            }, 1000);
        } else {
            console.log(`⚡ SetChargingProfile received`);
            console.log(`   Purpose: ${purpose}`);
            console.log(`   Limit: ${limitWatts}W (${limitAmps}A)`);
            console.log(`   Unit: ${unit}`);
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

// Interactive REPL for simulator
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

console.log('⌨️  Commands: fault <errorCode> [info], clear, start, stop, help');

rl.on('line', (line) => {
    const args = line.trim().split(' ');
    const cmd = args[0].toLowerCase();

    if (cmd === 'fault') {
        const errorCode = args[1] || 'OtherError';
        const info = args.slice(2).join(' ') || 'Fault triggered manually';
        sendStatusNotification('Faulted', errorCode, info);
    } else if (cmd === 'clear') {
        sendStatusNotification(isCharging ? 'Charging' : 'Available', 'NoError');
    } else if (cmd === 'start') {
        startTransaction();
    } else if (cmd === 'stop') {
        stopTransaction();
    } else if (cmd === 'help') {
        console.log('Commands:');
        console.log('  fault <errorCode> [info] - Send StatusNotification with fault');
        console.log('  clear                    - Clear current fault (send NoError)');
        console.log('  start                    - Start a charging transaction');
        console.log('  stop                     - Stop the current transaction');
        console.log('  help                     - Show this help message');
    }
});
