#!/usr/bin/env node
/**
 * Seed first admin user.
 *
 * Usage:
 *   node scripts/seed-admin-user.js --local
 *   node scripts/seed-admin-user.js --qa
 *   node scripts/seed-admin-user.js --production   # careful
 *
 * Env: ADMIN_EMAIL, ADMIN_PASSWORD
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const email = (process.env.ADMIN_EMAIL || 'admin@growl.app').toLowerCase();
const password = process.env.ADMIN_PASSWORD || 'GrowlAdmin123!';
const local = process.argv.includes('--local');
const qa = process.argv.includes('--qa');
const production = process.argv.includes('--production');

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.pbkdf2Sync(pw, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

const adminId = `admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const passwordHash = hashPassword(password);

const sql = `DELETE FROM admin_users WHERE email = '${email}';
INSERT INTO admin_users (id, email, password_hash, role, status, mfa_enabled, created_at, updated_at)
VALUES ('${adminId}', '${email}', '${passwordHash}', 'super_admin', 'active', 0, datetime('now'), datetime('now'));
`;

const sqlFile = path.join(os.tmpdir(), `growl-seed-admin-${Date.now()}.sql`);
fs.writeFileSync(sqlFile, sql);

let cmd;
if (local) {
  cmd = `npx wrangler d1 execute growl-db-dev --local --file="${sqlFile}"`;
} else if (qa) {
  cmd = `npx wrangler d1 execute growl-db-qa --remote --env qa --file="${sqlFile}"`;
} else if (production) {
  cmd = `npx wrangler d1 execute growl-db-prod --remote --env production --file="${sqlFile}"`;
} else {
  console.error('Specify --local, --qa, or --production');
  process.exit(1);
}

console.log(`Seeding admin (${local ? 'local' : qa ? 'qa' : 'production'}): ${email}`);
try {
  execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log(`\nAdmin credentials:\n  Email: ${email}\n  Password: ${password}`);
} catch (e) {
  console.error('Failed to seed admin user. Run migrations first.');
  process.exit(1);
} finally {
  try {
    fs.unlinkSync(sqlFile);
  } catch {
    /* ignore */
  }
}
