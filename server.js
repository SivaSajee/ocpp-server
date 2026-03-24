/**
 * OCPP Server - Main Entry Point
 * 
 * This server handles OCPP 1.6 communication with EV chargers
 * and provides a web dashboard for monitoring and control.
 * 
 * Modules:
 * - src/config/config.js        - Configuration constants
 * - src/utils/utils.js          - Utility functions
 * - src/services/chargerService.js - Charger state management
 * - src/services/dlbService.js  - Dynamic Load Balancing
 * - src/handlers/ocppHandlers.js - OCPP message handlers
 * - src/handlers/dashboardHandlers.js - Dashboard command handlers
 * - src/routes/apiRoutes.js     - HTTP API routes
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { connectDB } = require('./src/db/database');
const { CONFIG } = require('./src/config/config');

// ─── SESSION FILE LOGGER ────────────────────────────────────────────────────
// Saves ALL console output to a timestamped log file in ./logs/
// so every charger test session is permanently recorded for debugging.
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Format: logs/session-2026-02-25T10-02+05-30.log  (IST time)
const _startIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
const sessionTimestamp = _startIST.toISOString().replace('Z', '+05:30').replace(/:/g, '-').replace(/\..+\+/, '+');
const logFilePath = path.join(logsDir, `session-${sessionTimestamp}.log`);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

function writeToLog(prefix, args) {
    // Use IST (UTC+5:30) for all log timestamps
    const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const timestamp = now.toISOString().replace('Z', '+05:30');
    const line = `[${timestamp}] ${prefix}${args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
    ).join(' ')}\n`;
    logStream.write(line);
}

const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;

console.log = (...args) => { _origLog(...args); writeToLog('', args); };
console.warn = (...args) => { _origWarn(...args); writeToLog('[WARN] ', args); };
console.error = (...args) => { _origError(...args); writeToLog('[ERROR] ', args); };

// Also catch any unhandled exceptions/rejections
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err.message, err.stack);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('💥 UNHANDLED REJECTION:', reason);
});

console.log(`📝 Session log started: ${logFilePath}`);
// ────────────────────────────────────────────────────────────────────────────

// Services
const {
    chargers,
    addCharger,
    getCharger,
    getChargerList,
    addDashboardSocket,
    removeDashboardSocket,
    broadcastToDashboards
} = require('./src/services/chargerService');

const { dlbConfig, startDLBUpdates } = require('./src/services/dlbService');

// Handlers
const {
    handleBootNotification,
    handleAuthorize,
    handleHeartbeat,
    handleMeterValues,
    handleStartTransaction,
    handleStopTransaction,
    handleStatusNotification,
    handleCommandResponse,
    handleConfigResponse,
    handleDiagResponse,
    handleFirmwareStatusNotification,
    sendUpdateFirmware,
    checkAllChargersBrightness
} = require('./src/handlers/ocppHandlers');

const { processDashboardMessage } = require('./src/handlers/dashboardHandlers');
const { loadChargerSettings } = require('./src/db/database');

// Routes
const { handleRequest } = require('./src/routes/apiRoutes');

const PORT = process.env.PORT || 9000;

// 1. HTTP SERVER
const server = http.createServer(handleRequest);

// 2. WEBSOCKET SERVER
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const url = req.url;

    // --- A. DASHBOARD CONNECTS ---
    if (url.includes('dashboard-ui')) {
        addDashboardSocket(ws);
        console.log("💻 Dashboard Connected");

        // Send list of all connected chargers
        ws.send(JSON.stringify({
            type: 'chargerList',
            chargers: getChargerList()
        }));
        console.log("📤 Sent charger list to dashboard:", getChargerList().length, "chargers");

        // Handle dashboard disconnection
        ws.on('close', () => {
            removeDashboardSocket(ws);
            console.log(" Dashboard Disconnected");
        });

        // Listen for dashboard commands
        ws.on('message', (message) => {
            processDashboardMessage(message);
        });
        return;
    }

    // --- B. CHARGER CONNECTS ---
    const rawChargerId = url.replace('/', '');
    const chargerId = rawChargerId.replace(/[^a-zA-Z0-9_-]/g, '');

    // Validate charger ID
    if (!chargerId || chargerId.length === 0) {
        console.warn(`⚠️ Empty charger ID attempted from ${req.socket.remoteAddress}`);
        ws.close(1008, 'Invalid charger ID: cannot be empty');
        return;
    }

    if (chargerId.length > 50) {
        console.warn(`⚠️ Charger ID too long (${rawChargerId.length} chars) from ${req.socket.remoteAddress}`);
        ws.close(1008, 'Invalid charger ID: maximum 50 characters');
        return;
    }

    if (chargerId !== rawChargerId) {
        console.warn(`⚠️ Charger ID sanitized: "${rawChargerId}" → "${chargerId}"`);
    }

    // Add charger to registry
    addCharger(chargerId, ws);
    console.log(`🔌 CHARGER CONNECTED: ${chargerId}`);

    // 💾 Restore persisted settings immediately on connect
    // (handles reconnects where BootNotification may not be sent)
    loadChargerSettings(chargerId).then(savedSettings => {
        if (savedSettings) {
            const charger = getCharger(chargerId);
            if (charger) {
                charger.settings = { ...charger.settings, ...savedSettings };
                const tagCount = charger.settings.rfidWhitelist?.length || 0;
                console.log(`💾 [${chargerId}] Settings pre-loaded on connect (${tagCount} RFID tag${tagCount !== 1 ? 's' : ''})`);
            }
        }
    }).catch(err => {
        console.error(`❌ [${chargerId}] Failed to pre-load settings on connect:`, err.message);
    });

    // Broadcast updated charger list to all dashboards
    broadcastToDashboards({
        type: 'chargerList',
        chargers: getChargerList()
    });

    // Handle charger disconnection
    ws.on('close', () => {
        const charger = getCharger(chargerId);
        if (charger) {
            // Clear all pending timeouts
            if (charger.pendingTimeouts && charger.pendingTimeouts.length > 0) {
                charger.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
                console.log(`🧹 Cleared ${charger.pendingTimeouts.length} pending timeouts for ${chargerId}`);
                charger.pendingTimeouts = [];
            }

            charger.status = 'Offline';
            charger.socket = null;
            charger.isCharging = false;
        }
        console.log(`🔌 CHARGER DISCONNECTED: ${chargerId} (Marked Offline)`);

        const anyOnline = Array.from(chargers.values()).some(c => c.status !== 'Offline');
        if (!anyOnline) {
            console.log('⚡ DLB System: Idle (All chargers offline)');
        }

        broadcastToDashboards({
            type: 'chargerList',
            chargers: getChargerList()
        });
    });

    // Configure charger to send MeterValues
    const charger = getCharger(chargerId);
    const configTimeout = setTimeout(() => {
        console.log(`🔍 Checking charger configuration for OCPP feature support...`);

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

        const configTimeout1 = setTimeout(() => {
            const configRemote = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "AuthorizeRemoteTxRequests",
                value: "true"
            }];
            ws.send(JSON.stringify(configRemote));
            console.log("⚙️ FIX: Enabling AuthorizeRemoteTxRequests");
        }, 500);
        charger?.pendingTimeouts.push(configTimeout1);

        const configTimeout2 = setTimeout(() => {
            const configInterval = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "MeterValueSampleInterval",
                value: "10"
            }];
            ws.send(JSON.stringify(configInterval));
            console.log("⚙️ Configuring MeterValueSampleInterval to 10 seconds");
        }, 1000);
        charger?.pendingTimeouts.push(configTimeout2);

        const configTimeout3 = setTimeout(() => {
            const configMeasurands = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "MeterValuesSampledData",
                value: "Energy.Active.Import.Register,Power.Active.Import,Current.Import,Voltage,Power.Active.Import,Power.Active.Export,Current.Offered"
            }];
            ws.send(JSON.stringify(configMeasurands));
            console.log("⚙️ Configuring MeterValuesSampledData measurands");
        }, 2000);
        charger?.pendingTimeouts.push(configTimeout3);

        const configTimeout4 = setTimeout(() => {
            const configClockAligned = [2, "config-" + Date.now(), "ChangeConfiguration", {
                key: "ClockAlignedDataInterval",
                value: "0"
            }];
            ws.send(JSON.stringify(configClockAligned));
            console.log("⚙️ Disabling ClockAlignedDataInterval");
        }, 3000);
        charger?.pendingTimeouts.push(configTimeout4);

        // 🔍 Read what MeterValuesSampledData the charger currently has (incl. any DLB measurands)
        const configTimeout5 = setTimeout(() => {
            const readMeasurands = [2, "dlb-diag-" + Date.now(), "GetConfiguration", {
                key: ["MeterValuesSampledData", "StopTxnSampledData", "SupportedMeasurands"]
            }];
            ws.send(JSON.stringify(readMeasurands));
            console.log("🔍 Reading charger MeterValuesSampledData config (DLB diagnostic)...");
        }, 4500);
        charger?.pendingTimeouts.push(configTimeout5);

        // 🔓 All DLB configuration (App config unlock, Hardware Enable, Breaker Rating, 
        // PV Max Grid Current, Data Transfer Interval) has been moved to dashboardHandlers.js 
        // and is now executed strictly when the user clicks 'Enable DLB' on the dashboard.
    }, CONFIG.CONFIG_SETUP_DELAY);
    charger?.pendingTimeouts.push(configTimeout);

    // Handle OCPP messages
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

        // Route OCPP messages to handlers
        if (action === 'BootNotification') {
            await handleBootNotification(ws, uniqueId, payload, chargerId);
        } else if (action === 'Authorize') {
            handleAuthorize(ws, uniqueId, payload, chargerId);
        } else if (action === 'MeterValues') {
            handleMeterValues(ws, uniqueId, payload, chargerId);
        } else if (action === 'StartTransaction') {
            handleStartTransaction(ws, uniqueId, payload, chargerId);
        } else if (action === 'StopTransaction') {
            await handleStopTransaction(ws, uniqueId, payload, chargerId);
        } else if (action === 'StatusNotification') {
            await handleStatusNotification(ws, uniqueId, payload, chargerId);
        } else if (action === 'FirmwareStatusNotification') {
            handleFirmwareStatusNotification(ws, uniqueId, payload, chargerId);
        } else if (action === 'Heartbeat') {
            handleHeartbeat(ws, uniqueId);
        } else if (action === 'DataTransfer') {
            // 📦 Z-Beny DLB data via DataTransfer
            console.log(`📦 [${chargerId}] DataTransfer received:`);
            console.log(`   vendorId: ${payload?.vendorId}`);
            console.log(`   messageId: ${payload?.messageId}`);
            console.log(`   data: ${JSON.stringify(payload?.data)}`);

            // ⚡ DLBType restoration previously occurred here.
            // Removed because charger is lock-managed by the meter and rejects server overrides.
            try {
                let dlbPayload = payload?.data;

                // Firmware sends data as a JSON string — parse it
                if (typeof dlbPayload === 'string') {
                    try { dlbPayload = JSON.parse(dlbPayload); } catch (_) { }
                }

                if (dlbPayload && typeof dlbPayload === 'object') {
                    const charger = getCharger(chargerId);
                    if (charger && charger.dlbState) {
                        const VOLTAGE = 230; // Nominal voltage for Amps → Watts conversion

                        // Helper: parse a value that may have a unit suffix like "1.25kW" or "4.77W"
                        const parseKw = (v) => {
                            if (v == null) return null;
                            const s = String(v).replace(/kW$/i, '').replace(/W$/i, '').trim();
                            const n = parseFloat(s);
                            return isNaN(n) ? null : n;
                        };

                        // --- Format 1: EVB/NewSolar firmware — dot-key Power.* in kW ---
                        // e.g. { "Power.Grid": "1.25kW", "Power.Solar": "-4.77kW", "Power.HomeLoad": "0.00kW", "Power.EVSE": "0.00kW" }
                        const rawGridKw = dlbPayload['Power.Grid'] ?? null;
                        const rawPvKw = dlbPayload['Power.Solar'] ?? null;
                        const rawHomeKw = dlbPayload['Power.HomeLoad'] ?? null;
                        const rawEvseKw = dlbPayload['Power.EVSE'] ?? null;

                        // --- Format 2: ZJBENY firmware — current-based (Amps) ---
                        const gridA = dlbPayload.grid_current ?? null;
                        const homeA = dlbPayload.house_current ?? null;
                        const pvA = dlbPayload.pv_current ?? null;
                        const evA = dlbPayload.ev_current ?? null;

                        // --- Format 3: generic camelCase / alternate Watts-based names ---
                        const gridW =
                            dlbPayload.GridPower ?? dlbPayload.gridPower ??
                            dlbPayload.Grid ?? dlbPayload.grid ?? null;
                        const pvW =
                            dlbPayload.PVPower ?? dlbPayload.pvPower ??
                            dlbPayload.Solar ?? dlbPayload.solar ??
                            dlbPayload.PV ?? dlbPayload.pv ?? null;
                        const homeW =
                            dlbPayload.HomePower ?? dlbPayload.homePower ??
                            dlbPayload.Home ?? dlbPayload.home ??
                            dlbPayload.Load ?? dlbPayload.load ?? null;

                        // Apply values — priority: Format1 (kW dot-key) > Format2 (Amps) > Format3 (W)
                        const gridKwParsed = parseKw(rawGridKw);
                        const pvKwParsed = parseKw(rawPvKw);
                        const homeKwParsed = parseKw(rawHomeKw);

                        if (gridKwParsed !== null) charger.dlbState.gridPower = Math.round(gridKwParsed * 1000);
                        else if (gridA !== null) charger.dlbState.gridPower = Math.round(parseFloat(gridA) * VOLTAGE);
                        else if (gridW !== null) charger.dlbState.gridPower = Math.round(parseFloat(gridW));

                        if (pvKwParsed !== null) charger.dlbState.pvPower = Math.round(pvKwParsed * 1000);
                        else if (pvA !== null) charger.dlbState.pvPower = Math.round(parseFloat(pvA) * VOLTAGE);
                        else if (pvW !== null) charger.dlbState.pvPower = Math.round(parseFloat(pvW));

                        if (homeKwParsed !== null) charger.dlbState.homeLoad = Math.round(homeKwParsed * 1000);
                        else if (homeA !== null) charger.dlbState.homeLoad = Math.round(parseFloat(homeA) * VOLTAGE);
                        else if (homeW !== null) charger.dlbState.homeLoad = Math.round(parseFloat(homeW));

                        // Save DLBMode and DLBStatus if present
                        if (dlbPayload.DLBMode) charger.dlbState.dlbMode = dlbPayload.DLBMode;
                        const prevDlbStatus = charger.dlbState.dlbStatus;
                        if (dlbPayload.DLBStatus) charger.dlbState.dlbStatus = dlbPayload.DLBStatus;

                        // ⚡ DLB Offline Override:
                        // When the charger's hardware DLB meter goes offline, the charger firmware
                        // self-limits to 6A regardless of SetChargingProfile. Fix: disable the
                        // charger's internal DLB and push max current via OCPP profile.
                        if (dlbPayload.DLBStatus === 'Offline' && prevDlbStatus !== 'Offline') {
                            const maxAmps = charger.maxChargeAmps || 32;
                            const powerLimitWatts = maxAmps * 690; // 3-phase: 3 × 230V
                            console.log(`⚡ [${chargerId}] DLB Offline detected — overriding to ${maxAmps}A (disabling hardware DLB)`);

                            // 1. Disable the charger's internal DLB hardware (releases the 6A cap)
                            ws.send(JSON.stringify([2, 'config-' + Date.now(), 'ChangeConfiguration', {
                                key: 'DLBEnabled', value: 'false'
                            }]));

                            // 2. Push a charging profile at maxChargeAmps so car charges at full speed
                            setTimeout(() => {
                                if (charger.socket && charger.socket.readyState === WebSocket.OPEN && charger.isCharging) {
                                    ws.send(JSON.stringify([2, 'dlb-' + Date.now(), 'SetChargingProfile', {
                                        connectorId: 1,
                                        csChargingProfiles: {
                                            chargingProfileId: 1,
                                            stackLevel: 0,
                                            chargingProfilePurpose: 'TxDefaultProfile',
                                            chargingProfileKind: 'Relative',
                                            chargingSchedule: {
                                                chargingRateUnit: 'W',
                                                chargingSchedulePeriod: [{ startPeriod: 0, limit: powerLimitWatts }]
                                            }
                                        }
                                    }]));
                                    console.log(`⚡ [${chargerId}] DLB Offline override: SetChargingProfile sent at ${maxAmps}A (${powerLimitWatts}W)`);
                                }
                            }, 500);

                        } else if (dlbPayload.DLBStatus === 'Normal' && prevDlbStatus === 'Offline') {
                            // DLB meter came back online — re-enable hardware DLB
                            console.log(`✅ [${chargerId}] DLB back Online — re-enabling hardware DLB`);
                            ws.send(JSON.stringify([2, 'config-' + Date.now(), 'ChangeConfiguration', {
                                key: 'DLBEnabled', value: 'true'
                            }]));
                        }

                        const hasData = (gridKwParsed ?? pvKwParsed ?? homeKwParsed ?? gridA ?? pvA ?? homeA ?? gridW ?? pvW ?? homeW) !== null;

                        if (hasData) {
                            const evseW = parseKw(rawEvseKw);
                            if (evseW !== null) charger.dlbState.evsePower = Math.round(evseW * 1000);
                            console.log(`   ✅ DLB parsed → Grid=${charger.dlbState.gridPower}W | PV=${charger.dlbState.pvPower}W | Home=${charger.dlbState.homeLoad}W${evseW !== null ? ` | EVSE=${Math.round(evseW * 1000)}W` : ''} | Mode=${charger.dlbState.dlbMode || '-'}`);
                            broadcastToDashboards({
                                type: 'dlb',
                                chargerId,
                                data: charger.dlbState,
                                modes: charger.dlbModes
                            });
                        } else {
                            console.log(`   ⚠️ DataTransfer received but no DLB fields recognized. Raw:`, dlbPayload);
                        }
                    }
                }
            } catch (err) {
                console.error(`   ❌ Failed to parse DataTransfer DLB data:`, err.message);
            }

            // Always acknowledge — use Accepted for ZJBENY, UnknownVendorId otherwise
            const ackStatus = (payload?.vendorId === 'ZJBENY' || payload?.vendorId === 'EVB') ? 'Accepted' : 'UnknownVendorId';
            ws.send(JSON.stringify([3, uniqueId, { status: ackStatus }]));
        } else if (action) {
            // Log any unknown/unhandled OCPP actions
            console.log(`⚠️ [${chargerId}] Unhandled action: ${action} — payload: ${JSON.stringify(payload)}`);
            ws.send(JSON.stringify([3, uniqueId, {}]));
        }

        // Handle responses
        if (msgType === 3) {
            if (uniqueId.startsWith('cmd-')) {
                handleCommandResponse(payload, uniqueId, chargerId);
            } else if (uniqueId.startsWith('config-')) {
                handleConfigResponse(payload, uniqueId);
            } else if (uniqueId.startsWith('diag-')) {
                handleDiagResponse(payload, uniqueId);
            } else if (uniqueId.startsWith('dlb-diag-')) {
                // DLB diagnostic: show what measurands the charger supports
                console.log(`🔍 [${chargerId}] Charger MeterValuesSampledData config:`);
                if (payload && payload.configurationKey) {
                    payload.configurationKey.forEach(item => {
                        console.log(`   📋 ${item.key}: ${item.value || '(empty)'} ${item.readonly ? '(readonly)' : ''}`);
                    });
                }
                if (payload && payload.unknownKey && payload.unknownKey.length > 0) {
                    console.log(`   ⚠️ Unknown keys (not supported): ${payload.unknownKey.join(', ')}`);
                }
            } else {
                console.log("✅ Charger response received");
            }
        }
    });
});

// 3. Start periodic DLB updates
startDLBUpdates(chargers);

// 3.1 Start periodic LED Brightness checks (Day/Night mode)
setInterval(() => {
    checkAllChargersBrightness();
}, 60 * 1000); // Check every minute

// 4. Connect to MongoDB and start server
connectDB()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`✅ Server Running on Port ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`⚡ DLB System: Enabled`);
        });
    })
    .catch((error) => {
        console.error('❌ Failed to connect to MongoDB:', error);
        console.log('⚠️  Server will not start without database connection');
        process.exit(1);
    });