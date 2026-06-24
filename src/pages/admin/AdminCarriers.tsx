import { useEffect, useState, type ClipboardEvent } from "react";
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
import type { UpsertCarrierPayload } from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

type CarrierFormState = {
  id?: string;
  draftKey?: string;
  carrier: string;
  companyNumber: string;
  eAppLabel: string;
  eAppUrl: string;
  published: boolean;
};

const EMPTY_FORM: CarrierFormState = {
  carrier: "",
  companyNumber: "",
  eAppLabel: "",
  eAppUrl: "",
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

function createDraftRowFromCarrierName(carrier: string): CarrierFormState {
  return {
    ...createEmptyDraftRow(),
    carrier,
    eAppLabel: carrier,
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
    rowsToInsert.push(createDraftRowFromCarrierName(name));
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
  const { carriers, loading, error, saveMany, remove, reorder } = useAdminCarriers();
  const [sheetEditing, setSheetEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<CarrierFormState[]>([]);
  const [savingSheet, setSavingSheet] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Carriers — PNCL Admin";
    trackPageView("admin_carriers");
  }, []);

  const startSheetEdit = () => {
    setDraftRows(carriers.length > 0 ? carriers.map(toFormState) : [createEmptyDraftRow()]);
    setSheetEditing(true);
  };

  const cancelSheetEdit = () => {
    setSheetEditing(false);
    setDraftRows([]);
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
    setDraftRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSheetSave = async () => {
    const rowsToSave = prepareDraftRowsForSave(draftRows);
    if (rowsToSave.length === 0) {
      toast.error("Add at least one carrier row before saving.");
      return;
    }

    const validationError = validateDraftRows(rowsToSave);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSavingSheet(true);
    try {
      const existingCount = carriers.length;
      let nextNewSortOrder = existingCount;
      const payloads = rowsToSave.map((row) => {
        if (row.id) {
          return toPayload(row);
        }
        const payload = toPayload(row, nextNewSortOrder);
        nextNewSortOrder += 1;
        return payload;
      });
      await saveMany(payloads);
      toast.success("Carrier sheet saved.");
      cancelSheetEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save carrier sheet");
    } finally {
      setSavingSheet(false);
    }
  };

  const handleDelete = async (carrier: AdminCarrierSummary) => {
    if (!window.confirm(`Delete ${rowLabel(carrier)}?`)) return;

    setDeletingId(carrier.id);
    try {
      const result = await remove(carrier.id);
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete carrier");
    } finally {
      setDeletingId(null);
    }
  };

  const moveCarrier = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= carriers.length) return;

    const reordered = [...carriers];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];

    setReorderingId(reordered[nextIndex].id);
    try {
      const result = await reorder(reordered.map((carrier) => carrier.id));
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to reorder carriers");
    } finally {
      setReorderingId(null);
    }
  };

  const rows = sheetEditing ? draftRows : carriers;

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
            {sheetEditing ? (
              <>
                <p className="admin-inline-note">
                  {draftRows.length > 0
                    ? "Paste a multi-line carrier list into any carrier name field to create rows automatically."
                    : "Add a row or paste a carrier list into the carrier name field."}
                </p>
                <div className="admin-sheet-toolbar-actions">
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
                    className="admin-primary-btn"
                    disabled={savingSheet}
                    onClick={() => void handleSheetSave()}
                  >
                    {savingSheet ? "Saving..." : "Save sheet"}
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-link"
                    disabled={savingSheet}
                    onClick={cancelSheetEdit}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="admin-primary-btn" onClick={startSheetEdit}>
                <Pencil size={16} aria-hidden="true" />
                Edit sheet
              </button>
            )}
          </div>

          <div className="admin-table-wrap">
            {(sheetEditing || carriers.length > 0) && (
            <table className={`admin-table${sheetEditing ? " admin-table-editing" : ""}`}>
              <thead>
                <tr>
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
                  const carrier = sheetEditing ? null : (row as AdminCarrierSummary);
                  const draft = sheetEditing ? (row as CarrierFormState) : null;
                  const rowId = sheetEditing
                    ? draft?.id ?? draft?.draftKey ?? `draft-${index}`
                    : carrier!.id;
                  const isDeleting = carrier ? deletingId === carrier.id : false;
                  const isReordering = carrier ? reorderingId === carrier.id : false;

                  return (
                    <tr key={rowId}>
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
                          carrier?.carrier || "—"
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
                          carrier?.companyNumber || "—"
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
                          {carrier?.eAppUrl ? (
                            <a
                              href={carrier.eAppUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="admin-secondary-link"
                            >
                              {carrier.eAppLabel || carrier.eAppUrl}
                            </a>
                          ) : (
                            carrier?.eAppLabel || "—"
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
                          <span className={`admin-status${carrier?.published ? " active" : ""}`}>
                            {carrier?.published ? "Published" : "Hidden"}
                          </span>
                        )}
                      </td>
                      <td>
                        {sheetEditing && draft ? (
                          !draft.id ? (
                            <button
                              type="button"
                              className="admin-icon-btn"
                              onClick={() => removeDraftRow(index)}
                              aria-label={`Remove ${rowLabel(draft)}`}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                              Remove
                            </button>
                          ) : null
                        ) : carrier ? (
                          <div className="admin-incentive-actions">
                            <button
                              type="button"
                              className="admin-icon-btn"
                              disabled={index === 0 || isReordering}
                              onClick={() => void moveCarrier(index, -1)}
                              aria-label={`Move ${rowLabel(carrier)} up`}
                            >
                              <ArrowUp size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              disabled={index === carriers.length - 1 || isReordering}
                              onClick={() => void moveCarrier(index, 1)}
                              aria-label={`Move ${rowLabel(carrier)} down`}
                            >
                              <ArrowDown size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              disabled={isDeleting}
                              onClick={() => void handleDelete(carrier)}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}

            {!sheetEditing && carriers.length === 0 && (
              <p className="admin-empty">No carrier rows yet. Use Edit sheet to add your first rows.</p>
            )}

            {sheetEditing && draftRows.length === 0 && (
              <p className="admin-empty">No rows yet. Click Add row to start building the sheet.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
