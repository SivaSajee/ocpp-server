require('dotenv').config();
const { MongoClient } = require('mongodb');

let db = null;
let client = null;

// Connect to MongoDB with retry logic
async function connectDB(maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';

            client = new MongoClient(uri, {
                serverSelectionTimeoutMS: 15000, // 15s (was 5s) - Atlas shards can be slow to discover
                connectTimeoutMS: 20000,       // 20s for initial connection
                socketTimeoutMS: 60000,        // 60s for queries (Atlas free tier can be slow)
            });

            await client.connect();

            db = client.db('ocpp'); // Database name

            console.log('✅ Connected to MongoDB');
            return db;
        } catch (error) {
            if (i === maxRetries - 1) {
                // Last retry failed
                console.error('❌ MongoDB connection failed after', maxRetries, 'retries:', error.message);
                throw error;
            }

            // Calculate exponential backoff delay (1s, 2s, 4s, 8s, 16s max)
            const delay = Math.min(1000 * Math.pow(2, i), 30000);
            console.log(`⏳ MongoDB connection attempt ${i + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
            console.log(`   Error: ${error.message}`);

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Get database instance
function getDB() {
    if (!db) {
        throw new Error('Database not connected. Call connectDB() first.');
    }
    return db;
}

// Save a charging session
async function saveChargingSession(session) {
    try {
        const db = getDB();
        const collection = db.collection('charging_sessions');

        const result = await collection.insertOne({
            ...session,
            createdAt: new Date()
        });

        console.log(`💾 Session saved to MongoDB: ${session.transactionId}`);
        return result;
    } catch (error) {
        console.error('❌ Error saving session:', error.message);
        throw error;
    }
}

// Get charging sessions with optional filtering
async function getChargingSessions(filter = {}) {
    try {
        const db = getDB();
        const collection = db.collection('charging_sessions');

        const sessions = await collection
            .find(filter)
            .sort({ startTime: -1 })
            .toArray();

        return sessions;
    } catch (error) {
        console.error('❌ Error fetching sessions:', error.message);
        throw error;
    }
}

// Get sessions by period (for history API)
async function getSessionsByPeriod(period, viewType = 'month', chargerId) {
    try {
        const db = getDB();
        const collection = db.collection('charging_sessions');

        let filter = {};
        if (chargerId) {
            filter.chargerId = chargerId;
        }

        if (viewType === 'month') {
            // Filter by YYYY-MM
            filter.startTime = {
                $regex: `^${period}`
            };
        } else {
            // Filter by YYYY (year)
            filter.startTime = {
                $regex: `^${period}`
            };
        }

        const sessions = await collection
            .find(filter)
            .sort({ startTime: 1 })
            .toArray();

        return sessions;
    } catch (error) {
        console.error('❌ Error fetching sessions by period:', error.message);
        throw error;
    }
}

// Close database connection
async function closeDB() {
    if (client) {
        await client.close();
        console.log('🔌 MongoDB connection closed');
    }
}

// Save charger settings (RFID whitelist etc.) to MongoDB
async function saveChargerSettings(chargerId, settings) {
    try {
        const db = getDB();
        const collection = db.collection('charger_settings');

        await collection.updateOne(
            { chargerId },
            { $set: { chargerId, settings, updatedAt: new Date() } },
            { upsert: true }
        );
        console.log(`💾 [${chargerId}] Settings saved to MongoDB (RFID whitelist: ${settings.rfidWhitelist?.length || 0} tags)`);
    } catch (error) {
        console.error(`❌ Error saving charger settings for ${chargerId}:`, error.message);
    }
}

// Load charger settings from MongoDB (called on charger connect)
async function loadChargerSettings(chargerId) {
    try {
        const db = getDB();
        const collection = db.collection('charger_settings');
        const doc = await collection.findOne({ chargerId });
        return doc ? doc.settings : null;
    } catch (error) {
        console.error(`❌ Error loading charger settings for ${chargerId}:`, error.message);
        return null;
    }
}

module.exports = {
    connectDB,
    getDB,
    saveChargingSession,
    getChargingSessions,
    getSessionsByPeriod,
    saveChargerSettings,
    loadChargerSettings,
    closeDB
};
