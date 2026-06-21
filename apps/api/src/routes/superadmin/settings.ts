import { Router } from "express";
import { requireSuperAdmin, type SuperAdminRequest } from "../../middleware/superAdminAuth.js";
import {
  getSubscriptionFeeSettingMeta,
  setSubscriptionFeeUgx,
} from "../../services/platformSettings.js";

export const superAdminSettingsRouter = Router();

superAdminSettingsRouter.use(requireSuperAdmin);

superAdminSettingsRouter.get("/billing", async (_req, res) => {
  const settings = await getSubscriptionFeeSettingMeta();
  return res.json({ data: settings });
});

superAdminSettingsRouter.patch("/billing", async (req: SuperAdminRequest, res) => {
  const { subscription_fee_ugx: amount } = req.body as { subscription_fee_ugx?: number };
  const superAdminId = req.superAdmin?.sub;

  if (!superAdminId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (amount === undefined || amount === null) {
    return res.status(400).json({ error: "subscription_fee_ugx is required" });
  }

  try {
    const fee = await setSubscriptionFeeUgx(Number(amount), superAdminId);
    const settings = await getSubscriptionFeeSettingMeta();
    return res.json({
      data: {
        ...settings,
        subscription_fee_ugx: fee,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update subscription fee";
    return res.status(400).json({ error: message });
  }
});
