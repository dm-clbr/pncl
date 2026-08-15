import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { NAVIGATION_FALLBACK_DENYLIST } from "@/lib/navigation-fallback";
import { W9_PDF_URL } from "@/lib/w9-form";

const projectPath = (...segments: string[]) => path.resolve(process.cwd(), ...segments);

function expectModuleToProvidePromiseWithResolvers(modulePath: string): void {
  const moduleUrl = pathToFileURL(modulePath).href;
  const script = `
    delete Promise.withResolvers;
    await import(${JSON.stringify(moduleUrl)});
    if (typeof Promise.withResolvers !== "function") {
      throw new Error("Module did not provide Promise.withResolvers compatibility");
    }
  `;

  execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
    stdio: "pipe",
  });
}

describe("W-9 browser and static routing compatibility", () => {
  it("uses the PDF.js browser build that supports Safari without Promise.withResolvers", () => {
    expectModuleToProvidePromiseWithResolvers(
      projectPath("node_modules/pdfjs-dist/legacy/build/pdf.min.mjs"),
    );
  });

  it("uses a worker that supports Safari without Promise.withResolvers", () => {
    expectModuleToProvidePromiseWithResolvers(projectPath("public/pdf.worker.min.mjs"));
  });

  it("keeps document navigations out of the SPA fallback", () => {
    expect(NAVIGATION_FALLBACK_DENYLIST.some((pattern) => pattern.test(W9_PDF_URL))).toBe(true);
    expect(NAVIGATION_FALLBACK_DENYLIST.some((pattern) => pattern.test("/portal/w9"))).toBe(false);
  });

  it("serves the configured W-9 path from a real static PDF asset", () => {
    const bytes = readFileSync(projectPath("public", W9_PDF_URL.replace(/^\//, "")));
    expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
