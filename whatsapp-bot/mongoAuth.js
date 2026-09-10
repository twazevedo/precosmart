const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { encryptSecret, decryptSecret } = require('./security');

async function useMongoDBAuthState(collection) {
    const writeData = async (data, id) => {
        try {
            const raw = JSON.stringify(data, BufferJSON.replacer);
            const encrypted = encryptSecret(raw);
            await collection.updateOne({ _id: id }, { $set: { encryptedPayload: encrypted, updatedAt: new Date() } }, { upsert: true });
        } catch (error) {
            const informationToStore = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
            await collection.updateOne({ _id: id }, { $set: { ...informationToStore } }, { upsert: true });
        }
    };

    const readData = async (id) => {
        try {
            const data = await collection.findOne({ _id: id });
            if (!data) return null;
            if (data.encryptedPayload) {
                const decrypted = decryptSecret(data.encryptedPayload);
                if (decrypted) {
                    return JSON.parse(decrypted, BufferJSON.reviver);
                }
            }
            return JSON.parse(JSON.stringify(data), BufferJSON.reviver);
        } catch (error) {
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await collection.deleteOne({ _id: id });
        } catch (error) {}
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
}

module.exports = { useMongoDBAuthState };
