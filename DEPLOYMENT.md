# OCPP Server - Cloud Deployment Guide

This guide will help you deploy your OCPP server to the cloud so it runs 24/7 without depending on your laptop.

## 📋 Prerequisites

- Git installed on your computer
- GitHub account (for most platforms)
- Your OCPP server code

## 🚀 Deployment Options

### Option 1: Render.com (Recommended for Beginners)

**Pros:** Free tier, automatic deployments, easy setup, HTTPS included
**Cons:** May sleep after inactivity on free tier

#### Steps:

1. **Prepare Your Code**
   ```bash
   cd c:\Users\94762\Desktop\OCPP-Server
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub**
   - Create a new repository on GitHub
   - Follow GitHub's instructions to push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/ocpp-server.git
   git branch -M main
   git push -u origin main
   ```

3. **Deploy on Render**
   - Go to [render.com](https://render.com) and sign up
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** ocpp-server
     - **Environment:** Node
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Plan:** Free
   - Click "Create Web Service"

4. **Get Your Server URL**
   - Render will provide a URL like: `https://ocpp-server-xxxx.onrender.com`
   - Your dashboard will be at: `https://ocpp-server-xxxx.onrender.com/`
   - WebSocket endpoint: `wss://ocpp-server-xxxx.onrender.com/`

5. **Configure Your Charger**
   - Update your charger's OCPP server URL to: `wss://ocpp-server-xxxx.onrender.com/YOUR_CHARGER_ID`

---

### Option 2: Railway.app

**Pros:** Free tier, excellent developer experience, automatic HTTPS
**Cons:** Free tier has usage limits

#### Steps:

1. **Prepare Your Code** (same as Render)
   ```bash
   cd c:\Users\94762\Desktop\OCPP-Server
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub** (same as Render)

3. **Deploy on Railway**
   - Go to [railway.app](https://railway.app) and sign up
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway will auto-detect Node.js and deploy
   - Click "Generate Domain" to get a public URL

4. **Environment Variables** (Optional)
   - Go to your project → Variables
   - Add: `PORT` (Railway sets this automatically, but you can override)

5. **Get Your Server URL**
   - Railway provides: `https://your-app.up.railway.app`

---

### Option 3: Heroku

**Pros:** Popular, well-documented, reliable
**Cons:** Free tier discontinued (requires paid plan)

#### Steps:

1. **Install Heroku CLI**
   - Download from [heroku.com/cli](https://devcenter.heroku.com/articles/heroku-cli)

2. **Login and Create App**
   ```bash
   heroku login
   cd c:\Users\94762\Desktop\OCPP-Server
   git init
   heroku create ocpp-server-yourname
   ```

3. **Deploy**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```

4. **Open Your App**
   ```bash
   heroku open
   ```

---

### Option 4: AWS EC2 / DigitalOcean (Advanced)

**Pros:** Full control, no sleep/timeout issues, scalable
**Cons:** Requires more setup, paid (typically $5-10/month)

#### Quick Setup (DigitalOcean):

1. **Create Droplet**
   - Go to [digitalocean.com](https://www.digitalocean.com)
   - Create a Droplet (Ubuntu 22.04, $6/month plan)
   - Note the IP address

2. **SSH into Server**
   ```bash
   ssh root@YOUR_SERVER_IP
   ```

3. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

4. **Upload Your Code**
   ```bash
   # On your local machine
   scp -r c:\Users\94762\Desktop\OCPP-Server root@YOUR_SERVER_IP:/root/
   ```

5. **Run Server with PM2**
   ```bash
   # On the server
   cd /root/OCPP-Server
   npm install
   pm2 start server.js --name ocpp-server
   pm2 startup
   pm2 save
   ```

6. **Configure Firewall**
   ```bash
   sudo ufw allow 9000
   sudo ufw allow 22
   sudo ufw enable
   ```

7. **Access Your Server**
   - Dashboard: `http://YOUR_SERVER_IP:9000`
   - WebSocket: `ws://YOUR_SERVER_IP:9000/YOUR_CHARGER_ID`

8. **Optional: Add HTTPS with Nginx + Let's Encrypt**
   - Install Nginx: `sudo apt install nginx`
   - Install Certbot: `sudo apt install certbot python3-certbot-nginx`
   - Configure domain and SSL (detailed guide available)

---

## 🔧 Post-Deployment Configuration

### Update Dashboard WebSocket URL

If your dashboard has a hardcoded WebSocket URL, update it to use the cloud URL:

```javascript
// In dashboard.html, find the WebSocket connection and update:
const ws = new WebSocket('wss://your-cloud-url.com/dashboard-ui');
```

### Update Charger Configuration

Configure your EV charger to connect to:
```
wss://your-cloud-url.com/YOUR_CHARGER_ID
```

Or for HTTP:
```
ws://your-server-ip:9000/YOUR_CHARGER_ID
```

---

## 📊 Monitoring & Logs

### Render.com
- Go to your service → "Logs" tab
- View real-time logs

### Railway.app
- Click on your deployment → "Deployments" → "View Logs"

### Heroku
```bash
heroku logs --tail
```

### PM2 (VPS)
```bash
pm2 logs ocpp-server
pm2 monit
```

---

## ⚠️ Important Considerations

### File Storage Limitation

Your current server uses `charging_history.json` for data storage. **On most cloud platforms, the filesystem is ephemeral** (resets on restart).

**Solutions:**
1. **Short-term:** Accept that history may be lost on restarts
2. **Recommended:** Migrate to a database:
   - **MongoDB Atlas** (Free tier available)
   - **PostgreSQL** (Render, Railway, Heroku offer free tiers)
   - **Supabase** (Free tier, PostgreSQL-based)

### WebSocket Connections

- Most cloud platforms support WebSockets
- Ensure your charger supports WSS (WebSocket Secure) for HTTPS deployments
- Some chargers may need certificate configuration

### Free Tier Limitations

- **Render:** Services sleep after 15 minutes of inactivity
- **Railway:** 500 hours/month free, then usage-based pricing
- **Heroku:** No free tier (requires paid plan)

---

## 🧪 Testing Your Deployment

1. **Test Dashboard**
   - Open `https://your-cloud-url.com` in browser
   - Verify dashboard loads correctly

2. **Test WebSocket (Browser Console)**
   ```javascript
   const ws = new WebSocket('wss://your-cloud-url.com/dashboard-ui');
   ws.onopen = () => console.log('Connected!');
   ws.onmessage = (msg) => console.log('Received:', msg.data);
   ```

3. **Test Charger Connection**
   - Configure your charger with the new URL
   - Check server logs for connection messages

---

## 🆘 Troubleshooting

### Server Not Starting
- Check logs for errors
- Verify `package.json` has correct start script
- Ensure `ws` dependency is installed

### WebSocket Connection Failed
- Verify URL uses `wss://` (not `ws://`) for HTTPS deployments
- Check firewall/security group settings (VPS)
- Ensure PORT environment variable is set correctly

### Charger Can't Connect
- Verify charger supports WSS protocol
- Check charger's OCPP server URL configuration
- Review server logs for connection attempts

### Data Loss
- Migrate to a database for persistent storage
- Use cloud platform's persistent storage options

---

## 📚 Next Steps

1. **Choose a platform** from the options above
2. **Deploy your server** following the steps
3. **Test the deployment** with your dashboard
4. **Configure your charger** with the new URL
5. **Consider migrating to a database** for persistent storage

Need help? Check the platform-specific documentation or reach out for support!
