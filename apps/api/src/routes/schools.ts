import { Router } from "express";
import type { TenantRequest } from "../middleware/tenant.js";

export const schoolsRouter = Router();

schoolsRouter.get("/me", (req: TenantRequest, res) => {
  res.json({
    data: {
      schoolSlug: req.schoolSlug,
      schoolId: req.schoolId ?? null,
    },
  });
});
