// Configuration Constants
const CONFIG = {
    // Charging Limits
    MIN_CHARGE_AMPS: 6,           // Minimum charging current (EV standard)
    MAX_CHARGE_AMPS: 32,          // Maximum charging current (hardware limit)
    MAIN_FUSE_AMPS: 40,           // Main breaker size per phase (A)

    // Power and Voltage
    NOMINAL_VOLTAGE: 230,         // Phase voltage (V)
    PHASES: 3,                    // Number of phases (3-phase supply)
    GRID_CAPACITY: 20000,         // Max grid capacity (W)
    PV_CAPACITY: 10000,           // Solar capacity (W)
    HOME_BASE_LOAD: 3000,         // Average home consumption (W)
    SAFETY_MARGIN: 200,           // Safety buffer (W)

    // Timing
    NIGHT_START_HOUR: 22,         // Night mode start (22:00)
    NIGHT_END_HOUR: 6,            // Night mode end (06:00)
    METER_INTERVAL: 10000,        // Meter value interval (ms)
    HEARTBEAT_INTERVAL: 30000,    // Heartbeat interval (ms)
    DLB_SYNC_INTERVAL: 15000,     // DLB sync interval (ms)

    // Timeouts
    STOP_CURRENT_DELAY: 2000,     // Delay before reducing current (ms)
    STOP_RESET_DELAY: 2500,       // Delay before soft reset (ms)
    CONFIG_SETUP_DELAY: 2000,     // Delay before config setup (ms)

    // Z-Beny DLB Hardware (vendor-specific ChangeConfiguration keys — firmware 1.2.11)
    DLB_ENABLED: 'true',                    // 'true' = on, 'false' = off
    DLB_TYPE: '1',                          // '0'=Grid Only, '1'=Solar Hybrid (accepted by BCP-A2N-P), '2'=PV Only, '3'=NewSolar (rejected by this charger)
    DLB_NORMAL_MODE_MAX_CURRENT: '32',      // Breaker rating per phase (A)
    DLB_PV_MODE_MAX_GRID_CURRENT: '99',     // Max grid current in PV/hybrid mode (A)
    DLB_DATA_TRANSFER: 'true',              // Master switch for real-time reporting
    DLB_DATA_TRANSFER_INTERVAL: '30',       // Telemetry push interval (seconds)
    DLB_DATA_TRANSFER_ANYTIME_ENABLED: 'true' // Enable reporting 24/7 even when idle
};

module.exports = { CONFIG };
