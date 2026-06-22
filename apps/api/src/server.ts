import "./loadEnv.js";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "./db/migrate.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { tenantMiddleware } from "./middleware/tenant.js";
import { requireTenantAuth } from "./middleware/tenantAuth.js";
import { requireActiveSubscription } from "./middleware/subscriptionGuard.js";
import { authRouter } from "./routes/auth/login.js";
import { changePasswordRouter } from "./routes/auth/changePassword.js";
import { forgotPasswordRouter, resetPasswordRouter } from "./routes/auth/passwordReset.js";
import { schoolPreviewRouter } from "./routes/auth/schoolPreview.js";
import { superAdminAuthRouter } from "./routes/superadmin/auth.js";
import { superAdminSchoolsRouter } from "./routes/superadmin/schools.js";
import { superAdminAdminsRouter } from "./routes/superadmin/admins.js";
import { superAdminSettingsRouter } from "./routes/superadmin/settings.js";
import { superAdminSubscriptionsRouter } from "./routes/superadmin/subscriptions.js";
import { healthRouter } from "./routes/health.js";
import { schoolPayWebhookRouter } from "./routes/webhooks/schoolpay.js";
import { makyPayWebhookRouter } from "./routes/webhooks/makypay.js";
import { schoolBillingRouter } from "./routes/schools/billing.js";
import { schoolSetupRouter } from "./routes/schools/setup.js";
import { classesRouter } from "./routes/schools/classes.js";
import { subjectsRouter } from "./routes/schools/subjects.js";
import { usersRouter } from "./routes/schools/users.js";
import { teachersRouter } from "./routes/schools/teachers.js";
import { resolveCorsOptions } from "./utils/cors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors(resolveCorsOptions()));
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

if (process.env.RUN_MIGRATIONS === "true" || process.env.NODE_ENV !== "production") {
  await migrate();
}

app.use("/api/health", healthRouter);
app.use("/api/v1/health", healthRouter);

app.use("/api/auth", authRouter);
app.use("/api/auth/school", schoolPreviewRouter);
app.use("/api/auth/change-password", changePasswordRouter);
app.use("/api/auth/forgot-password", forgotPasswordRouter);
app.use("/api/auth/reset-password", resetPasswordRouter);
app.use("/api/superadmin/auth", superAdminAuthRouter);
app.use("/api/superadmin/schools", superAdminSchoolsRouter);
app.use("/api/superadmin/admins", superAdminAdminsRouter);
app.use("/api/superadmin/settings", superAdminSettingsRouter);
app.use("/api/superadmin/subscriptions", superAdminSubscriptionsRouter);
app.use("/api/webhooks/schoolpay", schoolPayWebhookRouter);
app.use("/api/webhooks/makypay", makyPayWebhookRouter);

app.use(tenantMiddleware);

app.use(requireTenantAuth);
app.use(requireActiveSubscription);
app.use("/api/schools/setup", schoolSetupRouter);
app.use("/api/schools/billing", schoolBillingRouter);
app.use("/api/schools/classes", classesRouter);
app.use("/api/schools/subjects", subjectsRouter);
app.use("/api/schools/users", usersRouter);
app.use("/api/schools/teachers", teachersRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`MakySchool API listening on http://localhost:${port}`);
});
