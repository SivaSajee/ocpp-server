# MongoDB Atlas Setup Guide

This guide will walk you through setting up a **free** MongoDB Atlas cluster for your OCPP server.

## Step 1: Create MongoDB Atlas Account

1. Go to [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Sign up with:
   - Email address
   - Google account
   - GitHub account

3. Complete the registration form

## Step 2: Create a Free Cluster

1. After logging in, you'll see "Create a deployment"
2. Choose **M0 (Free)** tier
   - 512 MB storage
   - Shared RAM
   - Perfect for development and small projects

3. **Select Cloud Provider & Region:**
   - Provider: AWS, Google Cloud, or Azure (any works)
   - Region: Choose closest to your location or users
   - Recommended: AWS - Mumbai (ap-south-1) for India

4. **Cluster Name:**
   - Name it: `ocpp-cluster` (or any name you prefer)

5. Click **"Create Deployment"**

6. **Save your credentials!** MongoDB will show you:
   - Username (e.g., `ocppuser`)
   - Password (e.g., `Abc123xyz`)
   
   > ⚠️ **IMPORTANT:** Save these credentials! You'll need them for the connection string.

## Step 3: Configure Database Access

1. In the Atlas dashboard, go to **"Database Access"** (left sidebar)
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication
4. Set username: `ocppuser` (or your preferred name)
5. Click **"Autogenerate Secure Password"** or create your own
6. **Save the password somewhere safe!**
7. Set **Database User Privileges** to:
   - **"Read and write to any database"** (for simplicity)
   - Or create custom role for specific database

8. Click **"Add User"**

## Step 4: Configure Network Access

1. Go to **"Network Access"** (left sidebar)
2. Click **"Add IP Address"**
3. For development, choose **"Allow Access from Anywhere"**
   - This adds `0.0.0.0/0` to the whitelist
   - ⚠️ This is fine for development, but for production, restrict to specific IPs

4. Click **"Confirm"**

> 💡 **Note:** Render.com uses dynamic IPs, so "Allow Access from Anywhere" is necessary for cloud deployment.

## Step 5: Get Connection String

1. Go to **"Database"** (left sidebar)
2. Click **"Connect"** button on your cluster
3. Choose **"Drivers"**
4. Select:
   - Driver: **Node.js**
   - Version: **6.3 or later**

5. Copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

6. **Replace placeholders:**
   - `<username>` → your database username (e.g., `ocppuser`)
   - `<password>` → your database password
   - Add database name: `mongodb+srv://ocppuser:yourpassword@cluster0.xxxxx.mongodb.net/ocpp?retryWrites=true&w=majority`

   Example:
   ```
   mongodb+srv://ocppuser:Abc123xyz@cluster0.ab1cd.mongodb.net/ocpp?retryWrites=true&w=majority
   ```

## Step 6: Test Connection Locally

1. Create a `.env` file in your project:
   ```bash
   # In c:\Users\94762\Desktop\OCPP-Server
   # Create .env file
   ```

2. Add your MongoDB connection string:
   ```env
   PORT=9000
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://ocppuser:Abc123xyz@cluster0.ab1cd.mongodb.net/ocpp?retryWrites=true&w=majority
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start your server:
   ```bash
   npm start
   ```

5. Check the console for:
   ```
   ✅ Connected to MongoDB
   ✅ Server Running on Port 9000
   ```

## Step 7: View Your Data

1. In MongoDB Atlas, go to **"Database"** → **"Browse Collections"**
2. Select your database: `ocpp`
3. You'll see collections:
   - `charging_sessions` - Stores all charging session data

4. Click on a collection to view documents

## Troubleshooting

### Connection Error: "Authentication failed"
- Double-check username and password in connection string
- Ensure password doesn't contain special characters (or URL-encode them)
- Verify database user exists in "Database Access"

### Connection Error: "Network timeout"
- Check "Network Access" whitelist
- Ensure `0.0.0.0/0` is added for "Allow Access from Anywhere"
- Check your internet connection

### Connection Error: "Database name not specified"
- Ensure connection string includes `/ocpp` before the `?`
- Format: `...mongodb.net/ocpp?retryWrites=true...`

### Special Characters in Password
If your password contains special characters, URL-encode them:
- `@` → `%40`
- `:` → `%3A`
- `/` → `%2F`
- `?` → `%3F`

Example: Password `P@ss:word` becomes `P%40ss%3Aword`

## MongoDB Atlas Dashboard Overview

### Key Sections:
- **Database** - View clusters, connect, browse data
- **Database Access** - Manage users and permissions
- **Network Access** - Configure IP whitelist
- **Metrics** - Monitor database performance
- **Alerts** - Set up notifications

## Free Tier Limits

MongoDB Atlas M0 (Free) includes:
- ✅ 512 MB storage
- ✅ Shared RAM
- ✅ Unlimited connections
- ✅ Basic monitoring
- ❌ No backups (upgrade to M2+ for backups)
- ❌ Shared cluster (may have occasional slowness)

**This is perfect for development and small projects!**

## Next Steps

After setting up MongoDB Atlas:

1. ✅ Save your connection string
2. ✅ Add it to `.env` file
3. ✅ Update your code to use MongoDB (see implementation)
4. ✅ Test locally
5. ✅ Deploy to Render with MongoDB connection string

## Security Best Practices

For production deployments:

1. **Restrict IP Access**
   - Instead of `0.0.0.0/0`, add specific IPs
   - For Render, you may need to keep it open due to dynamic IPs

2. **Use Environment Variables**
   - Never commit `.env` file to Git
   - Use Render's environment variable settings

3. **Rotate Credentials**
   - Change database password periodically
   - Update in both Atlas and Render

4. **Enable Monitoring**
   - Set up alerts for unusual activity
   - Monitor connection counts

## Support Resources

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [MongoDB Node.js Driver Docs](https://mongodb.github.io/node-mongodb-native/)
- [Connection String Format](https://docs.mongodb.com/manual/reference/connection-string/)

---

**You're all set!** Once you have your connection string, proceed to update your code for MongoDB integration.
