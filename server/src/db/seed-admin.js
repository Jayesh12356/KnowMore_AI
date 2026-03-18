/**
 * Seed the first Super Admin account.
 * Usage: node src/db/seed-admin.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./client');

const ADMIN_EMAIL = 'admin@knowmore.ai';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'Super Admin';

async function seed() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const result = await db.query(
    `INSERT INTO admins (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, display_name`,
    [ADMIN_EMAIL, hash, ADMIN_NAME]
  );

  if (result.rows.length > 0) {
    console.log(`✅ Admin created: ${result.rows[0].email} (id: ${result.rows[0].id})`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log('   ⚠️  Change this password after first login!');
  } else {
    console.log(`ℹ️  Admin ${ADMIN_EMAIL} already exists. No changes made.`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  })
  .finally(() => db.pool.end());
