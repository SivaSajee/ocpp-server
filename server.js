const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { connectDB, saveChargingSession, getSessionsByPeriod } = require('./database');

// Helper function to convert UTC to IST (UTC+5:30)
function toIST(date) {
    const utcDate = new Date(date);
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istDate = new Date(utcDate.getTime() + istOffset);
    return istDate.toISOString().replace('Z', '+05:30');
}

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
    // Serve static files (CSS/JS)
    else if (req.url.startsWith('/css/') || req.url.startsWith('/js/')) {
        const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(__dirname, 'public', safePath);

        const ext = path.extname(filePath);
        const contentType = ext === '.css' ? 'text/css' : 'application/javascript';

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            }
        });
    }
    // Get list of chargers with history
    else if (req.url === '/api/history/chargers') {
        try {
            const { getDB } = require('./database');
            const db = getDB();
            const collection = db.collection('charging_sessions');

            // Aggregate to get unique chargers with session counts and total energy
            const chargers = await collection.aggregate([
                {
                    $group: {
                        _id: '$chargerId',
                        sessionCount: { $sum: 1 },
                        totalEnergy: { $sum: '$energyKwh' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        chargerId: '$_id',
                        sessionCount: 1,
                        totalEnergy: 1
                    }
                },
                { $sort: { chargerId: 1 } }
            ]).toArray();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(chargers));
        } catch (error) {
            console.error('⚠️ Error fetching chargers:', error.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
        }
    }
    // Download history endpoint - Get all sessions for a specific charger
    // IMPORTANT: This must come BEFORE /api/history to avoid incorrect matching
    else if (req.url.startsWith('/api/history/download')) {
        const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
        const chargerId = urlParams.get('chargerId');

        if (!chargerId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'chargerId parameter is required' }));
            return;
        }

        try {
            const { getDB } = require('./database');
            const db = getDB();
            const collection = db.collection('charging_sessions');


            // Fetch all sessions for this charger, sorted by start time
            const sessions = await collection
                .find({ chargerId: chargerId })
                .sort({ startTime: 1 })
                .toArray();

            console.log(`📊 Found ${sessions.length} sessions for ${chargerId}`);

            // Format sessions for CSV download
            const formattedSessions = sessions.map(session => ({
                date: session.startTime ? session.startTime.substring(0, 10) : 'N/A',
                startTime: session.startTime ? session.startTime.substring(11, 19) : 'N/A',
                endTime: session.endTime ? session.endTime.substring(11, 19) : 'N/A',
                duration: session.duration || 0,
                energy: session.energyKwh || 0
            }));

            console.log(`📤 Sending ${formattedSessions.length} formatted sessions`);
            console.log('Sample:', formattedSessions[0]);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(formattedSessions));
        } catch (error) {
            console.error('⚠️ Error fetching download data:', error.message);
            console.error('Stack:', error.stack);
            // Return empty array instead of error to allow graceful handling
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
        }
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
    // Power Limit Settings - GET current value
    else if (req.url === '/api/settings/power-limit' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            maxChargeAmps: dlbConfig.maxChargeAmps,
            minChargeAmps: dlbConfig.minChargeAmps
        }));
    }
    // Power Limit Settings - POST update value
    else if (req.url === '/api/settings/power-limit' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const update = JSON.parse(body);
                const newLimit = parseInt(update.maxChargeAmps);

                // Validate input
                if (isNaN(newLimit) || newLimit < 6 || newLimit > 32) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Invalid value. Must be between 6 and 32 Amps.'
                    }));
                    return;
                }

                // Update configuration
                dlbConfig.maxChargeAmps = newLimit;
                console.log(`⚙️ Power Limit Updated: ${newLimit}A`);

                // Trigger immediate DLB recalculation for all active chargers
                allocatePowerToChargers();

                // Broadcast to all dashboards
                broadcastToDashboards({
                    type: 'powerLimitUpdate',
                    maxChargeAmps: newLimit
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    maxChargeAmps: newLimit
                }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid JSON'
                }));
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
        pvDynamicBalance: false,     // User: "Prioritize solar power"
        extremeMode: false,         // User: "Maximum power charging" (Overrides PV)
        nightFullSpeed: false,      // User: "Full speed at night" (Auto-switch)
        antiOverload: false          // User: "Prevent exceeding grid capacity" (Safety)
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
        // Ensure we never go below minimum charging current (6A) when charging
        // This prevents the charger from pausing and losing meter values
        if (targetAmps > 0 && targetAmps < dlbConfig.minChargeAmps) {
            targetAmps = dlbConfig.minChargeAmps; // Clamp to min if not 0
            modeDescription += " (Min Current)";
        }

        // Clamp to Hardware Max (Power Limit from Settings)
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
                chargingProfilePurpose: "TxDefaultProfile",  // Changed from TxProfile for better compatibility
                chargingProfileKind: "Relative",  // Changed from Absolute - more widely supported
                chargingSchedule: {
                    chargingRateUnit: "W",
                    chargingSchedulePeriod: [{
                        startPeriod: 0,
                        limit: Math.max(1380, powerLimitWatts)  // Minimum 1380W (6A * 230V)
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
                console.log(`🛑 STOP REQUEST: Smart-Stop Fallback Sequence`);
                console.log(`   📊 Charger state: isCharging=${charger.isCharging}, transactionId=${charger.transactionId || 'NONE'}`);

                const transactionId = charger.transactionId;

                // PRIORITY 0: Set current to 0A to gracefully reduce power before stopping
                console.log(`   ⚡ PRIORITY 0: Setting current to 0A (Graceful Power Reduction)`);
                const setZeroCurrent = [2, "stop-priority0-" + Date.now(), "SetChargingProfile", {
                    connectorId: 1,
                    csChargingProfiles: {
                        chargingProfileId: 1,
                        stackLevel: 0,
                        chargingProfilePurpose: "TxDefaultProfile",
                        chargingProfileKind: "Relative",
                        chargingSchedule: {
                            chargingRateUnit: "W",
                            chargingSchedulePeriod: [{
                                startPeriod: 0,
                                limit: 0  // 0W = stop charging
                            }]
                        }
                    }
                }];
                charger.socket.send(JSON.stringify(setZeroCurrent));

                // Wait 2 seconds for current to drop to 0
                setTimeout(() => {
                    console.log(`   ✅ Current reduced to 0A, proceeding with stop sequence...`);
                }, 2000);

                // Soft Reset (Only method that works for this charger)
                // Execute after 2.5 seconds to allow current to drop to 0
                setTimeout(async () => {
                    if (charger.isCharging) {
                        console.log(`   🔄 STEP 2: Soft Reset (Charger Reboot)`);
                        console.log(`      ⚠️ Rebooting charger to stop charging...`);

                        // IMPORTANT: Save session BEFORE reset (since reset won't send StopTransaction)
                        const transactionId = charger.transactionId;
                        const session = activeSessions[transactionId];

                        if (session) {
                            const endTime = new Date();
                            const startTime = new Date(session.startTime);
                            const duration = Math.floor((endTime - startTime) / 1000 / 60); // minutes

                            // Use last known energy value from charger metadata (already in kWh)
                            const energyKwh = charger.sessionEnergy || 0;

                            console.log(`      💾 Saving session before reset: ${energyKwh.toFixed(2)} kWh`);

                            try {
                                await saveChargingSession({
                                    chargerId: session.chargerId,
                                    transactionId,
                                    startTime: session.startTime,
                                    endTime: toIST(endTime),
                                    energyKwh: parseFloat(energyKwh.toFixed(2)),
                                    duration,
                                    stoppedBy: 'SoftReset' // Mark how it was stopped
                                });
                                console.log(`      ✅ Session saved before reset`);
                                delete activeSessions[transactionId];
                            } catch (error) {
                                console.error(`      ❌ Error saving session before reset:`, error.message);
                            }
                        }

                        // Now send the reset
                        const reset = [2, "stop-step2-" + Date.now(), "Reset", {
                            type: "Soft"
                        }];
                        charger.socket.send(JSON.stringify(reset));
                    } else {
                        console.log(`   ✅ Charging already stopped`);
                    }
                }, 2500); // Execute 2.5 seconds after zero current command

                // Notify dashboard
                broadcastToDashboards({
                    type: 'status',
                    chargerId: chargerId,
                    status: 'Stopping',
                    message: 'Smart-Stop sequence initiated...'
                });
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
        // DIAGNOSTIC: Check charger configuration for OCPP feature support
        console.log(`🔍 Checking charger configuration for OCPP feature support...`);

        // Query critical configuration keys
        const configCheck = [2, "diag-" + Date.now(), "GetConfiguration", {
            key: [
                "AuthorizeRemoteTxRequests",
                "ChargeProfileMaxStackLevel",
                "ChargingScheduleAllowedChargingRateUnit",
                "MaxChargingProfilesInstalled",
                "SupportedFeatureProfiles"
            ]
        }];
        ws.send(JSON.stringify(configCheck));
        console.log(`📤 Sent configuration query to diagnose feature support`);

        // FIX: Enable Remote Commands
        setTimeout(() => {
            const configRemote = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "AuthorizeRemoteTxRequests",
                value: "true"
            }];
            ws.send(JSON.stringify(configRemote));
            console.log("⚙️ FIX: Enabling AuthorizeRemoteTxRequests to allow remote stop");
        }, 500);

        // Set MeterValueSampleInterval to 10 seconds
        setTimeout(() => {
            const configInterval = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "MeterValueSampleInterval",
                value: "10"
            }];
            ws.send(JSON.stringify(configInterval));
            console.log("⚙️ Configuring MeterValueSampleInterval to 10 seconds");
        }, 1000);

        // Set MeterValuesSampledData to include all measurands
        setTimeout(() => {
            const configMeasurands = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "MeterValuesSampledData",
                value: "Energy.Active.Import.Register,Power.Active.Import,Current.Import,Voltage"
            }];
            ws.send(JSON.stringify(configMeasurands));
            console.log("⚙️ Configuring MeterValuesSampledData measurands");
        }, 2000);

        // Disable ClockAlignedDataInterval to reduce stop delay
        setTimeout(() => {
            const configClockAligned = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "ClockAlignedDataInterval",
                value: "0"  // Disable clock-aligned intervals
            }];
            ws.send(JSON.stringify(configClockAligned));
            console.log("⚙️ Disabling ClockAlignedDataInterval to reduce stop delay");
        }, 3000);
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
            if (energy !== null) {
                console.log(`   📊 Energy Register: ${energy} Wh`);
            }


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
                    // allocatePowerToChargers(); // Commented out as per instruction

                    // Periodic DLB Sync (Every 15 seconds)
                    // DISABLED: Charger doesn't support SetChargingProfile (returns ProtocolError)
                    // TODO: Find alternative method to limit current (hardware configuration?)
                    /*
                    setInterval(() => {
                        chargers.forEach((charger, id) => {
                            if (charger.isCharging && charger.dlbState) {
                                console.log(`📊 [${id}] Periodic DLB Sync: Grid=${(charger.dlbState.gridPower / 1000).toFixed(1)}kW, Available=${(charger.dlbState.availablePower / 1000).toFixed(1)}kW`);
                            }
                        });
                        allocatePowerToChargers();
                    }, 15000);
                    */


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

                // Handle recovery mode - establish baseline from current meter reading
                if (charger.recoveryMode && energy !== null) {
                    console.log(`   ✅ Recovery: Got current meter value: ${energy} Wh`);
                    console.log(`   📊 Setting energy baseline for continued tracking`);

                    // Set the baseline - future readings will be relative to this
                    charger.recoveryBaseline = energy;
                    charger.sessionEnergy = 0; // Start from 0, will add delta from baseline
                    charger.recoveryMode = false; // Exit recovery mode

                    // Update session with baseline
                    const session = activeSessions[charger.transactionId];
                    if (session) {
                        session.startMeterValue = energy;
                        session.recoveryBaseline = energy;
                    }
                }

                // Calculate session energy
                if (charger.isCharging) {
                    if (energy !== null) {
                        // Use actual meter register if available (most accurate)
                        const session = activeSessions[charger.transactionId];
                        if (session && session.startMeterValue !== undefined) {
                            // Calculate from meter register difference
                            charger.sessionEnergy = (energy - session.startMeterValue) / 1000; // Convert Wh to kWh
                        } else if (charger.recoveryBaseline) {
                            // Post-recovery: use baseline
                            charger.sessionEnergy = (energy - charger.recoveryBaseline) / 1000; // Convert Wh to kWh
                        } else {
                            // Fallback: use raw energy value
                            charger.sessionEnergy = energy / 1000; // Convert Wh to kWh
                        }
                    } else {
                        // Fallback to time-based calculation if no meter register
                        const now = new Date();
                        if (charger.lastMeterTime) {
                            const deltaTime = (now - charger.lastMeterTime) / 1000; // seconds
                            const energyDelta = (power * deltaTime) / 3600 / 1000; // kWh
                            charger.sessionEnergy = (charger.sessionEnergy || 0) + energyDelta;
                        }
                        charger.lastMeterTime = now;
                    }
                } else {
                    charger.lastMeterTime = null;
                }

                // Debug: Log session energy if charging
                if (charger.isCharging && charger.sessionEnergy > 0) {
                    console.log(`   🔋 Session Energy: ${charger.sessionEnergy.toFixed(3)} kWh`);
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
            console.log(`📩 [${chargerId}] StartTransaction Request received`);
            console.log(`   📋 Payload:`, JSON.stringify(payload, null, 2));

            // Check if charger sent a transactionId
            let transactionId;
            if (payload.transactionId) {
                // Use charger's transaction ID
                transactionId = payload.transactionId;
                console.log(`   � Using charger's Transaction ID: ${transactionId}`);
            } else {
                // Generate our own transaction ID
                transactionId = Date.now();
                console.log(`   🔑 Generated Transaction ID: ${transactionId}`);
            }

            // Update charger metadata
            const charger = chargers.get(chargerId);
            if (charger) {
                charger.transactionId = transactionId;
                charger.isCharging = true;
                charger.status = 'Charging';
                charger.startTime = new Date();
                charger.sessionEnergy = 0;
                charger.lastMeterTime = new Date(); // Initialize to current time for immediate energy tracking
                console.log(`   ✅ Charger state updated: transactionId=${transactionId}, isCharging=true`);
            }

            activeSessions[transactionId] = {
                chargerId,
                transactionId,
                startTime: toIST(new Date()),
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

            // CRITICAL: Capture energy BEFORE clearing charger metadata
            const charger = chargers.get(chargerId);
            const energyKwh = charger ? (charger.sessionEnergy || 0) : 0;

            console.log(`📊 StopTransaction received: transactionId=${transactionId}`);
            console.log(`   💾 Captured session energy: ${energyKwh.toFixed(3)} kWh`);

            // Update charger metadata (clear after capturing energy)
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

                console.log(`📊 StopTransaction: Energy=${energyKwh.toFixed(2)} kWh, Duration=${duration} min`);

                // Save to MongoDB
                try {
                    await saveChargingSession({
                        chargerId: session.chargerId,
                        transactionId,
                        startTime: session.startTime,
                        endTime: toIST(endTime),
                        energyKwh: parseFloat(energyKwh.toFixed(2)),
                        duration,
                        stoppedBy: 'StopTransaction' // Natural stop
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
                status: 'Online',  // Map to UI "Online" instead of OCPP "Available"
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

            const charger = chargers.get(chargerId);
            if (charger) {
                charger.status = connectorStatus;

                // If charger reports "Charging" but we don't have an active session, create one
                // This handles server restart during active charging
                if (connectorStatus === 'Charging' && !charger.isCharging) {
                    console.log(`⚡ [${chargerId}] Detected active charging session (server restart recovery)`);

                    // Generate a recovery transaction ID
                    const recoveryTransactionId = Date.now();
                    charger.isCharging = true;
                    charger.transactionId = recoveryTransactionId;
                    charger.startTime = toIST(new Date()); // Temporary - will be updated when we get meter values
                    charger.sessionEnergy = 0; // Will update from MeterValues
                    charger.recoveryMode = true; // Flag to indicate we're recovering

                    // Create session entry
                    activeSessions[recoveryTransactionId] = {
                        chargerId,
                        transactionId: recoveryTransactionId,
                        startTime: charger.startTime,
                        startMeterValue: 0, // Unknown, will use relative energy
                        recovered: true // Mark as recovered session
                    };

                    console.log(`   📝 Created recovery session: Transaction ${recoveryTransactionId}`);
                    console.log(`   🔍 Requesting current meter values from charger...`);

                    // Request current meter values using TriggerMessage
                    // This will give us the actual current energy reading
                    const triggerMeterValues = [2, "trigger-meter-" + Date.now(), "TriggerMessage", {
                        requestedMessage: "MeterValues",
                        connectorId: 1
                    }];

                    charger.socket.send(JSON.stringify(triggerMeterValues));
                }

                // If status is Available or Finishing, mark as not charging
                if (connectorStatus === 'Available' || connectorStatus === 'Finishing') {
                    charger.isCharging = false;
                }
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
                    message: 'Vehicle connected'
                });
                console.log(`📤 Sent "Charging" status to dashboard (vehicle connected)`);
            }

            // AVAILABLE: Charger stopped and ready for next session
            else if (connectorStatus === 'Available') {
                broadcastToDashboards({
                    type: 'status',
                    chargerId: chargerId,
                    status: 'Online',  // Map OCPP "Available" to UI "Online"
                    message: 'Ready for charging'
                });
                console.log('📤 Sent "Online" status to dashboard (charger available)');
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

            const charger = chargers.get(chargerId);

            if (payload && payload.status === 'Rejected') {
                console.log('⚠️ Command was REJECTED by charger:', payload);

                // If it's a RemoteStop that was rejected, the fallback will trigger
                if (uniqueId.includes('cmd-') && charger) {
                    console.log('   ℹ️ Fallback stop method will attempt in 2 seconds...');
                }

                // Notify all dashboards if command was rejected
                broadcastToDashboards({
                    type: 'error',
                    chargerId: chargerId,
                    message: `Charger ${chargerId} rejected the command. Trying alternative method...`
                });
            } else if (payload && payload.status === 'Accepted') {
                console.log('✅ Command ACCEPTED by charger');

                // Clear fallback flag if RemoteStop was accepted
                if (charger && charger.pendingStopFallback) {
                    charger.pendingStopFallback = false;
                    console.log('   ✅ Cancelled fallback (command accepted)');
                }
            } else {
                console.log('✅ Command response received' + (payload ? '' : ' (no payload)'));
            }
        }
        // Handle configuration responses
        else if (msgType === 3 && uniqueId.startsWith('config-')) {
            console.log(`⚙️ Configuration response:`, JSON.stringify(payload));
        }
        // Handle diagnostic configuration check responses
        else if (msgType === 3 && uniqueId.startsWith('diag-')) {
            console.log(`🔍 CHARGER CONFIGURATION DIAGNOSTIC RESULTS:`);
            if (payload && payload.configurationKey) {
                payload.configurationKey.forEach(config => {
                    console.log(`   📋 ${config.key}: ${config.value} ${config.readonly ? '(readonly)' : ''}`);
                });

                // Analyze critical settings
                const authRemote = payload.configurationKey.find(k => k.key === 'AuthorizeRemoteTxRequests');
                const profileStack = payload.configurationKey.find(k => k.key === 'ChargeProfileMaxStackLevel');
                const maxProfiles = payload.configurationKey.find(k => k.key === 'MaxChargingProfilesInstalled');

                console.log(`\n   🔍 ANALYSIS:`);
                if (authRemote && authRemote.value === 'false') {
                    console.log(`   ⚠️ AuthorizeRemoteTxRequests is FALSE - Remote commands may be blocked!`);
                }
                if (profileStack && parseInt(profileStack.value) === 0) {
                    console.log(`   ⚠️ ChargeProfileMaxStackLevel is 0 - SetChargingProfile NOT supported!`);
                }
                if (maxProfiles && parseInt(maxProfiles.value) === 0) {
                    console.log(`   ⚠️ MaxChargingProfilesInstalled is 0 - SetChargingProfile NOT supported!`);
                }
            } else if (payload && payload.unknownKey) {
                console.log(`   ⚠️ Charger doesn't recognize these configuration keys:`, payload.unknownKey);
            }
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