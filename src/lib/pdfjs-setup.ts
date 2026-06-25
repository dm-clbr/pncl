import { GlobalWorkerOptions } from "pdfjs-dist";

// Copied to public/ on postinstall — same origin, works in dev and production builds.
GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
