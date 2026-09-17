'use strict';
// utils/refreshTokenUtils.js
//
// Opaque refresh token issuance, rotation, and revocation.
// Design is identical to AMS's refreshTokenUtils.js — reusing the design,
// not copy-pasting the code (different DB, different secret, separate service).
//
// Key properties:
//   • Raw tokens are NEVER stored — only their SHA-256 hash.
//   • Rotation is atomic via findOneAndUpdate with { revoked: false } filter.
//   • Reuse of a rotated token throws RefreshTokenReuseError (token-theft signal).

const crypto = require('crypto');
const RefreshToken = require('../models/RefreshToken');

const REFRESH_TOKEN_TTL_MS = parseInt(process.env.REFRESH_TOKEN_TTL_MS || '604800000', 10); // 7 days

class RefreshTokenReuseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RefreshTokenReuseError';
    }
}

function generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
}

function hashRefreshToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function issueRefreshToken(userId, userAgent = null) {
    const rawToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawToken);
    await RefreshToken.create({
        userId,
        tokenHash,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revoked: false,
        replacedByTokenHash: null,
        userAgent: userAgent || null,
    });
    return rawToken;
}

async function rotateRefreshToken(oldRawToken) {
    const oldHash = hashRefreshToken(oldRawToken);
    const hashPrefix = oldHash.slice(0, 12);
    const newRawToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRawToken);

    // Atomic: only succeeds once even under concurrent calls
    const preUpdate = await RefreshToken.findOneAndUpdate(
        { tokenHash: oldHash, revoked: false },
        { $set: { revoked: true, replacedByTokenHash: newHash } },
        { new: false }
    );

    if (!preUpdate) {
        const existing = await RefreshToken.findOne({ tokenHash: oldHash }).lean();
        if (!existing) {
            throw new Error('Refresh token not found');
        }
        if (existing.replacedByTokenHash) {
            console.error(`[RefreshToken] ⚠️ REUSE DETECTED | hash: ${hashPrefix}... | userId: ${existing.userId}`);
            throw new RefreshTokenReuseError('Refresh token already rotated — possible token theft');
        }
        throw new Error('Refresh token has been revoked');
    }

    if (preUpdate.expiresAt < new Date()) {
        throw new Error('Refresh token has expired');
    }

    await RefreshToken.create({
        userId: preUpdate.userId,
        tokenHash: newHash,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revoked: false,
        replacedByTokenHash: null,
        userAgent: preUpdate.userAgent,
    });

    return { newRawToken, userId: preUpdate.userId.toString() };
}

async function revokeRefreshToken(rawToken) {
    if (!rawToken) return;
    const tokenHash = hashRefreshToken(rawToken);
    await RefreshToken.updateOne({ tokenHash, revoked: false }, { $set: { revoked: true } });
}

module.exports = {
    RefreshTokenReuseError,
    hashRefreshToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
};
