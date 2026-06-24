import type { PoolClient } from "pg";

export function deriveLearnerIdPrefix(slug: string): string {
  const parts = slug
    .toLowerCase()
    .split(/[-_\s]+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length === 0) {
    return "SCH";
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 3).toUpperCase().padEnd(3, "X");
  }

  if (parts.length === 2 && parts[0]!.length <= 3) {
    const first = parts[0]!.toUpperCase();
    const secondInitial = parts[1]!.charAt(0).toUpperCase();
    return `${first}${secondInitial}`.slice(0, 4);
  }

  if (parts.length === 2) {
    return parts[0]!.slice(0, 3).toUpperCase();
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 4);
}

export async function generateLearnerId(
  schoolId: string,
  client: PoolClient,
): Promise<string> {
  const schoolResult = await client.query<{ slug: string }>(
    "SELECT slug FROM schools WHERE id = $1 LIMIT 1",
    [schoolId],
  );
  const slug = schoolResult.rows[0]?.slug ?? "school";
  const prefix = deriveLearnerIdPrefix(slug);
  const year = new Date().getFullYear();

  const sequenceResult = await client.query<{ issued_seq: number; prefix: string }>(
    `INSERT INTO learner_id_sequences (school_id, prefix, year, next_seq)
     VALUES ($1, $2, $3, 2)
     ON CONFLICT (school_id, year) DO UPDATE
     SET next_seq = learner_id_sequences.next_seq + 1
     RETURNING next_seq - 1 AS issued_seq, prefix`,
    [schoolId, prefix, year],
  );

  const issuedSeq = Number(sequenceResult.rows[0]?.issued_seq ?? 1);
  const resolvedPrefix = sequenceResult.rows[0]?.prefix ?? prefix;

  return `${resolvedPrefix}-${year}-${String(issuedSeq).padStart(3, "0")}`;
}
