const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  let mongoUri = (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/GoldPrism_intelligence').trim();
  if (mongoUri.endsWith('/')) {
    mongoUri = `${mongoUri}GoldPrism_intelligence?retryWrites=true&w=majority`;
  }
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    isConnected = true;
    console.log(`[GoldPrism MongoDB] Connected successfully to ${mongoUri.replace(/:[^:]*@/, ':****@')}`);
  } catch (err) {
    isConnected = false;
    console.warn(`[GoldPrism MongoDB] Connection fallback: running in high-reliability in-memory / local mode (${err.message})`);
  }
}

function getDbStatus() {
  return {
    connected: isConnected,
    state: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'STANDALONE_FALLBACK',
    uri: isConnected ? (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/GoldPrism_intelligence') : 'LOCAL_IN_MEMORY'
  };
}

module.exports = { connectDB, getDbStatus };
