import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ponytail: a source scan, not a render. The mount is a one-line composition
// rule across 14 pages, and rendering each one would need its whole hook and
// auth mock stack to prove a single line. PortalDashboard and
// PortalAuthLayout carry their own LiquidGradientCanvas and must not gain a
// second, so they are excluded by name.
const OWN_CANVAS = new Set(["PortalDashboard.tsx"]);
const pagesDir = path.resolve(__dirname, "../../pages");

const wrapperPages = readdirSync(pagesDir)
  .filter((name) => name.startsWith("Portal") && name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
  .filter((name) => !OWN_CANVAS.has(name))
  .filter((name) => readFileSync(path.join(pagesDir, name), "utf8").includes('className="home2-page'));

describe("PortalBackground mounts on every portal page", () => {
  it("covers every home2-page wrapper", () => {
    expect(wrapperPages.length).toBeGreaterThanOrEqual(14);
  });

  it.each(wrapperPages)("%s mounts the backdrop as the wrapper's first child", (name) => {
    const source = readFileSync(path.join(pagesDir, name), "utf8");
    expect(source).toMatch(/<div className="home2-page[^"]*">\s*<PortalBackground \/>/);
  });
});

// ponytail: a text assertion on the stylesheet, because jsdom does not do
// layout and cannot be asked which box paints on top. The rule below is the
// one that decides it, and re-adding a z-index there is the exact regression
// this guards: it would turn <main> into a stacking context and clamp the ICA
// signature modal (z-index 1100, rendered inside <main>) under the 620px tab
// bar at z-index 50.
const shellCss = readFileSync(path.resolve(__dirname, "../../styles/portal-shell.css"), "utf8");

const ruleBody = (selector: string) => {
  const start = shellCss.indexOf(selector);
  expect(start, `${selector} is missing from portal-shell.css`).toBeGreaterThan(-1);
  const open = shellCss.indexOf("{", start);
  return shellCss.slice(open + 1, shellCss.indexOf("}", open));
};

describe("the backdrop paint-through rule", () => {
  it("raises <main> with position alone, never a z-index", () => {
    const body = ruleBody(".home2-page:has(> .portal-backdrop) > main,");
    expect(body).toMatch(/position:\s*relative/);
    expect(body).not.toMatch(/z-index/);
  });

  it("keeps the backdrop at z-index 0 so tree order puts <main> above it", () => {
    expect(ruleBody(".portal-backdrop {")).toMatch(/z-index:\s*0/);
  });
});
