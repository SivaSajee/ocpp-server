# MongoDB Connection Setup for Your Cluster

## Your MongoDB Atlas Details

- **Cluster Name:** cluster0
- **Username:** admin
- **Password:** TaskFlow2026
- **Database Name:** ocpp

## Step 1: Get Your Full Connection String

You need to get the complete connection string from MongoDB Atlas because it includes your cluster's specific hostname.

### Option A: Get from MongoDB Atlas (Recommended)

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Log in to your account
3. Click **"Database"** in the left sidebar
4. Find your **cluster0** cluster
5. Click the **"Connect"** button
6. Choose **"Drivers"**
7. Select **Node.js** and version **6.3 or later**
8. Copy the connection string

It will look like:
```
mongodb+srv://admin:<password>@cluster0.XXXXX.mongodb.net/?retryWrites=true&w=majority
```

The `XXXXX` part is your cluster's unique identifier (like `ab1cd`, `xyz12`, etc.)

### Option B: If You Know Your Cluster Hostname

If you know the full hostname, your connection string is:
```
mongodb+srv://admin:TaskFlow2026@cluster0.XXXXX.mongodb.net/ocpp?retryWrites=true&w=majority
```

Replace `XXXXX` with your cluster's hostname suffix.

## Step 2: Create .env File

Since `.env` is protected by gitignore (which is good for security), you need to create it manually.

### Windows (PowerShell):

```powershell
cd c:\Users\94762\Desktop\OCPP-Server

# Create .env file
@"
PORT=9000
NODE_ENV=development
MONGODB_URI=mongodb+srv://admin:TaskFlow2026@cluster0.XXXXX.mongodb.net/ocpp?retryWrites=true&w=majority
"@ | Out-File -FilePath .env -Encoding utf8
```

**Replace `XXXXX` with your actual cluster hostname!**

### Or Create Manually:

1. Open Notepad or VS Code
2. Create a new file
3. Add this content:
   ```
   PORT=9000
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://admin:TaskFlow2026@cluster0.XXXXX.mongodb.net/ocpp?retryWrites=true&w=majority
   ```
4. Replace `XXXXX` with your cluster hostname
5. Save as `.env` in `c:\Users\94762\Desktop\OCPP-Server\`
6. Make sure it's named `.env` (not `.env.txt`)

## Step 3: Verify Network Access

Make sure your MongoDB Atlas cluster allows connections:

1. Go to MongoDB Atlas → **Network Access**
2. Check if `0.0.0.0/0` is in the IP Access List
3. If not, click **"Add IP Address"** → **"Allow Access from Anywhere"**

## Step 4: Test Connection

Once you have the `.env` file created:

1. **Stop your current server** (Ctrl+C in the terminal running `node server.js`)

2. **Start server with MongoDB:**
   ```bash
   npm start
   ```

3. **Look for these messages:**
   ```
   ✅ Connected to MongoDB
   ✅ Server Running on Port 9000
   📊 Dashboard: http://localhost:9000
   ```

4. **If you see an error**, it will tell you what's wrong:
   - Authentication failed → Check username/password
   - Network timeout → Check Network Access in Atlas
   - Invalid connection string → Check the hostname

## Common Connection String Formats

Your cluster hostname might look like one of these:

```
cluster0.ab1cd.mongodb.net
cluster0.xyz12.mongodb.net
cluster0.mongodb.net
```

**Full connection string examples:**
```
mongodb+srv://admin:TaskFlow2026@cluster0.ab1cd.mongodb.net/ocpp?retryWrites=true&w=majority
mongodb+srv://admin:TaskFlow2026@cluster0.xyz12.mongodb.net/ocpp?retryWrites=true&w=majority
```

## Need Help Finding Your Hostname?

If you're not sure of your cluster's hostname, I can help you test different formats, or you can:

1. Check your MongoDB Atlas dashboard
2. Look at any previous connection strings you've used
3. Click "Connect" on your cluster to get the exact string

## Next Steps After Connection Works

Once you see "✅ Connected to MongoDB":

1. ✅ Test the dashboard: `http://localhost:9000`
2. ✅ Verify MongoDB Atlas shows the `ocpp` database
3. ✅ Ready to deploy to Render!

---

**Let me know:**
1. Do you know your cluster's full hostname (the XXXXX part)?
2. Or would you like me to help you get it from MongoDB Atlas?
