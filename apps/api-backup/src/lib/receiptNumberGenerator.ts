import type { PoolClient } from "pg";

export async function generateReceiptNumber(
  schoolId: string,
  client: PoolClient,
): Promise<string> {
  const year = new Date().getFullYear();

  const sequenceResult = await client.query<{ issued_seq: number }>(
    `INSERT INTO receipt_number_sequences (school_id, year, next_seq)
     VALUES ($1, $2, 2)
     ON CONFLICT (school_id, year) DO UPDATE
     SET next_seq = receipt_number_sequences.next_seq + 1
     RETURNING next_seq - 1 AS issued_seq`,
    [schoolId, year],
  );

  const seq = sequenceResult.rows[0]?.issued_seq ?? 1;
  return `RCP-${year}-${String(seq).padStart(4, "0")}`;
}

export function formatClassName(level: string, stream: string | null) {
  return stream ? `${level}${stream}` : level;
}

export function computeFeeAccountStatus(
  amountOwed: number,
  amountPaid: number,
  waived: boolean,
): "unpaid" | "partial" | "paid" | "waived" | "overpaid" {
  if (waived) return "waived";
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid > amountOwed) return "overpaid";
  if (amountPaid >= amountOwed) return "paid";
  return "partial";
}

export function formatUGX(amount: number | string | bigint) {
  const value = Number(amount);
  return `UGX ${value.toLocaleString("en-UG")}`;
}
