/**
 * Prepare pncl-w9-standard.pdf from the official IRS fw9.pdf:
 * - Strip XFA (pdf-lib does this on save)
 * - Prefill requester block
 * - Add signature + date fields for Part II
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SOURCE = path.join(root, "public/documents/fw9.pdf");
const OUTPUT = path.join(root, "public/documents/pncl-w9-standard.pdf");
const ASSET_DIRS = [
  path.join(root, "supabase/functions/submit-portal-w9/assets"),
  path.join(root, "supabase/functions/_shared/assets"),
];

const W9_REQUESTER_TEXT = [
  "PNCL LLC",
  "8927 E Wethersfield Rd",
  "Scottsdale, AZ 85260-5003",
].join("\n");

const SIGNATURE_FIELD = {
  name: "signature",
  x: 58.6,
  y: 310,
  width: 320,
  height: 24,
};

const DATE_FIELD = {
  name: "date",
  x: 504,
  y: 310,
  width: 72,
  height: 24,
};

function findFieldBySuffix(form, suffix) {
  return form.getFields().find((field) => field.getName().endsWith(suffix));
}

function formatToday() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source PDF not found: ${SOURCE}`);
  }

  const bytes = fs.readFileSync(SOURCE);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const page = doc.getPage(0);

  const requester = findFieldBySuffix(form, "f1_09[0]");
  if (requester && "setText" in requester) {
    requester.setText(W9_REQUESTER_TEXT);
  } else {
    console.warn("Warning: requester field f1_09[0] not found");
  }

  const signatureField = form.createTextField(SIGNATURE_FIELD.name);
  signatureField.addToPage(page, {
    x: SIGNATURE_FIELD.x,
    y: SIGNATURE_FIELD.y,
    width: SIGNATURE_FIELD.width,
    height: SIGNATURE_FIELD.height,
    borderWidth: 0,
  });
  signatureField.setText("");
  signatureField.enableReadOnly();

  const dateField = form.createTextField(DATE_FIELD.name);
  dateField.addToPage(page, {
    x: DATE_FIELD.x,
    y: DATE_FIELD.y,
    width: DATE_FIELD.width,
    height: DATE_FIELD.height,
    borderWidth: 0,
  });
  dateField.setText(formatToday());

  const outputBytes = await doc.save();
  fs.writeFileSync(OUTPUT, outputBytes);

  for (const dir of ASSET_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(OUTPUT, path.join(dir, "pncl-w9-standard.pdf"));
  }

  const verifyDoc = await PDFDocument.load(outputBytes);
  const verifyForm = verifyDoc.getForm();
  console.log(`Wrote ${OUTPUT} (${outputBytes.length} bytes)`);
  console.log(`Copied to ${ASSET_DIRS.length} edge function asset directories`);
  console.log(`Fields (${verifyForm.getFields().length}):`);
  for (const field of verifyForm.getFields()) {
    const name = field.getName();
    const short = name.includes(".") ? name.split(".").slice(-2).join(".") : name;
    let extra = field.constructor.name.replace("PDF", "");
    try {
      if ("getText" in field) extra += ` text=${JSON.stringify(field.getText())}`;
      if ("isChecked" in field) extra += ` checked=${field.isChecked()}`;
    } catch {
      // ignore
    }
    console.log(`  ${short.padEnd(40)} ${extra}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
