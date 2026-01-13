# OCPP Server

A WebSocket-based OCPP 1.6 server for EV charging stations with a real-time dashboard.

## Features

- ✅ OCPP 1.6 WebSocket protocol support
- 📊 Real-time dashboard with live metrics
- 🔌 Remote start/stop charging
- 📈 Charging history tracking with MongoDB
- ⚡ Live voltage, current, and power monitoring
- ☁️ Cloud-ready with persistent storage

## Quick Start

### Local Development

1. **Set Up MongoDB Atlas** (Free)
   - See [QUICK_START.md](QUICK_START.md) for step-by-step guide
   - Get your connection string

2. **Create .env File**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your MongoDB connection string:
   ```env
   PORT=9000
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ocpp?retryWrites=true&w=majority
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Start Server**
   ```bash
   npm start
   ```

5. **Access Dashboard**
   - Open browser: `http://localhost:9000`

### Cloud Deployment

**Quick Start (30 minutes):**
See [QUICK_START.md](QUICK_START.md) for a streamlined guide.

**Detailed Guides:**
- [MONGODB_SETUP.md](MONGODB_SETUP.md) - MongoDB Atlas setup
- [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) - Render.com deployment
- [DEPLOYMENT.md](DEPLOYMENT.md) - All cloud platform options

## Configuration

The server uses environment variables for configuration. Copy `.env.example` to `.env`:

```bash
PORT=9000
NODE_ENV=production
```

## Project Structure

```
OCPP-Server/
├── server.js              # Main server file (WebSocket + HTTP)
├── database.js            # MongoDB connection and operations
├── dashboard.html         # Web dashboard UI
├── package.json          # Dependencies and scripts
├── .env.example          # Environment variables template
├── .gitignore           # Git exclusions
├── QUICK_START.md       # 30-minute deployment guide
├── MONGODB_SETUP.md     # MongoDB Atlas setup guide
├── RENDER_DEPLOYMENT.md # Render.com deployment guide
├── DEPLOYMENT.md        # All cloud platform options
└── README.md           # This file
```

## Usage

### Connecting a Charger

Configure your OCPP 1.6 compatible charger to connect to:

**Local:**
```
ws://localhost:9000/YOUR_CHARGER_ID
```

**Cloud:**
```
wss://your-cloud-url.com/YOUR_CHARGER_ID
```

### Dashboard

The dashboard connects via WebSocket to:
```
ws://localhost:9000/dashboard-ui
```

Features:
- View charger status (Online/Offline)
- Monitor real-time voltage, current, power
- Remote start/stop charging
- View charging history (monthly/yearly)

## API Endpoints

### HTTP Endpoints

- `GET /` - Dashboard UI
- `GET /api/history?period=2026-01&type=month` - Get charging history

### WebSocket Endpoints

- `/dashboard-ui` - Dashboard WebSocket connection
- `/{chargerId}` - Charger WebSocket connection

## OCPP Messages Supported

- ✅ BootNotification
- ✅ Heartbeat
- ✅ StatusNotification
- ✅ MeterValues
- ✅ StartTransaction
- ✅ StopTransaction
- ✅ RemoteStartTransaction
- ✅ RemoteStopTransaction
- ✅ ChangeConfiguration

## Technologies

- **Node.js** - Runtime environment
- **ws** - WebSocket library
- **MongoDB** - Database for persistent storage
- **HTTP** - Built-in HTTP server

## Important Notes

### Data Persistence

Currently uses `charging_history.json` for data storage. For production deployments, consider migrating to a database:
- MongoDB Atlas (Free tier)
- PostgreSQL (Render, Railway, Supabase)

### Cloud Platform Considerations

- Most cloud platforms have **ephemeral filesystems** (data may be lost on restart)
- Free tiers may have sleep/timeout limitations
- WebSocket support varies by platform

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed information.

## License

ISC

## Support

For deployment help, see [DEPLOYMENT.md](DEPLOYMENT.md)
