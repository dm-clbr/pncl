import { syncW9FormFieldsFromDom } from "@/lib/w9-acroform";
import { W9_PDF_URL, W9_PDF_PAGES, W9_TOTAL_PAGES } from "@/lib/w9-form";
import { prefillW9Fields, refreshW9SignatureDate } from "@/lib/w9-prefill";
import "@/lib/pdfjs-setup";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  EventBus,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/legacy/web/pdf_viewer.mjs";
import "pdfjs-dist/legacy/web/pdf_viewer.css";
import W9FieldCallouts from "@/components/W9FieldCallouts";
import Segmented, { panelAria } from "@/components/portal/Segmented";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface W9FillablePdfViewerHandle {
  getPdfDocument: () => PDFDocumentProxy | null;
  getContainer: () => HTMLDivElement | null;
  ensureFieldPagesRendered: () => Promise<void>;
}

interface W9FillablePdfViewerProps {
  className?: string;
  prefillLegalName?: string;
  /** Rendered at the end of the pager bar: the Sign button, a Back link. */
  actions?: ReactNode;
  onPageChange?: (page: number) => void;
}

const PARSE_TIMEOUT_MS = 30_000;

const W9_HOST_ID = "w9-pdf-host";

const W9_SECTION_JUMPS = [
  { label: "Form", page: W9_PDF_PAGES.form },
  { label: "Instructions", page: 2 },
] as const;

const W9_JUMP_ITEMS = W9_SECTION_JUMPS.map((section) => ({
  value: String(section.page),
  label: section.label,
  id: `${W9_HOST_ID}-jump-${section.page}`,
  controls: W9_HOST_ID,
}));

async function fetchW9PdfBytes(): Promise<Uint8Array> {
  const response = await fetch(W9_PDF_URL);
  if (!response.ok) {
    throw new Error(`Unable to load W-9 (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function loadWithTimeout(
  bytes: Uint8Array,
  timeoutMs = PARSE_TIMEOUT_MS,
): Promise<PDFDocumentProxy> {
  const task = getDocument({ data: bytes, verbosity: 0 });

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      void task.destroy();
      reject(new Error("Timed out while opening the W-9"));
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

async function loadW9PdfDocument(): Promise<PDFDocumentProxy> {
  const bytes = await fetchW9PdfBytes();
  try {
    return await loadWithTimeout(bytes);
  } catch {
    // pdf.js falls back to a main-thread worker on its own, so the retry only
    // needs to cover a transient fetch/parse failure.
    return loadWithTimeout(bytes);
  }
}

function hasRenderedPages(viewer: HTMLElement | null): boolean {
  return Boolean(viewer?.querySelector(".page"));
}

const W9FillablePdfViewer = forwardRef<W9FillablePdfViewerHandle, W9FillablePdfViewerProps>(
  function W9FillablePdfViewer(
    { className, prefillLegalName = "", actions, onPageChange },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<HTMLDivElement>(null);
    const pdfViewerRef = useRef<PDFViewer | null>(null);
    const eventBusRef = useRef<EventBus | null>(null);
    const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
    const loadGenerationRef = useRef(0);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    const syncHostHeightForPage = useCallback((page: number) => {
      const viewer = viewerRef.current;
      const host = hostRef.current;
      if (!viewer || !host) return;

      const safePage = Math.min(Math.max(page, 1), W9_TOTAL_PAGES);
      const pageEl = viewer.querySelector<HTMLElement>(`.page[data-page-number="${safePage}"]`);
      if (pageEl && pageEl.offsetHeight > 0) {
        host.style.height = `${pageEl.offsetHeight}px`;
      }
    }, []);

    const syncVisiblePageLayout = useCallback((page = pdfViewerRef.current?.currentPageNumber ?? 1) => {
      const pdfViewer = pdfViewerRef.current;
      if (!pdfViewer) return;

      const safePage = Math.min(Math.max(page, 1), W9_TOTAL_PAGES);
      pdfViewer.currentScaleValue = "page-width";

      if (pdfViewer.currentPageNumber !== safePage) {
        pdfViewer.currentPageNumber = safePage;
      }

      try {
        pdfViewer.scrollPageIntoView({ pageNumber: safePage });
      } catch {
        // page may not be rendered yet
      }

      syncHostHeightForPage(safePage);
    }, [syncHostHeightForPage]);

    const goToPage = useCallback(
      (page: number) => {
        const safePage = Math.min(Math.max(page, 1), W9_TOTAL_PAGES);
        setCurrentPage(safePage);
        syncVisiblePageLayout(safePage);
      },
      [syncVisiblePageLayout],
    );

    const ensureFieldPagesRendered = useCallback(async () => {
      const pdfDocumentLocal = pdfDocRef.current;
      const container = containerRef.current;
      if (!pdfDocumentLocal || !container) {
        throw new Error("The W-9 is still loading.");
      }

      goToPage(W9_PDF_PAGES.form);

      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        if (container.querySelector(`.page[data-page-number="${W9_PDF_PAGES.form}"]`)) break;
      }

      container.scrollTop = container.scrollHeight;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      await syncW9FormFieldsFromDom(container, pdfDocumentLocal);
    }, [goToPage]);

    useImperativeHandle(ref, () => ({
      getPdfDocument: () => pdfDocRef.current,
      getContainer: () => containerRef.current,
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
        setError(loadError instanceof Error ? loadError.message : "Unable to load W-9");
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
          goToPage(W9_PDF_PAGES.form);
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
          setError("The W-9 is taking too long to load. Try refreshing or open it in a new tab.");
          setLoading(false);
        }, PARSE_TIMEOUT_MS + 5_000);

        watchForRenderedPages();

        void loadW9PdfDocument()
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
              if (hasRenderedPages(viewer)) markReady();
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

      void prefillW9Fields(pdfDocumentLocal, container, { legalName: prefillLegalName });
    }, [viewerReady, pdfDocument, prefillLegalName]);

    useEffect(() => {
      const container = containerRef.current;
      const pdfDocumentLocal = pdfDocRef.current;
      if (!viewerReady || !container || !pdfDocumentLocal) return;

      void refreshW9SignatureDate(pdfDocumentLocal, container);
    }, [viewerReady, pdfDocument]);

    // Notifies the owner of the page the viewer is showing. pdf.js raises
    // pagechanging on scroll as well as on a jump, so this follows both.
    useEffect(() => {
      onPageChange?.(currentPage);
    }, [currentPage, onPageChange]);

    const progressPercent = Math.round((currentPage / W9_TOTAL_PAGES) * 100);
    const chromeReady = !loading && !error;
    // The host is the tabs' panel only on a page a jump owns; on every other
    // page no tab is selected, so it takes a plain page name instead.
    const hostAria = chromeReady
      ? panelAria(W9_JUMP_ITEMS, String(currentPage), `Page ${currentPage} of ${W9_TOTAL_PAGES}`)
      : {};

    return (
      <div className={`pforms-doc${className ? ` ${className}` : ""}`}>
        {chromeReady && (
          <div className="pforms-jumps">
            <Segmented
              items={W9_JUMP_ITEMS}
              value={String(currentPage)}
              onChange={(value) => goToPage(Number(value))}
              label="W-9 sections"
            />
          </div>
        )}

        <div
          ref={hostRef}
          id={W9_HOST_ID}
          className="ica-fillable-pdf-host"
          {...hostAria}
        >
          {loading && !error && (
            <p className="pforms-doc-status">
              <span className="pforms-doc-spinner" aria-hidden="true" />
              Loading&#8230;
            </p>
          )}
          {error && (
            <div className="ica-fillable-pdf-error">
              <p>{error}</p>
              <a href={W9_PDF_URL} target="_blank" rel="noopener noreferrer">
                Open PDF in new tab
              </a>
            </div>
          )}
          <div ref={containerRef} className="ica-fillable-pdf-container ica-fillable-pdf-container--paged">
            <div ref={viewerRef} className="pdfViewer" />
          </div>
          <W9FieldCallouts
            containerRef={containerRef}
            hostRef={hostRef}
            pdfDocument={pdfDocument}
            currentPage={currentPage}
            active={viewerReady && !error}
          />
        </div>
        {!chromeReady && actions && (
          // The pager is chrome for a loaded document, but the actions slot
          // carries the step's Back control, and on the public onboarding funnel
          // that is the only way out of the contract step. So the slot keeps its
          // own row when the pager is suppressed.
          <div className="pforms-pager-actions pforms-pager-actions--bare">{actions}</div>
        )}
        {chromeReady && (
          <div className="pforms-pager">
            <div className="pforms-pager-progress" aria-hidden="true">
              <div className="pforms-pager-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="pforms-pager-row">
              <button
                type="button"
                className="pforms-pager-btn"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                Prev
              </button>
              <label className="pforms-pager-count">
                <span className="sr-only">Page number</span>
                <input
                  type="number"
                  name="page"
                  inputMode="numeric"
                  min={1}
                  max={W9_TOTAL_PAGES}
                  value={currentPage}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    if (!Number.isNaN(next)) goToPage(next);
                  }}
                />
                <span>of {W9_TOTAL_PAGES}</span>
              </label>
              <button
                type="button"
                className="pforms-pager-btn"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= W9_TOTAL_PAGES}
              >
                Next
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              {actions && <div className="pforms-pager-actions">{actions}</div>}
            </div>
          </div>
        )}

        <a href={W9_PDF_URL} target="_blank" rel="noopener noreferrer" className="ica-fillable-pdf-link">
          Open full W-9 in a new tab
        </a>
      </div>
    );
  },
);

export default W9FillablePdfViewer;
