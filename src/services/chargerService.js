const WebSocket = require('ws');
const { CONFIG } = require('../config/config');

// Multi-charger support
const chargers = new Map(); // chargerId -> { socket, status, transactionId, isCharging, lastSeen }
let dashboardSockets = new Set(); // Track all connected dashboards
let activeSessions = {}; // Track active charging sessions

// Create a new charger entry with default values
function createChargerEntry(socket) {
    return {
        socket: socket,
        status: 'Online',
        isCharging: false,
        transactionId: null,
        lastSeen: new Date(),
        // Timer fields for persistent timers
        activeTimer: null,
        timerSetAt: null,
        // Session metrics
        voltage: 0,
        current: 0,
        power: 0,
        sessionEnergy: 0,
        startTime: null,
        lastMeterTime: null,
        // Timeout tracking for cleanup
        pendingTimeouts: [],
        // DLB state for this specific charger's site
        dlbState: {
            gridPower: 0,
            pvPower: 0,
            homeLoad: 0,
            totalChargerLoad: 0,
            availablePower: 0,
            timestamp: new Date()
        },
        // Per-charger DLB modes
        dlbModes: {
            pvDynamicBalance: false,
            extremeMode: false,
            nightFullSpeed: false,
            antiOverload: false
        },
        // Per-charger power limit
        maxChargeAmps: CONFIG.MAX_CHARGE_AMPS,
        // Per-charger safety and feature settings
        settings: {
            groundingDetection: true,
            emergencyStop: true,
            plugAndPlay: false,
            autoResumeAfterPowerLoss: true,
            chargingCompatibility: false,
            // Additional advanced settings
            spotTariffEnabled: false,
            peakRate: 8.50,
            offPeakRate: 4.20,
            peakHours: '6-10,18-22',
            ledBrightness: 80, // Legacy
            ledBrightnessDay: 80,
            ledBrightnessNight: 50,
            ledNightStartTime: '20:00',
            ledNightEndTime: '06:00',
            firmwareVersion: 'v1.2.3',

            // Main breaker / fuse rating (A per phase) — user configurable
            mainFuseAmps: CONFIG.MAIN_FUSE_AMPS,

            // RFID Authorization
            rfidWhitelist: [] // Array of allowed RFID tags
        },
        // Fault tracking
        currentFault: null,
        faultHistory: [],
        lastFaultTime: null,
        // Compatibility tracking
        lastVoltage: null,
        lastCurrent: null,
        // Charger hardware info (from BootNotification)
        model: null,
        vendor: null,
        serialNumber: null
    };
}

// Add a new charger
function addCharger(chargerId, socket) {
    chargers.set(chargerId, createChargerEntry(socket));
}

// Get a charger by ID
function getCharger(chargerId) {
    return chargers.get(chargerId);
}

// Check if charger exists
function hasCharger(chargerId) {
    return chargers.has(chargerId);
}

// Remove a charger
function removeCharger(chargerId) {
    const charger = chargers.get(chargerId);
    if (charger) {
        // Clear all pending timeouts
        if (charger.pendingTimeouts && charger.pendingTimeouts.length > 0) {
            charger.pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
            charger.pendingTimeouts = [];
        }
    }
    chargers.delete(chargerId);
}

// Get list of all chargers for dashboard
function getChargerList() {
    const list = [];
    chargers.forEach((charger, id) => {
        let displayStatus = charger.status || 'Online';
        if (displayStatus === 'Available') {
            displayStatus = 'Online';
        }

        list.push({
            id: id,
            status: displayStatus,
            isCharging: charger.isCharging || false,
            activeTimer: charger.activeTimer,
            timerSetAt: charger.timerSetAt,
            voltage: charger.voltage || 0,
            current: charger.current || 0,
            power: charger.power || 0,
            sessionEnergy: charger.sessionEnergy || 0,
            startTime: charger.startTime,
            maxChargeAmps: charger.maxChargeAmps,
            dlbModes: charger.dlbModes,
            settings: charger.settings,
            currentFault: charger.currentFault || null,
            faultHistory: charger.faultHistory || []
        });
    });
    return list;
}

// Get all charger IDs
function getChargerIds() {
    return Array.from(chargers.keys());
}

// Iterate over all chargers
function forEachCharger(callback) {
    chargers.forEach(callback);
}

// Dashboard socket management
function addDashboardSocket(socket) {
    dashboardSockets.add(socket);
}

function removeDashboardSocket(socket) {
    dashboardSockets.delete(socket);
}

// Broadcast message to all dashboards
function broadcastToDashboards(message) {
    dashboardSockets.forEach(dashboard => {
        if (dashboard.readyState === WebSocket.OPEN) {
            dashboard.send(JSON.stringify(message));
        }
    });
}

// Session management
function createSession(transactionId, sessionData) {
    activeSessions[transactionId] = sessionData;
}

function getSession(transactionId) {
    return activeSessions[transactionId];
}

function deleteSession(transactionId) {
    delete activeSessions[transactionId];
}

function getAllSessions() {
    return activeSessions;
}

module.exports = {
    chargers,
    addCharger,
    getCharger,
    hasCharger,
    removeCharger,
    getChargerList,
    getChargerIds,
    forEachCharger,
    addDashboardSocket,
    removeDashboardSocket,
    broadcastToDashboards,
    createSession,
    getSession,
    deleteSession,
    getAllSessions
};
