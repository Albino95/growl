#!/usr/bin/env node
/**
 * Seed first admin user for local/dev use.
 * Usage: ADMIN_EMAIL=admin@growl.app ADMIN_PASSWORD='SecurePass123!' node scripts/seed-admin-user.js
 * Or after migrate:local, run with wrangler d1 execute for remote.
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

const email = process.env.ADMIN_EMAIL || 'admin@growl.app';
const password = process.env.ADMIN_PASSWORD || 'GrowlAdmin123!';
const local = process.argv.includes('--local');

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

const adminId = `admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const passwordHash = hashPassword(password);

const sql = `
INSERT OR IGNORE INTO admin_users (id, email, password_hash, role, status, mfa_enabled, created_at, updated_at)
VALUES ('${adminId}', '${email.toLowerCase()}', '${passwordHash}', 'super_admin', 'active', 0, datetime('now'), datetime('now'));
SELECT id, email, role FROM admin_users WHERE email = '${email.toLowerCase()}';
`;

const flag = local ? '--local' : '--remote';
const cmd = `npx wrangler d1 execute growl-db ${flag} --command "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

console.log(`Seeding admin user (${local ? 'local' : 'remote'}): ${email}`);
try {
  execSync(cmd, { stdio: 'inherit', cwd: __dirname + '/..' });
  console.log(`\nAdmin credentials:\n  Email: ${email}\n  Password: ${password}`);
} catch (e) {
  console.error('Failed to seed admin user. Run migrations first: npm run migrate:local');
  process.exit(1);
}
