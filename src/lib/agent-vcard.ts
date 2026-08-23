export interface AgentVCardAddress {
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface AgentVCardData {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  organization?: string | null;
  title?: string | null;
  workEmail?: string | null;
  workPhone?: string | null;
  workAddress?: AgentVCardAddress | null;
  profileUrl?: string | null;
}

const VCARD_MIME_TYPE = "text/vcard;charset=utf-8";
const VCARD_LINE_LIMIT = 75;

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function cleanUriValue(value: string): string {
  return value.replace(/[\r\n]/g, "").trim();
}

function displayNameFor(data: AgentVCardData): string {
  const firstName = clean(data.firstName);
  const lastName = clean(data.lastName);
  return [firstName, lastName].filter(Boolean).join(" ")
    || clean(data.displayName)
    || clean(data.workEmail);
}

function foldVCardLine(line: string): string[] {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  let byteLength = 0;
  let limit = VCARD_LINE_LIMIT;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (current && byteLength + characterBytes > limit) {
      folded.push(current);
      current = ` ${character}`;
      byteLength = 1 + characterBytes;
      limit = VCARD_LINE_LIMIT;
    } else {
      current += character;
      byteLength += characterBytes;
    }
  }

  folded.push(current);
  return folded;
}

export function canCreateAgentVCard(data: AgentVCardData): boolean {
  return Boolean(displayNameFor(data));
}

export function buildAgentVCard(data: AgentVCardData): string {
  const firstName = clean(data.firstName);
  const lastName = clean(data.lastName);
  const displayName = displayNameFor(data);
  const structuredLastName = firstName || lastName ? lastName : displayName;

  if (!displayName) {
    throw new Error("A name or work email is required to create a digital business card.");
  }

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "PRODID:-//PNCL//Agent Digital Business Card//EN",
    `N;CHARSET=UTF-8:${escapeVCardText(structuredLastName)};${escapeVCardText(firstName)};;;`,
    `FN;CHARSET=UTF-8:${escapeVCardText(displayName)}`,
  ];

  const organization = clean(data.organization);
  if (organization) lines.push(`ORG;CHARSET=UTF-8:${escapeVCardText(organization)}`);

  const title = clean(data.title);
  if (title) lines.push(`TITLE;CHARSET=UTF-8:${escapeVCardText(title)}`);

  const workEmail = cleanUriValue(clean(data.workEmail));
  if (workEmail) lines.push(`EMAIL;TYPE=INTERNET,WORK:${workEmail}`);

  const workPhone = cleanUriValue(clean(data.workPhone));
  if (workPhone) lines.push(`TEL;TYPE=WORK,VOICE:${workPhone}`);

  const address = data.workAddress;
  if (address) {
    const components = [
      clean(address.street),
      clean(address.city),
      clean(address.region),
      clean(address.postalCode),
      clean(address.country),
    ];
    if (components.some(Boolean)) {
      lines.push(`ADR;TYPE=WORK:;;${components.map(escapeVCardText).join(";")}`);
    }
  }

  const profileUrl = cleanUriValue(clean(data.profileUrl));
  if (profileUrl) lines.push(`URL;TYPE=WORK:${profileUrl}`);

  lines.push("END:VCARD");
  return `${lines.flatMap(foldVCardLine).join("\r\n")}\r\n`;
}

export function getAgentVCardFileName(data: AgentVCardData): string {
  const baseName = displayNameFor(data)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${baseName || "pncl-agent"}-pncl.vcf`;
}

export function downloadAgentVCard(data: AgentVCardData): void {
  const blob = new Blob([buildAgentVCard(data)], { type: VCARD_MIME_TYPE });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = getAgentVCardFileName(data);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
