const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'inventory_app',
    multipleStatements: true
  });
  const seedPath = path.join(__dirname, '..', '..', 'database', 'seeds', '001_seed.sql');
  const sql = await fs.readFile(seedPath, 'utf8');
  await connection.query(sql);

  const ownerEmail = process.env.SEED_OWNER_EMAIL || 'mt.owner@gmail.com';
  const password = process.env.SEED_OWNER_PASSWORD || 'changeme0';
  const hash = await bcrypt.hash(password, 12);
  const [[role]] = await connection.query('SELECT id FROM roles WHERE name = ?', ['owner']);
  await connection.query(
    `INSERT INTO users (name, email, password_hash, role_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role_id = VALUES(role_id), status = 'active'`,
    ['Owner', ownerEmail, hash, role.id]
  );
  console.log(`Seeded roles, locations, and ${ownerEmail}`);
  await connection.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
