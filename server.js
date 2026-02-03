const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { connectDB, saveChargingSession, getSessionsByPeriod } = require('./database');

const PORT = process.env.PORT || 9000;

// Track current transaction ID for remote stop
let currentTransactionId = null;

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
        const chargerId = urlParams.get('chargerId'); // Optional filter

        try {
            // Fetch sessions from MongoDB with optional chargerId filter
            const filteredSessions = await getSessionsByPeriod(period, viewType, chargerId);

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
            console.error('⚠️ MongoDB Unavailable for history, returning empty state');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                period,
                viewType,
                totalEnergy: "0.00",
                chartData: [],
                warning: 'Database offline'
            }));
        }

    }
    // New endpoint: Get all historical chargers
    else if (req.url === '/api/chargers/all') {
        try {
            const db = require('./database').getDB();
            const chargersCollection = db.collection('charging_sessions');
            const uniqueChargers = await chargersCollection.distinct('chargerId');

            // Combine with currently online chargers
            const onlineChargerIds = Array.from(chargers.keys());
            const allChargerIds = Array.from(new Set([...uniqueChargers, ...onlineChargerIds]));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(allChargerIds));
        } catch (error) {
            console.error('⚠️ MongoDB Unavailable, returning only online chargers');
            const onlineChargerIds = Array.from(chargers.keys());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(onlineChargerIds));
        }

    }
    // DLB Status API endpoint
    else if (req.url.startsWith('/api/dlb/status')) {
        const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
        const chargerId = urlParams.get('chargerId');

        // Calculate current DLB state for this specific charger
        const currentState = calculateLoadBalance(chargerId);

        if (!currentState) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Charger or DLB data not found' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ...currentState,
            config: dlbConfig.modes,
            gridCapacity: dlbConfig.gridCapacity,
            pvCapacity: dlbConfig.pvCapacity
        }));
    }

    // DLB Configuration API endpoint
    else if (req.url === '/api/dlb/config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const update = JSON.parse(body);
                // Update DLB modes
                Object.assign(dlbConfig.modes, update);
                console.log('⚙️ DLB Config Updated:', dlbConfig.modes);

                // Broadcast updated config to all dashboards
                broadcastToDashboards({
                    type: 'dlbConfig',
                    modes: dlbConfig.modes
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, modes: dlbConfig.modes }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    }
    else {
        res.writeHead(200);
        res.end('Server Online');
    }
});

// 2. WEBSOCKET SERVER
const wss = new WebSocket.Server({ server });

// Multi-charger support
const chargers = new Map(); // chargerId -> { socket, status, transactionId, isCharging, lastSeen }
let dashboardSockets = new Set(); // Track all connected dashboards
let activeSessions = {}; // Track active charging sessions

// 3. DYNAMIC LOAD BALANCING (DLB) CONFIGURATION
const dlbConfig = {
    gridCapacity: 20000,        // 20kW max grid capacity (in Watts) - kept for reference
    pvCapacity: 10000,          // 10kW solar capacity (in Watts)
    homeBaseLoad: 3000,         // 3kW average home consumption (in Watts)
    safetyMargin: 200,          // 200W safety buffer

    // New Smart Charging Parameters
    mainFuseAmps: 60,           // Main fuse size in Amps (User Defined)
    minChargeAmps: 6,           // Minimum charging current (Standard EV minimum)
    maxChargeAmps: 32,          // Maximum charging current (Hardware limit)
    nightStartHour: 22,         // Night mode start (22:00)
    nightEndHour: 6,            // Night mode end (06:00)

    modes: {
        pvDynamicBalance: true,     // User: "Prioritize solar power"
        extremeMode: false,         // User: "Maximum power charging" (Overrides PV)
        nightFullSpeed: false,      // User: "Full speed at night" (Auto-switch)
        antiOverload: true          // User: "Prevent exceeding grid capacity" (Safety)
    }
};


// Helper: Broadcast message to all dashboards
function broadcastToDashboards(message) {
    dashboardSockets.forEach(dashboard => {
        if (dashboard.readyState === WebSocket.OPEN) {
            dashboard.send(JSON.stringify(message));
        }
    });
}

// Helper: Get list of all chargers
function getChargerList() {
    const list = [];
    chargers.forEach((charger, id) => {
        list.push({
            id: id,
            status: charger.status || 'Online',
            isCharging: charger.isCharging || false,
            activeTimer: charger.activeTimer,      // Include timer data
            timerSetAt: charger.timerSetAt,
            // Session metrics
            voltage: charger.voltage || 0,
            current: charger.current || 0,
            power: charger.power || 0,
            sessionEnergy: charger.sessionEnergy || 0,
            startTime: charger.startTime
        });
    });
    return list;
}

// DLB Helper: Get current load balance state
function calculateLoadBalance(chargerId) {
    const charger = chargers.get(chargerId);
    return charger ? charger.dlbState : null;
}


// DLB Helper: Allocate power to active chargers
function allocatePowerToChargers() {
    chargers.forEach((charger, id) => {
        // Only balance chargers that are actively charging and have DLB data
        // We need DLB data (Grid/Home) to make decisions, especially for PV Dynamic and Anti-Overload
        if (!charger.isCharging || !charger.socket || charger.socket.readyState !== WebSocket.OPEN || !charger.dlbState) {
            return;
        }

        const dlb = charger.dlbState;
        const currentHour = new Date().getHours();

        // --- 1. Determine Target Current (Amps) ---
        let targetAmps = 0;
        let modeDescription = "";

        // CHECK: Night Full Speed
        // If enabled and within time window, it behaves like Extreme Mode
        const isNightTime = (currentHour >= dlbConfig.nightStartHour || currentHour < dlbConfig.nightEndHour);
        const isNightBoostActive = dlbConfig.modes.nightFullSpeed && isNightTime;

        if (dlbConfig.modes.extremeMode || isNightBoostActive) {
            // EXTREME MODE / NIGHT FULL SPEED
            // "I don't care about saving money/solar right now, I need the car full ASAP."
            targetAmps = dlbConfig.maxChargeAmps;
            modeDescription = dlbConfig.modes.extremeMode ? "Extreme Mode" : "Night Full Speed";
        } else if (dlbConfig.modes.pvDynamicBalance) {
            // PV DYNAMIC LOAD BALANCE
            // "Prioritize solar power consumption."
            // Formula: Charge_Limit = Current_Charge_Speed + Grid_Export_Power (converted to Amps)
            // We use the grid power directly: Negative = Exporting, Positive = Importing

            // Calculate Grid Amps (Grid Power W / 230V)
            // gridPower is raw Watts. >0 = Import (Buying), <0 = Export (Selling)
            const gridAmps = dlb.gridPower / 230;

            // Current charging speed (Amps)
            const currentChargeAmps = charger.current || 0; // Use actual measured current if available, else 0

            // If we are exporting (e.g. -2000W / 230V = -8.7A), we can INCREASE charging by 8.7A
            // If we are importing (e.g. +500W / 230V = +2.2A), we must DECREASE charging by 2.2A

            // The formula implies we simply subtract the Grid Amps from existing limit? 
            // Or rather: Available = Solar calculation?
            // The user prompt logic: 
            // "Check Grid: Is house exporting? Yes -> Increase limit."
            // "Check Grid: Is house importing? Yes -> Decrease limit."

            // Let's rely on a stability-seeking loop approach (simulated PID mostly P):
            // We want Grid Exchange to be 0.
            // Target Change = -GridAmps
            // If Grid is -10A (Exporting), we want to add +10A to charging.
            // If Grid is +5A (Importing), we want to remove 5A from charging.

            // We need the *previous* limit or current actual to adjust? 
            // Ideally we use the current actual charging current as the baseline.

            let adjustment = -gridAmps;

            // Dampening factor to prevent oscillation? 
            // Let's use 100% correction first as per user request logic.

            targetAmps = currentChargeAmps + adjustment;

            modeDescription = "PV Dynamic";
        } else {
            // Default Fallback (Standard Mode) - perhaps max speed or min speed?
            // If no mode is selected, default to safe min? Or max? 
            // Usually "Plug and Charge" = Max, but let's assume Max for standard behavior if no smart mode.
            targetAmps = dlbConfig.maxChargeAmps;
            modeDescription = "Standard";
        }

        // --- 2. Apply Constraints ---

        // CONSTRAINT A: Minimum Amps (Standard EV Protocol)
        // Check this BEFORE Anti-Overload? Or AFTER? 
        // User says: "If excess solar is < 6A, pause."
        // This applies specifically to PV Dynamic.
        if ((dlbConfig.modes.pvDynamicBalance && !dlbConfig.modes.extremeMode && !isNightBoostActive) && targetAmps < dlbConfig.minChargeAmps) {
            // Too low to charge safely or efficiently
            // Action: Suspend/Pause
            targetAmps = 0;
            modeDescription += " (Paused - Low Solar)";
        } else {
            // For other modes, or if we are above threshold, clamp to min/max
            // But if it's 0 (paused), we keep it 0.
            // Wait, if it IS Extreme mode, we definitely want > 6A (which is handled by setting target=32A)
            // So we just ensure we don't send like 3A to the car.
            if (targetAmps > 0 && targetAmps < dlbConfig.minChargeAmps) {
                targetAmps = dlbConfig.minChargeAmps; // Clamp to min if not 0
            }
        }

        // Clamp to Hardware Max
        if (targetAmps > dlbConfig.maxChargeAmps) {
            targetAmps = dlbConfig.maxChargeAmps;
        }


        // --- 3. Anti Overload (Safety Layer) ---
        // "Prevent exceeding grid capacity."
        // Formula: Max_Allowed_Charge = Main_Fuse_Size - Other_House_Loads
        if (dlbConfig.modes.antiOverload) {
            // Calculate Other House Loads in Amps
            // We know Total Grid Import = House + Car. 
            // So House = Grid Import - Car (Approximation if we don't have separate CT)
            // But we DO have dlb.homeLoad from the meter value "Power.Active.Import.Home" or similar?
            // The existing code has `dlb.homeLoad`.

            const houseAmps = dlb.homeLoad / 230;
            const availableFuseAmps = dlbConfig.mainFuseAmps - houseAmps;

            // Safety margin (e.g. keep 1A buffer)
            const safeAvailableAmps = availableFuseAmps - 1.0;

            if (targetAmps > safeAvailableAmps) {
                console.log(`⚠️ Anti Overload Triggered! Wanted ${targetAmps.toFixed(1)}A, capping at ${safeAvailableAmps.toFixed(1)}A`);
                targetAmps = Math.max(0, safeAvailableAmps); // Never go negative
                modeDescription += " (Throttled)";
            }
        }

        // --- 4. Send Command ---

        // Convert Amps to Watts for the SetChargingProfile command (existing server uses Watts)
        // Or should we switch to Amps? 
        // Existing Server P: "chargingRateUnit: 'W'"
        // We will stick to W to match the rest of the system structure, but calculated from Amps.
        const powerLimitWatts = Math.round(targetAmps * 230);


        console.log(`⚡ DLB [${id}]: ${modeDescription} | Target: ${targetAmps.toFixed(1)}A (${powerLimitWatts}W) | Grid: ${(dlb.gridPower / 230).toFixed(1)}A | Home: ${(dlb.homeLoad / 230).toFixed(1)}A`);

        // Update DLB State with the calculated available power (for dashboard display mostly)
        charger.dlbState.availablePower = powerLimitWatts;

        // Send SetChargingProfile
        const chargingProfile = {
            connectorId: 1,
            csChargingProfiles: {
                chargingProfileId: 1,
                stackLevel: 0,
                chargingProfilePurpose: "TxProfile",
                chargingProfileKind: "Absolute",
                chargingSchedule: {
                    chargingRateUnit: "W",
                    chargingSchedulePeriod: [{
                        startPeriod: 0,
                        limit: Math.max(0, powerLimitWatts)
                    }]
                }
            }
        };

        const setProfileCmd = [2, "dlb-" + Date.now(), "SetChargingProfile", chargingProfile];
        charger.socket.send(JSON.stringify(setProfileCmd));
    });
}



wss.on('connection', (ws, req) => {
    const url = req.url;

    // --- A. DASHBOARD CONNECTS ---
    if (url.includes('dashboard-ui')) {
        dashboardSockets.add(ws);
        console.log("💻 Dashboard Connected");

        // Send list of all connected chargers
        ws.send(JSON.stringify({
            type: 'chargerList',
            chargers: getChargerList()
        }));
        console.log("📤 Sent charger list to dashboard:", getChargerList().length, "chargers");

        // Handle dashboard disconnection
        ws.on('close', () => {
            dashboardSockets.delete(ws);
            console.log(" Dashboard Disconnected");
        });

        // Listen for "Start/Stop" clicks from the Dashboard
        ws.on('message', (message) => {
            const command = JSON.parse(message);
            const chargerId = command.chargerId; // Get charger ID from command
            const charger = chargers.get(chargerId);

            if (command.action === "START" && charger && charger.socket) {
                console.log(`🚀 [DEBUG] Received START command for ${chargerId} from dashboard socket`);
                console.log(`🚀 Sending Remote Start to Charger ${chargerId}...`);

                // OCPP Command: RemoteStartTransaction
                const remoteStart = [2, "cmd-" + Date.now(), "RemoteStartTransaction", { idTag: "AdminUser" }];
                charger.socket.send(JSON.stringify(remoteStart));
            }

            if (command.action === "STOP" && charger && charger.socket) {
                console.log(`🛑 Sending Remote Stop to Charger ${chargerId}...`);

                // Send immediate feedback to dashboard
                broadcastToDashboards({
                    type: 'status',
                    chargerId: chargerId,
                    status: 'Stopping',
                    message: 'Stop command sent'
                });

                // Use real transaction ID if available, otherwise use fallback for testing
                const transactionId = charger.transactionId || 1;
                if (!charger.transactionId) {
                    console.log("⚠️ No active transaction tracked, using fallback ID for testing");
                }
                const remoteStop = [2, "cmd-" + Date.now(), "RemoteStopTransaction", { transactionId }];
                charger.socket.send(JSON.stringify(remoteStop));
            }

            // SET_TIMER: Dashboard sets a timer for a charger
            if (command.action === "SET_TIMER" && charger) {
                console.log(`⏱ Setting timer for ${chargerId}:`, command.timer);

                // Store timer in charger metadata
                charger.activeTimer = command.timer;
                charger.timerSetAt = new Date().toISOString();

                // Broadcast updated charger list to all dashboards
                broadcastToDashboards({
                    type: 'chargerList',
                    chargers: getChargerList()
                });

                console.log(`✅ Timer set for ${chargerId}`);
            }

            // CANCEL_TIMER: Dashboard cancels a timer
            if (command.action === "CANCEL_TIMER" && charger) {
                console.log(`⏱ Canceling timer for ${chargerId}`);

                // Clear timer from charger metadata
                charger.activeTimer = null;
                charger.timerSetAt = null;

                // Broadcast updated charger list to all dashboards
                broadcastToDashboards({
                    type: 'chargerList',
                    chargers: getChargerList()
                });

                console.log(`✅ Timer canceled for ${chargerId}`);
            }
        });
        return;
    }

    // --- B. CHARGER CONNECTS ---
    const chargerId = url.replace('/', '');

    // Add charger to Map with timer support
    chargers.set(chargerId, {
        socket: ws,
        status: 'Online',
        isCharging: false,
        transactionId: null,
        lastSeen: new Date(),
        // Timer fields for persistent timers
        activeTimer: null,      // { mode, duration, startTime, endTime } or { mode, startTime, endTime }
        timerSetAt: null,       // When timer was set
        // Session metrics
        voltage: 0,
        current: 0,
        power: 0,
        sessionEnergy: 0,
        startTime: null,
        lastMeterTime: null,
        // DLB state for this specific charger's site
        dlbState: {
            gridPower: 0,
            pvPower: 0,
            homeLoad: 0,
            totalChargerLoad: 0,
            availablePower: 0,
            timestamp: new Date()
        }
    });


    console.log(`🔌 CHARGER CONNECTED: ${chargerId}`);

    // Broadcast updated charger list to all dashboards
    broadcastToDashboards({
        type: 'chargerList',
        chargers: getChargerList()
    });

    // Handle charger disconnection
    ws.on('close', () => {
        const charger = chargers.get(chargerId);
        if (charger) {
            charger.status = 'Offline';
            charger.socket = null;
            charger.isCharging = false;
        }
        console.log(`🔌 CHARGER DISCONNECTED: ${chargerId} (Marked Offline)`);

        // If no chargers are online anymore, notify dashboards
        const anyOnline = Array.from(chargers.values()).some(c => c.status !== 'Offline');
        if (!anyOnline) {
            console.log('⚡ DLB System: Idle (All chargers offline)');
        }


        // Broadcast updated charger list
        broadcastToDashboards({
            type: 'chargerList',
            chargers: getChargerList()
        });
    });

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

        // Disable ClockAlignedDataInterval to reduce stop delay
        setTimeout(() => {
            const configClockAligned = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "ClockAlignedDataInterval",
                value: "0"  // Disable clock-aligned intervals
            }];
            ws.send(JSON.stringify(configClockAligned));
            console.log("⚙️ Disabling ClockAlignedDataInterval to reduce stop delay");
        }, 2000);
    }, 2000);

    ws.on('message', async (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }

        const msgType = data[0];
        const uniqueId = data[1];
        let action, payload;

        if (msgType === 2) {
            action = data[2];
            payload = data[3];
            console.log(`📩 [${chargerId}] Request: ${action}`);
        } else if (msgType === 3) {
            payload = data[2];
            console.log(`📩 [${chargerId}] Response to ${uniqueId}`);
        } else if (msgType === 4) {
            console.log(`📩 [${chargerId}] Error Response to ${uniqueId}: ${data[2]}`);
        }

        // 1. BootNotification
        if (action === 'BootNotification') {
            ws.send(JSON.stringify([3, uniqueId, { "status": "Accepted", "currentTime": new Date().toISOString(), "interval": 30 }]));
        }

        // 2. MeterValues (Update Dashboard)
        if (action === 'MeterValues') {
            let voltage = 0, current = 0, power = 0, energy = null;
            let gridPower = null, pvPower = null, homeLoad = null;

            // Iterate through ALL meterValue entries provided by the charger
            payload.meterValue.forEach(mv => {
                mv.sampledValue.forEach(v => {
                    // Standard charging measurands
                    if (v.measurand === 'Voltage') voltage = parseFloat(v.value);
                    if (v.measurand === 'Current.Import') current = parseFloat(v.value);
                    if (v.measurand === 'Power.Active.Import' && (!v.location || v.location === 'Outlet')) {
                        power = parseFloat(v.value);
                    }
                    if (v.measurand === 'Energy.Active.Import.Register') energy = parseFloat(v.value);

                    // DLB measurands (real data from DLB box)
                    if (v.measurand === 'Power.Active.Import.Grid' || (v.measurand === 'Power.Active.Import' && v.location === 'Grid')) {
                        gridPower = parseFloat(v.value);
                    }
                    if (v.measurand === 'Power.Active.Import.PV' || (v.measurand === 'Power.Active.Export' && v.location === 'Solar')) {
                        pvPower = parseFloat(v.value);
                    }
                    if (v.measurand === 'Power.Active.Import.Home' || (v.measurand === 'Power.Active.Import' && v.location === 'Home')) {
                        homeLoad = parseFloat(v.value);
                    }
                });
            });

            console.log(`⚡ MeterValues [${chargerId}]: ${power}W, ${voltage}V, ${current}A`);


            // Update charger-specific DLB state if any DLB measurands are present
            if (gridPower !== null || pvPower !== null || homeLoad !== null) {
                const charger = chargers.get(chargerId);
                if (charger) {
                    // Update only present values
                    if (gridPower !== null) charger.dlbState.gridPower = Math.round(gridPower);
                    if (pvPower !== null) charger.dlbState.pvPower = Math.round(pvPower);
                    if (homeLoad !== null) charger.dlbState.homeLoad = Math.round(homeLoad);

                    charger.dlbState.timestamp = new Date();
                    charger.dlbState.totalChargerLoad = Math.round(power);

                    // TRIGGER DLB CALCULATION IMMEDIATELY
                    // This ensures the charger gets the new profile ASAP when conditions change
                    allocatePowerToChargers();

                    console.log(`   📊 [${chargerId}] DLB Sync: Grid=${(charger.dlbState.gridPower / 1000).toFixed(1)}kW, PV=${(charger.dlbState.pvPower / 1000).toFixed(1)}kW`);

                    // Instant broadcast to dashboards
                    broadcastToDashboards({
                        type: 'dlb',
                        chargerId: chargerId,
                        data: charger.dlbState,
                        modes: dlbConfig.modes
                    });
                } else {
                    console.log(`   ⚠️ received DLB data for unknown charger: ${chargerId}`);
                }
            }



            // Update charger metadata for persistence
            const charger = chargers.get(chargerId);
            if (charger) {
                charger.voltage = voltage;
                charger.current = current;
                charger.power = power;

                if (charger.isCharging) {
                    const now = new Date();
                    if (charger.lastMeterTime) {
                        const deltaTime = (now - charger.lastMeterTime) / 1000; // seconds
                        const energyDelta = (power * deltaTime) / 3600 / 1000; // kWh
                        charger.sessionEnergy = (charger.sessionEnergy || 0) + energyDelta;
                    }
                    charger.lastMeterTime = now;
                } else {
                    charger.lastMeterTime = null;
                }
            }

            // Broadcast to all dashboards with charger ID
            broadcastToDashboards({
                type: 'meter',
                chargerId: chargerId,
                voltage,
                current,
                power,
                energy, // Include energy if available
                sessionEnergy: charger ? charger.sessionEnergy : 0
            });
            ws.send(JSON.stringify([3, uniqueId, {}]));
        }

        // 3. StartTransaction - Track session start
        if (action === 'StartTransaction') {
            const transactionId = payload.transactionId || Date.now();

            // Update charger metadata
            const charger = chargers.get(chargerId);
            if (charger) {
                charger.transactionId = transactionId;
                charger.isCharging = true;
                charger.status = 'Charging';
                charger.startTime = new Date();
                charger.sessionEnergy = 0;
                charger.lastMeterTime = new Date(); // Initialize to current time for immediate energy tracking
            }

            activeSessions[transactionId] = {
                chargerId,
                transactionId,
                startTime: new Date().toISOString(),
                startMeterValue: payload.meterStart || 0
            };
            console.log(`⚡ Session Started on ${chargerId}: Transaction ${transactionId}`);

            // Broadcast charging status to all dashboards
            broadcastToDashboards({
                type: 'charging',
                chargerId: chargerId,
                status: 'Charging',
                message: 'Charging started',
                sessionData: {
                    startTime: activeSessions[transactionId].startTime,
                    transactionId: transactionId
                }
            });

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

            // Update charger metadata
            const charger = chargers.get(chargerId);
            if (charger) {
                charger.isCharging = false;
                charger.transactionId = null;
                charger.status = 'Online';
                // Clear session metrics for persistence
                charger.startTime = null;
                charger.sessionEnergy = 0;
                charger.power = 0;
                charger.current = 0;
                charger.lastMeterTime = null;
            }

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

            // Broadcast session end to all dashboards
            broadcastToDashboards({
                type: 'charging',
                chargerId: chargerId,
                status: 'Available',
                message: 'Charging stopped'
            });

            // Broadcast zero meter values to clear the display
            broadcastToDashboards({
                type: 'meter',
                chargerId: chargerId,
                voltage: 0,
                current: 0,
                power: 0,
                energy: null,
                sessionEnergy: 0
            });
        }

        // 5. StatusNotification - Handle charger state changes
        else if (action === 'StatusNotification') {
            const connectorStatus = payload.status; // e.g., "Available", "Preparing", "Charging", "Finishing"
            console.log(`📊 [${chargerId}] Status changed to: ${connectorStatus}`);

            // Update charger metadata in Map
            const charger = chargers.get(chargerId);
            if (charger) {
                charger.status = (connectorStatus === 'Available') ? 'Online' : connectorStatus;
            }

            // Send appropriate status to dashboard based on charger state
            // PREPARING: Charger is ready, waiting for vehicle to connect
            if (connectorStatus === 'Preparing') {
                broadcastToDashboards({
                    type: 'status',
                    chargerId: chargerId,
                    status: 'Preparing',
                    message: 'Ready for charging - waiting for vehicle connection'
                });
                console.log('📤 Sent "Preparing" status to dashboard (waiting for vehicle)');
            }

            // CHARGING: Vehicle connected and actively charging
            else if (connectorStatus === 'Charging') {
                broadcastToDashboards({
                    type: 'charging',
                    chargerId: chargerId,
                    status: 'Charging',
                    message: 'Vehicle connected - charging in progress'
                });
                console.log('📤 Sent "Charging" status to dashboard (vehicle connected)');
            }

            // AVAILABLE: Charger stopped and ready for next session
            else if (connectorStatus === 'Available') {
                broadcastToDashboards({
                    type: 'status',
                    chargerId: chargerId,
                    status: 'Online',
                    message: 'Charger stopped and ready'
                });
                console.log('📤 Sent "Available" status to dashboard');
            }

            ws.send(JSON.stringify([3, uniqueId, { "currentTime": new Date().toISOString() }]));
        }

        // 6. Heartbeat
        else if (action === 'Heartbeat') {
            ws.send(JSON.stringify([3, uniqueId, { "currentTime": new Date().toISOString() }]));
        }

        // 4. Handle Command Responses (RemoteStart/RemoteStop)
        if (msgType === 3 && uniqueId.startsWith('cmd-')) {
            console.log(`✅ Charger response to ${uniqueId}:`, payload ? JSON.stringify(payload) : "EMPTY RESPONSE");
            if (payload && payload.status === 'Rejected') {
                console.log('⚠️ Command was REJECTED by charger:', payload);
                // Notify all dashboards if command was rejected
                broadcastToDashboards({
                    type: 'error',
                    message: `Charger ${chargerId} rejected the command`
                });
            } else if (payload && payload.status === 'Accepted') {
                console.log('✅ Command ACCEPTED by charger');
            } else {
                console.log('✅ Command response received' + (payload ? '' : ' (no payload)'));
            }
        }
        // Handle configuration responses
        else if (msgType === 3 && uniqueId.startsWith('config-')) {
            console.log(`⚙️ Configuration response:`, JSON.stringify(payload));
        }
        // Handle other responses
        else if (msgType === 3) {
            console.log("✅ Charger response received");
        }
    });
});

// 4. PERIODIC DLB UPDATES
// Broadcast DLB state for each site to all dashboards every 15 seconds
setInterval(() => {
    chargers.forEach((charger, id) => {
        if (charger.status !== 'Offline' && charger.dlbState) {
            // Always broadcast if online, to keep dashboard synced even if zero
            broadcastToDashboards({
                type: 'dlb',
                chargerId: id,
                data: charger.dlbState,
                modes: dlbConfig.modes
            });

            const dlb = charger.dlbState;
            if (dlb.gridPower > 0 || dlb.pvPower > 0 || dlb.availablePower > 0) {
                console.log(`📊 [${id}] Periodic DLB Sync: Grid=${(dlb.gridPower / 1000).toFixed(1)}kW, Available=${(dlb.availablePower / 1000).toFixed(1)}kW`);
            }
        }
    });

    // Allocate power to active chargers based on current site states
    allocatePowerToChargers();
}, 15000);



// Connect to MongoDB and start server
connectDB()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`✅ Server Running on Port ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`⚡ DLB System: Enabled (Simulated)`);
        });
    })
    .catch((error) => {
        console.error('❌ Failed to connect to MongoDB:', error);
        console.log('⚠️  Server will not start without database connection');
        process.exit(1);
    });