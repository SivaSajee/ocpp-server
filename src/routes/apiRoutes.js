const fs = require('fs');
const path = require('path');
const { getDB, getSessionsByPeriod, saveChargerSettings, loadChargerSettings } = require('../db/database');
const { toIST, getLocalIP } = require('../utils/utils');
const { dlbConfig, calculateLoadBalance, allocatePowerToChargers } = require('../services/dlbService');
const { sendUpdateFirmware, sendLEDBrightnessControl, sendSpotTariffConfig, sendDLBHardwareConfig, checkAllChargersBrightness } = require('../handlers/ocppHandlers');
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

    // Serve Firmware files
    if (req.url.startsWith('/firmware/')) {
        return serveFirmwareFile(req, res);
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

    if (req.url === '/api/dlb/hardware-config' && req.method === 'POST') {
        return handleDLBHardwareConfig(req, res);
    }

    if (req.url.startsWith('/api/dlb/configured') && req.method === 'GET') {
        return handleGetDLBConfigured(req, res);
    }

    if (req.url === '/api/dlb/configured' && req.method === 'POST') {
        return handleSetDLBConfigured(req, res);
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
        dlbEnabled: (charger.settings && charger.settings.dlbEnabled) === true,
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
            
            if (!charger.settings) charger.settings = {};
            charger.settings.dlbModes = charger.dlbModes;
            saveChargerSettings(chargerId, charger.settings);

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

            // Always attempt to clear the persistent UserCurrentLimit ceiling
            if (charger.socket && charger.socket.readyState === 1) {
                charger.socket.send(JSON.stringify([2, "config-" + Date.now(), "ChangeConfiguration", {
                    key: "UserCurrentLimit", value: String(newLimit)
                }]));
            }

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
    const localIP = getLocalIP();
    const firmwareDir = path.join(__dirname, '../../firmware');
    
    // 1. Start with official Z-Beny repository (from user requirements)
    const repositories = [
        {
            id: "zbeny-official",
            name: "Z-Beny Official",
            description: "Direct links to Z-Beny manufacturer firmware",
            versions: [
                {
                    version: "v1.0.26",
                    url: "http://106.15.78.131/BCP-A2N-P_SW1_0_26_HW1.bin",
                    releaseDate: "2024-05-10",
                    changelog: "Official Z-Beny BCP-A2N-P Firmware (SW1.0.26 / HW1)",
                    size: "4.5 MB"
                }
            ]
        }
    ];

    // 2. Scan local /firmware folder for any .bin files
    const localVersions = [];
    if (!fs.existsSync(firmwareDir)) {
        fs.mkdirSync(firmwareDir, { recursive: true });
    }

    try {
        const files = fs.readdirSync(firmwareDir);
        files.forEach(file => {
            if (file.endsWith('.bin')) {
                const stats = fs.statSync(path.join(firmwareDir, file));
                localVersions.push({
                    version: file.replace('.bin', ''),
                    url: `http://${localIP}:${PORT}/firmware/${file}`,
                    releaseDate: stats.mtime.toISOString().split('T')[0],
                    changelog: `Local file: ${file}`,
                    size: (stats.size / (1024 * 1024)).toFixed(1) + " MB"
                });
            }
        });
    } catch (err) {
        console.error("❌ Error scanning local firmware directory:", err.message);
    }

    if (localVersions.length > 0) {
        repositories.push({
            id: "local",
            name: "Local Files (Laptop)",
            description: `Firmware files found in your ./firmware/ folder`,
            versions: localVersions
        });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ repositories }));
}

// Serve firmware files from local directory
function serveFirmwareFile(req, res) {
    const filename = req.url.replace('/firmware/', '');
    const filePath = path.join(__dirname, '../../firmware', filename);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Firmware file not found");
        return;
    }

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${filename}"`
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
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
            const result = sendUpdateFirmware(chargerId, firmwareUrl);

            if (result.success) {
                console.log(`📦 [${chargerId}] Firmware update initiated: ${version} from ${firmwareUrl}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: `Firmware update started for ${chargerId}`,
                    version: version,
                    url: firmwareUrl
                }));
            } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: result.error || 'Failed to initiate firmware update'
                }));
            }
        } catch (error) {
            console.error('❌ Error parsing firmware update request:', error.message);
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

            console.log(`🔄 Switching charger ${chargerId} to Bluetooth mode (NetWorkSetting: 5): ${reason || 'User requested'}`);

            // Send ChangeConfiguration command for NetWorkSetting (5 = Offline/Bluetooth)
            const ws = charger.socket;
            if (ws && ws.readyState === 1) {
                const configMsgId = `mode-switch-config-${Date.now()}`;
                const configMsg = [2, configMsgId, 'ChangeConfiguration', { 
                    key: 'NetWorkSetting', 
                    value: '5' 
                }];
                ws.send(JSON.stringify(configMsg));
                console.log(`📤 Sent NetWorkSetting: 5 to ${chargerId} (ID: ${configMsgId})`);
            } else {
                console.error(`❌ Cannot send command: Charger ${chargerId} is not connected or socket unavailable`);
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not connected' }));
                return;
            }

            // Sync UI locally for now - final offline state will be broadcasted after disconnection
            charger.status = 'Disconnecting...';

            // Broadcast pending status update to dashboard
            broadcastToDashboards({
                type: 'status',
                chargerId: chargerId,
                status: 'Disconnecting...'
            });

            // Log initiation
            console.log(`✅ Transition initiated for ${chargerId}`);

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

// API: Get whether DLB has been set up for a charger
async function handleGetDLBConfigured(req, res) {
    const urlParams = new URL('http://x' + req.url).searchParams;
    const chargerId = urlParams.get('chargerId');

    if (!chargerId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing chargerId' }));
        return;
    }

    const charger = getCharger(chargerId);
    const configured = !!(charger?.settings?.dlbConfigured);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ configured }));
}

// API: Mark DLB as configured (or unconfigured) for a charger — persisted to MongoDB
function handleSetDLBConfigured(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
        try {
            const { chargerId, configured } = JSON.parse(body);
            if (!chargerId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing chargerId' }));
                return;
            }

            const charger = getCharger(chargerId);
            if (!charger) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Charger not found' }));
                return;
            }

            charger.settings.dlbConfigured = configured !== false; // default true
            await saveChargerSettings(chargerId, charger.settings);
            console.log(`💾 [${chargerId}] DLB configured flag saved: ${charger.settings.dlbConfigured}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, configured: charger.settings.dlbConfigured }));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}

// API: Send DLB hardware configuration via OCPP ChangeConfiguration
function handleDLBHardwareConfig(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
        try {
            const data = body ? JSON.parse(body) : {};
            const chargerId = data.chargerId;

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

            // Build options — caller may override defaults, otherwise use per-charger values
            const options = {
                dlbEnabled: data.dlbEnabled !== undefined ? data.dlbEnabled : true,
                // Use the charger's configured max current, NOT a hardcoded 32A default.
                // This ensures DLB hardware chip honours the user's max current setting.
                normalModeMaxCurrent: data.normalModeMaxCurrent !== undefined
                    ? data.normalModeMaxCurrent
                    : (charger.maxChargeAmps || 32),
                dlbType: data.dlbType !== undefined ? data.dlbType : 1,
                pvModeMaxGridCurrent: data.pvModeMaxGridCurrent !== undefined ? data.pvModeMaxGridCurrent : 99,
                dataTransferInterval: data.dataTransferInterval !== undefined ? data.dataTransferInterval : 30
            };

            // disableOnly: just send DLBEnabled=false, skip all other commands
            if (data.disableOnly) {
                const ws = charger.ws;
                if (!ws || ws.readyState !== 1) {
                    res.writeHead(503, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Charger not connected' }));
                    return;
                }
                const msgId = `dlb-disable-${Date.now()}`;
                ws.send(JSON.stringify([2, msgId, 'ChangeConfiguration', { key: 'DLBEnabled', value: 'false' }]));
                console.log(`⛔ [${chargerId}] DLBEnabled=false sent`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, sent: 'DLBEnabled=false' }));
                return;
            }

            console.log(`⚙️ [${chargerId}] DLB Hardware Config requested:`, options);

            const success = sendDLBHardwareConfig(chargerId, options);

            if (success) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: `DLB hardware configuration sent to ${chargerId}`,
                    config: options
                }));
            } else {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Charger is not connected or socket unavailable'
                }));
            }
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
}

module.exports = {
    handleRequest,
    handleAddRFIDTag,
    handleRemoveRFIDTag,
    handleDLBHardwareConfig
};
