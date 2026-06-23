import {
  deleteDashboardLink,
  deleteDashboardSection,
  reorderDashboardLinkPlacements,
  reorderDashboardSections,
  upsertDashboardLink,
  upsertDashboardSection,
  type AdminDashboardLinkSummary,
  type AdminDashboardSectionSummary,
} from "@/lib/admin-api";

export const DRAFT_LINK_ID_PREFIX = "draft-link-";

export function createDraftLinkId(): string {
  return `${DRAFT_LINK_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isDraftLinkId(id: string): boolean {
  return id.startsWith(DRAFT_LINK_ID_PREFIX);
}

export function cloneSections(
  sections: AdminDashboardSectionSummary[],
): AdminDashboardSectionSummary[] {
  return JSON.parse(JSON.stringify(sections)) as AdminDashboardSectionSummary[];
}

export function serializeSectionsSnapshot(sections: AdminDashboardSectionSummary[]): string {
  return JSON.stringify(
    sections.map((section) => ({
      id: section.id,
      title: section.title,
      published: section.published,
      sectionType: section.sectionType,
      links: section.links.map((link) => ({
        id: link.id,
        sectionId: link.sectionId,
        title: link.title,
        description: link.description,
        href: link.href,
        external: link.external,
        icon: link.icon,
        published: link.published,
      })),
    })),
  );
}

export function createDraftSection(
  input: {
    id: string;
    title: string;
    published: boolean;
    sectionType?: "links" | "incentives" | "brand_assets" | "downloads";
  },
  sortOrder: number,
): AdminDashboardSectionSummary {
  const now = new Date().toISOString();
  return {
    id: input.id,
    title: input.title,
    published: input.published,
    sectionType: input.sectionType ?? "links",
    sortOrder,
    links: [],
    files: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createDraftLink(
  input: {
    sectionId: string;
    title: string;
    description: string | null;
    href: string;
    external: boolean;
    published: boolean;
  },
  sortOrder: number,
): AdminDashboardLinkSummary {
  const now = new Date().toISOString();
  return {
    id: createDraftLinkId(),
    sectionId: input.sectionId,
    title: input.title,
    description: input.description,
    href: input.href,
    external: input.external,
    icon: "Link2",
    published: input.published,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

export async function persistDashboardTabsDraft(
  accessToken: string,
  draft: AdminDashboardSectionSummary[],
  saved: AdminDashboardSectionSummary[],
): Promise<void> {
  const savedSectionIds = new Set(saved.map((section) => section.id));
  const savedLinkIds = new Set(saved.flatMap((section) => section.links.map((link) => link.id)));
  const draftSectionIds = new Set(draft.map((section) => section.id));
  const draftLinkIds = new Set(draft.flatMap((section) => section.links.map((link) => link.id)));

  for (const id of savedSectionIds) {
    if (!draftSectionIds.has(id)) {
      await deleteDashboardSection(accessToken, id);
    }
  }

  for (let index = 0; index < draft.length; index += 1) {
    const section = draft[index];
    await upsertDashboardSection(accessToken, {
      id: section.id,
      title: section.title,
      published: section.published,
      sortOrder: index,
      sectionType: section.sectionType,
    });
  }

  await reorderDashboardSections(
    accessToken,
    draft.map((section) => section.id),
  );

  for (const id of savedLinkIds) {
    if (!draftLinkIds.has(id)) {
      await deleteDashboardLink(accessToken, id);
    }
  }

  const linkIdMap = new Map<string, string>();

  for (const section of draft) {
    if (section.sectionType !== "links") {
      for (const link of section.links) {
        if (!isDraftLinkId(link.id)) {
          await deleteDashboardLink(accessToken, link.id);
        }
      }
      continue;
    }

    for (let index = 0; index < section.links.length; index += 1) {
      const link = section.links[index];
      const result = await upsertDashboardLink(accessToken, {
        id: isDraftLinkId(link.id) ? undefined : link.id,
        sectionId: section.id,
        title: link.title,
        description: link.description,
        href: link.href,
        external: link.external,
        icon: link.icon,
        published: link.published,
        sortOrder: index,
      });
      linkIdMap.set(link.id, result.link.id);
    }
  }

  await reorderDashboardLinkPlacements(
    accessToken,
    draft
      .filter((section) => section.sectionType === "links")
      .map((section) => ({
        sectionId: section.id,
        linkIds: section.links.map((link) => linkIdMap.get(link.id) ?? link.id),
      })),
  );
}
