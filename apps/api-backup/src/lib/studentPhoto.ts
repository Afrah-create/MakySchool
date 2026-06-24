import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWED_STUDENT_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const uploadsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../uploads/schools",
);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function saveStudentPhoto(
  schoolId: string,
  studentId: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  const ext = EXT_BY_MIME[mimetype] ?? ".jpg";
  const filename = `photo${ext}`;
  const directory = path.join(uploadsRoot, schoolId, "students", studentId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), buffer);
  return `/uploads/schools/${schoolId}/students/${studentId}/${filename}`;
}
