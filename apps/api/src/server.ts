import cors from "cors";
import express from "express";
import helmet from "helmet";
import { tenantMiddleware } from "./middleware/tenant.js";
import { healthRouter } from "./routes/health.js";
import { schoolsRouter } from "./routes/schools.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true, credentials: true }));
app.use(express.json());

app.use("/api/v1/health", healthRouter);
app.use(tenantMiddleware);
app.use("/api/v1/schools", schoolsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`MakySchool API listening on http://localhost:${port}`);
});
