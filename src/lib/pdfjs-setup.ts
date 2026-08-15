import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// The legacy worker includes the same compatibility polyfills as the main PDF.js
// bundle. It is copied to public/ on postinstall so it stays same-origin in dev
// and production.
GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
