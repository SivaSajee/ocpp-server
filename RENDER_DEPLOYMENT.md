# Render.com Deployment Guide

Complete guide to deploying your OCPP server to Render.com with MongoDB Atlas.

## Prerequisites

- ✅ MongoDB Atlas cluster set up (see [MONGODB_SETUP.md](MONGODB_SETUP.md))
- ✅ MongoDB connection string saved
- ✅ GitHub account
- ✅ Git installed on your computer

## Step 1: Prepare Your Code

### 1.1 Initialize Git Repository

```bash
cd c:\Users\94762\Desktop\OCPP-Server
git init
```

### 1.2 Stage All Files

```bash
git add .
```

### 1.3 Commit Your Code

```bash
git commit -m "Initial commit - OCPP server with MongoDB"
```

## Step 2: Push to GitHub

### 2.1 Create GitHub Repository

1. Go to [github.com](https://github.com)
2. Click **"+"** (top right) → **"New repository"**
3. Repository name: `ocpp-server`
4. Description: "OCPP 1.6 WebSocket Server with MongoDB"
5. Choose **Public** or **Private**
6. **Do NOT** initialize with README (you already have code)
7. Click **"Create repository"**

### 2.2 Push Your Code

GitHub will show you commands. Use these:

```bash
git remote add origin https://github.com/YOUR_USERNAME/ocpp-server.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

**Enter your GitHub credentials when prompted.**

## Step 3: Create Render Account

1. Go to [render.com](https://render.com)
2. Click **"Get Started"** or **"Sign Up"**
3. Sign up with:
   - GitHub account (recommended - easiest integration)
   - GitLab account
   - Email

4. **Authorize Render** to access your GitHub repositories

## Step 4: Create New Web Service

### 4.1 Start New Service

1. In Render dashboard, click **"New +"** (top right)
2. Select **"Web Service"**

### 4.2 Connect Repository

1. You'll see a list of your GitHub repositories
2. Find **"ocpp-server"** and click **"Connect"**

   > If you don't see it, click **"Configure account"** to grant access to more repositories

### 4.3 Configure Service

Fill in the following settings:

#### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `ocpp-server` (or your preferred name) |
| **Region** | Choose closest to you (e.g., Singapore for Asia) |
| **Branch** | `main` |
| **Root Directory** | Leave blank |
| **Runtime** | `Node` |

#### Build & Deploy Settings

| Field | Value |
|-------|-------|
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

#### Instance Type

| Field | Value |
|-------|-------|
| **Instance Type** | `Free` |

> ⚠️ **Free tier limitations:**
> - Services spin down after 15 minutes of inactivity
> - Takes ~30 seconds to wake up on first request
> - 750 hours/month free
> - Perfect for development/testing

### 4.4 Add Environment Variables

**This is critical!** Click **"Advanced"** to expand environment variables section.

Add the following:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Your MongoDB connection string from Atlas |
| `NODE_ENV` | `production` |

**Example:**
```
MONGODB_URI = mongodb+srv://ocppuser:Abc123xyz@cluster0.ab1cd.mongodb.net/ocpp?retryWrites=true&w=majority
NODE_ENV = production
```

> 💡 **Note:** Render automatically sets `PORT` environment variable, so you don't need to add it.

### 4.5 Create Web Service

1. Review all settings
2. Click **"Create Web Service"**
3. Render will start deploying your app!

## Step 5: Monitor Deployment

### 5.1 Watch Build Logs

Render will show real-time logs:

```
==> Cloning from https://github.com/YOUR_USERNAME/ocpp-server...
==> Running 'npm install'
==> Build successful!
==> Starting service with 'npm start'
✅ Connected to MongoDB
✅ Server Running on Port 10000
==> Your service is live 🎉
```

### 5.2 Get Your Service URL

Once deployed, Render provides a URL:
```
https://ocpp-server-xxxx.onrender.com
```

**Save this URL!** This is your server's public address.

## Step 6: Test Your Deployment

### 6.1 Test Dashboard

1. Open your Render URL in a browser:
   ```
   https://ocpp-server-xxxx.onrender.com
   ```

2. You should see your dashboard load

### 6.2 Test WebSocket Connection

Open browser console (F12) and run:

```javascript
const ws = new WebSocket('wss://ocpp-server-xxxx.onrender.com/dashboard-ui');
ws.onopen = () => console.log('✅ Connected to server!');
ws.onmessage = (msg) => console.log('📩 Received:', msg.data);
ws.onerror = (err) => console.error('❌ Error:', err);
```

You should see: `✅ Connected to server!`

### 6.3 Check Server Logs

In Render dashboard:
1. Go to your service
2. Click **"Logs"** tab
3. You should see:
   ```
   ✅ Connected to MongoDB
   ✅ Server Running on Port 10000
   ```

### 6.4 Verify MongoDB Connection

1. Go to MongoDB Atlas
2. Navigate to **Database** → **Browse Collections**
3. Your `ocpp` database should exist
4. Collections will appear after first charging session

## Step 7: Configure Your Charger

Update your EV charger's OCPP server URL to:

```
wss://ocpp-server-xxxx.onrender.com/YOUR_CHARGER_ID
```

**Replace:**
- `ocpp-server-xxxx.onrender.com` with your actual Render URL
- `YOUR_CHARGER_ID` with your charger's identifier

**Example:**
```
wss://ocpp-server-abc123.onrender.com/Charger01
```

## Step 8: Test End-to-End

1. **Connect charger** to your Render server
2. **Check Render logs** for charger connection:
   ```
   🔌 CHARGER CONNECTED: Charger01
   ```

3. **Open dashboard** in browser
4. **Start a charging session** (via dashboard or charger)
5. **Stop the session**
6. **Check MongoDB Atlas** - session should be saved in `charging_sessions` collection

## Automatic Deployments

Render automatically deploys when you push to GitHub:

```bash
# Make changes to your code
git add .
git commit -m "Updated feature"
git push origin main
```

Render will:
1. Detect the push
2. Rebuild your service
3. Deploy automatically
4. Show logs in real-time

## Managing Your Service

### View Logs

```
Render Dashboard → Your Service → Logs tab
```

Real-time logs show:
- Server startup
- Charger connections
- Errors and warnings
- WebSocket activity

### Restart Service

```
Render Dashboard → Your Service → Manual Deploy → "Clear build cache & deploy"
```

### Update Environment Variables

```
Render Dashboard → Your Service → Environment → Add/Edit variables → Save Changes
```

Service will automatically redeploy.

### Monitor Performance

```
Render Dashboard → Your Service → Metrics tab
```

Shows:
- CPU usage
- Memory usage
- Request count
- Response times

## Troubleshooting

### Service Won't Start

**Check build logs for errors:**
- Missing dependencies? Run `npm install` locally first
- Syntax errors? Test locally with `npm start`
- MongoDB connection failed? Verify `MONGODB_URI` in environment variables

### MongoDB Connection Error

**Error:** `MongoServerError: Authentication failed`

**Solution:**
1. Verify username/password in connection string
2. Check MongoDB Atlas → Database Access → User exists
3. URL-encode special characters in password

**Error:** `MongooseServerSelectionError: connect ETIMEDOUT`

**Solution:**
1. Check MongoDB Atlas → Network Access
2. Ensure `0.0.0.0/0` is whitelisted
3. Wait a few minutes for changes to propagate

### Dashboard Loads but WebSocket Fails

**Check:**
1. Browser console for errors
2. Ensure dashboard connects to `wss://` (not `ws://`)
3. Verify Render URL is correct

### Service Sleeps on Free Tier

**Behavior:**
- Free tier services spin down after 15 minutes of inactivity
- First request after sleep takes ~30 seconds

**Solutions:**
1. **Upgrade to paid tier** ($7/month) - no sleep
2. **Use uptime monitor** (e.g., UptimeRobot) to ping every 14 minutes
3. **Accept the limitation** for development

## Custom Domain (Optional)

### Add Your Own Domain

1. Go to **Settings** → **Custom Domain**
2. Click **"Add Custom Domain"**
3. Enter your domain: `ocpp.yourdomain.com`
4. Add DNS records (Render provides instructions):
   ```
   Type: CNAME
   Name: ocpp
   Value: ocpp-server-xxxx.onrender.com
   ```

5. Wait for DNS propagation (5-30 minutes)
6. Render automatically provisions SSL certificate

## Upgrading to Paid Tier

**Benefits of paid tier ($7/month):**
- ✅ No sleep/spin down
- ✅ More CPU and RAM
- ✅ Faster builds
- ✅ Priority support

**To upgrade:**
1. Go to your service → **Settings**
2. Under **Instance Type**, select **Starter** or higher
3. Add payment method
4. Confirm upgrade

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MONGODB_URI` | ✅ Yes | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/ocpp` |
| `NODE_ENV` | ⚠️ Recommended | Environment mode | `production` |
| `PORT` | ❌ No | Server port (auto-set by Render) | `10000` |

## Security Best Practices

1. **Never commit `.env` file** - It's in `.gitignore`
2. **Use Render's environment variables** - Encrypted and secure
3. **Rotate MongoDB credentials** - Change password periodically
4. **Enable HTTPS only** - Render provides this automatically
5. **Monitor logs** - Watch for suspicious activity

## Cost Estimate

### Free Tier
- **Cost:** $0/month
- **Limitations:** 750 hours, sleeps after 15 min inactivity
- **Best for:** Development, testing, personal projects

### Starter Tier
- **Cost:** $7/month
- **Benefits:** No sleep, better performance
- **Best for:** Production, small business

### MongoDB Atlas
- **Free tier:** $0/month (512 MB)
- **Paid tiers:** Starting at $9/month (2 GB)

**Total for production:** ~$7-16/month

## Next Steps

After successful deployment:

1. ✅ Test all features thoroughly
2. ✅ Configure your charger with Render URL
3. ✅ Monitor logs for any issues
4. ✅ Set up uptime monitoring (optional)
5. ✅ Consider custom domain (optional)
6. ✅ Plan for scaling if needed

## Support Resources

- [Render Documentation](https://render.com/docs)
- [Render Community Forum](https://community.render.com)
- [MongoDB Atlas Support](https://docs.atlas.mongodb.com)

---

**Congratulations! Your OCPP server is now running 24/7 in the cloud!** 🚀
