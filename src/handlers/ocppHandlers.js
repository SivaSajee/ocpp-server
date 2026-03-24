const { saveChargingSession, loadChargerSettings } = require('../db/database');
const { OCPP_ERROR_MAP } = require('../constants/ocppErrors');
const { toIST } = require('../utils/utils');
const { dlbConfig } = require('../services/dlbService');
const {
    getCharger,
    broadcastToDashboards,
    createSession,
    getSession,
    deleteSession,
    getAllSessions,
    forEachCharger
} = require('../services/chargerService');

// Handle BootNotification
async function handleBootNotification(ws, uniqueId, payload, chargerId) {
    console.log(`🔌 [${chargerId}] BootNotification received:`, payload);

    const charger = getCharger(chargerId);
    if (charger && payload) {
        // Extract real firmware version from BootNotification payload
        if (payload.firmwareVersion) {
            charger.settings.firmwareVersion = payload.firmwareVersion;
            console.log(`📱 [${chargerId}] Firmware version: ${payload.firmwareVersion}`);
        }

        // Store other charger info
        if (payload.chargePointModel) charger.model = payload.chargePointModel;
        if (payload.chargePointVendor) charger.vendor = payload.chargePointVendor;
        if (payload.chargePointSerialNumber) charger.serialNumber = payload.chargePointSerialNumber;

        // 💾 RESTORE PERSISTED SETTINGS FROM MONGODB (RFID whitelist etc.)
        try {
            const savedSettings = await loadChargerSettings(chargerId);
            if (savedSettings) {
                // Merge saved settings — persisted fields override defaults,
                // but we keep any new default fields added since last save.
                // ⚠️ CRITICAL: We MUST NOT let old firmwareVersion from DB overwrite 
                // the fresh one we just got from the BootNotification payload!
                const currentFirmware = charger.settings.firmwareVersion;
                charger.settings = { ...charger.settings, ...savedSettings };
                if (currentFirmware) {
                    charger.settings.firmwareVersion = currentFirmware;
                }
                if (savedSettings.dlbModes) {
                    charger.dlbModes = savedSettings.dlbModes;
                }
                const tagCount = charger.settings.rfidWhitelist?.length || 0;
                console.log(`💾 [${chargerId}] Restored settings from MongoDB (${tagCount} RFID tag${tagCount !== 1 ? 's' : ''} in whitelist)`);
                if (tagCount > 0) {
                    console.log(`   🆔 Tags: ${charger.settings.rfidWhitelist.join(', ')}`);
                }
            } else {
                console.log(`💾 [${chargerId}] No saved settings found - using defaults`);
            }
        } catch (err) {
            console.error(`❌ [${chargerId}] Failed to load saved settings:`, err.message);
        }

        // Broadcast firmware info to dashboard
        broadcastToDashboards({
            type: 'chargerInfo',
            chargerId: chargerId,
            firmwareVersion: payload.firmwareVersion,
            model: payload.chargePointModel,
            vendor: payload.chargePointVendor
        });
    }

    ws.send(JSON.stringify([3, uniqueId, {
        "status": "Accepted",
        "currentTime": new Date().toISOString(),
        "interval": 30
    }]));
}

// Handle Heartbeat
function handleHeartbeat(ws, uniqueId) {
    ws.send(JSON.stringify([3, uniqueId, { "currentTime": new Date().toISOString() }]));
}

// Handle MeterValues
function handleMeterValues(ws, uniqueId, payload, chargerId) {
    let voltage = 0, current = 0, power = 0, energy = null;
    let gridPower = null, pvPower = null, homeLoad = null;

    payload.meterValue.forEach(mv => {
        // 🔍 DEBUG: Dump ALL measurands so we can see what the DLB receiver sends
        console.log(`📋 [${chargerId}] Raw MeterValues dump:`);
        mv.sampledValue.forEach(v => {
            console.log(`   • measurand="${v.measurand || 'n/a'}" location="${v.location || 'n/a'}" context="${v.context || 'n/a'}" phase="${v.phase || 'n/a'}" value="${v.value}" unit="${v.unit || 'n/a'}"`);
        });

        mv.sampledValue.forEach(v => {
            if (v.measurand === 'Voltage') voltage = parseFloat(v.value);
            if (v.measurand === 'Current.Import') current = parseFloat(v.value);
            if (v.measurand === 'Power.Active.Import' && (!v.location || v.location === 'Outlet')) {
                power = parseFloat(v.value);
            }
            if (v.measurand === 'Energy.Active.Import.Register') energy = parseFloat(v.value);

            // DLB measurands
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

    const charger = getCharger(chargerId);
    if (charger) {
        // Always update charger power in dlbState so the flow diagram shows it
        charger.dlbState.totalChargerLoad = Math.round(power);
        charger.dlbState.timestamp = new Date();

        // Update DLB grid/pv/home if the charger or external source provides them
        if (gridPower !== null) charger.dlbState.gridPower = Math.round(gridPower);
        if (pvPower !== null) charger.dlbState.pvPower = Math.round(pvPower);
        if (homeLoad !== null) charger.dlbState.homeLoad = Math.round(homeLoad);

        // Always broadcast DLB state so the dashboard flow diagram stays live
        broadcastToDashboards({
            type: 'dlb',
            chargerId: chargerId,
            data: charger.dlbState,
            modes: charger.dlbModes
        });

        // Update charger metadata
        charger.voltage = voltage;
        charger.current = current;
        charger.power = power;

        // 🚗 CHARGING COMPATIBILITY ADJUSTMENTS
        if (charger.settings && charger.settings.chargingCompatibility === true && charger.isCharging) {
            // Enhanced compatibility mode - apply smoothing for older vehicles
            if (charger.lastVoltage && charger.lastCurrent) {
                // Smooth voltage and current readings for better compatibility
                charger.voltage = Math.round((voltage + charger.lastVoltage) / 2);
                charger.current = Math.round((current + charger.lastCurrent) / 2 * 100) / 100;
                charger.power = Math.round(charger.voltage * charger.current);

                console.log(`🔧 [${chargerId}] Compatibility smoothing applied: V=${charger.voltage}, I=${charger.current}A`);
            }
            charger.lastVoltage = voltage;
            charger.lastCurrent = current;
        }

        // Handle recovery mode
        if (charger.recoveryMode && energy !== null) {
            console.log(`   ✅ Recovery: Got current meter value: ${energy} Wh`);
            charger.recoveryBaseline = energy;
            charger.sessionEnergy = 0;
            charger.recoveryMode = false;

            const session = getSession(charger.transactionId);
            if (session) {
                session.startMeterValue = energy;
                session.recoveryBaseline = energy;
            }
        }

        // Calculate session energy
        if (charger.isCharging) {
            if (energy !== null) {
                const session = getSession(charger.transactionId);
                if (session && session.startMeterValue !== undefined) {
                    charger.sessionEnergy = (energy - session.startMeterValue) / 1000;
                } else if (charger.recoveryBaseline) {
                    charger.sessionEnergy = (energy - charger.recoveryBaseline) / 1000;
                } else {
                    charger.sessionEnergy = energy / 1000;
                }
            } else {
                const now = new Date();
                if (charger.lastMeterTime) {
                    const deltaTime = (now - charger.lastMeterTime) / 1000;
                    const energyDelta = (power * deltaTime) / 3600 / 1000;
                    charger.sessionEnergy = (charger.sessionEnergy || 0) + energyDelta;
                }
                charger.lastMeterTime = now;
            }
        } else {
            charger.lastMeterTime = null;
        }

        if (charger.isCharging && charger.sessionEnergy > 0) {
            console.log(`   🔋 Session Energy: ${charger.sessionEnergy.toFixed(3)} kWh`);
        }
    }

    broadcastToDashboards({
        type: 'meter',
        chargerId: chargerId,
        voltage,
        current,
        power,
        energy,
        sessionEnergy: charger ? charger.sessionEnergy : 0
    });

    ws.send(JSON.stringify([3, uniqueId, {}]));
}

// Handle Authorize
function handleAuthorize(ws, uniqueId, payload, chargerId) {
    const idTag = payload.idTag;
    console.log(`🔐 [${chargerId}] Authorize request: ${idTag}`);

    const charger = getCharger(chargerId);
    let status = 'Invalid';
    let authReason = '';

    if (charger) {
        const isPlugAndPlay = charger.settings && charger.settings.plugAndPlay === true;
        const isWhitelisted = charger.settings && charger.settings.rfidWhitelist && charger.settings.rfidWhitelist.includes(idTag);

        // ── STOP AUTHORIZATION (charger is currently charging) ──────────────────
        if (charger.isCharging) {
            if (charger.startedBy === 'Remote') {
                // Session was started via the app — any authorized card can stop it
                if (isPlugAndPlay || isWhitelisted) {
                    status = 'Accepted';
                    authReason = 'Stop-Auth (App session, authorized card)';
                } else {
                    // ⚡ Also accept if plug & play is OFF but whitelist is empty
                    // (common case: user has no whitelist configured yet)
                    if (!charger.settings.rfidWhitelist || charger.settings.rfidWhitelist.length === 0) {
                        status = 'Accepted';
                        authReason = 'Stop-Auth (App session, no whitelist configured → allowing any card)';
                    } else {
                        authReason = 'Stop-Auth REJECTED (App session, card not in whitelist)';
                    }
                }
            } else {
                // Session was started via RFID — same card can always stop,
                // whitelisted cards or plug & play can also stop
                if (charger.activeIdTag === idTag) {
                    status = 'Accepted';
                    authReason = 'Stop-Auth (Same card that started session)';
                } else if (isPlugAndPlay || isWhitelisted) {
                    status = 'Accepted';
                    authReason = 'Stop-Auth (Authorized card stopping RFID session)';
                } else if (!charger.settings.rfidWhitelist || charger.settings.rfidWhitelist.length === 0) {
                    status = 'Accepted';
                    authReason = 'Stop-Auth (RFID session, no whitelist configured → allowing any card)';
                } else {
                    authReason = 'Stop-Auth REJECTED (Different card, not authorized)';
                }
            }
        }
        // ── START AUTHORIZATION (charger is idle) ────────────────────────────────
        else {
            // Remote tags sent by the server/app are always accepted
            const REMOTE_TAGS = ['AdminUser', 'UnknownUser', 'REMOTE', ''];
            const isRemoteStart = !idTag || idTag.length < 4 || REMOTE_TAGS.includes(idTag);

            if (isRemoteStart) {
                status = 'Accepted';
                authReason = 'Start-Auth (Remote/App start — auto-accepted)';
            } else if (isPlugAndPlay) {
                status = 'Accepted';
                authReason = 'Start-Auth (Plug & Play enabled)';
            } else if (isWhitelisted) {
                status = 'Accepted';
                authReason = 'Start-Auth (Whitelisted Tag)';
            } else if (!charger.settings.rfidWhitelist || charger.settings.rfidWhitelist.length === 0) {
                // No whitelist configured at all — accept any card so charger works out of the box
                status = 'Accepted';
                authReason = 'Start-Auth (No whitelist configured → allowing any card)';
            } else {
                authReason = 'Start-Auth REJECTED (Tag not in whitelist)';
            }
        }

        if (status === 'Accepted') {
            console.log(`   ✅ [${chargerId}] Authorized: ${authReason}`);
        } else {
            console.log(`   🚫 [${chargerId}] Authorization Failed: ${authReason}`);
        }
    }

    ws.send(JSON.stringify([3, uniqueId, {
        idTagInfo: {
            status: status,
            expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            parentIdTag: 'LocalAuth'
        }
    }]));
}

// Handle StartTransaction
function handleStartTransaction(ws, uniqueId, payload, chargerId) {
    console.log(`📩 [${chargerId}] StartTransaction Request received`);

    const charger = getCharger(chargerId);

    // 🔌 PLUG & PLAY LOGIC
    if (charger && charger.settings && charger.settings.plugAndPlay === false) {
        // Plug & Play disabled - require proper authentication
        const idTag = payload.idTag || '';
        if (!idTag || idTag === 'UnknownUser' || idTag.length < 4) {
            console.log(`🚫 [${chargerId}] START REJECTED - Plug & Play DISABLED, authentication required`);
            ws.send(JSON.stringify([3, uniqueId, {
                "currentTime": new Date().toISOString(),
                "idTagInfo": { "status": "Invalid" },
                "transactionId": null
            }]));

            broadcastToDashboards({
                type: 'error',
                chargerId: chargerId,
                message: 'Authentication required - Plug & Play is disabled. Please use RFID card or app.'
            });
            return;
        }
        console.log(`✅ [${chargerId}] Authentication accepted: ${idTag}`);
    } else {
        console.log(`🔌 [${chargerId}] Plug & Play enabled - auto-start allowed`);
    }

    let transactionId;
    if (payload.transactionId) {
        transactionId = payload.transactionId;
    } else {
        transactionId = Date.now();
    }

    // Determine how this session was started
    // 'AdminUser' is sent by the dashboard app's RemoteStartTransaction — treat as Remote
    const idTag = payload.idTag || '';
    const REMOTE_TAGS = ['AdminUser', 'UnknownUser', 'REMOTE', ''];
    const startedBy = (!idTag || idTag.length < 4 || REMOTE_TAGS.includes(idTag)) ? 'Remote' : 'RFID';

    if (charger) {
        charger.transactionId = transactionId;
        charger.isCharging = true;
        charger.status = 'Charging';
        charger.startTime = new Date();
        charger.sessionEnergy = 0;
        charger.lastMeterTime = new Date();
        // 🆔 Track who started the session for RFID stop-auth logic
        charger.activeIdTag = idTag || null;
        charger.startedBy = startedBy;
        console.log(`🆔 [${chargerId}] Session started by: ${startedBy}${idTag ? ' (card: ' + idTag + ')' : ''}`);
    }

    createSession(transactionId, {
        chargerId,
        transactionId,
        startTime: toIST(new Date()),
        startMeterValue: payload.meterStart || 0,
        chargingRate: calculateCurrentTariff(charger),
        spotTariffEnabled: charger?.settings?.spotTariffEnabled || false,
        startedBy: startedBy,
        startIdTag: idTag || null
    });

    console.log(`⚡ Session Started on ${chargerId}: Transaction ${transactionId}`);

    // 🔋 SPOT TARIFF LOGIC (Real Implementation)
    const currentRate = calculateCurrentTariff(charger);
    if (charger?.settings?.spotTariffEnabled) {
        const isPeak = isCurrentlyPeakTime(charger.settings.peakHours);
        console.log(`💰 [${chargerId}] Spot Tariff Active: ${isPeak ? 'PEAK' : 'OFF-PEAK'} - ₹${currentRate}/kWh`);

        // Send tariff info to charger
        sendTariffUpdate(chargerId, currentRate, isPeak);
    }

    broadcastToDashboards({
        type: 'charging',
        chargerId: chargerId,
        status: 'Charging',
        message: startedBy === 'RFID'
            ? `Charging started by RFID card: ${idTag}`
            : 'Charging started',
        sessionData: {
            startTime: getSession(transactionId).startTime,
            transactionId: transactionId
        }
    });

    // Broadcast rfidEvent so dashboard can show card activity
    if (startedBy === 'RFID') {
        broadcastToDashboards({
            type: 'rfidEvent',
            chargerId: chargerId,
            action: 'start',
            idTag: idTag,
            timestamp: new Date().toISOString()
        });
        console.log(`🆔 [${chargerId}] Charging started by RFID card: ${idTag}`);
    }

    // 🚗 CHARGING COMPATIBILITY LOGIC
    let response = {
        "currentTime": new Date().toISOString(),
        "idTagInfo": { "status": "Accepted" },
        "transactionId": transactionId
    };

    if (charger && charger.settings && charger.settings.chargingCompatibility === true) {
        // Enhanced compatibility mode for older/non-standard vehicles
        console.log(`🔧 [${chargerId}] Enhanced Compatibility Mode enabled`);
        response.idTagInfo.parentIdTag = "AdminUser";
        response.idTagInfo.expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h expiry

        // Add compatibility parameters for older vehicles
        response.chargingProfile = {
            chargingProfileId: 999,
            stackLevel: 0,
            chargingProfilePurpose: "TxDefaultProfile",
            chargingProfileKind: "Relative",
            chargingSchedule: {
                chargingRateUnit: "A", // Use Ampere for better compatibility
                chargingSchedulePeriod: [{
                    startPeriod: 0,
                    limit: Math.min(charger.maxChargeAmps || 32, 16), // Limit to 16A for compatibility
                    numberPhases: 1 // Single phase for older vehicles
                }]
            }
        };

        broadcastToDashboards({
            type: 'status',
            chargerId: chargerId,
            message: 'Enhanced compatibility mode active - optimized for older vehicles'
        });
    } else {
        console.log(`⚡ [${chargerId}] Standard charging mode`);
    }

    ws.send(JSON.stringify([3, uniqueId, response]));
}

// Handle StopTransaction
async function handleStopTransaction(ws, uniqueId, payload, chargerId) {
    const transactionId = payload.transactionId;
    const session = getSession(transactionId);
    const stoppingIdTag = payload.idTag || null;

    const charger = getCharger(chargerId);
    const energyKwh = charger ? (charger.sessionEnergy || 0) : 0;

    // Determine stop method: RFID card (has idTag), Remote (no idTag / system stop)
    const stoppedByRFID = stoppingIdTag && stoppingIdTag.length >= 4 && stoppingIdTag !== 'UnknownUser';
    const stopMethod = stoppedByRFID ? `RFID (${stoppingIdTag})` : 'Remote/App';

    console.log(`📊 StopTransaction received: transactionId=${transactionId}`);
    console.log(`   🆔 Stopped by: ${stopMethod}`);
    console.log(`   💾 Captured session energy: ${energyKwh.toFixed(3)} kWh`);

    if (charger) {
        charger.isCharging = false;
        charger.transactionId = null;
        charger.status = 'Online';
        charger.startTime = null;
        charger.sessionEnergy = 0;
        charger.power = 0;
        charger.current = 0;
        charger.lastMeterTime = null;
        // Clear RFID session tracking
        charger.activeIdTag = null;
        charger.startedBy = null;
    }

    if (session) {
        const endTime = new Date();
        const startTime = new Date(session.startTime);
        const duration = Math.floor((endTime - startTime) / 1000 / 60);

        console.log(`📊 StopTransaction: Energy=${energyKwh.toFixed(2)} kWh, Duration=${duration} min`);

        try {
            await saveChargingSession({
                chargerId: session.chargerId,
                transactionId,
                startTime: session.startTime,
                endTime: toIST(endTime),
                energyKwh: parseFloat(energyKwh.toFixed(2)),
                duration,
                stoppedBy: stoppedByRFID ? `RFID:${stoppingIdTag}` : 'Remote',
                startedBy: session.startedBy || 'Unknown'
            });
            console.log(`🔋 Session Saved to MongoDB: ${energyKwh.toFixed(2)} kWh`);
        } catch (error) {
            console.error('❌ Error saving session:', error);
        }

        deleteSession(transactionId);
    }

    ws.send(JSON.stringify([3, uniqueId, {
        "currentTime": new Date().toISOString(),
        "idTagInfo": { "status": "Accepted" }
    }]));

    // Broadcast stop event — include card info if stopped by RFID
    broadcastToDashboards({
        type: 'charging',
        chargerId: chargerId,
        status: 'Online',
        message: stoppedByRFID
            ? `Charging stopped by RFID card: ${stoppingIdTag}`
            : 'Charging stopped'
    });

    // Also broadcast rfidEvent so dashboard can show card activity
    if (stoppedByRFID) {
        broadcastToDashboards({
            type: 'rfidEvent',
            chargerId: chargerId,
            action: 'stop',
            idTag: stoppingIdTag,
            timestamp: new Date().toISOString()
        });
        console.log(`🆔 [${chargerId}] Charging stopped by RFID card: ${stoppingIdTag}`);
    }

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

// Handle StatusNotification
async function handleStatusNotification(ws, uniqueId, payload, chargerId) {
    const connectorStatus = payload.status;
    const errorCode = payload.errorCode || 'NoError';
    const errorInfo = payload.info || '';

    console.log(`📊 [${chargerId}] Status changed to: ${connectorStatus} (Error: ${errorCode})`);

    const charger = getCharger(chargerId);
    if (charger) {
        charger.status = connectorStatus;

        // Handle Faults
        if (errorCode !== 'NoError') {
            // 🛡️ GROUNDING DETECTION LOGIC
            if (errorCode === 'GroundFailure' && charger.settings && !charger.settings.groundingDetection) {
                console.log(`⚡ [${chargerId}] Ground fault ignored - Grounding Detection DISABLED`);
                // Send successful response even though there's a ground fault
                ws.send(JSON.stringify([3, uniqueId, { "currentTime": new Date().toISOString() }]));
                return;
            }

            const errorDetail = OCPP_ERROR_MAP[errorCode] || { message: "Unknown charger error", severity: "critical" };

            const fault = {
                errorCode: errorCode,
                message: errorDetail.message,
                severity: errorDetail.severity,
                info: errorInfo,
                status: connectorStatus,
                timestamp: toIST(new Date()),
                resolved: false
            };

            charger.currentFault = fault;
            charger.faultHistory.push(fault);
            charger.lastFaultTime = fault.timestamp;

            console.error(`⚠️ [${chargerId}] FAULT DETECTED: ${errorCode} - ${errorInfo}`);

            broadcastToDashboards({
                type: 'fault',
                chargerId: chargerId,
                fault: fault
            });

            // 🚨 EMERGENCY SAVE: If charger was charging when fault hit,
            // save the session NOW before the charger skips StopTransaction.
            // This handles EmergencyStop button, EVCommunicationError, PowerMeterFailure, etc.
            if (charger.isCharging && charger.transactionId) {
                const session = getSession(charger.transactionId);
                const energyKwh = charger.sessionEnergy || 0;

                console.log(`🚨 [${chargerId}] Fault while charging! Saving session before data loss...`);
                console.log(`   ⚡ Error: ${errorCode} | Energy: ${energyKwh.toFixed(3)} kWh`);

                if (session) {
                    const endTime = new Date();
                    const startTime = new Date(session.startTime);
                    const duration = Math.floor((endTime - startTime) / 1000 / 60);

                    try {
                        await saveChargingSession({
                            chargerId: session.chargerId,
                            transactionId: charger.transactionId,
                            startTime: session.startTime,
                            endTime: toIST(endTime),
                            energyKwh: parseFloat(energyKwh.toFixed(2)),
                            duration,
                            stoppedBy: `Fault:${errorCode}`,
                            startedBy: session.startedBy || 'Unknown'
                        });
                        console.log(`💾 [${chargerId}] Session saved due to fault: ${energyKwh.toFixed(2)} kWh`);
                    } catch (err) {
                        console.error(`❌ [${chargerId}] Failed to save session on fault:`, err.message);
                    }

                    deleteSession(charger.transactionId);
                }

                // Reset charger state
                charger.isCharging = false;
                charger.transactionId = null;
                charger.startTime = null;
                charger.sessionEnergy = 0;
                charger.power = 0;
                charger.current = 0;
                charger.lastMeterTime = null;
                charger.activeIdTag = null;
                charger.startedBy = null;

                // Broadcast session ended + meter reset
                broadcastToDashboards({
                    type: 'charging',
                    chargerId: chargerId,
                    status: 'Faulted',
                    message: `Charging stopped by fault: ${errorCode}`
                });
                broadcastToDashboards({
                    type: 'meter',
                    chargerId: chargerId,
                    voltage: 0, current: 0, power: 0, energy: null, sessionEnergy: 0
                });
            }
        } else if (charger.currentFault) {
            console.log(`✅ [${chargerId}] Fault cleared: ${charger.currentFault.errorCode}`);
            charger.currentFault.resolved = true;
            charger.currentFault.resolvedAt = toIST(new Date());
            charger.currentFault = null;

            broadcastToDashboards({
                type: 'faultCleared',
                chargerId: chargerId
            });
        }

        // Handle server restart recovery
        if (connectorStatus === 'Charging' && !charger.isCharging) {
            // 🔄 AUTO RESUME AFTER POWER LOSS LOGIC
            if (charger.settings && charger.settings.autoResumeAfterPowerLoss === false) {
                console.log(`🚫 [${chargerId}] Auto Resume DISABLED - Charging session not recovered`);
                console.log(`   💡 User must manually restart charging after power loss`);

                broadcastToDashboards({
                    type: 'status',
                    chargerId: chargerId,
                    status: 'Available',
                    message: 'Power restored - Manual restart required (Auto Resume disabled)'
                });

                // Set charger to available state
                charger.status = 'Available';
                charger.isCharging = false;
                charger.transactionId = null;
                return;
            }

            console.log(`⚡ [${chargerId}] Detected active charging session (server restart recovery)`);
            console.log(`   🔄 Auto Resume enabled - recovering charging session`);

            const recoveryTransactionId = Date.now();
            charger.isCharging = true;
            charger.transactionId = recoveryTransactionId;
            charger.startTime = toIST(new Date());
            charger.sessionEnergy = 0;
            charger.recoveryMode = true;

            createSession(recoveryTransactionId, {
                chargerId,
                transactionId: recoveryTransactionId,
                startTime: charger.startTime,
                startMeterValue: 0,
                recovered: true
            });

            console.log(`   📝 Created recovery session: Transaction ${recoveryTransactionId}`);

            const triggerMeterValues = [2, "trigger-meter-" + Date.now(), "TriggerMessage", {
                requestedMessage: "MeterValues",
                connectorId: 1
            }];
            charger.socket.send(JSON.stringify(triggerMeterValues));
        }

        if (connectorStatus === 'Available' || connectorStatus === 'Finishing') {
            charger.isCharging = false;
        }
    }

    // Broadcast status to dashboard
    if (connectorStatus === 'Preparing') {
        broadcastToDashboards({
            type: 'status',
            chargerId: chargerId,
            status: 'Preparing',
            message: 'Ready for charging - waiting for vehicle connection'
        });
    } else if (connectorStatus === 'Charging') {
        broadcastToDashboards({
            type: 'charging',
            chargerId: chargerId,
            status: 'Charging',
            message: 'Vehicle connected'
        });
    } else if (connectorStatus === 'Available') {
        broadcastToDashboards({
            type: 'status',
            chargerId: chargerId,
            status: 'Online',
            message: 'Ready for charging'
        });
    }

    ws.send(JSON.stringify([3, uniqueId, { "currentTime": new Date().toISOString() }]));
}

// Handle command responses
function handleCommandResponse(payload, uniqueId, chargerId) {
    console.log(`✅ Charger response to ${uniqueId}:`, payload ? JSON.stringify(payload) : "EMPTY RESPONSE");

    const charger = getCharger(chargerId);

    if (payload && payload.status === 'Rejected') {
        console.log('⚠️ Command was REJECTED by charger:', payload);

        if (uniqueId.includes('cmd-') && charger) {
            console.log('   ℹ️ Fallback stop method will attempt in 2 seconds...');
        }

        broadcastToDashboards({
            type: 'error',
            chargerId: chargerId,
            message: `Charger ${chargerId} rejected the command. Trying alternative method...`
        });
    } else if (payload && payload.status === 'Accepted') {
        console.log('✅ Command ACCEPTED by charger');

        // --- PERSISTENT MODE SWITCH LOGIC ---
        if (uniqueId.startsWith('mode-switch-config-')) {
            console.log(`📡 [${chargerId}] NetWorkSetting ACCEPTED. Sending Soft Reset in 1s...`);
            setTimeout(() => {
                const resetMsgId = `mode-switch-reset-${Date.now()}`;
                const resetMsg = [2, resetMsgId, 'Reset', { type: 'Soft' }];
                if (charger && charger.socket && charger.socket.readyState === 1) {
                    charger.socket.send(JSON.stringify(resetMsg));
                    console.log(`📤 Sent Soft Reset to ${chargerId} (ID: ${resetMsgId})`);
                }
            }, 1000);
        }

        if (charger && charger.pendingStopFallback) {
            charger.pendingStopFallback = false;
            console.log('   ✅ Cancelled fallback (command accepted)');
        }
    }
}

// Handle configuration responses
function handleConfigResponse(payload, uniqueId) {
    console.log(`⚙️ Configuration response:`, JSON.stringify(payload));
}

// Handle diagnostic configuration check responses
function handleDiagResponse(payload, uniqueId) {
    console.log(`🔍 CHARGER CONFIGURATION DIAGNOSTIC RESULTS:`);
    if (payload && payload.configurationKey) {
        payload.configurationKey.forEach(config => {
            console.log(`   📋 ${config.key}: ${config.value} ${config.readonly ? '(readonly)' : ''}`);
        });

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

// Handle FirmwareStatusNotification
function handleFirmwareStatusNotification(ws, uniqueId, payload, chargerId) {
    const status = payload.status;
    console.log(`🔄 [${chargerId}] Firmware Status: ${status}`);

    const charger = getCharger(chargerId);
    if (charger) {
        charger.firmwareStatus = status;

        // Broadcast firmware update progress to dashboard
        broadcastToDashboards({
            type: 'firmwareStatus',
            chargerId: chargerId,
            status: status,
            timestamp: toIST(new Date())
        });
    }

    // Send acknowledgment
    ws.send(JSON.stringify([3, uniqueId, {}]));
}

// Send UpdateFirmware command to charger
function sendUpdateFirmware(chargerId, firmwareUrl, retryInterval = 120) {
    const charger = getCharger(chargerId);
    if (!charger || !charger.socket) {
        console.error(`❌ [${chargerId}] Cannot send UpdateFirmware - charger not connected`);
        return { success: false, error: 'Charger not connected' };
    }

    // Z-Beny Requirement: Charger must be in Available (Idle) state
    if (charger.status !== 'Available') {
        console.warn(`⚠️ [${chargerId}] Firmware update rejected: Charger is currently ${charger.status} (must be Available)`);
        return { success: false, error: `Charger is ${charger.status}. Please stop charging/sessions before updating.` };
    }

    // Offset of 10-15 seconds is usually enough for the charger to prepare
    const startOffsetMs = 15000;
    const retrieveDate = new Date(Date.now() + startOffsetMs).toISOString();
    
    const updateMessage = [2, "update-firmware-" + Date.now(), "UpdateFirmware", {
        location: firmwareUrl,
        retries: 3,
        retrieveDate: retrieveDate,
        retryInterval: retryInterval
    }];

    console.log(`📦 [${chargerId}] Sending UpdateFirmware command:`);
    console.log(`   🔗 URL: ${firmwareUrl}`);
    console.log(`   ⏰ Start time: ${retrieveDate} (in ${startOffsetMs / 1000}s)`);
    console.log(`   🔄 Retry interval: ${retryInterval}s`);

    try {
        charger.socket.send(JSON.stringify(updateMessage));

        // Update charger firmware status
        charger.firmwareStatus = 'DownloadScheduled';

        // Broadcast status to dashboard
        broadcastToDashboards({
            type: 'firmwareStatus',
            chargerId: chargerId,
            status: 'DownloadScheduled',
            url: firmwareUrl,
            retrieveDate: retrieveDate
        });

        return { success: true };
    } catch (err) {
        console.error(`❌ [${chargerId}] Failed to send UpdateFirmware message:`, err.message);
        return { success: false, error: 'Socket communication error' };
    }
}

// Calculate current tariff rate based on time and charger settings
function calculateCurrentTariff(charger) {
    if (!charger?.settings?.spotTariffEnabled) {
        return 4.20; // Default rate
    }

    const isPeak = isCurrentlyPeakTime(charger.settings.peakHours);
    return isPeak ?
        (charger.settings.peakRate || 8.50) :
        (charger.settings.offPeakRate || 4.20);
}

// Check if current time is within peak hours
function isCurrentlyPeakTime(peakHours = '6-10,18-22') {
    const currentHour = new Date().getHours();
    return peakHours.split(',').some(range => {
        const [start, end] = range.split('-').map(Number);
        return currentHour >= start && currentHour <= end;
    });
}

// Send tariff update to charger (Real OCPP)
function sendTariffUpdate(chargerId, rate, isPeak) {
    const charger = getCharger(chargerId);
    if (!charger?.socket) return false;

    const uniqueId = 'tariff-' + Date.now();
    const message = [2, uniqueId, 'DataTransfer', {
        vendorId: 'EVChargerPro',
        messageId: 'TariffUpdate',
        data: JSON.stringify({ rate, isPeak, timestamp: Date.now() })
    }];

    try {
        charger.socket.send(JSON.stringify(message));
        broadcastToDashboards({
            type: 'tariffUpdate',
            chargerId,
            rate,
            isPeak,
            timestamp: new Date().toISOString()
        });
        return true;
    } catch (error) {
        console.error(`❌ [${chargerId}] Tariff update failed:`, error);
        return false;
    }
}

// Send LED Brightness Control (Real OCPP Implementation)
function sendLEDBrightnessControl(chargerId, brightness) {
    const charger = getCharger(chargerId);
    if (!charger?.socket) {
        console.error(`❌ [${chargerId}] Cannot send LED control: charger not connected`);
        return false;
    }

    const uniqueId = 'led-' + Date.now();
    const changeConfigMessage = [2, uniqueId, 'ChangeConfiguration', {
        key: 'LEDBrightness',
        value: brightness.toString()
    }];

    console.log(`💡 [${chargerId}] Setting LED brightness to ${brightness}%`);

    try {
        charger.socket.send(JSON.stringify(changeConfigMessage));

        // Update local settings
        if (charger.settings) {
            charger.settings.ledBrightness = brightness; // Update legacy field too
            charger.settings.currentLEDBrightness = brightness;
        }

        // Broadcast to dashboard
        broadcastToDashboards({
            type: 'ledBrightnessUpdate',
            chargerId,
            brightness,
            timestamp: new Date().toISOString()
        });

        return true;
    } catch (error) {
        console.error(`❌ [${chargerId}] LED control failed:`, error);
        return false;
    }
}

// Send Spot Tariff Configuration (Real OCPP Implementation)
function sendSpotTariffConfig(chargerId, tariffSettings) {
    const charger = getCharger(chargerId);
    if (!charger?.socket) {
        console.error(`❌ [${chargerId}] Cannot send tariff config: charger not connected`);
        return false;
    }

    const uniqueId = 'tariff-config-' + Date.now();
    const configMessage = [2, uniqueId, 'ChangeConfiguration', {
        key: 'TariffConfiguration',
        value: JSON.stringify({
            enabled: tariffSettings.spotTariffEnabled,
            peakRate: tariffSettings.peakRate,
            offPeakRate: tariffSettings.offPeakRate,
            peakHours: tariffSettings.peakHours
        })
    }];

    console.log(`💰 [${chargerId}] Configuring spot tariff:`, tariffSettings);

    try {
        charger.socket.send(JSON.stringify(configMessage));

        // Update local settings
        if (charger.settings) {
            Object.assign(charger.settings, tariffSettings);
        }

        // Broadcast to dashboard
        broadcastToDashboards({
            type: 'tariffConfigUpdate',
            chargerId,
            settings: tariffSettings,
            timestamp: new Date().toISOString()
        });

        return true;
    } catch (error) {
        console.error(`❌ [${chargerId}] Tariff config failed:`, error);
        return false;
    }
}

// Send DLB Hardware Configuration (ChangeConfiguration batch)
// Configures the charger's built-in DLB hardware chip via OCPP ChangeConfiguration.
// All values must be sent as strings per OCPP 1.6 spec.
function sendDLBHardwareConfig(chargerId, options = {}) {
    const charger = getCharger(chargerId);
    if (!charger?.socket) {
        console.error(`❌ [${chargerId}] Cannot send DLB hardware config: charger not connected`);
        return false;
    }

    const {
        dlbEnabled = true,
        normalModeMaxCurrent = 32,
        dlbType = 1,
        pvModeMaxGridCurrent = 99,
        dataTransferInterval = 30
    } = options;

    // Build list of ChangeConfiguration commands to send in sequence
    // DLBAPPConfigEnabled must go first — it unlocks remote config priority over hardware defaults
    const configs = [
        { key: 'DLBAPPConfigEnabled', value: 'true' },
        { key: 'DLBEnabled', value: dlbEnabled ? 'true' : 'false' },
        { key: 'DLBNormalModeMaxCurrent', value: String(normalModeMaxCurrent) },
        { key: 'DLBType', value: String(dlbType) },
        { key: 'DLBPVModeMaxGridCurrent', value: String(pvModeMaxGridCurrent) },
        { key: 'DLBDataTransferInterval', value: String(dataTransferInterval) }
    ];

    console.log(`⚙️ [${chargerId}] Sending DLB hardware configuration (${configs.length} keys)...`);

    // Stagger each command by 200ms to avoid flooding the charger
    configs.forEach((cfg, index) => {
        setTimeout(() => {
            const uniqueId = `dlbcfg-${cfg.key}-${Date.now()}`;
            const message = [2, uniqueId, 'ChangeConfiguration', {
                key: cfg.key,
                value: cfg.value
            }];
            try {
                charger.socket.send(JSON.stringify(message));
                console.log(`   📤 [${chargerId}] ChangeConfiguration → ${cfg.key} = "${cfg.value}"`);
            } catch (err) {
                console.error(`   ❌ [${chargerId}] Failed to send ${cfg.key}:`, err.message);
            }
        }, index * 1200);
    });

    // Broadcast to dashboard so UI can show confirmation
    broadcastToDashboards({
        type: 'dlbHardwareConfigSent',
        chargerId,
        config: {
            dlbEnabled,
            normalModeMaxCurrent,
            dlbType,
            pvModeMaxGridCurrent,
            dataTransferInterval
        },
        timestamp: new Date().toISOString()
    });

}

// Check and apply LED brightness for all chargers based on time
function checkAllChargersBrightness() {
    forEachCharger((charger, chargerId) => {
        checkAndApplyLEDBrightness(charger, chargerId);
    });
}

// Check and apply LED brightness for a single charger
function checkAndApplyLEDBrightness(charger, chargerId) {
    if (!charger || !charger.settings) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeVal = currentHour * 60 + currentMinute;

    const nightStart = charger.settings.ledNightStartTime || '20:00';
    const nightEnd = charger.settings.ledNightEndTime || '06:00';

    const [startHour, startMinute] = nightStart.split(':').map(Number);
    const [endHour, endMinute] = nightEnd.split(':').map(Number);

    const startTimeVal = startHour * 60 + startMinute;
    const endTimeVal = endHour * 60 + endMinute;

    let isNight = false;
    if (startTimeVal < endTimeVal) {
        // e.g. 20:00 to 22:00
        isNight = currentTimeVal >= startTimeVal && currentTimeVal < endTimeVal;
    } else {
        // e.g. 20:00 to 06:00 (crosses midnight)
        isNight = currentTimeVal >= startTimeVal || currentTimeVal < endTimeVal;
    }

    const targetBrightness = isNight
        ? (charger.settings.ledBrightnessNight !== undefined ? charger.settings.ledBrightnessNight : 50)
        : (charger.settings.ledBrightnessDay !== undefined ? charger.settings.ledBrightnessDay : 80);

    // Only send if different from what we think it is
    if (charger.settings.currentLEDBrightness !== targetBrightness) {
        console.log(`💡 [${chargerId}] Auto-adjusting LED Brightness: ${isNight ? 'Night' : 'Day'} Mode (${targetBrightness}%)`);
        sendLEDBrightnessControl(chargerId, targetBrightness);
    }
}

module.exports = {
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
    sendLEDBrightnessControl,
    sendSpotTariffConfig,
    sendDLBHardwareConfig,
    calculateCurrentTariff,
    isCurrentlyPeakTime,
    checkAllChargersBrightness
};
