# Charger Configuration Check Script

This script will query your charger's configuration to see what OCPP features it supports.

## Run this test to check charger capabilities:

1. Start a charging session
2. The server will send configuration queries
3. Check the logs for supported features

## Configuration Keys to Check:

- **AuthorizeRemoteTxRequests** - Must be `true` to allow remote start/stop
- **LocalAuthorizeOffline** - Should be `false` for remote control
- **ChargeProfileMaxStackLevel** - Must be > 0 to support SetChargingProfile
- **ChargingScheduleAllowedChargingRateUnit** - Should include "W" or "A"
- **MaxChargingProfilesInstalled** - Must be > 0

## How to Query Configuration

The server can send `GetConfiguration` commands to check these values.
