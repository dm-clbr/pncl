import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isTodoCompleteForUser } from "../../supabase/functions/_shared/todoCompletion";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903000000_genesis_training_replacement.sql"),
  "utf8",
);

const modules = [
  ["disclosure_1", "pd2a8WCC8cs"],
  ["disclosure_2", "9iQnVo4tibQ"],
  ["disclosure_3", "MMC9vlQRIrw"],
  ["disclosure_4", "q63_noNkDe0"],
  ["disclosure_5", "LMGcZqNqhnY"],
  ["disclosure_6", "IF_sfLKysKg"],
  ["disclosure_7", "x8gPJ16U6SM"],
] as const;

describe("Genesis training replacement migration", () => {
  it("installs all seven approved YouTube modules in order", () => {
    for (const [slug, videoId] of modules) {
      expect(migration).toContain(`'${slug}'`);
      expect(migration).toContain(`https://www.youtube.com/watch?v=${videoId}`);
    }
    expect(migration).toMatch(/title = 'Complete PNCL training'/);
    expect(migration).toMatch(/title = 'PNCL Training'[\s\S]*href = '\/portal\/disclosures'/i);
    expect(migration).toMatch(/insert into public\.portal_dashboard_links[\s\S]*where not exists[\s\S]*href = '\/portal\/disclosures'/i);
    expect(migration).toMatch(/external = false[\s\S]*published = true/i);
  });

  it("versions content and accepts only current, published modules with videos", () => {
    expect(migration).toMatch(/add column if not exists content_version integer not null default 1/i);
    expect(migration).toMatch(/new\.content_version := old\.content_version \+ 1/i);
    expect(migration).toMatch(/unique \(user_id, disclosure_id, content_version\)/i);
    expect(migration).toMatch(/disclosure\.published/i);
    expect(migration).toMatch(/nullif\(btrim\(disclosure\.video_url\), ''\) is not null/i);
    expect(migration).toMatch(/disclosure\.content_version = portal_disclosure_acknowledgments\.content_version/i);
  });

  it("grandfathers existing completion only for the initial rollout", () => {
    expect(migration).toMatch(
      /update public\.portal_disclosure_acknowledgments as acknowledgment[\s\S]*set content_version = disclosure\.content_version[\s\S]*acknowledgment\.disclosure_id = disclosure\.id/i,
    );
    expect(migration.match(/set content_version = disclosure\.content_version/gi)).toHaveLength(1);
  });

  it("does not let legacy checklist metadata bypass current training", () => {
    const row = {
      slug: "disclosures",
      completion_type: "auto" as const,
      auto_key: "disclosures",
    };

    expect(isTodoCompleteForUser(
      row,
      "agent-1",
      { disclosures: true },
      new Map([["disclosures", new Set()]]),
    )).toBe(false);
  });
});
