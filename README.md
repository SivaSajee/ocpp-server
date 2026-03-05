# OCPP Server

A comprehensive **OCPP 1.6 WebSocket Server** with a real-time dashboard for managing and monitoring electric vehicle (EV) charging stations. This server implements the Open Charge Point Protocol (OCPP) 1.6J specification and provides a web-based interface for charger management, transaction monitoring, and historical data analysis.

## ✨ Features

### Core Functionality
- **OCPP 1.6J Protocol Support** - Full implementation of OCPP 1.6 JSON over WebSocket
- **Real-time Charger Management** - Monitor and control multiple charging stations simultaneously
- **Remote Start/Stop** - Initiate and terminate charging sessions remotely
- **RFID Bind Feature** - Secure RFID tag whitelist management for authorized charging
- **Advanced DLB Modes** - Support for PV Dynamic Balance, Extreme Mode, Night Full Speed, and Anti Overload
- **Fault & Diagnostic Management** - Real-time severity-based fault detection and diagnostic data parsing
- **Charging Timer** - Schedule charging sessions with custom start/stop times

### Dashboard Features
- **Live Charger Status** - Real-time monitoring of charger availability and state
- **Meter Values Display** - Live voltage, current, power, and energy consumption
- **Charging History** - Per-charger historical data with graphical visualization
- **Transaction Logs** - Detailed records of all charging sessions with session filtering
- **CSV Export** - Download charging history for offline analysis
- **Mobile Optimized UI** - Premium, responsive interface tailored for both desktop and mobile use, featuring a refined history view
- **Settings Management** - Configure LED brightness, spot tariffs, and power limits via UI
- **Configurable Main Fuse** - Manage main fuse rating constraints directly from the dashboard for accurate DLB calculations
- **Fault Diagnostics** - Interactive fault UI banner providing real-time severity-based alerts and detailed fault history logs

### Technical Features
- **MongoDB Integration** - Persistent storage for transactions and charger data
- **WebSocket Communication** - Bi-directional real-time communication
- **Charger Simulator** - Built-in simulator for testing without physical hardware
- **RESTful API** - HTTP endpoints for dashboard and external integrations

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 14.0.0
- **MongoDB** (local installation or MongoDB Atlas account)
- **npm** or **yarn** package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/SivaSajee/ocpp-server.git
   cd ocpp-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure your settings:
   ```env
   PORT=9000
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ocpp?retryWrites=true&w=majority
   ```

4. **Start the server**
   ```bash
   npm start
   ```

   The server will start on `http://localhost:9000` (or your configured port).

## 🎮 Usage

### Accessing the Dashboard

Open your browser and navigate to:
```
http://localhost:9000
```

The dashboard provides:
- **Overview** - Real-time status of all connected chargers
- **Charger Cards** - Individual charger controls and metrics
- **History** - Historical charging data and analytics
- **DLB Monitor** - Dynamic load balancing visualization

### Connecting a Charger

Configure your OCPP-compatible charger to connect to:
```
ws://YOUR_SERVER_IP:9000/ocpp
```

Replace `YOUR_SERVER_IP` with your server's IP address.

### Using the Charger Simulator

For testing without physical hardware:

```bash
npm run simulator
```

The simulator will:
- Connect to the OCPP server
- Send BootNotification
- Respond to RemoteStartTransaction and RemoteStopTransaction
- Send periodic MeterValues during charging
- Simulate realistic charging behavior

## 📁 Project Structure

```
ocpp-server/
├── server.js              # Main OCPP server and HTTP server
├── src/                   # Source code modules
│   ├── config/           # App configuration and environment setup
│   ├── constants/        # OCPP protocol constants and error codes
│   ├── db/               # MongoDB schema and connection logic
│   ├── handlers/         # OCPP (Authorize, Heartbeat) and UI handlers
│   ├── routes/           # API endpoint routing and static file serving
│   ├── services/         # Core business logic (Charger & DLB services)
│   └── utils/            # Helper functions (Time conversion, logging)
├── views/                 # HTML templates
│   └── dashboard.html    # Web dashboard UI
├── simulators/            # Testing and simulation tools
│   └── charger-simulator.js  # Dedicated charger simulator
├── public/                # Static assets served to dashboard
│   ├── css/              # Visual styles (dashboard.css, components.css)
│   └── js/               # Frontend logic (dashboard.js, animations.js)
├── .env                   # Local configuration (secrets & URIs)
├── .env.example          # Template for environment configuration
└── package.json          # Dependency management and scripts
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `9000` |
| `NODE_ENV` | Environment mode | `production` |
| `MONGODB_URI` | MongoDB connection string | Required |

### MongoDB Setup

#### Option 1: MongoDB Atlas (Cloud)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Get your connection string
4. Add it to your `.env` file

#### Option 2: Local MongoDB

1. Install MongoDB locally
2. Start MongoDB service
3. Use connection string: `mongodb://localhost:27017/ocpp`

## 🔌 OCPP Protocol Support

### Supported Messages

#### From Charger to Server (Requests)
- `BootNotification` - Charger registration
- `Heartbeat` - Keep-alive messages
- `StatusNotification` - Charger status updates
- `StartTransaction` - Transaction initiation
- `StopTransaction` - Transaction completion
- `MeterValues` - Real-time meter readings
- `Authorize` - RFID authorization

#### From Server to Charger (Requests)
- `RemoteStartTransaction` - Start charging remotely
- `RemoteStopTransaction` - Stop charging remotely
- `ChangeConfiguration` - Modify charger settings
- `Reset` - Reboot charger
- `GetConfiguration` - Retrieve charger configuration

## 📊 API Endpoints

### WebSocket
- `ws://localhost:9000/ocpp` - OCPP WebSocket endpoint

### HTTP
- `GET /` - Dashboard UI
- `GET /api/chargers/all` - List all connected chargers with status
- `GET /api/history` - Get charging session history
- `GET /api/history/chargers` - List chargers with history records
- `GET /api/history/download` - Export charger history as JSON/CSV
- `GET /api/dlb/status` - Current DLB status and power distribution
- `POST /api/dlb/config` - Update Dynamic Load Balancing settings
- `GET /api/settings/power-limit` - Fetch current system power limits
- `POST /api/settings/power-limit` - Update system-wide power limits
- `GET /api/settings/charger` - Get specific charger configuration
- `POST /api/settings/charger` - Update charger settings (Timer, Speed, etc.)
- `POST /api/settings/rfid/add` - Whitelist a new RFID tag
- `POST /api/settings/rfid/remove` - Remove an RFID tag from whitelist
- `GET /api/faults` - Retrieve active charger faults
- `POST /api/faults/clear` - Clear fault logs
- `GET /api/firmware/repositories` - List available firmware versions
- `POST /api/firmware/update` - Trigger OTA firmware upgrade

## 🧪 Testing

### Manual Testing
1. Start the server: `npm start`
2. Run the simulator: `npm run simulator`
3. Open the dashboard in your browser
4. Test remote start/stop functionality

### With Physical Charger
1. Configure charger's OCPP endpoint to your server
2. Set charger ID in the charger's configuration
3. Monitor connection in server logs
4. Test operations through the dashboard

## 🛠️ Development

### Running in Development Mode
```bash
npm run dev
```

### Project Scripts
- `npm start` - Start the production server
- `npm run dev` - Start in development mode
- `npm run simulator` - Run the charger simulator

## 📝 Database Schema

### Collections

#### `chargers`
Stores charger registration, connectivity status, and hardware metadata.

#### `sessions`
Stores detailed charging session data including:
- Transaction ID & Connector
- Start/Stop Timestamps & Durations
- Energy Consumption (kWh)
- Phased Meter Values (Voltage, Current, Power)
- User Identification (RFID Tag)
- Session Stop Reason

#### `settings`
Persisted system and charger-specific configurations:
- Load Balancing Modes
- Dynamic Power Limits
- RFID Whitelists
- Specialized Timers & Schedules

## 🌐 Network Configuration

### Static IP Setup (Windows)

For consistent charger connectivity:

1. Open Network Settings
2. Select your network adapter
3. Configure IPv4 settings:
   - IP Address: `10.1.1.12` (or your preferred IP)
   - Subnet Mask: `255.255.255.0`
   - Default Gateway: Your router's IP

### Firewall Configuration

Ensure port `9000` (or your configured port) is open for:
- Incoming WebSocket connections
- HTTP traffic for the dashboard

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- Built with the [OCPP 1.6J specification](https://www.openchargealliance.org/)
- Uses [ws](https://github.com/websockets/ws) for WebSocket implementation
- MongoDB for data persistence

## 📞 Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Made with ⚡ for EV Charging Infrastructure**
