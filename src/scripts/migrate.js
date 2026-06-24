const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runSqlFile(filePath) {
  const sql = await fs.readFile(filePath, 'utf8');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

async function main() {
  const migrationsDir = path.join(__dirname, '..', '..', 'database', 'migrations');
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    await runSqlFile(path.join(migrationsDir, file));
    console.log(`Applied ${file}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
