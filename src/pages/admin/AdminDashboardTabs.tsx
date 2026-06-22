import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  GripVertical,
  LayoutGrid,
  Plus,
} from "lucide-react";
import {
  DashboardSectionLinks,
  findLinkSectionId,
  moveLinkBetweenSections,
  reorderLinkInSection,
} from "@/components/admin/DashboardSectionLinks";
import {
  DashboardSortableTab,
  DashboardSystemTabPanel,
  isSystemDashboardSection,
  reorderSections,
} from "@/components/admin/DashboardSortableTab";
import { isLinksDashboardSection } from "@/lib/portal-dashboard-section-types";
import {
  useAdminDashboardTabs,
  type AdminDashboardSectionSummary,
} from "@/hooks/useAdminDashboardTabs";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import type {
  UpsertDashboardLinkPayload,
  UpsertDashboardSectionPayload,
} from "@/lib/admin-api";
import {
  cloneSections,
  createDraftLink,
  createDraftSection,
  serializeSectionsSnapshot,
} from "@/lib/admin-dashboard-tabs-draft";
import { slugifyDashboardTabId } from "@/lib/portal-dashboard-tabs";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

type SectionFormState = {
  id: string;
  title: string;
  published: boolean;
  isNew: boolean;
};

type LinkFormState = {
  id?: string;
  sectionId: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  published: boolean;
};

const EMPTY_SECTION_FORM: SectionFormState = {
  id: "",
  title: "",
  published: true,
  isNew: true,
};

function emptyLinkForm(sectionId: string): LinkFormState {
  return {
    sectionId,
    title: "",
    description: "",
    href: "",
    external: false,
    published: true,
  };
}

function toSectionPayload(form: SectionFormState): UpsertDashboardSectionPayload {
  const id = slugifyDashboardTabId(form.id || form.title);
  if (!id) throw new Error("Tab id must contain letters or numbers");
  return {
    id,
    title: form.title.trim(),
    published: form.published,
  };
}

function toLinkPayload(form: LinkFormState): UpsertDashboardLinkPayload {
  return {
    id: form.id,
    sectionId: form.sectionId,
    title: form.title.trim(),
    description: form.description.trim() || null,
    href: form.href.trim(),
    external: form.external,
    published: form.published,
  };
}

export default function AdminDashboardTabs() {
  const { sections: savedSections, loading, error, persistDraft } = useAdminDashboardTabs();

  const [draftSections, setDraftSections] = useState<AdminDashboardSectionSummary[]>([]);
  const [baseline, setBaseline] = useState("");
  const [sectionForm, setSectionForm] = useState<SectionFormState | null>(null);
  const [linkForm, setLinkForm] = useState<LinkFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ type: "section" | "link"; id: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeLink = useMemo(() => {
    if (activeDrag?.type !== "link") return null;
    for (const section of draftSections) {
      const link = section.links.find((item) => item.id === activeDrag.id);
      if (link) return link;
    }
    return null;
  }, [activeDrag, draftSections]);

  const activeSection = useMemo(() => {
    if (activeDrag?.type !== "section") return null;
    return draftSections.find((section) => section.id === activeDrag.id) ?? null;
  }, [activeDrag, draftSections]);

  useEffect(() => {
    if (loading) return;
    const cloned = cloneSections(savedSections);
    setDraftSections(cloned);
    setBaseline(serializeSectionsSnapshot(cloned));
  }, [loading, savedSections]);

  const isDirty = baseline !== serializeSectionsSnapshot(draftSections);

  const publishedSectionCount = useMemo(
    () => draftSections.filter((section) => section.published).length,
    [draftSections],
  );

  useEffect(() => {
    document.title = "Dashboard Tabs — PNCL Admin";
    trackPageView("admin_dashboard_tabs");
  }, []);

  const resetSectionForm = () => setSectionForm(null);
  const resetLinkForm = () => setLinkForm(null);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      await persistDraft(draftSections);
      toast.success("Dashboard tabs saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save dashboard tabs");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [draftSections, persistDraft]);

  const handleDiscard = () => {
    if (!window.confirm("Discard unsaved changes?")) return;
    const cloned = cloneSections(savedSections);
    setDraftSections(cloned);
    setBaseline(serializeSectionsSnapshot(cloned));
    resetSectionForm();
    resetLinkForm();
  };

  const handleAttemptLeave = useCallback(async (): Promise<"stay" | "leave"> => {
    const save = window.confirm("Do you want to save changes before leaving?");
    if (save) {
      try {
        await handleSaveAll();
        return "leave";
      } catch {
        return "stay";
      }
    }

    const discard = window.confirm("Discard unsaved changes and leave?");
    return discard ? "leave" : "stay";
  }, [handleSaveAll]);

  useUnsavedChangesGuard(isDirty, handleAttemptLeave);

  const startNewSection = () => {
    resetLinkForm();
    setSectionForm({ ...EMPTY_SECTION_FORM, isNew: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEditSection = (section: AdminDashboardSectionSummary) => {
    resetLinkForm();
    setSectionForm({
      id: section.id,
      title: section.title,
      published: section.published,
      isNew: false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startNewLink = (sectionId: string) => {
    resetSectionForm();
    setLinkForm(emptyLinkForm(sectionId));
  };

  const startEditLink = (
    sectionId: string,
    link: AdminDashboardSectionSummary["links"][number],
  ) => {
    resetSectionForm();
    setLinkForm({
      id: link.id,
      sectionId,
      title: link.title,
      description: link.description ?? "",
      href: link.href,
      external: link.external,
      published: link.published,
    });
  };

  const handleSectionSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!sectionForm) return;

    try {
      const payload = toSectionPayload(sectionForm);

      if (sectionForm.isNew) {
        if (draftSections.some((section) => section.id === payload.id)) {
          toast.error("A tab with this id already exists");
          return;
        }

        setDraftSections((prev) => [
          ...prev,
          createDraftSection(
            {
              id: payload.id,
              title: payload.title,
              published: payload.published ?? true,
            },
            prev.length,
          ),
        ]);
      } else {
        setDraftSections((prev) =>
          prev.map((section) =>
            section.id === payload.id
              ? {
                  ...section,
                  title: payload.title,
                  published: payload.published ?? true,
                }
              : section,
          ),
        );
      }

      resetSectionForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update dashboard tab");
    }
  };

  const handleLinkSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!linkForm) return;

    try {
      const payload = toLinkPayload(linkForm);

      if (linkForm.id) {
        setDraftSections((prev) => {
          let existingLink: AdminDashboardSectionSummary["links"][number] | null = null;
          const without = prev.map((section) => {
            const found = section.links.find((link) => link.id === linkForm.id);
            if (found) existingLink = found;
            return {
              ...section,
              links: section.links.filter((link) => link.id !== linkForm.id),
            };
          });

          if (!existingLink) return prev;

          const updatedLink = {
            ...existingLink,
            sectionId: payload.sectionId,
            title: payload.title,
            description: payload.description ?? null,
            href: payload.href,
            external: payload.external ?? false,
            published: payload.published ?? true,
          };

          return without.map((section) =>
            section.id === payload.sectionId
              ? { ...section, links: [...section.links, updatedLink] }
              : section,
          );
        });
      } else {
        setDraftSections((prev) =>
          prev.map((section) =>
            section.id === payload.sectionId
              ? {
                  ...section,
                  links: [
                    ...section.links,
                    createDraftLink(
                      {
                        sectionId: payload.sectionId,
                        title: payload.title,
                        description: payload.description ?? null,
                        href: payload.href,
                        external: payload.external ?? false,
                        published: payload.published ?? true,
                      },
                      section.links.length,
                    ),
                  ],
                }
              : section,
          ),
        );
      }

      resetLinkForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update dashboard link");
    }
  };

  const handleDeleteSection = (section: AdminDashboardSectionSummary) => {
    if (isSystemDashboardSection(section)) {
      toast.error("Incentives and Brand assets tabs cannot be deleted. Hide them instead.");
      return;
    }

    if (!window.confirm(`Delete tab "${section.title}" and all of its links?`)) return;

    setDraftSections((prev) => prev.filter((item) => item.id !== section.id));
    if (sectionForm?.id === section.id) resetSectionForm();
    if (linkForm?.sectionId === section.id) resetLinkForm();
  };

  const handleDeleteLink = (_section: AdminDashboardSectionSummary, linkId: string, title: string) => {
    if (!window.confirm(`Delete link "${title}"?`)) return;

    setDraftSections((prev) =>
      prev.map((section) => ({
        ...section,
        links: section.links.filter((link) => link.id !== linkId),
      })),
    );
    if (linkForm?.id === linkId) resetLinkForm();
  };

  const handleDragStart = (event: DragStartEvent) => {
    const type = event.active.data.current?.type === "section" ? "section" : "link";
    setActiveDrag({ type, id: String(event.active.id) });
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (event.active.data.current?.type === "section") return;

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    setDraftSections((prev) => {
      const activeSectionId = findLinkSectionId(prev, activeId);
      const overSectionId = findLinkSectionId(prev, overId);
      if (!activeSectionId || !overSectionId || activeSectionId === overSectionId) return prev;

      return moveLinkBetweenSections(
        prev,
        activeId,
        overId,
        active.rect.current.translated?.top ?? active.rect.current.initial?.top,
        over.rect,
      );
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const dragType = active.data.current?.type;
    setActiveDrag(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    if (dragType === "section") {
      setDraftSections((prev) => {
        const overSectionId = findLinkSectionId(prev, overId);
        if (!overSectionId) return prev;
        return reorderSections(prev, activeId, overSectionId);
      });
      return;
    }

    setDraftSections((prev) => {
      const activeSectionId = findLinkSectionId(prev, activeId);
      const overSectionId = findLinkSectionId(prev, overId);
      if (!activeSectionId || !overSectionId) return prev;

      if (activeSectionId === overSectionId) {
        return reorderLinkInSection(prev, activeSectionId, activeId, overId);
      }

      return prev;
    });
  };

  const handleDragCancel = () => {
    setActiveDrag(null);
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <LayoutGrid size={22} aria-hidden="true" />
        <div>
          <h1>Dashboard tabs</h1>
          <p>
            Manage every collapsible tab on the agent portal dashboard. Drag tabs and link tiles to
            reorder them, then save when you are done.
          </p>
        </div>
      </div>

      {isDirty && (
        <div className="admin-draft-bar" role="status">
          <p>You have unsaved changes</p>
          <div className="admin-draft-bar-actions">
            <button
              type="button"
              className="admin-secondary-link"
              disabled={saving}
              onClick={handleDiscard}
            >
              Discard
            </button>
            <button
              type="button"
              className="admin-primary-btn"
              disabled={saving}
              onClick={() => void handleSaveAll()}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      )}

      <div className="admin-panel-head-row">
        <p className="admin-panel-note">
          {publishedSectionCount} published tab{publishedSectionCount === 1 ? "" : "s"}
        </p>
        {!sectionForm && (
          <button type="button" className="admin-primary-btn" onClick={startNewSection}>
            <Plus size={16} aria-hidden="true" />
            Add tab
          </button>
        )}
      </div>

      {sectionForm && (
        <form className="admin-form" onSubmit={handleSectionSubmit}>
          <p className="admin-panel-note">
            {sectionForm.isNew ? "New dashboard tab" : `Editing tab: ${sectionForm.title}`}
          </p>

          <label className="admin-field">
            <span>Tab id</span>
            <input
              type="text"
              value={sectionForm.id}
              onChange={(event) =>
                setSectionForm((prev) => prev && { ...prev, id: event.target.value })
              }
              placeholder="sales-tools"
              required
              readOnly={!sectionForm.isNew}
            />
          </label>

          <label className="admin-field">
            <span>Tab title</span>
            <input
              type="text"
              value={sectionForm.title}
              onChange={(event) =>
                setSectionForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        title: event.target.value,
                        id: prev.isNew
                          ? slugifyDashboardTabId(event.target.value)
                          : prev.id,
                      }
                    : prev,
                )
              }
              placeholder="Sales Tools"
              required
            />
          </label>

          <label className="admin-field admin-field-checkbox">
            <input
              type="checkbox"
              checked={sectionForm.published}
              onChange={(event) =>
                setSectionForm((prev) => prev && { ...prev, published: event.target.checked })
              }
            />
            <span>Published in agent portal</span>
          </label>

          <div className="admin-form-actions">
            <button type="submit" className="admin-primary-btn">
              {sectionForm.isNew ? "Add tab" : "Update tab"}
            </button>
            <button type="button" className="admin-secondary-link" onClick={resetSectionForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {linkForm && (
        <form className="admin-form admin-dashboard-link-form" onSubmit={handleLinkSubmit}>
          <p className="admin-panel-note">
            {linkForm.id ? "Edit link" : "Add link"} in{" "}
            <strong>
              {draftSections.find((section) => section.id === linkForm.sectionId)?.title
                ?? linkForm.sectionId}
            </strong>
          </p>

          <label className="admin-field">
            <span>Link title</span>
            <input
              type="text"
              value={linkForm.title}
              onChange={(event) =>
                setLinkForm((prev) => prev && { ...prev, title: event.target.value })
              }
              placeholder="Carrier Sheet"
              required
            />
          </label>

          <label className="admin-field">
            <span>URL</span>
            <input
              type="text"
              value={linkForm.href}
              onChange={(event) =>
                setLinkForm((prev) => prev && { ...prev, href: event.target.value })
              }
              placeholder="/portal/carriers or https://example.com"
              required
            />
          </label>

          <label className="admin-field">
            <span>Description</span>
            <textarea
              value={linkForm.description}
              onChange={(event) =>
                setLinkForm((prev) => prev && { ...prev, description: event.target.value })
              }
              placeholder="Optional note for admins"
              rows={2}
            />
          </label>

          <label className="admin-field admin-field-checkbox">
            <input
              type="checkbox"
              checked={linkForm.external}
              onChange={(event) =>
                setLinkForm((prev) => prev && { ...prev, external: event.target.checked })
              }
            />
            <span>Open in new tab (external link)</span>
          </label>

          <label className="admin-field admin-field-checkbox">
            <input
              type="checkbox"
              checked={linkForm.published}
              onChange={(event) =>
                setLinkForm((prev) => prev && { ...prev, published: event.target.checked })
              }
            />
            <span>Published in agent portal</span>
          </label>

          <div className="admin-form-actions">
            <button type="submit" className="admin-primary-btn">
              {linkForm.id ? "Update link" : "Add link"}
            </button>
            <button type="button" className="admin-secondary-link" onClick={resetLinkForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading dashboard tabs" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={draftSections.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className={`admin-dashboard-tabs-list${activeDrag ? " admin-dashboard-tabs-list-dragging" : ""}`}>
              {draftSections.map((section) => (
                <DashboardSortableTab
                  key={section.id}
                  section={section}
                  disabled={saving}
                  onEdit={() => startEditSection(section)}
                  onDelete={() => handleDeleteSection(section)}
                  onAddLink={() => startNewLink(section.id)}
                >
                  {isLinksDashboardSection(section) ? (
                    <DashboardSectionLinks
                      section={section}
                      disabled={saving}
                      onEditLink={(link) => startEditLink(section.id, link)}
                      onDeleteLink={(linkId, title) => handleDeleteLink(section, linkId, title)}
                    />
                  ) : (
                    <DashboardSystemTabPanel section={section} />
                  )}
                </DashboardSortableTab>
              ))}

              {draftSections.length === 0 && (
                <p className="admin-empty">No dashboard tabs yet. Add your first tab above.</p>
              )}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeSection ? (
              <div className="admin-dashboard-tab-card admin-dashboard-tab-card-overlay">
                <div className="admin-dashboard-tab-head-main">
                  <span className="admin-dashboard-tab-drag-handle" aria-hidden="true">
                    <GripVertical size={18} strokeWidth={2} />
                  </span>
                  <div>
                    <strong>{activeSection.title}</strong>
                    <p className="admin-panel-note">
                      {activeSection.links.length} link{activeSection.links.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </div>
            ) : activeLink ? (
              <div className="admin-dashboard-link-tile admin-dashboard-link-tile-overlay-card">
                <span className="admin-dashboard-link-tile-grip" aria-hidden="true">
                  <GripVertical size={16} strokeWidth={2} />
                </span>
                <span className="admin-dashboard-link-tile-title">{activeLink.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  );
}
