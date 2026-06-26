import { syncW9FormFieldsFromDom } from "@/lib/w9-acroform";
import { W9_PDF_URL, W9_PDF_PAGES, W9_TOTAL_PAGES } from "@/lib/w9-form";
import { prefillW9Fields, refreshW9SignatureDate } from "@/lib/w9-prefill";
import "@/lib/pdfjs-setup";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";
import {
  EventBus,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import W9FieldCallouts from "@/components/W9FieldCallouts";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface W9FillablePdfViewerHandle {
  getPdfDocument: () => PDFDocumentProxy | null;
  getContainer: () => HTMLDivElement | null;
  ensureFieldPagesRendered: () => Promise<void>;
}

interface W9FillablePdfViewerProps {
  className?: string;
  prefillLegalName?: string;
}

const PARSE_TIMEOUT_MS = 30_000;

const W9_SECTION_JUMPS = [
  { label: "Form", page: W9_PDF_PAGES.form },
  { label: "Instructions", page: 2 },
] as const;

async function fetchW9PdfBytes(): Promise<Uint8Array> {
  const response = await fetch(W9_PDF_URL);
  if (!response.ok) {
    throw new Error(`Unable to load W-9 (${response.status})`);
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
    return await loadWithTimeout(bytes, {});
  } catch {
    return loadWithTimeout(bytes, { disableWorker: true });
  }
}

function hasRenderedPages(viewer: HTMLElement | null): boolean {
  return Boolean(viewer?.querySelector(".page"));
}

const W9FillablePdfViewer = forwardRef<W9FillablePdfViewerHandle, W9FillablePdfViewerProps>(
  function W9FillablePdfViewer({ className, prefillLegalName = "" }, ref) {
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

    const progressPercent = Math.round((currentPage / W9_TOTAL_PAGES) * 100);

    return (
      <div className={`ica-fillable-pdf${className ? ` ${className}` : ""}`}>
        <div className="ica-fillable-pdf-head">
          <span>Form W-9</span>
          <span className="ica-fillable-pdf-head-meta">
            {loading && !error ? (
              <span className="ica-fillable-pdf-head-status">Loading…</span>
            ) : (
              <>Page {currentPage} of {W9_TOTAL_PAGES}</>
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
                  max={W9_TOTAL_PAGES}
                  value={currentPage}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    if (!Number.isNaN(next)) goToPage(next);
                  }}
                />
                <span>/ {W9_TOTAL_PAGES}</span>
              </label>
              <button
                type="button"
                className="ica-fillable-pdf-nav-btn"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= W9_TOTAL_PAGES}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>
            <div className="ica-fillable-pdf-progress" aria-hidden="true">
              <div className="ica-fillable-pdf-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="ica-fillable-pdf-jumps">
              {W9_SECTION_JUMPS.map((section) => (
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
        <a href={W9_PDF_URL} target="_blank" rel="noopener noreferrer" className="ica-fillable-pdf-link">
          Open full W-9 in a new tab
        </a>
      </div>
    );
  },
);

export default W9FillablePdfViewer;
