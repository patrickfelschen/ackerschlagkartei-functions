"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const spawn = require("child-process-promise").spawn;
const path = require("path");
const os = require("os");
const fs = require("fs");

// https://firebase.google.com/docs/functions/locations
// https://github.com/firebase/functions-samples/blob/main/quickstarts/thumbnails/functions/index.js
// https://firebase.google.com/docs/storage/extend-with-functions

exports.onDocumentUpload = functions.region("europe-west3").storage.object().onFinalize(async (object) => {
    const fileBucket = object.bucket;
    const filePath = object.name;
    const contentType = object.contentType;

    functions.logger.log("documentUploaded ", filePath);

    const fileName = path.basename(filePath);

    if (fileName.startsWith("thumb_")) {
        return null;
    }

    // Not an image
    if (!contentType.startsWith("image/")) {
        await admin.firestore().doc(filePath).set({
            "uriThumbnail": "",
            "uriFullsize": filePath,
            "contentType": contentType,
            "uploadDate": admin.firestore.FieldValue.serverTimestamp()
        })

        return null;
    }

    // Create Thumbnail
    const bucket = admin.storage().bucket(fileBucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    const metadata = {
        contentType: contentType,
    };

    await bucket.file(filePath).download({destination: tempFilePath});

    await spawn("convert", [tempFilePath, "-thumbnail", "200x200>", tempFilePath]);

    const thumbFileName = `thumb_${fileName}`;
    const thumbFilePath = path.join(path.dirname(filePath), thumbFileName);

    await bucket.upload(tempFilePath, {
        destination: thumbFilePath,
        metadata: metadata,
    });

    await admin.firestore().doc(filePath).set({
        "uriThumbnail": thumbFilePath,
        "uriFullsize": filePath,
        "contentType": contentType,
        "uploadDate": admin.firestore.FieldValue.serverTimestamp()
    });

    return fs.unlinkSync(tempFilePath);
});


exports.onDocumentDelete = functions.region("europe-west3").storage.object().onDelete(async (object) => {
    const fileBucket = object.bucket;
    const filePath = object.name;
    const contentType = object.contentType;

    functions.logger.log("documentDeleted ", filePath);

    const fileName = path.basename(filePath);

    if (fileName.startsWith("thumb_")) {
        return null;
    }

    if (contentType.startsWith("image/")) {
        // Delete Thumbnail from Storage
        const bucket = admin.storage().bucket(fileBucket);

        const thumbFileName = `thumb_${fileName}`;
        const thumbFilePath = path.join(path.dirname(filePath), thumbFileName);

        await bucket.file(thumbFilePath).delete();
    }

    // Delete Document from Firestore
    await admin.firestore().doc(filePath).delete();

    return null;
});

