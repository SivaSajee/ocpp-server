const { toIST } = require('../utils/utils');
const { saveChargingSession } = require('../db/database');
const {
    getCharger,
    getChargerList,
    broadcastToDashboards,
    getSession,
    deleteSession
} = require('../services/chargerService');

// Handle START command from dashboard
function handleStartCommand(chargerId) {
    const charger = getCharger(chargerId);
    if (charger && charger.socket) {
        // 🛑 EMERGENCY STOP LOGIC
        if (charger.settings && charger.settings.emergencyStop === false) {
            console.log(`🚫 [${chargerId}] START BLOCKED - Emergency Stop is DISABLED`);
            broadcastToDashboards({
                type: 'error',
                chargerId: chargerId,
                message: 'Cannot start: Emergency Stop system is disabled. Enable it in Settings first.'
            });
            return;
        }

        console.log(`🚀 Sending Remote Start to Charger ${chargerId}...`);

        const remoteStart = [2, "cmd-" + Date.now(), "RemoteStartTransaction", { idTag: "AdminUser" }];
        charger.socket.send(JSON.stringify(remoteStart));
    }
}

// Handle STOP command from dashboard (Smart-Stop Fallback Sequence)
async function handleStopCommand(chargerId) {
    const charger = getCharger(chargerId);
    if (!charger || !charger.socket) return;

    console.log(`🛑 STOP REQUEST: Smart-Stop Fallback Sequence`);
    console.log(`   📊 Charger state: isCharging=${charger.isCharging}, transactionId=${charger.transactionId || 'NONE'}`);

    // PRIORITY 0: Set current to 0A
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
                    limit: 0
                }]
            }
        }
    }];
    charger.socket.send(JSON.stringify(setZeroCurrent));

    // Wait 2 seconds for current to drop to 0
    const timeout1 = setTimeout(() => {
        console.log(`   ✅ Current reduced to 0A, proceeding with stop sequence...`);
    }, 2000);
    charger.pendingTimeouts.push(timeout1);

    // Soft Reset after 2.5 seconds
    const timeout2 = setTimeout(async () => {
        if (charger.isCharging) {
            console.log(`   🔄 STEP 2: Soft Reset (Charger Reboot)`);

            const transactionId = charger.transactionId;
            const session = getSession(transactionId);

            if (session) {
                const endTime = new Date();
                const startTime = new Date(session.startTime);
                const duration = Math.floor((endTime - startTime) / 1000 / 60);
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
                        stoppedBy: 'SoftReset'
                    });
                    console.log(`      ✅ Session saved before reset`);
                    deleteSession(transactionId);
                } catch (error) {
                    console.error(`      ❌ Error saving session before reset:`, error.message);
                }
            }

            const reset = [2, "stop-step2-" + Date.now(), "Reset", { type: "Soft" }];
            charger.socket.send(JSON.stringify(reset));
        } else {
            console.log(`   ✅ Charging already stopped`);
        }
    }, 2500);
    charger.pendingTimeouts.push(timeout2);

    broadcastToDashboards({
        type: 'status',
        chargerId: chargerId,
        status: 'Stopping',
        message: 'Smart-Stop sequence initiated...'
    });
}

// Handle SET_TIMER command from dashboard
function handleSetTimer(chargerId, timer) {
    const charger = getCharger(chargerId);
    if (!charger) return;

    console.log(`⏱ Setting timer for ${chargerId}:`, timer);

    charger.activeTimer = timer;
    charger.timerSetAt = new Date().toISOString();

    broadcastToDashboards({
        type: 'chargerList',
        chargers: getChargerList()
    });

    console.log(`✅ Timer set for ${chargerId}`);
}

// Handle CANCEL_TIMER command from dashboard
function handleCancelTimer(chargerId) {
    const charger = getCharger(chargerId);
    if (!charger) return;

    console.log(`⏱ Canceling timer for ${chargerId}`);

    charger.activeTimer = null;
    charger.timerSetAt = null;

    broadcastToDashboards({
        type: 'chargerList',
        chargers: getChargerList()
    });

    console.log(`✅ Timer canceled for ${chargerId}`);
}

// Process dashboard message
function processDashboardMessage(message, chargerId) {
    const command = JSON.parse(message);
    const targetChargerId = command.chargerId || chargerId;

    switch (command.action) {
        case 'START':
            console.log(`🚀 [DEBUG] Received START command for ${targetChargerId} from dashboard socket`);
            handleStartCommand(targetChargerId);
            break;
        case 'STOP':
            handleStopCommand(targetChargerId);
            break;
        case 'SET_TIMER':
            handleSetTimer(targetChargerId, command.timer);
            break;
        case 'CANCEL_TIMER':
            handleCancelTimer(targetChargerId);
            break;
        default:
            console.log(`⚠️ Unknown dashboard command: ${command.action}`);
    }
}

module.exports = {
    handleStartCommand,
    handleStopCommand,
    handleSetTimer,
    handleCancelTimer,
    processDashboardMessage
};
