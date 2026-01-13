# Deploy to Vercel

## Quick Deployment Steps

### Step 1: Go to Vercel Dashboard

1. Go to **[vercel.com](https://vercel.com)**
2. Sign in to your account
3. Click **"Add New..."** → **"Project"**

### Step 2: Import from GitHub

1. **Import Git Repository:**
   - You'll see a list of your GitHub repositories
   - Find **"SivaSajee/ocpp-server"**
   - Click **"Import"**

2. **Configure Project:**
   - **Project Name:** `ocpp-server` (or leave default)
   - **Framework Preset:** Leave as "Other" or "Node.js"
   - **Root Directory:** Leave as `./`

### Step 3: Add Environment Variables

Before deploying, add your environment variables:

1. **Expand "Environment Variables" section**

2. **Add these variables:**

   **Variable 1:**
   - Name: `MONGODB_URI`
   - Value: `mongodb+srv://admin:TaskFlow2026@cluster0.wtt8v10.mongodb.net/ocpp?retryWrites=true&w=majority&appName=Cluster0`

   **Variable 2:**
   - Name: `NODE_ENV`
   - Value: `production`

3. Click **"Add"** for each variable

### Step 4: Configure Build Settings

Vercel might need custom build settings:

1. **Build Command:** Leave empty or use `npm install`
2. **Output Directory:** Leave empty
3. **Install Command:** `npm install`

### Step 5: Add vercel.json Configuration

We need to create a `vercel.json` file to tell Vercel how to run your Node.js server.

**I'll create this file for you and push it to GitHub.**

### Step 6: Deploy

1. Click **"Deploy"**
2. Wait 1-2 minutes for deployment
3. Vercel will show you the URL!

---

## Your Vercel URL

After deployment, you'll get a URL like:
```
https://ocpp-server.vercel.app
```

Or:
```
https://ocpp-server-sivasajee.vercel.app
```

---

## Test Your Deployment

1. **Open dashboard:**
   ```
   https://your-app.vercel.app
   ```

2. **Configure charger:**
   ```
   wss://your-app.vercel.app/CP001
   ```

---

## Important Note

Vercel is optimized for serverless functions, but it can run Node.js servers. If you encounter any issues, we can adjust the configuration.

Let me create the vercel.json file now!
