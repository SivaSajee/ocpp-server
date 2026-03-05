const WebSocket = require('ws');
const { CONFIG } = require('../config/config');
const { forEachCharger, broadcastToDashboards } = require('./chargerService');

// Three-phase total watts per amp (3 × 230V)
const PHASE_WATTS = CONFIG.PHASES * CONFIG.NOMINAL_VOLTAGE; // 690 W/A

// DLB Configuration
const dlbConfig = {
    gridCapacity: CONFIG.GRID_CAPACITY,
    pvCapacity: CONFIG.PV_CAPACITY,
    homeBaseLoad: CONFIG.HOME_BASE_LOAD,
    safetyMargin: CONFIG.SAFETY_MARGIN,
    mainFuseAmps: CONFIG.MAIN_FUSE_AMPS,
    minChargeAmps: CONFIG.MIN_CHARGE_AMPS,
    maxChargeAmps: CONFIG.MAX_CHARGE_AMPS,
    nightStartHour: CONFIG.NIGHT_START_HOUR,
    nightEndHour: CONFIG.NIGHT_END_HOUR,
    modes: {
        pvDynamicBalance: false,
        extremeMode: false,
        nightFullSpeed: false,
        antiOverload: false
    }
};

// Get current load balance state for a charger
function calculateLoadBalance(chargerId, chargers) {
    const charger = chargers.get(chargerId);
    return charger ? charger.dlbState : null;
}

// Allocate power to active chargers
function allocatePowerToChargers(chargers) {
    chargers.forEach((charger, id) => {
        if (!charger.isCharging || !charger.socket || charger.socket.readyState !== WebSocket.OPEN || !charger.dlbState) {
            return;
        }

        const dlb = charger.dlbState;
        const currentHour = new Date().getHours();

        // --- 1. Determine Target Current (Amps) ---
        let targetAmps = 0;
        let modeDescription = "";

        const isNightTime = (currentHour >= dlbConfig.nightStartHour || currentHour < dlbConfig.nightEndHour);
        const isNightBoostActive = charger.dlbModes.nightFullSpeed && isNightTime;

        if (charger.dlbModes.extremeMode || isNightBoostActive) {
            targetAmps = charger.maxChargeAmps;
            modeDescription = charger.dlbModes.extremeMode ? "Extreme Mode" : "Night Full Speed";
        } else if (charger.dlbModes.pvDynamicBalance) {
            const solarPower = dlb.pvPower || 0;
            const housePower = dlb.homeLoad || 0;
            const excessPower = solarPower - housePower;

            modeDescription = "PV Dynamic";

            if (excessPower <= 0) {
                // No solar surplus — do not charge
                targetAmps = 0;
                console.log(`   ☀️ PV: ${(solarPower / 1000).toFixed(1)}kW | House: ${(housePower / 1000).toFixed(1)}kW | Excess: ${(excessPower / 1000).toFixed(1)}kW → No surplus, stopping charge`);
            } else {
                targetAmps = excessPower / PHASE_WATTS;
                console.log(`   ☀️ PV: ${(solarPower / 1000).toFixed(1)}kW | House: ${(housePower / 1000).toFixed(1)}kW | Excess: ${(excessPower / 1000).toFixed(1)}kW | Target: ${targetAmps.toFixed(1)}A`);
            }
        } else {
            targetAmps = charger.maxChargeAmps;
            modeDescription = "Standard";
        }

        // --- 2. Apply Constraints ---
        if (targetAmps > 0 && targetAmps < dlbConfig.minChargeAmps) {
            if (charger.dlbModes.pvDynamicBalance) {
                targetAmps = dlbConfig.minChargeAmps;
                modeDescription += " (Min Solar)";
            } else {
                targetAmps = dlbConfig.minChargeAmps;
                modeDescription += " (Min Current)";
            }
        }

        if (targetAmps > charger.maxChargeAmps) {
            targetAmps = charger.maxChargeAmps;
        }

        // --- 3. Anti Overload (Safety Layer) ---
        if (charger.dlbModes.antiOverload) {
            // Use per-charger fuse rating if set, else fall back to global config
            const fuseAmps = (charger.settings && charger.settings.mainFuseAmps)
                ? charger.settings.mainFuseAmps
                : dlbConfig.mainFuseAmps;

            // Per-phase amps (3-phase: total watts ÷ 690)
            const otherLoadsAmps = dlb.homeLoad / PHASE_WATTS;
            const safetyBuffer = 2.5;
            const availableAmps = fuseAmps - otherLoadsAmps - safetyBuffer;
            const threshold90 = fuseAmps * 0.9;
            const projectedTotal = otherLoadsAmps + targetAmps;

            if (projectedTotal >= threshold90 || targetAmps > availableAmps) {
                console.log(`⚠️ Anti Overload Triggered!`);
                console.log(`   Main Fuse: ${fuseAmps}A/phase | House: ${otherLoadsAmps.toFixed(1)}A/phase | 90% Threshold: ${threshold90.toFixed(1)}A`);
                console.log(`   Wanted: ${targetAmps.toFixed(1)}A | Capping at: ${Math.max(0, availableAmps).toFixed(1)}A`);

                targetAmps = Math.max(0, availableAmps);
                modeDescription += " (Throttled)";
            }
        }

        // --- 4. Send Command ---
        // SetChargingProfile limit is per-phase amps for 3-phase charger
        const powerLimitWatts = Math.round(targetAmps * PHASE_WATTS);

        console.log(`⚡ DLB [${id}]: ${modeDescription} | Target: ${targetAmps.toFixed(1)}A/phase (${powerLimitWatts}W) | Grid: ${(dlb.gridPower / PHASE_WATTS).toFixed(1)}A | Home: ${(dlb.homeLoad / PHASE_WATTS).toFixed(1)}A`);

        charger.dlbState.availablePower = powerLimitWatts;

        const chargingProfile = {
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
                        limit: Math.max(1380, powerLimitWatts)
                    }]
                }
            }
        };

        const setProfileCmd = [2, "dlb-" + Date.now(), "SetChargingProfile", chargingProfile];
        charger.socket.send(JSON.stringify(setProfileCmd));
    });
}

// Start periodic DLB updates
function startDLBUpdates(chargers) {
    setInterval(() => {
        chargers.forEach((charger, id) => {
            if (charger.status !== 'Offline' && charger.dlbState) {
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

        allocatePowerToChargers(chargers);
    }, CONFIG.DLB_SYNC_INTERVAL);
}

module.exports = {
    dlbConfig,
    calculateLoadBalance,
    allocatePowerToChargers,
    startDLBUpdates
};
