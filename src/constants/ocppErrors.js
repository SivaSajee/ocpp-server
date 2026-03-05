/**
 * OCPP Error Mapping
 * Maps OCPP error codes to user-friendly messages and severity levels.
 * Severity levels: critical (red), warning (orange/yellow), info (blue)
 */
const OCPP_ERROR_MAP = {
    // Standard OCPP 1.6 Error Codes
    'NoError': { message: "System Healthy", severity: "info" },
    'ConnectorLockFailure': { message: "Connector Lock Failure: Unable to lock/unlock connector", severity: "critical" },
    'EVCommunicationError': { message: "Vehicle Communication Lost: Check cable connection", severity: "critical" },
    'GroundFailure': { message: "Ground Fault Detected (GFCI): Check earthing immediately", severity: "critical" },
    'HighTemperature': { message: "Internal Overheating: Charger is too hot", severity: "warning" },
    'InternalError': { message: "Internal Charger Hardware Error", severity: "critical" },
    'LocalPListViolation': { message: "Local Authorization List Violation", severity: "warning" },
    'OtherError': { message: "An unspecified error occurred", severity: "warning" },
    'OverCurrentFailure': { message: "Over Current Protection Tripped: Drawing too much power", severity: "critical" },
    'OverVoltage': { message: "Input Voltage Too High: Risk of damage", severity: "warning" },
    'PowerMeterFailure': { message: "Internal Power Meter Failure", severity: "warning" },
    'PowerSwitchFailure': { message: "Internal Power Switch (Relay) Failure", severity: "critical" },
    'ReaderFailure': { message: "RFID Reader Failure", severity: "warning" },
    'ResetFailure': { message: "Charger Reset Failed", severity: "warning" },
    'UnderVoltage': { message: "Input Voltage Too Low: Undervoltage detected", severity: "warning" },
    'WeakSignal': { message: "Weak Network Signal: Connection may be unstable", severity: "info" },

    // Default for unknown errors
    'UnknownError': { message: "Unknown charger error reported", severity: "critical" }
};

module.exports = { OCPP_ERROR_MAP };
