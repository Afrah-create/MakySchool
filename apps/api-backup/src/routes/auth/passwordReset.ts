import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { Router } from "express";
import nodemailer from "nodemailer";
import { pool } from "../../db/pool.js";
import { validatePassword } from "../../utils/password.js";

export const forgotPasswordRouter = Router();
export const resetPasswordRouter = Router();

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

forgotPasswordRouter.post("/", async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email?.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const rawToken = randomBytes(32).toString("hex");
  const hashedToken = hashResetToken(rawToken);

  const result = await pool.query<{ id: string }>(
    `SELECT id FROM users
     WHERE LOWER(email) = LOWER($1)
       AND school_id IS NOT NULL
       AND password_hash IS NOT NULL
     LIMIT 1`,
    [normalizedEmail],
  );

  if (result.rowCount) {
    await pool.query(
      `UPDATE users
       SET password_reset_token = $1,
           password_reset_expires = NOW() + interval '1 hour',
           updated_at = NOW()
       WHERE id = $2`,
      [hashedToken, result.rows[0].id],
    );

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8080").replace(
      /\/$/,
      "",
    );
    const resetLink = `${appUrl}/auth/reset-password?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    const transporter = getMailer();
    const from = process.env.SMTP_FROM ?? "MakySchool <noreply@makylegacy.com>";

    if (transporter) {
      try {
        await transporter.sendMail({
          from,
          to: normalizedEmail,
          subject: "Reset your MakySchool password",
          text: `Reset your MakySchool password by visiting this link (valid for 1 hour):\n\n${resetLink}\n\nIf you did not request this, you can ignore this email.`,
        });
      } catch (error) {
        console.error("Failed to send password reset email", error);
      }
    } else {
      console.warn("SMTP not configured; password reset link:", resetLink);
    }
  }

  return res.json({
    data: {
      ok: true,
      message: "If an account exists, a reset link has been sent.",
    },
  });
});

resetPasswordRouter.post("/", async (req, res) => {
  const { email, token, new_password } = req.body as {
    email?: string;
    token?: string;
    new_password?: string;
  };

  if (!email?.trim() || !token?.trim() || !new_password) {
    return res.status(400).json({ error: "Email, token, and new password are required" });
  }

  const passwordError = validatePassword(new_password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const hashedToken = hashResetToken(token.trim());

  const result = await pool.query<{
    id: string;
    password_reset_token: string | null;
    password_reset_expires: Date | null;
  }>(
    `SELECT id, password_reset_token, password_reset_expires
     FROM users
     WHERE LOWER(email) = LOWER($1)
       AND school_id IS NOT NULL
     LIMIT 1`,
    [normalizedEmail],
  );

  const user = result.rows[0];
  if (!user?.password_reset_token || !user.password_reset_expires) {
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }

  if (user.password_reset_expires < new Date()) {
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }

  if (user.password_reset_token !== hashedToken) {
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }

  const passwordHash = await bcrypt.hash(new_password, 12);

  await pool.query(
    `UPDATE users
     SET password_hash = $1,
         is_temp_password = false,
         password_reset_token = NULL,
         password_reset_expires = NULL,
         password_changed_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [passwordHash, user.id],
  );

  return res.json({ data: { ok: true } });
});
