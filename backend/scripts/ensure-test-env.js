#!/usr/bin/env node
/**
 * Ensures attendance-test backend .env can boot on PORT 5005.
 * Does not overwrite an existing SESSION_SECRET.
 * Never used by production (attendance.bylinelms.com / :3011).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.resolve(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error(`ERROR: ${envPath} is missing. Create the test backend .env on the server first.`);
  process.exit(1);
}

let text = fs.readFileSync(envPath, 'utf8');

const upsert = (key, value) => {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) {
    text = text.replace(re, `${key}=${value}`);
  } else {
    text = `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
  }
};

const hasValue = (key) => new RegExp(`^${key}=.+$`, 'm').test(text);

upsert('PORT', '5005');
upsert('FRONTEND_URL', 'https://attendance-test.bylinelms.com');
upsert('BACKEND_PUBLIC_URL', 'https://attendance-test.bylinelms.com');

if (!hasValue('SESSION_SECRET')) {
  upsert('SESSION_SECRET', crypto.randomBytes(64).toString('hex'));
  console.log('Generated SESSION_SECRET in test .env');
} else {
  console.log('SESSION_SECRET already present in test .env');
}

fs.writeFileSync(envPath, text);
console.log('Test .env ready (PORT=5005, test FRONTEND_URL)');
