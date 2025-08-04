const aws = require("aws-sdk");
const sharp = require("sharp");
const busboy = require("busboy");
const cloudinary = require("cloudinary").v2;
const { MongoClient } = require("mongodb");
const { isRateLimited } = require("./ip-cache");

const rekognition = new aws.Rekognition({ region: "eu-west-2" });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// MongoDB setup
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 2,
});
let db = null;
async function getDb() {
    if (!db) {
        await mongoClient.connect();
        db = mongoClient.db(process.env.MONGODB_DB || "faces");
    }
    return db;
}

// Lambda entrypoint
exports.handler = async (event) => {
    // For HTTP API Gateway, httpMethod is inside requestContext.http.method
    const ip = event.requestContext?.http?.sourceIp || "unknown";

    if (isRateLimited(ip)) {
        return response(429, "Too many requests, slow down");
    }

    const method =
        event.httpMethod ||
        event.requestContext?.http?.method;

    if (method !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: "Method Not Allowed" }),
        };
    }

    try {
        const contentType =
            event.headers["content-type"] || event.headers["Content-Type"];
        if (!contentType) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing Content-Type header" }),
            };
        }

        const buffer = Buffer.from(
            event.body,
            event.isBase64Encoded ? "base64" : "utf8"
        );

        const fileBuffer = await parseMultipart(buffer, contentType);
        if (!fileBuffer) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "No file found" }),
            };
        }

        // Resize image
        const resizedBuffer = await sharp(fileBuffer)
            .resize(1024, 1024, { fit: "inside" })
            .jpeg()
            .toBuffer();

        // Face detection
        const faceDetected = await detectFace(resizedBuffer);
        if (!faceDetected) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "No human face detected" }),
            };
        }

        // Upload to Cloudinary
        const result = await uploadToCloudinary(resizedBuffer);

        // Save metadata to MongoDB
        const db = await getDb();
        const collection = db.collection("photos");

        await collection.insertOne({
            url: result.secure_url,
            createdAt: new Date(),
            ip,
            source: "lambda",
            cloudinaryId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ url: result.secure_url }),
        };
    } catch (err) {
        console.error("Upload error:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Server Error", error: err.message }),
        };
    }
};

// Multipart parser
function parseMultipart(buffer, contentType) {
    return new Promise((resolve, reject) => {
        const bb = busboy({ headers: { "content-type": contentType } });
        let fileBuffer = null;

        bb.on("file", (fieldname, file) => {
            const chunks = [];
            file.on("data", (data) => chunks.push(data));
            file.on("end", () => {
                fileBuffer = Buffer.concat(chunks);
            });
        });

        bb.on("finish", () => resolve(fileBuffer));
        bb.on("error", (err) => reject(err));
        bb.end(buffer);
    });
}

// Rekognition: check for exactly 1 human face
async function detectFace(imageBuffer) {
    const res = await rekognition
        .detectFaces({ Image: { Bytes: imageBuffer }, Attributes: ["DEFAULT"] })
        .promise();
    return res.FaceDetails.length === 1;
}

// Cloudinary upload
function uploadToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "1mfaces" },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        uploadStream.end(buffer);
    });
}
