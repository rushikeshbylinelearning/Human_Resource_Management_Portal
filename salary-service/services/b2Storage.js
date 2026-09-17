'use strict';
// services/b2Storage.js
//
// B2 storage operations for payroll documents.
// All object keys must pass through utils/storageKey.js — never build raw keys
// from user input without sanitisation.

const {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
    HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getB2Client, BUCKET_NAME } = require('../config/b2');

const PRESIGNED_URL_TTL_SECONDS = 10 * 60; // 10 minutes — short-lived, single-use-adjacent

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Uploads a buffer to B2.
 * @param {string} key           — sanitised B2 object key
 * @param {Buffer} buffer
 * @param {string} [contentType] — default application/pdf
 * @param {object} [metadata]    — optional x-amz-meta-* headers
 */
async function uploadObject(key, buffer, contentType = 'application/pdf', metadata = {}) {
    await getB2Client().send(new PutObjectCommand({
        Bucket:      BUCKET_NAME(),
        Key:         key,
        Body:        buffer,
        ContentType: contentType,
        Metadata:    metadata,
    }));
    return key;
}

/**
 * Creates a zero-byte folder marker object (key must end with '/').
 */
async function createFolderMarker(key) {
    if (!key.endsWith('/')) throw new Error('Folder marker key must end with /');
    await getB2Client().send(new PutObjectCommand({
        Bucket:        BUCKET_NAME(),
        Key:           key,
        Body:          Buffer.alloc(0),
        ContentType:   'application/x-directory',
        ContentLength: 0,
    }));
    return key;
}

// ─── Download / presigned ─────────────────────────────────────────────────────

/**
 * Generates a presigned GET URL for a specific object.
 * @param {string} key
 * @param {'inline'|'attachment'} disposition  — controls browser behaviour
 * @param {number} [ttlSeconds]                — default 10 min
 * @returns {Promise<string>} presigned URL
 */
async function presignedGetUrl(key, disposition = 'inline', ttlSeconds = PRESIGNED_URL_TTL_SECONDS) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME(),
        Key:    key,
        ResponseContentDisposition: `${disposition}; filename="${key.split('/').pop()}"`,
    });
    return getSignedUrl(getB2Client(), command, { expiresIn: ttlSeconds });
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * Lists objects under a prefix (paginated, up to 1000 per call).
 * @param {string} prefix         — must end with / for folder-like listing
 * @param {string} [delimiter]    — '/' to emulate folder listing (returns CommonPrefixes)
 * @param {string} [continuationToken]
 * @returns {Promise<object>}     { objects: [], folders: [], nextToken }
 */
async function listObjects(prefix, delimiter = '/', continuationToken = null) {
    const params = {
        Bucket:    BUCKET_NAME(),
        Prefix:    prefix,
        Delimiter: delimiter,
        MaxKeys:   1000,
    };
    if (continuationToken) params.ContinuationToken = continuationToken;

    const result = await getB2Client().send(new ListObjectsV2Command(params));

    return {
        objects:   (result.Contents || []).map(o => ({
            key:          o.Key,
            size:         o.Size,
            lastModified: o.LastModified,
            etag:         o.ETag,
        })),
        folders:   (result.CommonPrefixes || []).map(p => p.Prefix),
        nextToken: result.NextContinuationToken || null,
        isTruncated: result.IsTruncated || false,
    };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes a single object.
 */
async function deleteObject(key) {
    await getB2Client().send(new DeleteObjectCommand({ Bucket: BUCKET_NAME(), Key: key }));
}

/**
 * Deletes all objects under a prefix (recursive folder delete).
 * IRREVERSIBLE — caller must confirm in UI before calling.
 * Batches in chunks of 1000 (S3 DeleteObjects limit).
 */
async function deleteFolderRecursive(prefix) {
    let nextToken = null;
    let totalDeleted = 0;

    do {
        const { objects, nextToken: nt } = await listObjects(prefix, '', nextToken);
        nextToken = nt;

        if (objects.length === 0) break;

        // S3 DeleteObjects accepts max 1000 per call
        for (let i = 0; i < objects.length; i += 1000) {
            const batch = objects.slice(i, i + 1000);
            await getB2Client().send(new DeleteObjectsCommand({
                Bucket: BUCKET_NAME(),
                Delete: {
                    Objects: batch.map(o => ({ Key: o.key })),
                    Quiet: true,
                },
            }));
            totalDeleted += batch.length;
        }
    } while (nextToken);

    return totalDeleted;
}

// ─── Rename / Move ────────────────────────────────────────────────────────────

/**
 * S3 has no native rename — copy then delete.
 * @param {string} sourceKey
 * @param {string} destKey
 */
async function renameObject(sourceKey, destKey) {
    await getB2Client().send(new CopyObjectCommand({
        Bucket:     BUCKET_NAME(),
        CopySource: `/${BUCKET_NAME()}/${encodeURIComponent(sourceKey)}`,
        Key:        destKey,
    }));
    await deleteObject(sourceKey);
}

// ─── Existence check ──────────────────────────────────────────────────────────

/**
 * Returns true if the object exists in B2, false if 404.
 */
async function objectExists(key) {
    try {
        await getB2Client().send(new HeadObjectCommand({ Bucket: BUCKET_NAME(), Key: key }));
        return true;
    } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
        throw err;
    }
}

module.exports = {
    uploadObject,
    createFolderMarker,
    presignedGetUrl,
    listObjects,
    deleteObject,
    deleteFolderRecursive,
    renameObject,
    objectExists,
};
