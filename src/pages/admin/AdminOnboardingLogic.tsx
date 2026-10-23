import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Workflow,
  FileText,
  Play,
  UserRound,
  Eye,
  Save,
  Plus,
  GripVertical,
  Trash2,
  Info,
  X,
} from "lucide-react";
import { useOnboardingEditor } from "@/hooks/useOnboardingEditor";
import {
  APPLICATION_FIELDS,
  STAGES,
  defaultFlowRules,
  editorUrl,
  isLocalEditor,
  saveEditorFlow,
  validateFlowRules,
  type FlowRules,
  type EditorRow,
} from "@/lib/onboarding-editor";
import { applicationFieldVisible } from "../../../supabase/functions/_shared/onboardingEditorRules";
import { toast } from "sonner";
import "@/styles/admin-onboarding-steps.css";
const labels = Object.fromEntries(APPLICATION_FIELDS);
function orderedRows(rows: EditorRow[], rules: FlowRules, flow: "loa" | "ibo") {
  const rank = (id: string) => {
    const i = rules.portalOrder.indexOf(id);
    return i < 0 ? 10000 : i;
  };
  return rows
    .filter((row) => (flow === "loa" ? row.showLoa : row.showIbo))
    .sort(
      (a, b) =>
        STAGES.findIndex((s) => s.id === a.phase) -
          STAGES.findIndex((s) => s.id === b.phase) ||
        rank(a.slug) - rank(b.slug) ||
        a.sortOrder - b.sortOrder,
    );
}
function move(order: string[], id: string, delta: number) {
  const index = order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export default function AdminOnboardingLogic() {
  const { data, loading, error, token } = useOnboardingEditor();
  const [flow, setFlow] = useState<"loa" | "ibo">("loa");
  const [scope, setScope] = useState<"application" | "portal">("application");
  const [drafts, setDrafts] = useState<Record<"loa" | "ibo", FlowRules>>({
    loa: defaultFlowRules(),
    ibo: defaultFlowRules(),
  });
  const [saved, setSaved] = useState(drafts);
  const [revisions, setRevisions] = useState({ loa: 0, ibo: 0 });
  const [selected, setSelected] = useState("imo");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [preview, setPreview] = useState(false);
  const [answers, setAnswers] = useState({
    hasLicense: "Yes",
    hasEoInsurance: "Yes",
    hasOtherImo: "Yes",
  });
  const drag = useRef<string | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    document.title = "Onboarding logic — PNCL Admin";
  }, []);
  useEffect(() => {
    if (data) {
      const next = {
        loa: structuredClone(data.flows.loa.rules),
        ibo: structuredClone(data.flows.ibo.rules),
      };
      setDrafts(next);
      setSaved(structuredClone(next));
      setRevisions({
        loa: data.flows.loa.revision,
        ibo: data.flows.ibo.revision,
      });
    }
  }, [data]);
  useEffect(() => {
    if (preview) previewDialog.current?.showModal();
  }, [preview]);
  const rules = drafts[flow];
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved[flow]);
  const allRows = useMemo(
    () => (data ? orderedRows(data.rows, rules, flow) : []),
    [data, rules, flow],
  );
  const chosen = allRows.find((row) => row.slug === selected);
  const update = (patch: Partial<FlowRules>) => {
    setSaveError("");
    setDrafts((previous) => ({
      ...previous,
      [flow]: { ...previous[flow], ...patch },
    }));
  };
  const reorder = (id: string, delta: number) => {
    if (scope === "portal") {
      const order = allRows.map((row) => row.slug);
      const target = allRows[order.indexOf(id) + delta];
      const row = allRows.find((r) => r.slug === id);
      if (target?.phase !== row?.phase) return;
      update({ portalOrder: move(order, id, delta) });
    } else
      update({ applicationOrder: move(rules.applicationOrder, id, delta) });
  };
  const drop = (id: string) => {
    const from = drag.current;
    drag.current = null;
    if (!from || from === id) return;
    const order =
      scope === "portal"
        ? allRows.map((row) => row.slug)
        : rules.applicationOrder;
    const delta = order.indexOf(id) - order.indexOf(from);
    reorder(from, delta);
  };
  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      validateFlowRules(rules, allRows);
      const result = await saveEditorFlow(token, flow, rules, revisions[flow]);
      setRevisions((prev) => ({ ...prev, [flow]: result.revision }));
      setSaved((prev) => ({ ...prev, [flow]: structuredClone(rules) }));
      toast.success(`${flow.toUpperCase()} flow saved.`);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const reorderButtons = (id: string, order: string[]) => (
    <div className="onboarding-reorder-buttons">
      <button
        type="button"
        aria-label={`Move ${labels[id] ?? allRows.find((row) => row.slug === id)?.title} up`}
        disabled={order.indexOf(id) === 0}
        onClick={() => reorder(id, -1)}
      >
        <ArrowUp size={15} />
      </button>
      <button
        type="button"
        aria-label={`Move ${labels[id] ?? allRows.find((row) => row.slug === id)?.title} down`}
        disabled={order.indexOf(id) === order.length - 1}
        onClick={() => reorder(id, 1)}
      >
        <ArrowDown size={15} />
      </button>
    </div>
  );
  return (
    <section className="admin-panel admin-onboarding-steps onboarding-logic-page">
      <Link
        to={editorUrl("/portal/admin/onboarding-steps")}
        className="onboarding-back"
      >
        <ArrowLeft size={16} />
        Onboarding steps
      </Link>
      <div className="onboarding-page-heading">
        <div className="admin-panel-head">
          <div>
            <h1>Onboarding logic</h1>
            <p>Set the order, requirements, and conditions for each flow.</p>
          </div>
        </div>
        <div className="onboarding-heading-actions">
          <button
            className="admin-secondary-link"
            disabled={!data}
            onClick={() => setPreview(true)}
          >
            <Eye size={18} />
            Preview flow
          </button>
          <button
            className="admin-primary-btn"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            <Save size={18} />
            {saving ? "Saving…" : "Save flow"}
          </button>
        </div>
      </div>
      {isLocalEditor() && (
        <p className="onboarding-preview-banner">
          <Info size={16} />
          Local preview — flow changes stay in this browser.
        </p>
      )}
      <div className="onboarding-logic-toolbar">
        <div className="onboarding-segment">
          {(["loa", "ibo"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={flow === value}
              onClick={() => {
                setFlow(value);
                setSelected("imo");
                setSaveError("");
              }}
            >
              {value.toUpperCase()}
              {JSON.stringify(drafts[value]) !== JSON.stringify(saved[value])
                ? " •"
                : ""}
            </button>
          ))}
        </div>
        <div className="onboarding-segment">
          <button
            aria-pressed={scope === "application"}
            onClick={() => {
              setScope("application");
              setSelected("imo");
            }}
          >
            Application
          </button>
          <button
            aria-pressed={scope === "portal"}
            onClick={() => {
              setScope("portal");
              setSelected("");
            }}
          >
            Portal checklist
          </button>
        </div>
        <span
          role="status"
          className={dirty ? "onboarding-unsaved" : "onboarding-hint"}
        >
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
      </div>
      {(error || saveError) && (
        <p className="admin-error" role="alert">
          {error || saveError}
        </p>
      )}
      {loading && <p role="status">Loading flow…</p>}
      {data && (
        <div className="onboarding-logic-layout">
          <div className="onboarding-flow-canvas">
            <h2>
              {flow.toUpperCase()}{" "}
              {scope === "application" ? "application" : "checklist"}
            </h2>
            <p className="onboarding-hint">
              {scope === "application"
                ? "Select a step to edit its rules."
                : "Drag steps within a stage, or use the arrow buttons."}
            </p>
            {scope === "application" ? (
              <div className="onboarding-application-graph">
                <button
                  className="onboarding-flow-node"
                  onClick={() => setSelected("welcome")}
                >
                  <Play size={24} />
                  <div>
                    <strong>Welcome</strong>
                    <small>{flow.toUpperCase()} welcome video</small>
                  </div>
                </button>
                <ArrowDown className="onboarding-flow-arrow" size={22} />
                <button
                  className="onboarding-flow-node"
                  onClick={() => setSelected("ica")}
                >
                  <FileText size={24} />
                  <div>
                    <strong>Sign ICA</strong>
                    <small>{flow.toUpperCase()} agreement</small>
                  </div>
                </button>
                <ArrowDown className="onboarding-flow-arrow" size={22} />
                <button
                  className={`onboarding-flow-node ${selected === "details" ? "selected" : ""}`}
                  onClick={() => setSelected("details")}
                >
                  <UserRound size={24} />
                  <div>
                    <strong>Agent details</strong>
                    <small>
                      {rules.applicationOrder.length} questions · edit order
                    </small>
                  </div>
                </button>
                <ArrowDown className="onboarding-flow-arrow" size={22} />
                <button
                  className={`onboarding-flow-node onboarding-condition-node ${selected === "imo" ? "selected" : ""}`}
                  onClick={() => setSelected("imo")}
                >
                  <Workflow size={25} />
                  <div>
                    <strong>Contracted with another IMO?</strong>
                    <small>Show IMO details if Yes</small>
                  </div>
                </button>
                <div className="onboarding-branches">
                  <div>
                    <span className="onboarding-branch-label yes">Yes</span>
                    <ArrowDown size={20} />
                    <div className="onboarding-branch-card">
                      <FileText size={22} />
                      <div>
                        <strong>Collect IMO details</strong>
                        <small>IMO name + carrier list</small>
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="onboarding-branch-label">No</span>
                    <ArrowDown size={20} />
                    <div className="onboarding-branch-card">
                      <span>Continue to the next question</span>
                    </div>
                  </div>
                </div>
                <ArrowDown className="onboarding-flow-arrow" size={22} />
                <button
                  className="onboarding-flow-node"
                  onClick={() => setSelected("review")}
                >
                  <FileText size={24} />
                  <div>
                    <strong>Review application</strong>
                    <small>Final review and submit</small>
                  </div>
                </button>
              </div>
            ) : (
              <div className="onboarding-checklist-graph">
                {STAGES.map((stage) => {
                  const items = allRows.filter((row) => row.phase === stage.id);
                  return items.length ? (
                    <section key={stage.id}>
                      <h3>{stage.label}</h3>
                      {items.map((row) => (
                        <div
                          key={row.slug}
                          className={`onboarding-sort-row ${selected === row.slug ? "selected" : ""}`}
                          draggable
                          onDragStart={() => {
                            drag.current = row.slug;
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => drop(row.slug)}
                        >
                          <GripVertical size={17} />
                          <button onClick={() => setSelected(row.slug)}>
                            <strong>{row.title}</strong>
                            <small>
                              {row.published ? "Published" : "Draft"}
                              {rules.prerequisites[row.slug]?.length
                                ? ` · ${rules.prerequisites[row.slug].length} prerequisites`
                                : ""}
                            </small>
                          </button>
                          {reorderButtons(
                            row.slug,
                            items.map((item) => item.slug),
                          )}
                        </div>
                      ))}
                    </section>
                  ) : null;
                })}
              </div>
            )}
          </div>
          <aside className="onboarding-rule-panel">
            {scope === "portal" ? (
              chosen ? (
                <>
                  <span className="onboarding-eyebrow">Step requirements</span>
                  <h2>{chosen.title}</h2>
                  <p className="onboarding-hint">
                    Complete these steps first. Earlier stages remain required.
                  </p>
                  <div className="onboarding-prerequisites">
                    {allRows
                      .filter(
                        (row) =>
                          row.slug !== chosen.slug &&
                          STAGES.findIndex((s) => s.id === row.phase) <=
                            STAGES.findIndex((s) => s.id === chosen.phase),
                      )
                      .map((row) => (
                        <label key={row.slug}>
                          <input
                            type="checkbox"
                            checked={(
                              rules.prerequisites[chosen.slug] ?? []
                            ).includes(row.slug)}
                            onChange={(e) => {
                              const existing =
                                rules.prerequisites[chosen.slug] ?? [];
                              update({
                                prerequisites: {
                                  ...rules.prerequisites,
                                  [chosen.slug]: e.target.checked
                                    ? [...existing, row.slug]
                                    : existing.filter((id) => id !== row.slug),
                                },
                              });
                            }}
                          />
                          {row.title}
                          {!row.published ? " (draft)" : ""}
                        </label>
                      ))}
                  </div>
                  <p className="onboarding-hint">
                    Completion:{" "}
                    {chosen.completionType === "auto"
                      ? "Verified automatically"
                      : chosen.completionType === "admin"
                        ? "Confirmed by an admin"
                        : "Completed by the agent"}
                    . System requirements remain in place.
                  </p>
                </>
              ) : (
                <>
                  <Workflow size={30} />
                  <h2>Select a step</h2>
                  <p className="onboarding-hint">
                    Choose a checklist step to set its prerequisites.
                  </p>
                </>
              )
            ) : selected === "imo" ? (
              <>
                <span className="onboarding-eyebrow">Condition</span>
                <h2>Another IMO</h2>
                <label className="admin-field">
                  <span>When</span>
                  <input readOnly value="Contracted with another IMO" />
                </label>
                <div className="onboarding-rule-values">
                  <span>is</span>
                  <strong>Yes</strong>
                </div>
                <h3 className="onboarding-eyebrow">Show these fields</h3>
                <p className="onboarding-required-field">
                  IMO name <span>Required</span>
                </p>
                <p className="onboarding-required-field">
                  Previously contracted carriers <span>Required</span>
                </p>
                <h3 className="onboarding-eyebrow">If No</h3>
                <p className="onboarding-rule-callout">
                  Skip transfer details and continue the application.
                </p>
                <p className="onboarding-hint">
                  <Info size={16} />
                  Both details are required for transfers. This rule always
                  applies.
                </p>
                <button
                  className="admin-secondary-link onboarding-full-button"
                  onClick={() => setSelected("details")}
                >
                  <Plus size={17} />
                  Edit other conditions
                </button>
              </>
            ) : selected === "details" ? (
              <>
                <span className="onboarding-eyebrow">
                  Application questions
                </span>
                <h2>Order & conditions</h2>
                <p className="onboarding-hint">
                  Drag questions to reorder. Agreement and final review keep
                  their positions.
                </p>
                <div className="onboarding-question-list">
                  {rules.applicationOrder.map((key) => (
                    <div
                      className="onboarding-sort-row"
                      key={key}
                      draggable
                      onDragStart={() => {
                        drag.current = key;
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => drop(key)}
                    >
                      <GripVertical size={15} />
                      <span>{labels[key]}</span>
                      {reorderButtons(key, rules.applicationOrder)}
                    </div>
                  ))}
                </div>
                <h3>Optional field conditions</h3>
                {rules.conditions.map((condition, index) => (
                  <div
                    className="onboarding-condition-editor"
                    key={condition.id}
                  >
                    <label className="admin-field">
                      <span>Show field</span>
                      <select
                        aria-label={`Condition ${index + 1} field`}
                        value={condition.target}
                        onChange={(e) =>
                          update({
                            conditions: rules.conditions.map((item) =>
                              item.id === condition.id
                                ? {
                                    ...item,
                                    target: e.target
                                      .value as typeof condition.target,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="npn">NPN</option>
                        <option value="profilePhoto">Profile picture</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>When</span>
                      <select
                        aria-label={`Condition ${index + 1} question`}
                        value={condition.field}
                        onChange={(e) =>
                          update({
                            conditions: rules.conditions.map((item) =>
                              item.id === condition.id
                                ? {
                                    ...item,
                                    field: e.target
                                      .value as typeof condition.field,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="hasLicense">
                          Has insurance license
                        </option>
                        <option value="hasEoInsurance">
                          Has E&O insurance
                        </option>
                        <option value="hasOtherImo">Has another IMO</option>
                      </select>
                    </label>
                    <label className="admin-field">
                      <span>Answer is</span>
                      <select
                        value={condition.equals}
                        onChange={(e) =>
                          update({
                            conditions: rules.conditions.map((item) =>
                              item.id === condition.id
                                ? {
                                    ...item,
                                    equals: e.target.value as "Yes" | "No",
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </label>
                    <button
                      className="onboarding-text-button"
                      onClick={() =>
                        update({
                          conditions: rules.conditions.filter(
                            (item) => item.id !== condition.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={15} />
                      Remove condition
                    </button>
                  </div>
                ))}
                <button
                  className="admin-secondary-link onboarding-full-button"
                  disabled={rules.conditions.length >= 2}
                  onClick={() => {
                    const target = rules.conditions.some(
                      (c) => c.target === "npn",
                    )
                      ? "profilePhoto"
                      : "npn";
                    const order = [...rules.applicationOrder];
                    if (order.indexOf(target) < order.indexOf("hasLicense")) {
                      order.splice(order.indexOf(target), 1);
                      order.splice(order.indexOf("hasLicense") + 1, 0, target);
                    }
                    update({
                      applicationOrder: order,
                      conditions: [
                        ...rules.conditions,
                        {
                          id: crypto.randomUUID(),
                          field: "hasLicense",
                          equals: "Yes",
                          target,
                        },
                      ],
                    });
                  }}
                >
                  <Plus size={17} />
                  Add condition
                </button>
              </>
            ) : (
              <>
                <span className="onboarding-eyebrow">Application step</span>
                <h2>
                  {selected === "welcome"
                    ? "Welcome"
                    : selected === "ica"
                      ? "Sign ICA"
                      : "Review application"}
                </h2>
                <p className="onboarding-hint">
                  {selected === "review"
                    ? "Agents review their completed application before submitting."
                    : "Manage this step’s content and uploads from Onboarding steps."}{" "}
                  This step keeps its position in the application.
                </p>
                <Link
                  className="admin-secondary-link"
                  to={editorUrl("/portal/admin/onboarding-steps")}
                >
                  Edit content
                </Link>
              </>
            )}
          </aside>
        </div>
      )}
      <p className="onboarding-table-note">
        <Info size={17} />
        Content and uploads are managed from Onboarding steps.
      </p>
      {preview && (
        <dialog
          className="onboarding-edit-modal onboarding-flow-preview"
          ref={previewDialog}
          onCancel={() => setPreview(false)}
        >
          <header className="onboarding-modal-header">
            <div>
              <h2>
                {flow.toUpperCase()}{" "}
                {scope === "application" ? "application" : "checklist"} preview
              </h2>
                <p>Preview the current flow without submitting an application.</p>
            </div>
            <button
              className="onboarding-icon-button"
              aria-label="Close flow preview"
              onClick={() => setPreview(false)}
            >
              <X />
            </button>
          </header>
          <div className="onboarding-modal-body">
            {scope === "application" ? (
              <>
                <div className="onboarding-field-grid">
                  {Object.entries(answers).map(([key, value]) => (
                    <label className="admin-field" key={key}>
                      <span>{labels[key]}</span>
                      <select
                        value={value}
                        onChange={(e) =>
                          setAnswers((previous) => ({
                            ...previous,
                            [key]: e.target.value,
                          }))
                        }
                      >
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </label>
                  ))}
                </div>
                <ol className="onboarding-preview-list">
                  <li>Welcome</li>
                  <li>Sign ICA</li>
                  {rules.applicationOrder
                    .filter((key) =>
                      applicationFieldVisible(key, answers, rules),
                    )
                    .map((key) => (
                      <li key={key}>
                        {labels[key]}
                        {key === "hasOtherImo" &&
                          answers.hasOtherImo === "Yes" && (
                            <p>
                              Required: IMO name and previously contracted
                              carriers
                            </p>
                          )}
                      </li>
                    ))}
                  <li>Review and submit</li>
                </ol>
              </>
            ) : (
              <ol className="onboarding-preview-list">
                {allRows
                  .filter((row) => row.published)
                  .map((row) => (
                    <li key={row.slug}>
                      {row.title}
                      {rules.prerequisites[row.slug]?.length > 0 && (
                        <p>
                          Requires:{" "}
                          {rules.prerequisites[row.slug]
                            .map(
                              (id) => allRows.find((r) => r.slug === id)?.title,
                            )
                            .join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
              </ol>
            )}
          </div>
          <footer className="onboarding-modal-footer">
            <span>Nothing is submitted in this preview.</span>
            <button
              className="admin-primary-btn"
              onClick={() => setPreview(false)}
            >
              Done
            </button>
          </footer>
        </dialog>
      )}
    </section>
  );
}
