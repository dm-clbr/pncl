import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { AdminDashboardSectionSummary } from "@/hooks/useAdminDashboardTabs";
import {
  isLinksDashboardSection,
  isDownloadsDashboardSection,
  isSystemDashboardSection,
} from "@/lib/portal-dashboard-section-types";
import type { ReactNode } from "react";

type DashboardSortableTabProps = {
  section: AdminDashboardSectionSummary;
  disabled?: boolean;
  children: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  onAddLink: () => void;
};

export function DashboardSortableTab({
  section,
  disabled = false,
  children,
  onEdit,
  onDelete,
  onAddLink,
}: DashboardSortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: section.id,
    data: { type: "section" },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`admin-dashboard-tab-card${isDragging ? " dragging" : ""}`}
    >
      <div className="admin-dashboard-tab-head">
        <div className="admin-dashboard-tab-head-main">
          <div
            className="admin-dashboard-tab-drag-handle"
            aria-label={`Drag ${section.title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={18} strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <h2>{section.title}</h2>
            <p className="admin-panel-note">
              {section.id}
              {isLinksDashboardSection(section)
                ? ` · ${section.links.length} link${section.links.length === 1 ? "" : "s"}`
                : isDownloadsDashboardSection(section)
                  ? ` · ${section.files.length} file${section.files.length === 1 ? "" : "s"}`
                : section.sectionType === "incentives"
                  ? " · Incentives content"
                  : " · Brand assets content"}
            </p>
          </div>
        </div>
        <div
          className="admin-incentive-actions"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className={`admin-status${section.published ? " active" : ""}`}>
            {section.published ? "Published" : "Hidden"}
          </span>
          <button type="button" className="admin-icon-btn" onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" />
            Edit
          </button>
          {!isSystemDashboardSection(section) && (
            <button type="button" className="admin-icon-btn" onClick={onDelete}>
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </button>
          )}
          {isLinksDashboardSection(section) && (
            <button
              type="button"
              className="admin-primary-btn admin-dashboard-add-link-btn"
              onClick={onAddLink}
            >
              <Plus size={14} aria-hidden="true" />
              Add link
            </button>
          )}
        </div>
      </div>

      {children}
    </article>
  );
}

function DashboardSystemTabPanel({ section }: { section: AdminDashboardSectionSummary }) {
  if (section.sectionType === "incentives") {
    return (
      <div className="admin-dashboard-system-tab">
        <p className="admin-panel-note">
          Incentive posters and videos are managed in the Incentives admin. You can reorder and
          hide this tab here.
        </p>
        <Link to="/portal/admin/incentives" className="admin-secondary-btn">
          Manage incentives
        </Link>
      </div>
    );
  }

  if (section.sectionType === "brand_assets") {
    return (
      <div className="admin-dashboard-system-tab">
        <p className="admin-panel-note">
          Logos, colors, and brand files are managed in the Brand assets admin. You can reorder and
          hide this tab here.
        </p>
        <Link to="/portal/admin/brand-assets" className="admin-secondary-btn">
          Manage brand assets
        </Link>
      </div>
    );
  }

  return null;
}

export { DashboardSystemTabPanel, isSystemDashboardSection };

export function reorderSections(
  sections: AdminDashboardSectionSummary[],
  activeId: string,
  overId: string,
): AdminDashboardSectionSummary[] {
  const oldIndex = sections.findIndex((section) => section.id === activeId);
  const newIndex = sections.findIndex((section) => section.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return sections;

  const reordered = [...sections];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  return reordered;
}
