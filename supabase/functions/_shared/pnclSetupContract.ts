export class SetupError extends Error {
  constructor(
    public code: string,
    public status = 409,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export const states =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY"
    .split(" ");
export const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new SetupError("invalid_request", 400);
  }
  return v as Record<string, unknown>;
};
export const exact = (o: Record<string, unknown>, keys: string[]) => {
  if (
    Object.keys(o).some((k) => !keys.includes(k)) || keys.some((k) => !(k in o))
  ) throw new SetupError("invalid_request", 400);
};
export const string = (v: unknown, max = 254) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) {
    throw new SetupError("invalid_request", 400);
  }
  return v.trim();
};
export const email = (v: unknown) => {
  const e = string(v).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new SetupError("invalid_request", 400);
  }
  return e;
};
export const phone = (v: unknown) => {
  const p = string(v, 12);
  if (!/^\+1[0-9]{10}$/.test(p)) throw new SetupError("invalid_request", 400);
  return p;
};
export function registration(v: unknown) {
  const r = object(v);
  exact(r, [
    "firstName",
    "lastName",
    "phone",
    "password",
    "kind",
    "npn",
    "states",
    "inviteCode",
    "businessType",
    "businessName",
    "ein",
    "address",
    "city",
    "state",
    "postal",
    "terms",
    "agreement",
    "smsService",
    "smsMarketing",
  ]);
  if (
    r.terms !== true || r.agreement !== true ||
    typeof r.smsService !== "boolean" || typeof r.smsMarketing !== "boolean" ||
    !["rep", "setter"].includes(String(r.kind))
  ) throw new SetupError("invalid_request", 400);
  const password = typeof r.password === "string" ? r.password : "";
  if (
    password.length > 128 || password.length < 8 || !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) throw new SetupError("invalid_request", 400);
  for (
    const key of [
      "npn",
      "inviteCode",
      "businessType",
      "businessName",
      "ein",
      "address",
      "city",
      "state",
      "postal",
    ]
  ) {
    if (
      typeof r[key] !== "string" || (r[key] as string).length > 200
    ) throw new SetupError("invalid_request", 400);
  }
  if (
    !Array.isArray(r.states) ||
    r.states.some((s) => typeof s !== "string" || !states.includes(s)) ||
    r.states.length > 51
  ) throw new SetupError("invalid_request", 400);
  if (
    r.kind === "rep" &&
    (!/^[0-9]{1,12}$/.test(String(r.npn)) || !r.states.length ||
      !["sole_proprietor", "business"].includes(String(r.businessType)) ||
      !r.address || !r.city || !states.includes(String(r.state)) ||
      !/^\d{5}(?:-\d{4})?$/.test(String(r.postal)) ||
      (r.businessType === "business" &&
        (!r.businessName || !/^\d{9}$/.test(String(r.ein)))))
  ) throw new SetupError("invalid_request", 400);
  if (r.kind === "setter" && !r.inviteCode) {
    throw new SetupError("invite_required", 400);
  }
  return {
    ...r,
    firstName: string(r.firstName, 100),
    lastName: string(r.lastName, 100),
    phone: phone(r.phone),
    password,
  } as Record<string, unknown> & {
    firstName: string;
    lastName: string;
    phone: string;
    password: string;
  };
}
export function setupRequest(v: unknown) {
  const b = object(v);
  const action = string(b.action, 30);
  const keys: Record<string, string[]> = {
    status: [],
    verify: ["loginEmail", "password", "totp"],
    update_email: ["expectedEmail"],
    phone_start: ["phone"],
    phone_check: ["phone", "code"],
    register: ["expectedEmail", "registration"],
    pay: [],
  };
  if (!(action in keys)) throw new SetupError("invalid_request", 400);
  exact(b, ["action", ...keys[action]]);
  if (action === "verify") {
    b.loginEmail = email(b.loginEmail);
    string(b.password, 128);
    if (
      typeof b.totp !== "string" || (b.totp !== "" && !/^\d{6}$/.test(b.totp))
    ) throw new SetupError("invalid_request", 400);
  }
  if (action === "update_email" || action === "register") {
    b.expectedEmail = email(b.expectedEmail);
  }
  if (action.startsWith("phone_")) b.phone = phone(b.phone);
  if (
    action === "phone_check" &&
    (typeof b.code !== "string" || !/^\d{4,8}$/.test(b.code))
  ) throw new SetupError("invalid_request", 400);
  if (action === "register") b.registration = registration(b.registration);
  return b;
}
export type SetupStatus = {
  state: "not_linked" | "connected" | "account_unavailable";
  email: string;
  account: null | { id: string; email: string };
  ownershipVerified: boolean;
  proofExpiresAt: string | null;
  emailMatches: boolean;
  approved: boolean;
  ready: boolean;
};
