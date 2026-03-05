const fs = require('fs');
const path = require('path');
const { getDB, getSessionsByPeriod, saveChargerSettings, loadChargerSettings } = require('../db/database');
const { toIST } = require('../utils/utils');
const { dlbConfig, calculateLoadBalance, allocatePowerToChargers } = require('../services/dlbService');
const { sendUpdateFirmware, sendLEDBrightnessControl, sendSpotTariffConfig, checkAllChargersBrightness } = require('../handlers/ocppHandlers');
const {
    chargers,
    getCharger,
    getChargerList,
    getChargerIds,
    broadcastToDashboards
} = require('../services/chargerService');

const PORT = process.env.PORT || 9000;

// Handle HTTP requests
async function handleRequest(req, res) {
    // Dashboard page
    if (req.url === '/' || req.url === '/index.html') {
        return serveDashboard(req, res);
    }

    // Serve static files (CSS/JS)
    if (req.url.startsWith('/css/') || req.url.startsWith('/js/')) {
        return serveStaticFile(req, res);
    }

    // API endpoints
    if (req.url === '/api/history/chargers') {
        return handleHistoryChargers(req, res);
    }

    if (req.url.startsWith('/api/history/download')) {
        return handleHistoryDownload(req, res);
    }

    if (req.url.startsWith('/api/history')) {
        return handleHistory(req, res);
    }

    if (req.url === '/api/chargers/all') {
        return handleAllChargers(req, res);
    }

    if (req.url.startsWith('/api/dlb/status')) {
        return handleDLBStatus(req, res);
    }

    if (req.url === '/api/dlb/config' && req.method === 'POST') {
        return handleDLBConfig(req, res);
    }

    if (req.url.startsWith('/api/settings/power-limit') && req.method === 'GET') {
        return handleGetPowerLimit(req, res);
    }

    if (req.url === '/api/settings/power-limit' && req.method === 'POST') {
        return handleSetPowerLimit(req, res);
    }

    if (req.url.startsWith('/api/faults') && req.method === 'GET') {
        return handleGetFaults(req, res);
    }

    if (req.url === '/api/faults/clear' && req.method === 'POST') {
        return handleClearFaults(req, res);
    }

    if (req.url.startsWith('/api/settings/charger') && req.method === 'GET') {
        return handleGetChargerSettings(req, res);
    }

    if (req.url === '/api/settings/charger' && req.method === 'POST') {
        return handleSetChargerSettings(req, res);
    }

    if (req.url === '/api/firmware/repositories' && req.method === 'GET') {
        return handleGetFirmwareRepositories(req, res);
    }

    if (req.url === '/api/firmware/update' && req.method === 'POST') {
        return handleFirmwareUpdate(req, res);
    }

    if (req.url === '/api/charger/disconnect' && req.method === 'POST') {
        return handleChargerDisconnect(req, res);
    }

    if (req.url === '/api/settings/rfid/add' && req.method === 'POST') {
        return handleAddRFIDTag(req, res);
    }

    if (req.url === '/api/settings/rfid/remove' && req.method === 'POST') {
        return handleRemoveRFIDTag(req, res);
    }

    // Default response
    res.writeHead(200);
    res.end('Server Online');
}

// Serve dashboard HTML
function serveDashboard(req, res) {
    const dashboardPath = path.join(__dirname, '..', '..', 'views', 'dashboard.html');
    fs.readFile(dashboardPath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Error loading dashboard');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        }
    });
}

// Serve static files
function serveStaticFile(req, res) {
    const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(__dirname, '..', '..', 'public', safePath);

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

// API: Get chargers with history
async function handleHistoryChargers(req, res) {
    try {
        const db = getDB();
        const collection = db.collection('charging_sessions');

        const chargersList = await collection.aggregate([
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
        res.end(JSON.stringify(chargersList));
    } catch (error) {
        console.error('⚠️ Error fetching chargers:', error.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
    }
}

// API: Download history for a charger
async function handleHistoryDownload(req, res) {
    const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const chargerId = urlParams.get('chargerId');

    if (!chargerId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'chargerId parameter is required' }));
        return;
    }

    try {
        const db = getDB();
        const collection = db.collection('charging_sessions');

        const sessions = await collection
            .find({ chargerId: chargerId })
            .sort({ startTime: 1 })
            .toArray();

        console.log(`📊 Found ${sessions.length} sessions for ${chargerId}`);

        const formattedSessions = sessions.map(session => ({
            date: session.startTime ? session.startTime.substring(0, 10) : 'N/A',
            startTime: session.startTime ? session.startTime.substring(11, 19) : 'N/A',
            endTime: session.endTime ? session.endTime.substring(11, 19) : 'N/A',
            duration: session.duration || 0,
            energy: session.energyKwh || 0
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formattedSessions));
    } catch (error) {
        console.error('⚠️ Error fetching download data:', error.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
    }
}

// API: Get history
async function handleHistory(req, res) {
    const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const period = urlParams.get('period') || '2026-01';
    const viewType = urlParams.get('type') || 'month';
    const chargerId = urlParams.get('chargerId');

    try {
        const filteredSessions = await getSessionsByPeriod(period, viewType, chargerId);
        const totalEnergy = filteredSessions.reduce((sum, s) => sum + (s.energyKwh || 0), 0);

        const chartData = {};
        filteredSessions.forEach(s => {
            const key = viewType === 'month'
                ? parseInt(s.startTime.substring(8, 10))
                : parseInt(s.startTime.substring(5, 7));
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

// API: Get all chargers (historical + online)
async function handleAllChargers(req, res) {
    try {
        const db = getDB();
        const chargersCollection = db.collection('charging_sessions');
        const uniqueChargers = await chargersCollection.distinct('chargerId');

        const onlineChargerIds = getChargerIds();
        const allChargerIds = Array.from(new Set([...uniqueChargers, ...onlineChargerIds]));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(allChargerIds));
    } catch (error) {
        console.error('⚠️ MongoDB Unavailable, returning only online chargers');
        const onlineChargerIds = getChargerIds();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(onlineChargerIds));
    }
}

// API: Get DLB status
function handleDLBStatus(req, res) {
    const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const chargerId = urlParams.get('chargerId');

    const charger = getCharger(chargerId);

    if (!charger) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Charger not found' }));
        return;
    }

    const currentState = calculateLoadBalance(chargerId, chargers);

    if (!currentState) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'DLB data not found' }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        ...currentState,
        config: charger.dlbModes,
        mainFuseAmps: (charger.settings && charger.settings.mainFuseAmps) || dlbConfig.mainFuseAmps,
        gridCapacity: dlbConfig.gridCapacity,
        pvCapacity: dlbConfig.pvCapacity
    }));
}

// API: Update DLB config
function handleDLBConfig(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const update = JSON.parse(body);
            const chargerId = update.chargerId;

            if (!chargerId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'chargerId is required' }));
                return;
            }

            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            const incoming = update.modes || update;

            // Mutually exclusive modes: enabling one disables the others
            const EXCLUSIVE = ['pvDynamicBalance', 'extremeMode', 'nightFullSpeed'];
            const enabledMode = EXCLUSIVE.find(m => incoming[m] === true);
            if (enabledMode) {
                EXCLUSIVE.forEach(m => { charger.dlbModes[m] = (m === enabledMode); });
            } else {
                EXCLUSIVE.forEach(m => {
                    if (incoming[m] === false) charger.dlbModes[m] = false;
                });
            }

            // Anti Overload: user-controlled independently (not mutually exclusive)
            if (incoming.antiOverload !== undefined) {
                charger.dlbModes.antiOverload = !!incoming.antiOverload;
            }

            console.log(`⚙️ DLB Config Updated for ${chargerId}:`, charger.dlbModes);

            broadcastToDashboards({
                type: 'dlbConfig',
                chargerId: chargerId,
                modes: charger.dlbModes
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, modes: charger.dlbModes }));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}

// API: Get power limit
function handleGetPowerLimit(req, res) {
    const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const chargerId = urlParams.get('chargerId');

    if (!chargerId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'chargerId is required' }));
        return;
    }

    const charger = getCharger(chargerId);
    if (!charger) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Charger not found' }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        maxChargeAmps: charger.maxChargeAmps,
        minChargeAmps: dlbConfig.minChargeAmps
    }));
}

// API: Set power limit
function handleSetPowerLimit(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const update = JSON.parse(body);
            const chargerId = update.chargerId;
            const newLimit = parseInt(update.maxChargeAmps);

            if (!chargerId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'chargerId is required' }));
                return;
            }

            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            if (isNaN(newLimit) || newLimit < 6 || newLimit > 32) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid value. Must be between 6 and 32 Amps.'
                }));
                return;
            }

            charger.maxChargeAmps = newLimit;
            console.log(`⚙️ Power Limit Updated for ${chargerId}: ${newLimit}A`);

            if (charger.isCharging) {
                allocatePowerToChargers(chargers);
            }

            broadcastToDashboards({
                type: 'powerLimitUpdate',
                chargerId: chargerId,
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

// API: Get faults
function handleGetFaults(req, res) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const chargerId = urlParams.searchParams.get('chargerId');

    if (!chargerId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'chargerId is required' }));
        return;
    }

    const charger = getCharger(chargerId);
    if (!charger) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Charger not found' }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        currentFault: charger.currentFault,
        faultHistory: charger.faultHistory,
        lastFaultTime: charger.lastFaultTime
    }));
}

// API: Clear faults
function handleClearFaults(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const update = JSON.parse(body);
            const chargerId = update.chargerId;

            if (!chargerId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'chargerId is required' }));
                return;
            }

            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            if (charger.currentFault) {
                console.log(`🧹 Manual fault clear for ${chargerId}: ${charger.currentFault.errorCode}`);
                charger.currentFault.resolved = true;
                charger.currentFault.resolvedAt = toIST(new Date());
                charger.currentFault = null;

                broadcastToDashboards({
                    type: 'faultCleared',
                    chargerId: chargerId
                });
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}

// API: Get charger settings
function handleGetChargerSettings(req, res) {
    const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const chargerId = urlParams.get('chargerId');

    if (!chargerId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'chargerId is required' }));
        return;
    }

    const charger = getCharger(chargerId);
    if (!charger) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Charger not found' }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        settings: charger.settings,
        maxChargeAmps: charger.maxChargeAmps,
        dlbModes: charger.dlbModes
    }));
}

// API: Set charger settings
function handleSetChargerSettings(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const update = JSON.parse(body);
            const chargerId = update.chargerId;

            if (!chargerId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'chargerId is required' }));
                return;
            }

            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            // Update settings if provided
            if (update.settings) {
                charger.settings = { ...charger.settings, ...update.settings };

                // Apply real OCPP commands for specific settings
                if (update.settings.hasOwnProperty('ledBrightness')) {
                    const success = sendLEDBrightnessControl(chargerId, update.settings.ledBrightness);
                    if (!success) {
                        console.warn(`⚠️ Failed to send LED brightness control to ${chargerId}`);
                    }
                }

                if (update.settings.hasOwnProperty('spotTariffEnabled') ||
                    update.settings.hasOwnProperty('peakRate') ||
                    update.settings.hasOwnProperty('offPeakRate') ||
                    update.settings.hasOwnProperty('peakHours')) {
                    const tariffSettings = {
                        spotTariffEnabled: charger.settings.spotTariffEnabled,
                        peakRate: charger.settings.peakRate,
                        offPeakRate: charger.settings.offPeakRate,
                        peakHours: charger.settings.peakHours
                    };
                    const success = sendSpotTariffConfig(chargerId, tariffSettings);
                    if (!success) {
                        console.warn(`⚠️ Failed to send spot tariff config to ${chargerId}`);
                    }
                }
            }

            console.log(`⚙️ Settings updated for ${chargerId}:`, update.settings);

            // Broadcast settings update to dashboard
            broadcastToDashboards({
                type: 'settingsUpdate',
                chargerId: chargerId,
                settings: charger.settings
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                settings: charger.settings
            }));

            // Trigger brightness check to apply new settings immediately
            checkAllChargersBrightness();
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}

// API: Get firmware repositories
function handleGetFirmwareRepositories(req, res) {
    // Simulate firmware repository with different versions available
    const repositories = [
        {
            name: "Official Stable",
            description: "Production-ready firmware releases",
            versions: [
                {
                    version: "v2.1.8-stable",
                    url: "https://firmware.evcharger.com/releases/v2.1.8/firmware.bin",
                    releaseDate: "2026-02-10",
                    changelog: "Bug fixes, improved charging efficiency, security patches",
                    size: "4.2 MB"
                },
                {
                    version: "v2.1.7-stable",
                    url: "https://firmware.evcharger.com/releases/v2.1.7/firmware.bin",
                    releaseDate: "2026-01-15",
                    changelog: "Enhanced DLB algorithms, OCPP improvements",
                    size: "4.1 MB"
                }
            ]
        },
        {
            name: "Beta Channel",
            description: "Preview releases with latest features",
            versions: [
                {
                    version: "v2.2.0-beta3",
                    url: "https://firmware.evcharger.com/beta/v2.2.0-beta3/firmware.bin",
                    releaseDate: "2026-02-14",
                    changelog: "New smart charging features, improved UI, experimental V2G support",
                    size: "4.5 MB"
                }
            ]
        }
    ];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ repositories }));
}

// API: Initiate firmware update
function handleFirmwareUpdate(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const update = JSON.parse(body);
            const chargerId = update.chargerId;
            const firmwareUrl = update.firmwareUrl;
            const version = update.version;

            if (!chargerId || !firmwareUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'chargerId and firmwareUrl are required' }));
                return;
            }

            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            // Send UpdateFirmware command to charger
            const success = sendUpdateFirmware(chargerId, firmwareUrl);

            if (success) {
                console.log(`📦 [${chargerId}] Firmware update initiated: ${version} from ${firmwareUrl}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: `Firmware update started for ${chargerId}`,
                    version: version,
                    url: firmwareUrl
                }));
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Failed to send update command to charger'
                }));
            }
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}
// Handle charger disconnect (Switch to Bluetooth mode)
function handleChargerDisconnect(req, res) {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        try {
            const { chargerId, reason } = JSON.parse(body);

            if (!chargerId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'chargerId is required' }));
                return;
            }

            // Get charger
            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            // Check if charger is currently charging
            if (charger.isCharging) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'Cannot disconnect charger while charging is active'
                }));
                return;
            }

            console.log(`🔄 Disconnecting charger ${chargerId} for Bluetooth mode switch: ${reason || 'User requested'}`);

            // Close WebSocket connection if exists
            if (charger.socket && charger.socket.readyState === 1) {
                charger.socket.close(1000, 'Switching to Bluetooth mode');
            }

            // Update charger status to offline
            charger.status = 'Offline';
            charger.isCharging = false;

            // Broadcast status update to dashboard
            broadcastToDashboards({
                type: 'status',
                chargerId: chargerId,
                status: 'Offline'
            });

            // Log disconnection
            console.log(`✅ Charger ${chargerId} disconnected successfully for Bluetooth mode`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: `Charger ${chargerId} disconnected for Bluetooth mode`,
                chargerId: chargerId
            }));

        } catch (error) {
            console.error('Error disconnecting charger:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });

}

// Routes for RFID Management
async function handleAddRFIDTag(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const { chargerId, tag } = data;

            if (!chargerId || !tag) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing chargerId or tag' }));
                return;
            }

            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            if (!charger.settings.rfidWhitelist) {
                charger.settings.rfidWhitelist = [];
            }

            if (!charger.settings.rfidWhitelist.includes(tag)) {
                charger.settings.rfidWhitelist.push(tag);
                console.log(`🆔 [${chargerId}] Added RFID tag: ${tag} (whitelist now: ${charger.settings.rfidWhitelist.length} tags)`);
            }

            // Persist to MongoDB so it survives server restarts
            await saveChargerSettings(chargerId, charger.settings);

            // Broadcast settings update to dashboard
            broadcastToDashboards({
                type: 'settingsUpdate',
                chargerId: chargerId,
                settings: charger.settings
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, whitelist: charger.settings.rfidWhitelist }));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}

async function handleRemoveRFIDTag(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const { chargerId, tag } = data;

            if (!chargerId || !tag) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing chargerId or tag' }));
                return;
            }

            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            if (charger.settings.rfidWhitelist) {
                charger.settings.rfidWhitelist = charger.settings.rfidWhitelist.filter(t => t !== tag);
                console.log(`🆔 [${chargerId}] Removed RFID tag: ${tag} (whitelist now: ${charger.settings.rfidWhitelist.length} tags)`);
            }

            // Persist to MongoDB so removal survives server restarts
            await saveChargerSettings(chargerId, charger.settings);

            // Broadcast settings update to dashboard
            broadcastToDashboards({
                type: 'settingsUpdate',
                chargerId: chargerId,
                settings: charger.settings
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, whitelist: charger.settings.rfidWhitelist }));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}

module.exports = {
    handleRequest,
    handleAddRFIDTag,
    handleRemoveRFIDTag
};
