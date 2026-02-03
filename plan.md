# AV Charger App - Project Plan & Status

## 🚀 Project Overview
A modern OCPP (Open Charge Point Protocol) Central System for managing and monitoring Electric Vehicle (EV) chargers. The system allows remote control, real-time telemetry, and historical usage tracking.

## 🏗️ Core Architecture
- **Backend (Node.js)**: Handles OCPP 1.6J communication and WebSocket broadcasting.
- **Frontend (HTML/CSS/JS)**: Premium, glassmorphism-styled dashboard for real-time monitoring and control.
- **Database (MongoDB Atlas)**: Cloud storage for charging sessions and historical data.
- **Simulator (Node.js)**: Virtual charger for testing software features.

## ✅ Features Implemented

### 1. Multi-Charger Dashboard
- Automatically detects and lists multiple online chargers.
- Status indicators (Online, Charging, Preparing, Offline).
- Remote Start/Stop functionality.

### 2. Real-Time Telemetry
- Live monitoring of **Voltage (V)**, **Current (A)**, and **Power (W)**.
- Dynamic gauge and wave animations reflecting charging status.
- Real-time energy consumption (kWh) tracking.

### 3. Smart Charging Timers
- **Duration Mode**: Automatic stop after set minutes.
- **Schedule Mode**: Precise start and end time scheduling.
- **Server-Side Persistence**: Timers continue running even if the dashboard is closed.

### 4. Advanced History Analytics
- **Visual Charts**: Interactive, scrollable daily usage column graphs.
- **Time Periods**: Toggle between Monthly and Yearly views.
- **Daily Breakdown**: Detailed lists showing date, weekday, and kWh for every session.
- **Per-Charger History**: View history specific to an individual charger.

## 🛠️ Technical Stack
- **Languages**: HTML5, Vanilla CSS3, JavaScript (ES6+), Node.js.
- **Protocols**: OCPP 1.6J, WebSockets (wss).
- **Database**: MongoDB (Mongoose/MongoClient).
- **Hosting Ready**: Environment variables configured for cloud deployment.

## 📈 Recent Enhancements
- [x] Redesigned Monthly History with a single-row scrollable column graph.
- [x] Added "Daily Breakdown" list for detailed usage transparency.
- [x] Fixed graph rendering height issues for consistent plotting.
- [x] Configured MongoDB cluster to safely support multiple databases (e.g., Bus Booking project).
