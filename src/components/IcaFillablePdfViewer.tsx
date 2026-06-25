import { ICA_PDF_URL, ICA_PDF_PAGES, ICA_TOTAL_PAGES } from "@/lib/onboarding-contract";
import { prefillIcaServerFields, syncIcaMirroredNameFields } from "@/lib/ica-prefill";
import { ICA_FORM_FIELDS, ICA_DEBIT_CHECK_INITIAL_FIELD_NAMES, ICA_DEBIT_CHECK_INITIAL_MAX_LENGTH } from "@/lib/ica-form-fields";
import "@/lib/pdfjs-setup";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";
import {
  EventBus,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import IcaFieldCallouts from "@/components/IcaFieldCallouts";
import IcaSignatureModal from "@/components/IcaSignatureModal";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export interface IcaFillablePdfViewerHandle {
  getPdfDocument: () => PDFDocumentProxy | null;
  getContainer: () => HTMLDivElement | null;
  getSignatureImage: () => string | null;
  /** Navigate to field pages and wait for AcroForm DOM inputs to mount. */
  ensureFieldPagesRendered: () => Promise<void>;
}

interface IcaFillablePdfViewerProps {
  className?: string;
  prefillLegalName?: string;
  prefillEmail?: string;
}

const PARSE_TIMEOUT_MS = 30_000;

const ICA_SECTION_JUMPS = [
  { label: "Introduction", page: ICA_PDF_PAGES.introduction },
  { label: "Signature", page: ICA_PDF_PAGES.signature },
  { label: "Debit-Check", page: ICA_PDF_PAGES.debitCheck },
] as const;

const FIELD_RENDER_PAGES = [ICA_PDF_PAGES.signature, ICA_PDF_PAGES.debitCheck] as const;

const FIELDS_BY_PAGE: Record<number, string[]> = {
  [ICA_PDF_PAGES.signature]: [ICA_FORM_FIELDS.fullName, ICA_FORM_FIELDS.email],
  [ICA_PDF_PAGES.debitCheck]: [
    ICA_FORM_FIELDS.signature,
    ICA_FORM_FIELDS.initialA,
    ICA_FORM_FIELDS.initialB,
    ICA_FORM_FIELDS.initialC,
    ICA_FORM_FIELDS.initialD,
    ICA_FORM_FIELDS.initialE,
  ],
};

async function fetchIcaPdfBytes(): Promise<Uint8Array> {
  const response = await fetch(ICA_PDF_URL);
  if (!response.ok) {
    throw new Error(`Unable to load agreement (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function loadWithTimeout(
  bytes: Uint8Array,
  options: DocumentInitParameters,
  timeoutMs = PARSE_TIMEOUT_MS,
): Promise<PDFDocumentProxy> {
  const task = getDocument({ data: bytes, verbosity: 0, ...options });

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      void task.destroy();
      reject(new Error("Timed out while opening the agreement"));
    }, timeoutMs);

    task.promise
      .then((doc) => {
        window.clearTimeout(timer);
        resolve(doc);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

async function loadIcaPdfDocument(): Promise<PDFDocumentProxy> {
  const bytes = await fetchIcaPdfBytes();

  try {
    return await loadWithTimeout(bytes, {});
  } catch {
    return loadWithTimeout(bytes, { disableWorker: true });
  }
}

function hasRenderedPages(viewer: HTMLElement | null): boolean {
  return Boolean(viewer?.querySelector(".page"));
}

function waitForFieldDom(
  container: HTMLElement,
  fieldId: string,
  timeoutMs = 4000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();

    const check = () => {
      const el = container.querySelector(`#pdfjs_internal_id_${fieldId}`);
      if (el) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      window.requestAnimationFrame(check);
    };

    check();
  });
}

const IcaFillablePdfViewer = forwardRef<IcaFillablePdfViewerHandle, IcaFillablePdfViewerProps>(
  function IcaFillablePdfViewer({ className, prefillLegalName = "", prefillEmail = "" }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<HTMLDivElement>(null);
    const pdfViewerRef = useRef<PDFViewer | null>(null);
    const eventBusRef = useRef<EventBus | null>(null);
    const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
    const fullNameFieldIdRef = useRef<string | null>(null);
    const loadGenerationRef = useRef(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [signatureImage, setSignatureImage] = useState<string | null>(null);
    const [signatureModalOpen, setSignatureModalOpen] = useState(false);
    const [signatureOverlayStyle, setSignatureOverlayStyle] = useState<CSSProperties | null>(null);
    const signatureFieldIdRef = useRef<string | null>(null);

    const syncHostHeightForPage = useCallback((page: number) => {
      const viewer = viewerRef.current;
      const host = hostRef.current;
      if (!viewer || !host) return;

      const safePage = Math.min(Math.max(page, 1), ICA_TOTAL_PAGES);
      const pageEl = viewer.querySelector<HTMLElement>(`.page[data-page-number="${safePage}"]`);
      if (pageEl && pageEl.offsetHeight > 0) {
        host.style.height = `${pageEl.offsetHeight}px`;
      }
    }, []);

    const syncVisiblePageLayout = useCallback((page = pdfViewerRef.current?.currentPageNumber ?? 1) => {
      const pdfViewer = pdfViewerRef.current;
      if (!pdfViewer) return;

      const safePage = Math.min(Math.max(page, 1), ICA_TOTAL_PAGES);
      pdfViewer.currentScaleValue = "page-width";

      if (pdfViewer.currentPageNumber !== safePage) {
        pdfViewer.currentPageNumber = safePage;
      }

      try {
        pdfViewer.scrollPageIntoView({ pageNumber: safePage });
      } catch {
        // Target page may not be rendered yet; pagerendered will sync layout.
      }

      syncHostHeightForPage(safePage);
    }, [syncHostHeightForPage]);

    const goToPage = useCallback(
      (page: number) => {
        const safePage = Math.min(Math.max(page, 1), ICA_TOTAL_PAGES);
        setCurrentPage(safePage);
        syncVisiblePageLayout(safePage);
      },
      [syncVisiblePageLayout],
    );

    const ensureFieldPagesRendered = useCallback(async () => {
      const pdfDocumentLocal = pdfDocRef.current;
      const container = containerRef.current;
      const pdfViewer = pdfViewerRef.current;
      if (!pdfDocumentLocal || !container || !pdfViewer) {
        throw new Error("The agreement is still loading.");
      }

      const fieldObjects = await pdfDocumentLocal.getFieldObjects();
      if (!fieldObjects) {
        throw new Error("This agreement PDF has no fillable fields.");
      }

      for (const page of FIELD_RENDER_PAGES) {
        goToPage(page);
        await new Promise((resolve) => window.requestAnimationFrame(resolve));

        for (const fieldName of FIELDS_BY_PAGE[page] ?? []) {
          const entry = fieldObjects[fieldName]?.[0];
          if (!entry?.id) continue;

          const found = await waitForFieldDom(container, entry.id);
          if (!found) {
            throw new Error("Unable to load all agreement fields. Please try again.");
          }
        }
      }
    }, [goToPage]);

    useImperativeHandle(ref, () => ({
      getPdfDocument: () => pdfDocRef.current,
      getContainer: () => containerRef.current,
      getSignatureImage: () => signatureImage,
      ensureFieldPagesRendered,
    }));

    useEffect(() => {
      const container = containerRef.current;
      const viewer = viewerRef.current;
      if (!container || !viewer) {
        setError("PDF viewer failed to mount.");
        setLoading(false);
        return;
      }

      const generation = ++loadGenerationRef.current;
      let pdfViewer: PDFViewer | null = null;
      let pdfDocumentLocal: PDFDocumentProxy | null = null;
      let eventBus: EventBus | null = null;
      let loadingTimeout: number | undefined;
      let pageObserver: MutationObserver | undefined;

      const isCurrent = () => generation === loadGenerationRef.current;

      const markReady = () => {
        if (!isCurrent()) return;
        setLoading(false);
        setViewerReady(true);
      };

      const handleLoadError = (loadError: unknown) => {
        if (!isCurrent()) return;
        const message =
          loadError instanceof Error ? loadError.message : "Unable to load agreement";
        setError(message);
        setLoading(false);
      };

      const watchForRenderedPages = () => {
        pageObserver?.disconnect();
        if (hasRenderedPages(viewer)) {
          markReady();
          return;
        }

        pageObserver = new MutationObserver(() => {
          if (hasRenderedPages(viewer)) {
            markReady();
            pageObserver?.disconnect();
          }
        });
        pageObserver.observe(viewer, { childList: true, subtree: true });
      };

      let handlePagesLoaded: (() => void) | undefined;
      let handlePageChanging: ((event: { pageNumber: number }) => void) | undefined;
      let handlePageRendered: ((event: { pageNumber: number }) => void) | undefined;

      try {
        eventBus = new EventBus();
        eventBusRef.current = eventBus;
        const linkService = new PDFLinkService({ eventBus });
        pdfViewer = new PDFViewer({
          container,
          viewer,
          eventBus,
          linkService,
          removePageBorders: true,
        });

        linkService.setViewer(pdfViewer);
        pdfViewerRef.current = pdfViewer;

        handlePagesLoaded = () => {
          if (!isCurrent()) return;
          goToPage(1);
          markReady();
        };

        handlePageChanging = (event: { pageNumber: number }) => {
          if (!isCurrent()) return;
          setCurrentPage(event.pageNumber);
        };

        handlePageRendered = (event: { pageNumber: number }) => {
          if (!isCurrent()) return;
          if (event.pageNumber !== pdfViewer?.currentPageNumber) return;
          syncHostHeightForPage(event.pageNumber);
        };

        eventBus.on("pagesloaded", handlePagesLoaded);
        eventBus.on("pagesinit", markReady);
        eventBus.on("pagechanging", handlePageChanging);
        eventBus.on("pagerendered", handlePageRendered);

        loadingTimeout = window.setTimeout(() => {
          if (!isCurrent()) return;
          if (hasRenderedPages(viewer) || pdfDocRef.current) {
            markReady();
            return;
          }
          setError("The agreement is taking too long to load. Try refreshing or open it in a new tab.");
          setLoading(false);
        }, PARSE_TIMEOUT_MS + 5_000);

        watchForRenderedPages();

        void loadIcaPdfDocument()
          .then(async (doc) => {
            if (!isCurrent()) {
              void doc.destroy();
              return;
            }

            pdfDocumentLocal = doc;
            pdfDocRef.current = doc;
            setPdfDocument(doc);
            pdfViewer?.setDocument(doc);
            linkService.setDocument(doc, null);

            window.requestAnimationFrame(() => {
              if (hasRenderedPages(viewer)) {
                markReady();
              }
            });
          })
          .catch(handleLoadError);
      } catch (initError) {
        handleLoadError(initError);
      }

      return () => {
        loadGenerationRef.current += 1;
        window.clearTimeout(loadingTimeout);
        pageObserver?.disconnect();
        if (handlePagesLoaded) eventBus?.off("pagesloaded", handlePagesLoaded);
        eventBus?.off("pagesinit", markReady);
        if (handlePageChanging) eventBus?.off("pagechanging", handlePageChanging);
        if (handlePageRendered) eventBus?.off("pagerendered", handlePageRendered);
        pdfViewer?.setDocument(null);
        pdfViewerRef.current = null;
        eventBusRef.current = null;
        void pdfDocumentLocal?.destroy();
        pdfDocRef.current = null;
        fullNameFieldIdRef.current = null;
        setPdfDocument(null);
        setViewerReady(false);
      };
    }, [goToPage, syncHostHeightForPage, syncVisiblePageLayout]);

    useEffect(() => {
      const container = containerRef.current;
      if (!viewerReady || !container) return;

      const refit = () => syncVisiblePageLayout(currentPage);

      window.addEventListener("resize", refit);
      const resizeObserver = new ResizeObserver(refit);
      resizeObserver.observe(container);

      return () => {
        window.removeEventListener("resize", refit);
        resizeObserver.disconnect();
      };
    }, [currentPage, syncVisiblePageLayout, viewerReady]);

    useEffect(() => {
      const container = containerRef.current;
      const pdfDocumentLocal = pdfDocRef.current;
      if (!viewerReady || !container || !pdfDocumentLocal) return;

      void (async () => {
        await prefillIcaServerFields(pdfDocumentLocal, container, {
          legalName: prefillLegalName,
          email: prefillEmail,
        });

        const fieldObjects = await pdfDocumentLocal.getFieldObjects();
        const fullNameEntry = fieldObjects?.[ICA_FORM_FIELDS.fullName]?.[0];
        if (fullNameEntry?.id) {
          fullNameFieldIdRef.current = fullNameEntry.id;
        }
      })();
    }, [viewerReady, pdfDocument, prefillLegalName, prefillEmail]);

    useEffect(() => {
      const container = containerRef.current;
      const pdfDocumentLocal = pdfDocRef.current;
      if (!viewerReady || !container || !pdfDocumentLocal) return;

      const boundInputs = new Map<HTMLInputElement, () => void>();

      const bindInitialFieldInputs = () => {
        if (currentPage !== ICA_PDF_PAGES.debitCheck) return;

        void pdfDocumentLocal.getFieldObjects().then((fieldObjects) => {
          if (!fieldObjects) return;

          for (const fieldName of ICA_DEBIT_CHECK_INITIAL_FIELD_NAMES) {
            const entry = fieldObjects[fieldName]?.[0];
            if (!entry?.id) continue;

            const input = container.querySelector(
              `#pdfjs_internal_id_${entry.id}`,
            ) as HTMLInputElement | null;
            if (!input || boundInputs.has(input)) continue;

            input.maxLength = ICA_DEBIT_CHECK_INITIAL_MAX_LENGTH;
            input.classList.add("ica-initial-field-input");

            const normalizeInput = () => {
              const lettersOnly = input.value.replace(/[^a-zA-Z]/g, "").toUpperCase();
              const next = lettersOnly.slice(0, ICA_DEBIT_CHECK_INITIAL_MAX_LENGTH);
              if (input.value !== next) {
                input.value = next;
              }
            };

            input.addEventListener("input", normalizeInput);
            boundInputs.set(input, () => input.removeEventListener("input", normalizeInput));
          }
        });
      };

      bindInitialFieldInputs();

      const observer = new MutationObserver(bindInitialFieldInputs);
      observer.observe(container, { childList: true, subtree: true });

      return () => {
        observer.disconnect();
        for (const cleanup of boundInputs.values()) cleanup();
        boundInputs.clear();
      };
    }, [currentPage, viewerReady, pdfDocument]);

    useEffect(() => {
      const container = containerRef.current;
      const pdfDocumentLocal = pdfDocRef.current;
      if (!viewerReady || !container || !pdfDocumentLocal) return;

      const handleInput = (event: Event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;

        const fullNameId = fullNameFieldIdRef.current;
        if (!fullNameId || target.id !== `pdfjs_internal_id_${fullNameId}`) return;

        void syncIcaMirroredNameFields(pdfDocumentLocal, container, target.value.trim());
      };

      container.addEventListener("input", handleInput);
      return () => container.removeEventListener("input", handleInput);
    }, [viewerReady, pdfDocument]);

    useEffect(() => {
      const container = containerRef.current;
      if (!viewerReady || !container) return;

      const fieldId = signatureFieldIdRef.current;
      if (!fieldId) return;

      const input = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as HTMLInputElement | null;
      if (!input) return;

      input.readOnly = true;
      input.tabIndex = -1;
      input.placeholder = "Draw signature";
      input.classList.add("ica-signature-field-input");

      const openModal = () => setSignatureModalOpen(true);
      input.addEventListener("click", openModal);
      return () => input.removeEventListener("click", openModal);
    }, [currentPage, viewerReady]);

    useEffect(() => {
      const container = containerRef.current;
      const pdfDocumentLocal = pdfDocRef.current;
      if (!viewerReady || !container || !pdfDocumentLocal) return;

      void pdfDocumentLocal.getFieldObjects().then((fieldObjects) => {
        const entry = fieldObjects?.[ICA_FORM_FIELDS.signature]?.[0];
        signatureFieldIdRef.current = entry?.id ?? null;
      });
    }, [viewerReady, pdfDocument]);

    const layoutSignatureOverlay = useCallback(() => {
      const container = containerRef.current;
      const host = hostRef.current;
      const fieldId = signatureFieldIdRef.current;
      if (!signatureImage || !container || !host || !fieldId || currentPage !== ICA_PDF_PAGES.debitCheck) {
        setSignatureOverlayStyle(null);
        return;
      }

      const input = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as HTMLElement | null;
      if (!input) {
        setSignatureOverlayStyle(null);
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      if (inputRect.width === 0 || inputRect.height === 0) {
        setSignatureOverlayStyle(null);
        return;
      }

      setSignatureOverlayStyle({
        top: inputRect.top - hostRect.top,
        left: inputRect.left - hostRect.left,
        width: inputRect.width,
        height: inputRect.height,
      });
    }, [currentPage, signatureImage]);

    useEffect(() => {
      layoutSignatureOverlay();
      window.addEventListener("resize", layoutSignatureOverlay);
      const container = containerRef.current;
      container?.addEventListener("scroll", layoutSignatureOverlay, { passive: true });
      return () => {
        window.removeEventListener("resize", layoutSignatureOverlay);
        container?.removeEventListener("scroll", layoutSignatureOverlay);
      };
    }, [layoutSignatureOverlay]);

    const progressPercent = Math.round((currentPage / ICA_TOTAL_PAGES) * 100);

    return (
      <div className={`ica-fillable-pdf${className ? ` ${className}` : ""}`}>
        <div className="ica-fillable-pdf-head">
          <span>Independent Contractor Agreement</span>
          <span className="ica-fillable-pdf-head-meta">
            {loading && !error ? (
              <span className="ica-fillable-pdf-head-status">Loading…</span>
            ) : (
              <>Page {currentPage} of {ICA_TOTAL_PAGES}</>
            )}
          </span>
        </div>

        {!loading && !error && (
          <div className="ica-fillable-pdf-toolbar">
            <div className="ica-fillable-pdf-nav">
              <button
                type="button"
                className="ica-fillable-pdf-nav-btn"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Previous page"
              >
                ← Prev
              </button>
              <label className="ica-fillable-pdf-page-input">
                <span className="sr-only">Page number</span>
                <input
                  type="number"
                  min={1}
                  max={ICA_TOTAL_PAGES}
                  value={currentPage}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    if (!Number.isNaN(next)) goToPage(next);
                  }}
                />
                <span>/ {ICA_TOTAL_PAGES}</span>
              </label>
              <button
                type="button"
                className="ica-fillable-pdf-nav-btn"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= ICA_TOTAL_PAGES}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>
            <div className="ica-fillable-pdf-progress" aria-hidden="true">
              <div
                className="ica-fillable-pdf-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="ica-fillable-pdf-jumps">
              {ICA_SECTION_JUMPS.map((section) => (
                <button
                  key={section.page}
                  type="button"
                  className={`ica-fillable-pdf-jump-btn${currentPage === section.page ? " active" : ""}`}
                  onClick={() => goToPage(section.page)}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={hostRef} className="ica-fillable-pdf-host">
          {error && (
            <div className="ica-fillable-pdf-error">
              <p>{error}</p>
              <a href={ICA_PDF_URL} target="_blank" rel="noopener noreferrer">
                Open PDF in new tab
              </a>
            </div>
          )}
          <div ref={containerRef} className="ica-fillable-pdf-container ica-fillable-pdf-container--paged">
            <div ref={viewerRef} className="pdfViewer" />
          </div>
          <IcaFieldCallouts
            containerRef={containerRef}
            hostRef={hostRef}
            pdfDocument={pdfDocument}
            currentPage={currentPage}
            active={viewerReady && !error}
            signatureImage={signatureImage}
            onSignatureRequest={() => setSignatureModalOpen(true)}
          />
          {signatureOverlayStyle && (
            <div className="ica-signature-preview-overlay" style={signatureOverlayStyle}>
              <img src={signatureImage} alt="Your signature" className="ica-signature-preview-image" />
            </div>
          )}
        </div>
        <IcaSignatureModal
          open={signatureModalOpen}
          initialImage={signatureImage}
          onClose={() => setSignatureModalOpen(false)}
          onSave={(dataUrl) => {
            setSignatureImage(dataUrl);
            setSignatureModalOpen(false);
          }}
        />
        <a
          href={ICA_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ica-fillable-pdf-link"
        >
          Open full agreement in a new tab
        </a>
      </div>
    );
  },
);

export default IcaFillablePdfViewer;
