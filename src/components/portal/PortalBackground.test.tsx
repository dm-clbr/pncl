import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ponytail: a source scan, not a render. The mount is a one-line composition
// rule across 14 pages, and rendering each one would need its whole hook and
// auth mock stack to prove a single line. Pages that render through
// PortalBentoMain (the dashboard, calendar and state map) carry the
// dashboard's own canvas and must not gain a second, so they are checked the
// other way round.
const pagesDir = path.resolve(__dirname, "../../pages");
const source = (name: string) => readFileSync(path.join(pagesDir, name), "utf8");

const homePages = readdirSync(pagesDir)
  .filter((name) => name.startsWith("Portal") && name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
  .filter((name) => source(name).includes('className="home2-page'));
const bentoPages = homePages.filter((name) => source(name).includes("<PortalBentoMain"));
const wrapperPages = homePages.filter((name) => !bentoPages.includes(name));

describe("PortalBackground mounts on every portal page", () => {
  it("covers every home2-page wrapper", () => {
    expect(wrapperPages.length).toBeGreaterThanOrEqual(12);
  });

  it.each(wrapperPages)("%s mounts the backdrop as the wrapper's first child", (name) => {
    expect(source(name)).toMatch(/<div className="home2-page[^"]*">\s*<PortalBackground \/>/);
  });
});

// The state map page is a thin container around StateMapView, which renders
// the wrapper and the frame, so the frame check follows it there.
const frameFiles = [
  ...bentoPages.map((name) => path.join(pagesDir, name)),
  path.resolve(__dirname, "StateMapView.tsx"),
];

describe("the dashboard frame", () => {
  it("is shared by the dashboard, calendar and state map", () => {
    expect(bentoPages).toEqual(expect.arrayContaining(["PortalDashboard.tsx", "PortalCalendar.tsx"]));
    expect(source("PortalStateMap.tsx")).toContain("<StateMapView");
  });

  it.each(frameFiles.map((file) => [path.basename(file), file]))(
    "%s renders it first and mounts no second backdrop",
    (_name, file) => {
      const text = readFileSync(file, "utf8");
      expect(text).toMatch(/<div[^>]*className="home2-page[^"]*"[^>]*>\s*<PortalBentoMain[\s>]/);
      expect(text).not.toContain("<PortalBackground");
    },
  );
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

// ponytail: same text assertion, same reason. The sub-page header carried a
// fill only inside the (max-width: 620px) sticky-bar block, so above 620px the
// back link and the title sat on the bare gradient on all 14 sub-pages.
describe("every shell text run over the backdrop carries a fill", () => {
  it.each([
    ".home2-page:has(> .portal-backdrop) .portal-subhead {",
    ".home2-page:has(> .portal-backdrop) .portal-subhead + .portal-panel-note,",
  ])("%s sits on --portal-bar-fill", (selector) => {
    expect(ruleBody(selector)).toMatch(/background:.*--portal-bar-fill/);
  });
});
