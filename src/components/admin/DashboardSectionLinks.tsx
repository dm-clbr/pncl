import {
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { AdminDashboardSectionSummary } from "@/hooks/useAdminDashboardTabs";

type LinkSummary = AdminDashboardSectionSummary["links"][number];

type SortableLinkTileProps = {
  link: LinkSummary;
  sectionId: string;
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

function SortableLinkTile({
  link,
  sectionId,
  disabled = false,
  onEdit,
  onDelete,
}: SortableLinkTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: link.id,
    data: { type: "link", sectionId },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`admin-dashboard-link-tile${
        !link.published ? " unpublished" : ""
      }${isDragging ? " dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <span className="admin-dashboard-link-tile-grip" aria-hidden="true">
        <GripVertical size={16} strokeWidth={2} />
      </span>
      <span className="admin-dashboard-link-tile-title">{link.title}</span>
      <div
        className="admin-dashboard-link-tile-menu"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="admin-dashboard-link-tile-menu-btn"
          onClick={onEdit}
          aria-label={`Edit ${link.title}`}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="admin-dashboard-link-tile-menu-btn"
          disabled={disabled}
          onClick={onDelete}
          aria-label={`Delete ${link.title}`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

type DashboardSectionLinksProps = {
  section: AdminDashboardSectionSummary;
  disabled?: boolean;
  onEditLink: (link: LinkSummary) => void;
  onDeleteLink: (linkId: string, title: string) => void;
};

export function DashboardSectionLinks({
  section,
  disabled = false,
  onEditLink,
  onDeleteLink,
}: DashboardSectionLinksProps) {
  const { setNodeRef, isOver } = useDroppable({ id: section.id });
  const linkIds = section.links.map((link) => link.id);

  return (
    <SortableContext items={linkIds} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`admin-dashboard-links-grid${isOver ? " is-drop-over" : ""}`}
      >
        {section.links.length === 0 ? (
          <div className="admin-dashboard-link-tile admin-dashboard-link-drop-zone active">
            <span className="admin-dashboard-link-tile-title">Drop link here</span>
          </div>
        ) : (
          section.links.map((link) => (
            <SortableLinkTile
              key={link.id}
              link={link}
              sectionId={section.id}
              disabled={disabled}
              onEdit={() => onEditLink(link)}
              onDelete={() => onDeleteLink(link.id, link.title)}
            />
          ))
        )}
      </div>
    </SortableContext>
  );
}

export function findLinkSectionId(
  sections: AdminDashboardSectionSummary[],
  id: string,
): string | undefined {
  if (sections.some((section) => section.id === id)) return id;
  return sections.find((section) => section.links.some((link) => link.id === id))?.id;
}

export function moveLinkBetweenSections(
  sections: AdminDashboardSectionSummary[],
  activeId: string,
  overId: string,
  activeRectTop: number | undefined,
  overRect: { top: number; height: number } | undefined,
): AdminDashboardSectionSummary[] {
  const activeSectionId = findLinkSectionId(sections, activeId);
  const overSectionId = findLinkSectionId(sections, overId);
  if (!activeSectionId || !overSectionId || activeSectionId === overSectionId) {
    return sections;
  }

  const activeSection = sections.find((section) => section.id === activeSectionId);
  const overSection = sections.find((section) => section.id === overSectionId);
  if (!activeSection || !overSection) return sections;

  const activeLink = activeSection.links.find((link) => link.id === activeId);
  if (!activeLink) return sections;

  const overIndex = overSection.links.findIndex((link) => link.id === overId);
  let insertIndex = overSection.links.length;

  if (overIndex >= 0 && overRect) {
    const isBelow = activeRectTop !== undefined && activeRectTop > overRect.top + overRect.height / 2;
    insertIndex = overIndex + (isBelow ? 1 : 0);
  } else if (sections.some((section) => section.id === overId)) {
    insertIndex = overSection.links.length;
  }

  return sections.map((section) => {
    if (section.id === activeSectionId) {
      return {
        ...section,
        links: section.links.filter((link) => link.id !== activeId),
      };
    }

    if (section.id === overSectionId) {
      const links = [...section.links];
      links.splice(insertIndex, 0, { ...activeLink, sectionId: overSectionId });
      return { ...section, links };
    }

    return section;
  });
}

export function reorderLinkInSection(
  sections: AdminDashboardSectionSummary[],
  sectionId: string,
  activeId: string,
  overId: string,
): AdminDashboardSectionSummary[] {
  return sections.map((section) => {
    if (section.id !== sectionId) return section;

    const oldIndex = section.links.findIndex((link) => link.id === activeId);
    const newIndex = section.links.findIndex((link) => link.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return section;

    const links = [...section.links];
    const [moved] = links.splice(oldIndex, 1);
    links.splice(newIndex, 0, moved);
    return { ...section, links };
  });
}
