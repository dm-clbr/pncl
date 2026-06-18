import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const TO_EMAIL = "dm@clbr.com";
const FROM_EMAIL = "no-reply@thepncl.com";

const SOURCE_LABELS: Record<string, string> = {
  "agent-application-homepage": "Agent Application",
  "life-insurance-lp": "Life Insurance",
  "final-expense-lp": "Final Expense",
  "mortgage-protection-lp": "Mortgage Protection",
  "mortgage-coverage-lp": "Mortgage Coverage",
  "family-protection-lp": "Family Protection",
  "mortgage-quiz": "Mortgage Quiz",
  "contact-page": "Contact Page",
  "agent-onboarding": "Agent Onboarding",
};

function buildEmailHtml(data: Record<string, string>): string {
  const { source, ...fields } = data;
  const label = SOURCE_LABELS[source] ?? source ?? "Unknown";
  const rows = Object.entries(fields)
    .map(
      ([key, val]) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#555;text-transform:capitalize;white-space:nowrap;">
          ${key.replace(/_/g, " ")}
        </td>
        <td style="padding:8px 12px;color:#111;">${val || "—"}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="background:#0f0f0f;color:#fff;margin:0;padding:20px 24px;font-size:16px;">
        New Lead — ${label}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${rows}
      </table>
    </div>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const data: Record<string, string> = req.body;

  if (!data || !data.name) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const label = SOURCE_LABELS[data.source] ?? "New Lead";

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: `[PNCL] ${label} — ${data.name}`,
      html: buildEmailHtml(data),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Resend error:", err);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
