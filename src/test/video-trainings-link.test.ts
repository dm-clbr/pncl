import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_SECTIONS } from "@/lib/portal-links";

describe("video trainings dashboard link", () => {
  it("uses the requested label and internal training destination", () => {
    const trainingSection = PORTAL_SECTIONS.find((section) => section.id === "training");
    const trainingLink = trainingSection?.links.find((link) => link.id === "pncl-training");

    expect(trainingLink).toMatchObject({
      title: "Video Trainings",
      href: "/portal/disclosures",
      external: false,
    });
  });

  it("renames the database-driven production link", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260922170000_rename_training_link.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(/title = 'Video Trainings'/);
    expect(migration).toMatch(/where href = '\/portal\/disclosures'/);
  });
});
