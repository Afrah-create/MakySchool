import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error(error);

  const message =
    error instanceof Error ? error.message : "Internal server error";

  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }

  return res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
}
