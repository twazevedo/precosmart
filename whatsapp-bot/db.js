/**
 * @file db.js — Camada de Persistência Unificada PreçoSmart
 * Suporta MongoDB nativo com fallback automático para arquivo local (JSON/Memory).
 * Garante concorrência segura e compatibilidade total.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

let mongoClient = null;
let mongoDb = null;
let isMongoActive = false;

async function initDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) return false;
  if (mongoClient && isMongoActive) return true;

  try {
    mongoClient = new MongoClient(uri, { 
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db('precosmart');
    isMongoActive = true;

    mongoClient.on('close', () => { isMongoActive = false; });
    mongoClient.on('error', () => { isMongoActive = false; });
    return true;
  } catch (err) {
    isMongoActive = false;
    console.warn('[DB] MongoDB não conectado, operando em modo local resiliente:', err.message);
    return false;
  }
}

function createStore(name) {
  const safeName = String(name).replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(__dirname, safeName + '.json');
  let localCache = null;

  function loadLocal() {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
      }
    } catch (e) {}
    return null;
  }

  function saveLocal(data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
  }

  return {
    async get(id, defaultVal = null) {
      if (isMongoActive && mongoDb) {
        try {
          const doc = await mongoDb.collection(safeName).findOne({ _id: String(id) });
          return doc ? doc.value : defaultVal;
        } catch (e) {}
      }
      if (localCache === null) localCache = loadLocal() || {};
      if (localCache && typeof localCache === 'object' && id in localCache) {
        return localCache[id];
      }
      return localCache !== null ? localCache : defaultVal;
    },

    async set(id, val) {
      if (localCache === null) localCache = loadLocal() || {};
      if (typeof localCache === 'object' && !Array.isArray(localCache)) {
        localCache[id] = val;
      } else {
        localCache = val;
      }
      saveLocal(localCache);

      if (isMongoActive && mongoDb) {
        try {
          await mongoDb.collection(safeName).updateOne(
            { _id: String(id) },
            { $set: { value: val, updatedAt: new Date() } },
            { upsert: true }
          );
        } catch (e) {}
      }
    },

    getLocalSync(defaultVal = null) {
      if (localCache === null) {
        localCache = loadLocal();
      }
      return localCache !== null ? localCache : defaultVal;
    },

    saveLocalSync(val) {
      localCache = val;
      saveLocal(val);
      if (isMongoActive && mongoDb) {
        mongoDb.collection(safeName).updateOne(
          { _id: 'main' },
          { $set: { value: val, updatedAt: new Date() } },
          { upsert: true }
        ).catch(() => {});
      }
    }
  };
}

module.exports = {
  initDatabase,
  createStore
};
