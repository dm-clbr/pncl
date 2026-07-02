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

export function buildPortalWelcomeEmailHtml(input: {
  firstName: string;
  loginUrl: string;
}): string {
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hi,";

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="background:#0f0f0f;color:#fff;margin:0;padding:20px 24px;font-size:16px;">
        Your PNCL Employee Portal is ready
      </h2>
      <div style="padding:24px;font-size:14px;color:#111;line-height:1.6;">
        <p>${greeting}</p>
        <p>
          Your PNCL company email is ready. Sign in to the Employee Portal with your
          @thepncl.com Google account.
        </p>
        <p style="margin:28px 0;">
          <a href="${input.loginUrl}"
             style="display:inline-block;background:#c8ff00;color:#0f0f0f;padding:12px 20px;
                    text-decoration:none;font-weight:600;border-radius:4px;">
            Sign in to Portal
          </a>
        </p>
        <p style="color:#555;font-size:13px;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="${input.loginUrl}" style="color:#555;word-break:break-all;">
            ${input.loginUrl}
          </a>
        </p>
        <p style="color:#555;font-size:13px;margin-top:24px;">
          Use <strong>Sign in with Google</strong> and choose your @thepncl.com account.
        </p>
      </div>
    </div>`;
}

export async function sendPortalWelcomeEmail(input: {
  to: string;
  firstName: string;
  loginUrl: string;
}): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: "Your PNCL Employee Portal is ready",
    html: buildPortalWelcomeEmailHtml(input),
  });
}

export function buildGmailVerificationRetryEmailHtml(input: {
  firstName: string;
  workspaceEmail: string;
  gmailUrl: string;
  onboardingUrl?: string;
  temporaryPassword?: string;
}): string {
  const greeting = input.firstName ? `Hi ${input.firstName},` : "Hi,";

  const credentialsBlock = input.temporaryPassword
    ? `
        <div style="margin:24px 0;padding:16px 18px;background:#f6f6f6;border-radius:8px;">
          <p style="margin:0 0 10px;font-size:13px;color:#555;text-transform:uppercase;letter-spacing:0.04em;">
            Gmail sign-in details
          </p>
          <p style="margin:0 0 8px;"><strong>Email:</strong> ${input.workspaceEmail}</p>
          <p style="margin:0;"><strong>Temporary password:</strong> ${input.temporaryPassword}</p>
        </div>
        <p style="color:#555;font-size:13px;">
          You will be asked to create a new Google password after you sign in.
        </p>`
    : input.onboardingUrl
    ? `
        <p style="margin:28px 0;">
          <a href="${input.onboardingUrl}"
             style="display:inline-block;background:#0f0f0f;color:#fff;padding:12px 20px;
                    text-decoration:none;font-weight:600;border-radius:4px;margin-right:8px;">
            Get temporary password
          </a>
        </p>
        <p style="color:#555;font-size:13px;">
          If that link has expired, contact PNCL support for a password reset.
        </p>`
    : `
        <p style="color:#555;font-size:13px;">
          If you do not have your temporary password, contact PNCL support for help.
        </p>`;

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="background:#0f0f0f;color:#fff;margin:0;padding:20px 24px;font-size:16px;">
        Finish setting up your PNCL email
      </h2>
      <div style="padding:24px;font-size:14px;color:#111;line-height:1.6;">
        <p>${greeting}</p>
        <p>
          Your PNCL email <strong>${input.workspaceEmail}</strong> needs a one-time Google verification
          before you can sign in and create your password.
        </p>
        <p>
          We linked this personal email address as your Google account recovery option so you can choose
          <strong>Try another way</strong> during verification if Google asks for phone confirmation.
        </p>
        <ol style="padding-left:1.25rem;margin:20px 0;">
          <li style="margin-bottom:8px;">Open Gmail sign-in using the button below</li>
          <li style="margin-bottom:8px;">Sign in with your PNCL email and temporary password</li>
          <li style="margin-bottom:8px;">Complete Google&apos;s verification step</li>
          <li>Create your new Google password when prompted</li>
        </ol>
        <p style="margin:28px 0;">
          <a href="${input.gmailUrl}"
             style="display:inline-block;background:#c8ff00;color:#0f0f0f;padding:12px 20px;
                    text-decoration:none;font-weight:600;border-radius:4px;">
            Sign in to Gmail
          </a>
        </p>
        ${credentialsBlock}
        <p style="color:#555;font-size:13px;margin-top:24px;">
          After Gmail is set up, sign in to the PNCL Employee Portal with Google using your @thepncl.com account.
        </p>
      </div>
    </div>`;
}

export async function sendGmailVerificationRetryEmail(input: {
  to: string;
  firstName: string;
  workspaceEmail: string;
  gmailUrl: string;
  onboardingUrl?: string;
  temporaryPassword?: string | null;
}): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: "Action needed: verify your PNCL email",
    html: buildGmailVerificationRetryEmailHtml({
      firstName: input.firstName,
      workspaceEmail: input.workspaceEmail,
      gmailUrl: input.gmailUrl,
      onboardingUrl: input.onboardingUrl,
      temporaryPassword: input.temporaryPassword ?? undefined,
    }),
  });
}

function formatGenesisNotificationDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildGenesisOnboardingNotificationEmailHtml(input: {
  legalName: string;
  workspaceEmail: string;
  phoneNumber: string;
  dateOfBirth: string;
  stateOfResidence: string;
  uplineNetwork: string;
  hasLicense: string;
  npn: string | null;
  hasEoInsurance: string;
  completedAt: string;
  genesisUrl: string;
  isTest?: boolean;
}): string {
  const npn = input.npn?.trim() ? input.npn.trim() : "Not provided";
  const testBanner = input.isTest
    ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fff3cd;color:#664d03;font-size:13px;border-radius:4px;">
         This is a test notification. No new agent onboarding occurred.
       </p>`
    : "";

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="background:#0f0f0f;color:#fff;margin:0;padding:20px 24px;font-size:16px;">
        New agent onboarding completed
      </h2>
      <div style="padding:24px;font-size:14px;color:#111;line-height:1.6;">
        ${testBanner}
        <p>A new agent finished onboarding and needs a Pinnacle Genesis account.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0;">
          <tr><td style="padding:6px 0;color:#555;">Name</td><td style="padding:6px 0;"><strong>${input.legalName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#555;">PNCL email</td><td style="padding:6px 0;">${input.workspaceEmail}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">Phone</td><td style="padding:6px 0;">${input.phoneNumber}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">Date of birth</td><td style="padding:6px 0;">${input.dateOfBirth}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">State</td><td style="padding:6px 0;">${input.stateOfResidence}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">Upline network</td><td style="padding:6px 0;">${input.uplineNetwork}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">Has license</td><td style="padding:6px 0;">${input.hasLicense}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">NPN</td><td style="padding:6px 0;">${npn}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">E&amp;O insurance</td><td style="padding:6px 0;">${input.hasEoInsurance}</td></tr>
          <tr><td style="padding:6px 0;color:#555;">Completed</td><td style="padding:6px 0;">${formatGenesisNotificationDate(input.completedAt)}</td></tr>
        </table>
        <p style="margin:28px 0;">
          <a href="${input.genesisUrl}"
             style="display:inline-block;background:#c8ff00;color:#0f0f0f;padding:12px 20px;
                    text-decoration:none;font-weight:600;border-radius:4px;">
            Open Genesis queue
          </a>
        </p>
        <p style="color:#555;font-size:13px;">
          Full onboarding details, including SSN, are available in the Genesis admin queue.
        </p>
      </div>
    </div>`;
}

export async function sendGenesisOnboardingNotificationEmail(input: {
  to: string;
  legalName: string;
  workspaceEmail: string;
  phoneNumber: string;
  dateOfBirth: string;
  stateOfResidence: string;
  uplineNetwork: string;
  hasLicense: string;
  npn: string | null;
  hasEoInsurance: string;
  completedAt: string;
  genesisUrl: string;
  isTest?: boolean;
}): Promise<void> {
  const subjectPrefix = input.isTest ? "[Test] " : "";
  await sendEmail({
    to: input.to,
    subject: `${subjectPrefix}New onboarding: ${input.legalName}`,
    html: buildGenesisOnboardingNotificationEmailHtml(input),
  });
}
