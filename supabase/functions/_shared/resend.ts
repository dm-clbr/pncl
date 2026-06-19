import { logOnboarding } from "./logger.ts";

const RESEND_API_URL = "https://api.resend.com/emails";

export function getFromAddress(): string {
  const name = Deno.env.get("PNCL_FROM_NAME") ?? "PNCL";
  const email = Deno.env.get("PNCL_FROM_EMAIL") ?? "no-reply@thepncl.com";
  return `${name} <${email}>`;
}

export function getResendApiKey(): string {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return key;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getResendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logOnboarding("resend_send_failed", {
      to: input.to,
      subject: input.subject,
      status: response.status,
      body: body.slice(0, 500),
    }, "error");
    throw new Error("Unable to send email");
  }

  logOnboarding("resend_send_succeeded", { to: input.to, subject: input.subject });
}

export function buildPortalActivationEmailHtml(input: {
  firstName: string;
  activationUrl: string;
}): string {
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hi,";

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="background:#0f0f0f;color:#fff;margin:0;padding:20px 24px;font-size:16px;">
        Activate your PNCL Employee Portal
      </h2>
      <div style="padding:24px;font-size:14px;color:#111;line-height:1.6;">
        <p>${greeting}</p>
        <p>
          Your PNCL company email is ready. Click the button below to confirm your email
          and create your portal password. You will sign in with your @thepncl.com address.
        </p>
        <p style="margin:28px 0;">
          <a href="${input.activationUrl}"
             style="display:inline-block;background:#c8ff00;color:#0f0f0f;padding:12px 20px;
                    text-decoration:none;font-weight:600;border-radius:4px;">
            Activate Portal
          </a>
        </p>
        <p style="color:#555;font-size:13px;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="${input.activationUrl}" style="color:#555;word-break:break-all;">
            ${input.activationUrl}
          </a>
        </p>
        <p style="color:#555;font-size:13px;margin-top:24px;">
          If you did not expect this email, contact PNCL support.
        </p>
      </div>
    </div>`;
}

export async function sendPortalActivationEmail(input: {
  to: string;
  firstName: string;
  activationUrl: string;
}): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: "Activate your PNCL Employee Portal",
    html: buildPortalActivationEmailHtml(input),
  });
}
