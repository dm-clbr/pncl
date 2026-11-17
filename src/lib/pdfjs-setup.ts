import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// Vite gives this compatible worker a content hash. An older open tab keeps
// its matching worker instead of fetching a different version after a release.
GlobalWorkerOptions.workerSrc = workerUrl;
