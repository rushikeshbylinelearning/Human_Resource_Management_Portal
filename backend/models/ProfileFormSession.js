// Short-lived proof that an employee unlocked a profile-form link
// with their own email and password. Only the hash of the cookie is stored.
const mongoose = require('mongoose');

const profileFormSessionSchema = new mongoose.Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Hash of the link token this session is allowed to use.
  linkTokenHash: {
    type: String,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
}, { timestamps: true });

profileFormSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ProfileFormSession', profileFormSessionSchema);
