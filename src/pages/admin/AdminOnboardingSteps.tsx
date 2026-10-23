import OnboardingStepPreview from "@/components/admin/OnboardingStepPreview";
import { supportingFilesForFlow } from "../../../supabase/functions/_shared/onboardingAttachments";
import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Portal as TooltipPortal } from "@radix-ui/react-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Workflow,
  Plus,
  Pencil,
  Eye,
  FileText,
  Video,
  Link2,
  Search,
  Info,
  CircleHelp,
  UserRound,
} from "lucide-react";
import { useOnboardingEditor } from "@/hooks/useOnboardingEditor";
import {
  STAGES,
  CONTENT_LABELS,
  blankEditorRow,
  editorUrl,
  isLocalEditor,
  type EditorRow,
} from "@/lib/onboarding-editor";
import OnboardingStepModal from "@/components/admin/OnboardingStepModal";
import { toast } from "sonner";
import "@/styles/admin-onboarding-steps.css";

function StepDescription({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  if (!description.trim()) return null;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="onboarding-description-trigger"
          aria-label={`Description for ${title}`}
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          <CircleHelp size={16} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          className="onboarding-description-tooltip"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}
        >
          {description}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

export default function AdminOnboardingSteps() {
  const { data, loading, error, reload, token } = useOnboardingEditor();
  const [editing, setEditing] = useState<EditorRow | null>(null);
  const [previewing, setPreviewing] = useState<EditorRow | null>(null);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [flow, setFlow] = useState("all");
  useEffect(() => {
    document.title = "Onboarding steps — PNCL Admin";
  }, []);
  const rows = (data?.rows ?? []).filter(
    (row) =>
      (stage === "all" || row.phase === stage) &&
      (flow === "all" || (flow === "loa" ? row.showLoa : row.showIbo)) &&
      `${row.title} ${row.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="admin-panel admin-onboarding-steps">
      <div className="onboarding-page-heading">
        <div className="admin-panel-head">
          <Workflow size={24} />
          <div>
            <h1>Onboarding steps</h1>
            <p>Manage the content agents see in each onboarding step.</p>
          </div>
        </div>
        <div className="onboarding-heading-actions">
          <Link
            className="admin-secondary-link"
            to={editorUrl("/portal/admin/onboarding-logic")}
          >
            <Workflow size={17} />
            Edit logic flow
          </Link>
          <button
            className="admin-primary-btn"
            disabled={!data}
            onClick={() => setEditing(blankEditorRow())}
          >
            <Plus size={18} />
            Add row
          </button>
        </div>
      </div>
      {isLocalEditor() && (
        <p className="onboarding-preview-banner">
          <Info size={16} />
          Local preview — changes and uploaded files stay in this browser.
        </p>
      )}
      <div className="onboarding-filters">
        <label className="admin-field onboarding-search">
          <span className="sr-only">Search steps</span>
          <Search size={19} />
          <input
            placeholder="Search steps…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">All stages</option>
            {STAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Flow</span>
          <select value={flow} onChange={(e) => setFlow(e.target.value)}>
            <option value="all">All flows</option>
            <option value="loa">LOA</option>
            <option value="ibo">IBO</option>
          </select>
        </label>
      </div>
      {loading && (
        <p role="status" className="admin-panel-note">
          Loading onboarding steps…
        </p>
      )}
      {error && (
        <div className="admin-error" role="alert">
          {error}
          <button
            className="admin-secondary-link"
            onClick={() => void reload()}
          >
            Retry
          </button>
          {import.meta.env.DEV && !isLocalEditor() && (
            <Link
              className="admin-secondary-link"
              to="?localPreview=1"
              reloadDocument
            >
              Open local preview
            </Link>
          )}
        </div>
      )}
      {data && !loading && (
        <TooltipProvider delayDuration={200}>
          <div className="admin-table-wrap">
            <table className="admin-table onboarding-content-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Content</th>
                  <th>Status</th>
                  <th>LOA</th>
                  <th>IBO</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {STAGES.map((item) => {
                  const stageRows = rows.filter((row) => row.phase === item.id);
                  return stageRows.length ? (
                    <Fragment key={item.id}>
                      <tr className="onboarding-stage-row">
                        <th colSpan={6}>{item.label}</th>
                      </tr>
                      {stageRows.map((row) => {
                        const Icon = row.contentType.includes("video")
                          ? Video
                          : row.contentType === "link"
                            ? Link2
                            : row.contentType === "system"
                              ? UserRound
                              : FileText;
                        const count = Object.values(row.flowContent).filter(
                          Boolean,
                        ).length;
                        return (
                          <tr key={row.id}>
                            <th scope="row">
                              <div className="onboarding-step-title">
                                <strong>{row.title}</strong>
                                <StepDescription
                                  title={row.title}
                                  description={row.description}
                                />
                              </div>
                            </th>
                            <td data-label="Content">
                              <div className="onboarding-content-cell">
                                <Icon size={20} />
                                <div>
                                  {CONTENT_LABELS[row.contentType]}
                                  {(["loa", "ibo"] as const).some(
                                    (designation) =>
                                      supportingFilesForFlow(
                                        row.slug,
                                        row.flowAttachments,
                                        designation,
                                      ).length > 0,
                                  ) && <small>Supporting files</small>}
                                  {count > 0 && (
                                    <small>
                                      {count} flow{count === 1 ? "" : "s"}{" "}
                                      configured
                                    </small>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td data-label="Status">
                              <span
                                className={`onboarding-status ${row.published ? "published" : ""}`}
                              >
                                {row.published ? "Published" : "Draft"}
                              </span>
                            </td>
                            <td data-label="LOA">
                              <input
                                aria-label={`Show ${row.title} for LOA`}
                                type="checkbox"
                                checked={!!row.showLoa}
                                onChange={() =>
                                  setEditing({ ...row, showLoa: !row.showLoa })
                                }
                              />
                            </td>
                            <td data-label="IBO">
                              <input
                                aria-label={`Show ${row.title} for IBO`}
                                type="checkbox"
                                checked={!!row.showIbo}
                                onChange={() =>
                                  setEditing({ ...row, showIbo: !row.showIbo })
                                }
                              />
                            </td>
                            <td>
                              <div className="onboarding-row-actions">
                                <button
                                  type="button"
                                  className="admin-secondary-link"
                                  aria-label={`Preview ${row.title}`}
                                  title="Preview step"
                                  onClick={() => setPreviewing(row)}
                                >
                                  <Eye size={18} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  className="admin-secondary-link"
                                  aria-label={`Edit ${row.title}`}
                                  title="Edit step"
                                  onClick={() => setEditing(row)}
                                >
                                  <Pencil size={18} aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ) : null;
                })}
              </tbody>
            </table>
            {!rows.length && (
              <p className="admin-empty">No steps match these filters.</p>
            )}
          </div>
        </TooltipProvider>
      )}
      <p className="onboarding-table-note">
        <Info size={17} />
        Edit a row to update its content and files. Use logic flow to manage
        order and conditions.
      </p>
      {previewing && (
        <OnboardingStepPreview
          row={previewing}
          initialFlow={
            flow === "ibo" || (!previewing.showLoa && previewing.showIbo)
              ? "ibo"
              : "loa"
          }
          onClose={() => setPreviewing(null)}
        />
      )}
      {editing && data && (
        <OnboardingStepModal
          row={editing}
          token={token}
          limits={data.limits}
          supportingFilesEnabled={data.features?.supportingFiles ?? false}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Onboarding step saved.");
            void reload();
          }}
        />
      )}
    </section>
  );
}
