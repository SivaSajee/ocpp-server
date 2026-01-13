# Quick Start Guide: MongoDB + Render Deployment

This guide will get your OCPP server running on Render with MongoDB Atlas in about 30 minutes.

## 📋 Checklist

- [ ] Set up MongoDB Atlas (10 minutes)
- [ ] Test locally with MongoDB (5 minutes)
- [ ] Push code to GitHub (5 minutes)
- [ ] Deploy to Render (10 minutes)
- [ ] Test deployment (5 minutes)

---

## Step 1: Set Up MongoDB Atlas (10 minutes)

### 1.1 Create Account & Cluster

1. Go to [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Sign up (free)
3. Create a **Free M0 Cluster**:
   - Provider: AWS
   - Region: Choose closest to you
   - Cluster Name: `ocpp-cluster`

### 1.2 Create Database User

1. Go to **Database Access** → **Add New Database User**
2. Username: `ocppuser`
3. Password: Click **"Autogenerate Secure Password"** → **SAVE THIS PASSWORD!**
4. Privileges: **"Read and write to any database"**
5. Click **"Add User"**

### 1.3 Whitelist IP Addresses

1. Go to **Network Access** → **Add IP Address**
2. Click **"Allow Access from Anywhere"** (adds `0.0.0.0/0`)
3. Click **"Confirm"**

### 1.4 Get Connection String

1. Go to **Database** → Click **"Connect"** on your cluster
2. Choose **"Drivers"** → **Node.js** → **6.3 or later**
3. Copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

4. **Replace placeholders:**
   ```
   mongodb+srv://ocppuser:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/ocpp?retryWrites=true&w=majority
   ```
   - Replace `<username>` with `ocppuser`
   - Replace `<password>` with your saved password
   - Add `/ocpp` before the `?` (this is your database name)

**Save this connection string!** You'll need it in the next steps.

---

## Step 2: Test Locally with MongoDB (5 minutes)

### 2.1 Create .env File

Create a file named `.env` in your project folder:

```bash
# In c:\Users\94762\Desktop\OCPP-Server
# Create .env file with this content:
```

```env
PORT=9000
NODE_ENV=development
MONGODB_URI=mongodb+srv://ocppuser:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/ocpp?retryWrites=true&w=majority
```

**Replace `YOUR_PASSWORD` with your actual MongoDB password!**

### 2.2 Install Dependencies

```bash
npm install
```

### 2.3 Stop Current Server

If your server is running, stop it (Ctrl+C in the terminal).

### 2.4 Start Server with MongoDB

```bash
npm start
```

You should see:
```
✅ Connected to MongoDB
✅ Server Running on Port 9000
📊 Dashboard: http://localhost:9000
```

### 2.5 Test It Works

1. Open browser: `http://localhost:9000`
2. Dashboard should load
3. Check MongoDB Atlas → **Database** → **Browse Collections**
4. You should see the `ocpp` database

**✅ If you see the success messages, MongoDB is working!**

---

## Step 3: Push Code to GitHub (5 minutes)

### 3.1 Initialize Git (if not done)

```bash
cd c:\Users\94762\Desktop\OCPP-Server
git init
```

### 3.2 Stage and Commit

```bash
git add .
git commit -m "Add MongoDB integration for cloud deployment"
```

### 3.3 Create GitHub Repository

1. Go to [github.com](https://github.com)
2. Click **"+"** → **"New repository"**
3. Name: `ocpp-server`
4. **Do NOT** initialize with README
5. Click **"Create repository"**

### 3.4 Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/ocpp-server.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Step 4: Deploy to Render (10 minutes)

### 4.1 Create Render Account

1. Go to [render.com](https://render.com)
2. Click **"Get Started"**
3. **Sign up with GitHub** (easiest option)
4. Authorize Render to access your repositories

### 4.2 Create Web Service

1. Click **"New +"** → **"Web Service"**
2. Find and click **"Connect"** next to `ocpp-server`
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `ocpp-server` |
| **Region** | Choose closest to you |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

### 4.3 Add Environment Variables

Click **"Advanced"** to expand environment variables.

Add these:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Your MongoDB connection string from Step 1.4 |
| `NODE_ENV` | `production` |

**Example:**
```
MONGODB_URI = mongodb+srv://ocppuser:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/ocpp?retryWrites=true&w=majority
NODE_ENV = production
```

### 4.4 Deploy

1. Click **"Create Web Service"**
2. Render will start building and deploying
3. Wait for the build to complete (~2-3 minutes)

You'll see logs like:
```
==> Running 'npm install'
==> Build successful!
==> Starting service with 'npm start'
✅ Connected to MongoDB
✅ Server Running on Port 10000
==> Your service is live 🎉
```

### 4.5 Get Your URL

Render provides a URL like:
```
https://ocpp-server-xxxx.onrender.com
```

**Save this URL!**

---

## Step 5: Test Deployment (5 minutes)

### 5.1 Test Dashboard

Open your Render URL in a browser:
```
https://ocpp-server-xxxx.onrender.com
```

You should see your dashboard!

### 5.2 Test WebSocket

Open browser console (F12) and run:

```javascript
const ws = new WebSocket('wss://ocpp-server-xxxx.onrender.com/dashboard-ui');
ws.onopen = () => console.log('✅ Connected!');
ws.onmessage = (msg) => console.log('📩', msg.data);
```

You should see: `✅ Connected!`

### 5.3 Check Render Logs

In Render dashboard:
1. Go to your service → **Logs** tab
2. You should see:
   ```
   ✅ Connected to MongoDB
   ✅ Server Running on Port 10000
   ```

### 5.4 Verify MongoDB

1. Go to MongoDB Atlas → **Database** → **Browse Collections**
2. Your `ocpp` database should exist
3. After a charging session, you'll see data in `charging_sessions` collection

---

## 🎉 Success!

Your OCPP server is now running 24/7 in the cloud!

### Your URLs:

- **Dashboard:** `https://ocpp-server-xxxx.onrender.com`
- **WebSocket (Dashboard):** `wss://ocpp-server-xxxx.onrender.com/dashboard-ui`
- **WebSocket (Charger):** `wss://ocpp-server-xxxx.onrender.com/YOUR_CHARGER_ID`

### Configure Your Charger:

Update your EV charger's OCPP server URL to:
```
wss://ocpp-server-xxxx.onrender.com/Charger01
```

---

## 🔧 Troubleshooting

### "MongoDB connection error"

**Check:**
- Is `MONGODB_URI` correct in Render environment variables?
- Did you replace `<username>` and `<password>`?
- Did you add `/ocpp` before the `?`?
- Is Network Access set to `0.0.0.0/0` in MongoDB Atlas?

### "Service won't start"

**Check Render logs for errors:**
- Go to your service → **Logs** tab
- Look for error messages
- Common issues: Missing environment variables, syntax errors

### "Dashboard loads but no data"

**Check:**
- MongoDB Atlas → **Database Access** → User exists
- MongoDB Atlas → **Network Access** → `0.0.0.0/0` is whitelisted
- Render logs for connection errors

### "Service sleeps after 15 minutes"

This is normal for Render's free tier. The service will wake up when accessed (takes ~30 seconds).

**Solutions:**
- Upgrade to paid tier ($7/month) for no sleep
- Use uptime monitor to ping every 14 minutes
- Accept the limitation for development

---

## 📚 Next Steps

- ✅ Test charging sessions
- ✅ Configure your charger
- ✅ Monitor logs in Render
- ✅ Check data in MongoDB Atlas
- ⚙️ Consider upgrading to paid tier for production
- 🔒 Set up custom domain (optional)

---

## 📖 Detailed Guides

For more detailed information, see:

- [MONGODB_SETUP.md](MONGODB_SETUP.md) - Complete MongoDB Atlas guide
- [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) - Complete Render deployment guide
- [README.md](README.md) - Project documentation

---

**Need help?** Check the detailed guides above or review the Render/MongoDB Atlas documentation.
