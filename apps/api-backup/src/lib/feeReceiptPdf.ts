import type { Response } from "express";
import type { Browser } from "puppeteer";
import puppeteer from "puppeteer";
import { pool } from "../db/pool.js";
import { formatClassName, formatUGX } from "./receiptNumberGenerator.js";

type ReceiptData = {
  receipt_number: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  payment_reference: string | null;
  voided: boolean;
  student_name: string;
  learner_id: string;
  class_name: string;
  term_name: string;
  amount_owed: number;
  amount_paid: number;
  balance: number;
  previous_paid: number;
  recorded_by_name: string | null;
  school_name: string;
  school_address: string | null;
  school_phone: string | null;
  school_email: string | null;
  logo_url: string | null;
  stamp_url: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("en-UG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function methodLabel(method: string) {
  switch (method) {
    case "bank_transfer":
      return "Bank Transfer";
    case "mobile_money":
      return "Mobile Money";
    case "cheque":
      return "Cheque";
    case "other":
      return "Other";
    default:
      return "Cash";
  }
}

function buildReceiptHtml(data: ReceiptData) {
  const voidedOverlay = data.voided
    ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:10;">
         <div style="transform:rotate(-35deg);font-size:72px;font-weight:700;color:rgba(220,38,38,0.25);border:6px solid rgba(220,38,38,0.35);padding:12px 48px;">VOIDED</div>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 20mm; position: relative; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .logo, .stamp { width: 80px; height: 80px; object-fit: contain; }
    .school-name { font-size: 22px; font-weight: 700; margin: 0; }
    .meta { color: #555; font-size: 12px; margin-top: 4px; }
    .title { text-align: center; font-size: 18px; font-weight: 700; margin: 24px 0 8px; letter-spacing: 1px; }
    .divider { border-top: 1px solid #ccc; margin: 16px 0; }
    .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
    .label { color: #555; }
    .value { font-weight: 600; text-align: right; }
    .signatures { display: flex; justify-content: space-between; margin-top: 48px; }
    .sig-line { width: 42%; border-top: 1px solid #333; padding-top: 8px; font-size: 12px; text-align: center; }
    .footer { margin-top: 32px; font-size: 11px; color: #666; text-align: center; }
  </style>
</head>
<body>
  ${voidedOverlay}
  <div class="header">
    <div>
      ${data.logo_url ? `<img class="logo" src="${escapeHtml(data.logo_url)}" alt="Logo" />` : ""}
      <h1 class="school-name">${escapeHtml(data.school_name)}</h1>
      <div class="meta">
        ${[data.school_address, data.school_phone, data.school_email].filter(Boolean).map((value) => escapeHtml(String(value))).join(" · ")}
      </div>
    </div>
    ${data.stamp_url ? `<img class="stamp" src="${escapeHtml(data.stamp_url)}" alt="Stamp" />` : ""}
  </div>
  <div class="title">OFFICIAL PAYMENT RECEIPT</div>
  <div class="row"><span class="label">Receipt No:</span><span class="value">${escapeHtml(data.receipt_number)}</span></div>
  <div class="row"><span class="label">Date:</span><span class="value">${escapeHtml(formatDate(data.payment_date))}</span></div>
  <div class="divider"></div>
  <div class="row"><span class="label">Student:</span><span class="value">${escapeHtml(data.student_name)}</span></div>
  <div class="row"><span class="label">Learner ID:</span><span class="value">${escapeHtml(data.learner_id)}</span></div>
  <div class="row"><span class="label">Class:</span><span class="value">${escapeHtml(data.class_name)}</span></div>
  <div class="row"><span class="label">Term:</span><span class="value">${escapeHtml(data.term_name)}</span></div>
  <div class="divider"></div>
  <div class="row"><span class="label">Fee Item:</span><span class="value">School Fees ${escapeHtml(data.term_name)}</span></div>
  <div class="row"><span class="label">Total Fees:</span><span class="value">${escapeHtml(formatUGX(data.amount_owed))}</span></div>
  <div class="row"><span class="label">Amount Paid:</span><span class="value">${escapeHtml(formatUGX(data.amount))}</span></div>
  <div class="row"><span class="label">Previous Paid:</span><span class="value">${escapeHtml(formatUGX(data.previous_paid))}</span></div>
  <div class="row"><span class="label">Outstanding Bal:</span><span class="value">${escapeHtml(formatUGX(data.balance))}</span></div>
  <div class="row"><span class="label">Payment Method:</span><span class="value">${escapeHtml(methodLabel(data.payment_method))}</span></div>
  <div class="row"><span class="label">Reference:</span><span class="value">${escapeHtml(data.payment_reference || "—")}</span></div>
  <div class="divider"></div>
  <div class="row"><span class="label">Recorded by:</span><span class="value">${escapeHtml(data.recorded_by_name || "—")}</span></div>
  <div class="signatures">
    <div class="sig-line">Bursar Signature</div>
    <div class="sig-line">School Stamp</div>
  </div>
  <div class="footer">
    This receipt is proof of payment. Keep for your records.
  </div>
</body>
</html>`;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

export async function generateFeeReceiptPdf(paymentId: string, schoolId: string): Promise<Buffer> {
  const result = await pool.query(
    `SELECT
       fp.receipt_number,
       fp.payment_date,
       fp.amount,
       fp.payment_method,
       fp.payment_reference,
       fp.voided,
       s.full_name AS student_name,
       s.learner_id,
       sc.level,
       sc.stream,
       fs.term_name,
       sfa.amount_owed,
       sfa.amount_paid,
       sfa.balance,
       COALESCE(recorder.name, recorder.full_name) AS recorded_by_name,
       sch.name AS school_name,
       sch.address AS school_address,
       sch.phone AS school_phone,
       sch.email AS school_email,
       sch.logo_url,
       sch.stamp_url
     FROM fee_payments fp
     JOIN students s ON s.id = fp.student_id
     JOIN student_fee_accounts sfa ON sfa.id = fp.fee_account_id
     JOIN fee_structures fs ON fs.id = sfa.fee_structure_id
     LEFT JOIN school_classes sc ON sc.id = s.current_class_id
     LEFT JOIN users recorder ON recorder.id = fp.recorded_by
     JOIN schools sch ON sch.id = fp.school_id
     WHERE fp.id = $1 AND fp.school_id = $2
     LIMIT 1`,
    [paymentId, schoolId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("NOT_FOUND");
  }

  const data: ReceiptData = {
    receipt_number: row.receipt_number,
    payment_date: row.payment_date,
    amount: Number(row.amount),
    payment_method: row.payment_method,
    payment_reference: row.payment_reference,
    voided: row.voided,
    student_name: row.student_name,
    learner_id: row.learner_id,
    class_name: formatClassName(row.level ?? "", row.stream),
    term_name: row.term_name,
    amount_owed: Number(row.amount_owed),
    amount_paid: Number(row.amount_paid),
    balance: Number(row.balance),
    previous_paid: Number(row.amount_paid) - Number(row.amount),
    recorded_by_name: row.recorded_by_name,
    school_name: row.school_name,
    school_address: row.school_address,
    school_phone: row.school_phone,
    school_email: row.school_email,
    logo_url: row.logo_url,
    stamp_url: row.stamp_url,
  };

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(buildReceiptHtml(data), { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function sendFeeReceiptPdf(
  res: Response,
  paymentId: string,
  schoolId: string,
) {
  const pdf = await generateFeeReceiptPdf(paymentId, schoolId);
  const receiptResult = await pool.query<{ receipt_number: string }>(
    "SELECT receipt_number FROM fee_payments WHERE id = $1 AND school_id = $2 LIMIT 1",
    [paymentId, schoolId],
  );
  const receiptNumber = receiptResult.rows[0]?.receipt_number ?? paymentId;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="receipt-${receiptNumber}.pdf"`,
  );
  return res.send(pdf);
}
