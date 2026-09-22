const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { encryptSecret, decryptSecret } = require('./security');

async function useMongoDBAuthState(collection) {
    const writeData = async (data, id) => {
        try {
            const raw = JSON.stringify(data, BufferJSON.replacer);
            const encrypted = encryptSecret(raw);
            if (!encrypted) {
                throw new Error('Falha na encriptação de segredo Baileys. Gravação cancelada para proteção.');
            }
            await collection.updateOne({ _id: id }, { $set: { encryptedPayload: encrypted, updatedAt: new Date() } }, { upsert: true });
        } catch (error) {
            console.error(`[SEGURANÇA] Falha ao persistir credencial criptografada (${id}):`, error.message);
            throw error;
        }
    };

    const parsePayload = (doc) => {
        if (!doc) return null;
        if (doc.encryptedPayload) {
            const decrypted = decryptSecret(doc.encryptedPayload);
            if (decrypted) {
                return JSON.parse(decrypted, BufferJSON.reviver);
            }
        }
        return JSON.parse(JSON.stringify(doc), BufferJSON.reviver);
    };

    const readData = async (id) => {
        try {
            const data = await collection.findOne({ _id: id });
            return parsePayload(data);
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
                    if (!ids || ids.length === 0) return data;

                    try {
                        const targetIds = ids.map(id => `${type}-${id}`);
                        const docs = await collection.find({ _id: { $in: targetIds } }).toArray();
                        const docMap = new Map();
                        for (const doc of docs) {
                            docMap.set(doc._id, parsePayload(doc));
                        }

                        for (const id of ids) {
                            const fullKey = `${type}-${id}`;
                            let value = docMap.get(fullKey) || null;
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        }
                    } catch (err) {
                        console.error('[AUTH MONGO] Erro ao buscar chaves em lote:', err.message);
                    }
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
