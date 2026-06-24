const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateHandoffToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

export async function hashHandoffToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function generateTemporaryPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%&*-_+=";
  const all = upper + lower + numbers + symbols;

  const required = [
    upper[crypto.getRandomValues(new Uint8Array(1))[0] % upper.length],
    lower[crypto.getRandomValues(new Uint8Array(1))[0] % lower.length],
    numbers[crypto.getRandomValues(new Uint8Array(1))[0] % numbers.length],
    symbols[crypto.getRandomValues(new Uint8Array(1))[0] % symbols.length],
  ];

  const remaining: string[] = [];
  for (let i = required.length; i < length; i++) {
    remaining.push(all[crypto.getRandomValues(new Uint8Array(1))[0] % all.length]);
  }

  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint8Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CREDENTIAL_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("Missing credential encryption configuration");
  }
  const keyMaterial = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptTemporaryPassword(password: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(password),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64Url(combined);
}

export async function decryptTemporaryPassword(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = base64UrlToBytes(encrypted);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new TextDecoder().decode(plaintext);
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function validateHandoffToken(
  providedToken: string,
  storedHash: string,
): Promise<boolean> {
  const providedHash = await hashHandoffToken(providedToken);
  if (providedHash.length !== storedHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < providedHash.length; i++) {
    mismatch |= providedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return mismatch === 0;
}

async function getIdentityHashKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CREDENTIAL_ENCRYPTION_KEY");
  if (!secret) {
    throw new Error("Missing credential encryption configuration");
  }

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function hashSsn(ssn: string): Promise<string> {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length !== 9) {
    throw new Error("Invalid Social Security Number");
  }

  const key = await getIdentityHashKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(digits));
  return bytesToHex(new Uint8Array(signature));
}
