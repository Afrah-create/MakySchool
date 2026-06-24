import { Router } from "express";
import { requireSuperAdmin, type SuperAdminRequest } from "../../middleware/superAdminAuth.js";
import {
  auditAllSchoolSubscriptions,
  auditSchoolSubscription,
  getSchoolAuditHistory,
  getSubscriptionAuditOverview,
} from "../../services/subscriptionTerm.js";

export const superAdminSubscriptionsRouter = Router();

superAdminSubscriptionsRouter.use(requireSuperAdmin);

superAdminSubscriptionsRouter.get("/overview", async (_req, res) => {
  const overview = await getSubscriptionAuditOverview();
  return res.json({ data: overview });
});

superAdminSubscriptionsRouter.post("/audit-run", async (req: SuperAdminRequest, res) => {
  const result = await auditAllSchoolSubscriptions(req.superAdmin?.sub);
  return res.json({ data: result });
});

superAdminSubscriptionsRouter.post("/schools/:schoolId/require-payment", async (req: SuperAdminRequest, res) => {
  const schoolId = String(req.params.schoolId);

  const result = await auditSchoolSubscription(schoolId, {
    manual: true,
    triggeredBy: req.superAdmin?.sub,
  });

  if (!result) {
    return res.status(404).json({ error: "School not found or still in setup" });
  }

  return res.json({ data: result });
});

superAdminSubscriptionsRouter.get("/schools/:schoolId/history", async (req, res) => {
  const schoolId = String(req.params.schoolId);
  const history = await getSchoolAuditHistory(schoolId);
  return res.json({ data: history });
});
