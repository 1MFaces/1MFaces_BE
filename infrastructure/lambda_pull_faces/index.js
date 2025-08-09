const { MongoClient } = require('mongodb');

let cachedClient = null;

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
const collectionName = 'photosMetadata';

async function connectToDB() {
    if (cachedClient && cachedClient.isConnected()) {
        return cachedClient;
    }
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    cachedClient = client;
    return client;
}

exports.handler = async (event) => {
    try {
        // Parse query params from event (example: bounding box or grid coords)
        const { startX, endX, startY, endY } = event.queryStringParameters || {};

        // Validation
        if (!startX || !endX || !startY || !endY) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing coordinates' }),
            };
        }

        const client = await connectToDB();
        const collection = client.db(dbName).collection(collectionName);

        // Query MongoDB for photos metadata within the given coordinates (assuming fields x, y)
        const photos = await collection
            .find({
                x: { $gte: parseInt(startX), $lte: parseInt(endX) },
                y: { $gte: parseInt(startY), $lte: parseInt(endY) },
            })
            .toArray();

        return {
            statusCode: 200,
            body: JSON.stringify(photos),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (err) {
        console.error('Error in Lambda:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
