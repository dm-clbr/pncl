import { Fragment, useEffect, useState, type ClipboardEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useAdminCarriers,
  type AdminCarrierSummary,
} from "@/hooks/useAdminCarriers";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import type { UpsertCarrierPayload } from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { moveCarrierIntoAdjacentSection } from "@/lib/carrier-order";
import { toast } from "sonner";

type CarrierFormState = {
  id?: string;
  draftKey?: string;
  carrier: string;
  companyNumber: string;
  eAppLabel: string;
  eAppUrl: string;
  section: string;
  published: boolean;
};

const EMPTY_FORM: CarrierFormState = {
  carrier: "",
  companyNumber: "",
  eAppLabel: "",
  eAppUrl: "",
  section: "",
  published: true,
};

function createEmptyDraftRow(): CarrierFormState {
  return {
    ...EMPTY_FORM,
    draftKey: crypto.randomUUID(),
  };
}

function toFormState(carrier: AdminCarrierSummary): CarrierFormState {
  const carrierName = carrier.carrier;
  return {
    id: carrier.id,
    carrier: carrierName,
    companyNumber: carrier.companyNumber,
    eAppLabel: carrier.eAppLabel.trim() || carrierName,
    eAppUrl: carrier.eAppUrl ?? "",
    section: carrier.section,
    published: carrier.published,
  };
}

function toPayload(form: CarrierFormState, sortOrder?: number): UpsertCarrierPayload {
  return {
    id: form.id,
    carrier: form.carrier.trim(),
    companyNumber: form.companyNumber.trim(),
    eAppLabel: form.eAppLabel.trim() || form.carrier.trim(),
    eAppUrl: form.eAppUrl.trim() || null,
    section: form.section.trim(),
    published: form.published,
    ...(sortOrder !== undefined ? { sortOrder } : {}),
  };
}

function rowLabel(carrier: AdminCarrierSummary | CarrierFormState): string {
  return carrier.carrier || carrier.eAppLabel || "Carrier row";
}

function isEmptyDraftRow(row: CarrierFormState): boolean {
  return (
    !row.carrier.trim()
    && !row.companyNumber.trim()
    && !row.eAppLabel.trim()
    && !row.eAppUrl.trim()
  );
}

function prepareDraftRowsForSave(rows: CarrierFormState[]): CarrierFormState[] {
  return rows.filter((row) => !isEmptyDraftRow(row));
}

function parseCarrierList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function defaultEAppLabel(row: CarrierFormState, nextCarrier: string): string {
  const trimmedLabel = row.eAppLabel.trim();
  const trimmedCarrier = row.carrier.trim();
  if (!trimmedLabel || trimmedLabel === trimmedCarrier) {
    return nextCarrier;
  }
  return row.eAppLabel;
}

function withCarrierName(row: CarrierFormState, carrier: string): CarrierFormState {
  return {
    ...row,
    carrier,
    eAppLabel: defaultEAppLabel(row, carrier),
  };
}

function createDraftRowFromCarrierName(carrier: string, section: string): CarrierFormState {
  return {
    ...createEmptyDraftRow(),
    carrier,
    eAppLabel: carrier,
    section,
  };
}

function expandDraftRowsFromPaste(
  rows: CarrierFormState[],
  index: number,
  names: string[],
): { rows: CarrierFormState[]; added: number; skipped: number } | null {
  if (names.length <= 1 || index < 0 || index >= rows.length) {
    return null;
  }

  const existingNames = new Set(
    rows
      .map((row, rowIndex) => (rowIndex === index ? "" : row.carrier.trim().toLowerCase()))
      .filter(Boolean),
  );

  const [first, ...rest] = names;
  const next = rows.map((row, rowIndex) =>
    rowIndex === index ? withCarrierName(row, first) : row,
  );

  const rowsToInsert: CarrierFormState[] = [];
  let skipped = 0;
  for (const name of rest) {
    const key = name.toLowerCase();
    if (existingNames.has(key)) {
      skipped += 1;
      continue;
    }
    existingNames.add(key);
    rowsToInsert.push(createDraftRowFromCarrierName(name, rows[index].section));
  }

  next.splice(index + 1, 0, ...rowsToInsert);
  return {
    rows: next,
    added: rowsToInsert.length + 1,
    skipped,
  };
}

function validateDraftRows(rows: CarrierFormState[]): string | null {
  for (const row of rows) {
    if (!row.carrier.trim() && !row.eAppLabel.trim()) {
      return `Each row needs a carrier name or e-app label (${rowLabel(row)}).`;
    }
  }
  return null;
}

export default function AdminCarriers() {
  const { carriers, loading, error, saveSheet } = useAdminCarriers();
  const [sheetEditing, setSheetEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<CarrierFormState[]>([]);
  const [savingSheet, setSavingSheet] = useState(false);

  useEffect(() => {
    document.title = "Carriers — PNCL Admin";
    trackPageView("admin_carriers");
  }, []);

  useEffect(() => {
    setDraftRows(carriers.map(toFormState));
  }, [carriers]);

  const savedRows = carriers.map(toFormState);
  const isDirty = JSON.stringify(draftRows) !== JSON.stringify(savedRows);

  const startSheetEdit = () => {
    if (draftRows.length === 0) {
      setDraftRows([createEmptyDraftRow()]);
    }
    setSheetEditing(true);
  };

  const cancelSheetEdit = () => {
    if (isDirty && !window.confirm("Discard unsaved carrier changes?")) return;
    setSheetEditing(false);
    setDraftRows(savedRows);
  };

  const discardChanges = () => {
    if (!window.confirm("Discard unsaved carrier changes?")) return;
    setDraftRows(savedRows);
  };

  const handleCarrierPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    const names = parseCarrierList(text);
    if (names.length <= 1) {
      return;
    }

    event.preventDefault();

    setDraftRows((prev) => {
      const result = expandDraftRowsFromPaste(prev, index, names);
      if (!result) {
        return prev;
      }

      const skippedNote =
        result.skipped > 0 ? ` (${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped)` : "";
      toast.success(`Added ${result.added} carrier row${result.added === 1 ? "" : "s"}${skippedNote}.`);
      return result.rows;
    });
  };

  const updateDraftRow = (index: number, patch: Partial<CarrierFormState>) => {
    setDraftRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };

  const updateCarrierName = (index: number, carrier: string) => {
    setDraftRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? withCarrierName(row, carrier) : row)),
    );
  };

  const addDraftRow = () => {
    setDraftRows((prev) => [...prev, createEmptyDraftRow()]);
  };

  const removeDraftRow = (index: number) => {
    const row = draftRows[index];
    if (!row || !window.confirm(`Remove ${rowLabel(row)} from the carrier sheet draft?`)) return;
    setDraftRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSheetSave = async (): Promise<boolean> => {
    const rowsToSave = prepareDraftRowsForSave(draftRows);
    if (rowsToSave.length === 0) {
      toast.error("Add at least one carrier row before saving.");
      return false;
    }

    const validationError = validateDraftRows(rowsToSave);
    if (validationError) {
      toast.error(validationError);
      return false;
    }

    setSavingSheet(true);
    try {
      const retainedIds = new Set(
        rowsToSave.flatMap((row) => (row.id ? [row.id] : [])),
      );
      const deletedIds = carriers
        .filter(({ id }) => !retainedIds.has(id))
        .map(({ id }) => id);
      const payloads = rowsToSave.map((row, index) => toPayload(row, index));

      await saveSheet(payloads, deletedIds);
      toast.success("Carrier sheet saved.");
      setSheetEditing(false);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save carrier sheet");
      return false;
    } finally {
      setSavingSheet(false);
    }
  };

  const moveCarrier = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftRows.length) return;
    setDraftRows((prev) => moveCarrierIntoAdjacentSection(prev, index, direction));
  };

  const handleAttemptLeave = async (): Promise<"stay" | "leave"> => {
    if (window.confirm("Do you want to save the carrier sheet before leaving?")) {
      return await handleSheetSave() ? "leave" : "stay";
    }

    return window.confirm("Discard unsaved carrier changes and leave?") ? "leave" : "stay";
  };

  useUnsavedChangesGuard(isDirty, handleAttemptLeave);

  const rows = draftRows;

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <Building2 size={22} aria-hidden="true" />
        <div>
          <h1>Carrier sheet</h1>
          <p>
            Manage the read-only carrier reference table shown to agents under Sales Tools.
          </p>
        </div>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading carriers" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="admin-sheet-toolbar">
            <p className="admin-inline-note" role="status">
              {sheetEditing
                ? "Edit, add, remove, or reorder rows freely. Nothing is published until you save."
                : isDirty
                  ? "You have unsaved carrier sheet changes."
                  : "Move carriers freely, then save the completed order when you are done."}
            </p>
            <div className="admin-sheet-toolbar-actions">
              {sheetEditing ? (
                <>
                  <button
                    type="button"
                    className="admin-secondary-link admin-sheet-add-row-btn"
                    disabled={savingSheet}
                    onClick={addDraftRow}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Add row
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-link"
                    disabled={savingSheet}
                    onClick={cancelSheetEdit}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="admin-secondary-link"
                    disabled={savingSheet}
                    onClick={startSheetEdit}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    Edit sheet
                  </button>
                  {isDirty && (
                    <button
                      type="button"
                      className="admin-secondary-link"
                      disabled={savingSheet}
                      onClick={discardChanges}
                    >
                      Discard
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                className="admin-primary-btn"
                disabled={savingSheet || !isDirty}
                onClick={() => void handleSheetSave()}
              >
                {savingSheet ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>

          <div className="admin-table-wrap">
            {draftRows.length > 0 && (
            <table className={`admin-table${sheetEditing ? " admin-table-editing" : ""}`}>
              <thead>
                <tr>
                  {sheetEditing && <th>Section</th>}
                  <th>Carrier</th>
                  <th>Company #</th>
                  {sheetEditing ? (
                    <>
                      <th>E-App label</th>
                      <th>E-App URL</th>
                    </>
                  ) : (
                    <th>E-App link</th>
                  )}
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const carrier = row as CarrierFormState;
                  const draft = sheetEditing ? carrier : null;
                  const rowId = carrier.id ?? carrier.draftKey ?? `draft-${index}`;
                  const sectionTitle = carrier.section || "Other";
                  const previousSection = index > 0
                    ? rows[index - 1].section || "Other"
                    : null;
                  const showSectionDivider =
                    !sheetEditing && (index === 0 || previousSection !== sectionTitle);

                  return (
                    <Fragment key={rowId}>
                      {showSectionDivider && (
                        <tr className="admin-table-section-row">
                          <th colSpan={5} scope="colgroup">
                            {sectionTitle}
                          </th>
                        </tr>
                      )}
                      <tr>
                      {sheetEditing && draft && (
                        <td>
                          <input
                            type="text"
                            className="admin-table-input"
                            value={draft.section}
                            onChange={(event) =>
                              updateDraftRow(index, { section: event.target.value })
                            }
                            placeholder="Section"
                          />
                        </td>
                      )}
                      <td>
                        {sheetEditing && draft ? (
                          <input
                            type="text"
                            className="admin-table-input"
                            value={draft.carrier}
                            onChange={(event) => updateCarrierName(index, event.target.value)}
                            onPaste={(event) => handleCarrierPaste(index, event)}
                            placeholder="Carrier name"
                          />
                        ) : (
                          carrier.carrier || "—"
                        )}
                      </td>
                      <td>
                        {sheetEditing && draft ? (
                          <input
                            type="text"
                            className="admin-table-input"
                            value={draft.companyNumber}
                            onChange={(event) =>
                              updateDraftRow(index, { companyNumber: event.target.value })
                            }
                            placeholder="Company #"
                          />
                        ) : (
                          carrier.companyNumber || "—"
                        )}
                      </td>
                      {sheetEditing && draft ? (
                        <>
                          <td>
                            <input
                              type="text"
                              className="admin-table-input"
                              value={draft.eAppLabel}
                              onChange={(event) =>
                                updateDraftRow(index, { eAppLabel: event.target.value })
                              }
                              placeholder="Label"
                            />
                          </td>
                          <td>
                            <input
                              type="url"
                              className="admin-table-input admin-table-input-wide"
                              value={draft.eAppUrl}
                              onChange={(event) =>
                                updateDraftRow(index, { eAppUrl: event.target.value })
                              }
                              placeholder="https://..."
                            />
                          </td>
                        </>
                      ) : (
                        <td>
                          {carrier.eAppUrl ? (
                            <a
                              href={carrier.eAppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="admin-secondary-link"
                            >
                              {carrier.eAppLabel || carrier.eAppUrl}
                            </a>
                          ) : (
                            carrier.eAppLabel || "—"
                          )}
                        </td>
                      )}
                      <td>
                        {sheetEditing && draft ? (
                          <label className="admin-table-checkbox">
                            <input
                              type="checkbox"
                              checked={draft.published}
                              onChange={(event) =>
                                updateDraftRow(index, { published: event.target.checked })
                              }
                            />
                            <span>{draft.published ? "Published" : "Hidden"}</span>
                          </label>
                        ) : (
                          <span className={`admin-status${carrier.published ? " active" : ""}`}>
                            {carrier.published ? "Published" : "Hidden"}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="admin-incentive-actions">
                          <button
                            type="button"
                            className="admin-icon-btn"
                            disabled={index === 0 || savingSheet}
                            onClick={() => moveCarrier(index, -1)}
                            aria-label={`Move ${rowLabel(carrier)} up`}
                          >
                            <ArrowUp size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            disabled={index === rows.length - 1 || savingSheet}
                            onClick={() => moveCarrier(index, 1)}
                            aria-label={`Move ${rowLabel(carrier)} down`}
                          >
                            <ArrowDown size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            disabled={savingSheet}
                            onClick={() => removeDraftRow(index)}
                            aria-label={`Remove ${rowLabel(carrier)}`}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                            {sheetEditing ? "Remove" : "Delete"}
                          </button>
                        </div>
                      </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            )}

            {draftRows.length === 0 && (
              <p className="admin-empty">
                {sheetEditing
                  ? "No rows yet. Click Add row to start building the sheet."
                  : "No carrier rows in this draft. Edit the sheet to add a row or discard your changes."}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
