const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
const collectionName = 'photos';

async function connectToDB() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    const client = new MongoClient(uri);
    await client.connect();

    const db = client.db(dbName);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

exports.handler = async (event) => {
    try {
        // Parse query params from event (example: bounding box or grid coords)
        const { startX, endX, startY, endY } = event.queryStringParameters || {};

        if (startX === undefined || endX === undefined || startY === undefined || endY === undefined) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing coordinates' }),
            };
        }

        const { db } = await connectToDB();
        const collection = db.collection(collectionName);
        // console.log("Using DB:", dbName);
        // console.log("Count:", await collection.countDocuments());

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
