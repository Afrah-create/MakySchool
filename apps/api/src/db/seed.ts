import bcrypt from "bcrypt";
import { pool } from "./pool.js";

const DEFAULT_EMAIL = process.env.SUPERADMIN_EMAIL ?? "admin@makyschool.com";
const DEFAULT_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? "ChangeMe123!";
const DEFAULT_NAME = process.env.SUPERADMIN_NAME ?? "Platform Admin";

export async function seedSuperAdmin() {
  const existing = await pool.query(
    "SELECT id FROM super_admins WHERE email = $1 LIMIT 1",
    [DEFAULT_EMAIL.toLowerCase()],
  );

  if (existing.rowCount) {
    console.log(`Super admin already exists: ${DEFAULT_EMAIL}`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  await pool.query(
    `INSERT INTO super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), DEFAULT_EMAIL.toLowerCase(), passwordHash, DEFAULT_NAME],
  );

  console.log(`Super admin created: ${DEFAULT_EMAIL}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedSuperAdmin()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
