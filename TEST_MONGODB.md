# Testing MongoDB Connection

Your `.env` file has been created with:

```
PORT=9000
NODE_ENV=development
MONGODB_URI=mongodb+srv://admin:TaskFlow2026@cluster0.wtt8v10.mongodb.net/ocpp?retryWrites=true&w=majority&appName=Cluster0
```

## Next Steps:

### 1. Stop Current Server

You have a server running with the old JSON file storage. Stop it:

- Go to the terminal running `node server.js`
- Press **Ctrl+C** to stop it

### 2. Start Server with MongoDB

In the same terminal, run:

```bash
npm start
```

### 3. Look for Success Messages

You should see:

```
✅ Connected to MongoDB
✅ Server Running on Port 9000
📊 Dashboard: http://localhost:9000
```

### 4. If You See Errors

**"MongoServerError: Authentication failed"**
- Check if username/password are correct in MongoDB Atlas
- Verify the user "admin" exists in Database Access

**"MongooseServerSelectionError: connect ETIMEDOUT"**
- Go to MongoDB Atlas → Network Access
- Make sure `0.0.0.0/0` is in the IP Access List
- Click "Add IP Address" → "Allow Access from Anywhere" if not present

**"Database not connected"**
- Check the MONGODB_URI in .env file
- Make sure there are no extra spaces or line breaks

### 5. Verify MongoDB Connection

Once connected successfully:

1. **Open dashboard:** http://localhost:9000
2. **Check MongoDB Atlas:**
   - Go to MongoDB Atlas → Database → Browse Collections
   - You should see the `ocpp` database appear
   - After a charging session, you'll see `charging_sessions` collection

### 6. Test a Charging Session

1. Open the dashboard
2. Wait for a charger to connect (or simulate one)
3. Start and stop a charging session
4. Check MongoDB Atlas → Browse Collections → `ocpp` → `charging_sessions`
5. You should see the session data saved!

## After Successful Testing

Once MongoDB is working locally, you're ready to deploy to Render!

Follow the [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) guide to:
1. Push code to GitHub
2. Create Render Web Service
3. Add MONGODB_URI environment variable in Render
4. Deploy!

---

**Ready to test?** Stop your current server and run `npm start`!
