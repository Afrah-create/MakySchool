import "../loadEnv.js";
import bcrypt from "bcrypt";
import { pool } from "./pool.js";

const DEFAULT_EMAIL = (process.env.SUPERADMIN_EMAIL ?? "admin@makyschool.com").toLowerCase().trim();
const DEFAULT_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? "ChangeMe123!";
const DEFAULT_NAME = process.env.SUPERADMIN_NAME ?? "Platform Admin";
const FORCE_RESET = process.env.SUPERADMIN_FORCE_RESET === "true";

function requireProductionSecrets() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (!process.env.SUPERADMIN_JWT_SECRET || process.env.SUPERADMIN_JWT_SECRET === "change-me-superadmin") {
    throw new Error("Set SUPERADMIN_JWT_SECRET before seeding in production");
  }

  if (!process.env.SUPERADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD === "ChangeMe123!") {
    throw new Error("Set SUPERADMIN_PASSWORD before seeding in production");
  }
}

export async function seedSuperAdmin() {
  requireProductionSecrets();

  const tableCheck = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'super_admins' LIMIT 1`,
  );

  if (!tableCheck.rowCount) {
    throw new Error("super_admins table not found. Run migrations first: npm run migrate --workspace=@makyschool/api");
  }

  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM super_admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [DEFAULT_EMAIL],
  );

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  if (existing.rowCount && !FORCE_RESET) {
    console.log(`Super admin already exists: ${DEFAULT_EMAIL}`);
    console.log("Set SUPERADMIN_FORCE_RESET=true to rotate the password.");
    return;
  }

  if (existing.rowCount && FORCE_RESET) {
    await pool.query(
      "UPDATE super_admins SET password_hash = $1, name = $2 WHERE id = $3",
      [passwordHash, DEFAULT_NAME, existing.rows[0].id],
    );
    console.log(`Super admin password rotated: ${DEFAULT_EMAIL}`);
    return;
  }

  await pool.query(
    `INSERT INTO super_admins (id, email, password_hash, name)
     VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), DEFAULT_EMAIL, passwordHash, DEFAULT_NAME],
  );

  console.log("Super admin created successfully");
  console.log(`  Email:    ${DEFAULT_EMAIL}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`  Password: ${DEFAULT_PASSWORD}`);
  } else {
    console.log("  Password: (hidden — check SUPERADMIN_PASSWORD env var)");
  }
  console.log("Login at /login");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedSuperAdmin()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
