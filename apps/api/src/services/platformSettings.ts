import { SUBSCRIPTION_FEE_UGX } from "@makyschool/shared/constants";
import { pool } from "../db/pool.js";

export const SUBSCRIPTION_FEE_SETTING_KEY = "subscription_fee_ugx";

const MIN_SUBSCRIPTION_FEE_UGX = 500;
const MAX_SUBSCRIPTION_FEE_UGX = 10_000_000;
const CACHE_TTL_MS = 30_000;

let subscriptionFeeCache: { value: number; expiresAt: number } | null = null;

export function clearPlatformSettingsCache() {
  subscriptionFeeCache = null;
}

export function parseSubscriptionFee(value: string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_SUBSCRIPTION_FEE_UGX || parsed > MAX_SUBSCRIPTION_FEE_UGX) {
    return null;
  }
  return Math.round(parsed);
}

export async function getSubscriptionFeeUgx() {
  const now = Date.now();
  if (subscriptionFeeCache && subscriptionFeeCache.expiresAt > now) {
    return subscriptionFeeCache.value;
  }

  const result = await pool.query<{ setting_value: string }>(
    `SELECT setting_value FROM platform_settings WHERE setting_key = $1 LIMIT 1`,
    [SUBSCRIPTION_FEE_SETTING_KEY],
  );

  const fee = parseSubscriptionFee(result.rows[0]?.setting_value) ?? SUBSCRIPTION_FEE_UGX;
  subscriptionFeeCache = { value: fee, expiresAt: now + CACHE_TTL_MS };
  return fee;
}

export async function setSubscriptionFeeUgx(amount: number, updatedBy: string) {
  const fee = parseSubscriptionFee(String(amount));
  if (!fee) {
    throw new Error(
      `Subscription fee must be between ${MIN_SUBSCRIPTION_FEE_UGX.toLocaleString()} and ${MAX_SUBSCRIPTION_FEE_UGX.toLocaleString()} UGX`,
    );
  }

  await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, description, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (setting_key) DO UPDATE
     SET setting_value = EXCLUDED.setting_value,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
    [
      SUBSCRIPTION_FEE_SETTING_KEY,
      String(fee),
      "Termly subscription fee in UGX charged to schools",
      updatedBy,
    ],
  );

  clearPlatformSettingsCache();
  return fee;
}

export async function getSubscriptionFeeSettingMeta() {
  const result = await pool.query<{
    setting_value: string;
    updated_at: string;
    updated_by: string | null;
    updater_name: string | null;
    updater_email: string | null;
  }>(
    `SELECT
       ps.setting_value,
       ps.updated_at,
       ps.updated_by,
       sa.name AS updater_name,
       sa.email AS updater_email
     FROM platform_settings ps
     LEFT JOIN super_admins sa ON sa.id = ps.updated_by
     WHERE ps.setting_key = $1
     LIMIT 1`,
    [SUBSCRIPTION_FEE_SETTING_KEY],
  );

  const row = result.rows[0];
  const amount = await getSubscriptionFeeUgx();

  return {
    subscription_fee_ugx: amount,
    currency: "UGX" as const,
    min_ugx: MIN_SUBSCRIPTION_FEE_UGX,
    max_ugx: MAX_SUBSCRIPTION_FEE_UGX,
    updated_at: row?.updated_at ?? null,
    updated_by: row?.updated_by
      ? {
          id: row.updated_by,
          name: row.updater_name,
          email: row.updater_email,
        }
      : null,
  };
}
