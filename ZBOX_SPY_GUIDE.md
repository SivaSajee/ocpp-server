# OCPP Spy Proxy - Usage Guide

## What This Does

The spy proxy sits between Z-BOX and your charger, logging every OCPP message so we can see the exact stop command Z-BOX uses.

## Setup Steps

### 1. Start Your OCPP Server (Port 9000)
```bash
npm start
```
Keep this running in one terminal.

### 2. Start the Spy Proxy (Port 9001)
Open a **new terminal** and run:
```bash
node ocpp-spy-proxy.js
```

You should see:
```
🕵️ OCPP SPY PROXY READY
📡 Listening on: ws://localhost:9001
🎯 Forwarding to: ws://localhost:9000
```

### 3. Configure Z-BOX

**Temporarily** change Z-BOX server URL:
- **Old:** `ws://[YOUR_IP]:9000/CP001`
- **New:** `ws://[YOUR_IP]:9001/CP001`

(Just change the port from 9000 to 9001)

### 4. Test with Z-BOX

1. Use Z-BOX to **start charging**
2. Use Z-BOX to **stop charging**
3. Watch the spy proxy terminal

### 5. Find the Stop Command

Look for this in the spy logs:
```
🛑🛑🛑 STOP COMMAND DETECTED! 🛑🛑🛑
Command: RemoteStopTransaction
Parameters: {
  "transactionId": 1234567890
}
```

OR

```
⚡⚡⚡ CHARGING PROFILE COMMAND DETECTED! ⚡⚡⚡
Command: SetChargingProfile
Parameters: {
  ...
}
```

### 6. Copy the Exact Format

Take a screenshot or copy the exact command format that Z-BOX uses.

### 7. Restore Z-BOX Configuration

Change Z-BOX server URL back to port 9000.

## What to Look For

The spy will highlight:
- 🛑 `RemoteStopTransaction` commands
- ⚡ `SetChargingProfile` commands

Pay attention to:
- ✅ Command name
- ✅ All parameters (exact names and values)
- ✅ Message structure
- ✅ Any special fields we're missing

## Troubleshooting

**Proxy won't start:**
- Make sure port 9001 is not already in use
- Check that your OCPP server is running on port 9000

**Z-BOX won't connect:**
- Verify you changed the port to 9001
- Check firewall settings
- Make sure you're using the correct IP address

**No messages appearing:**
- Verify Z-BOX is connected to the proxy (not directly to server)
- Check that the charger is communicating

## Next Steps

Once you capture the stop command:
1. Share the exact format with me
2. I'll update `server.js` to use the same format
3. Test with your server
4. Success! 🎉
