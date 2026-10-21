/**
 * pdf.js worker must be same-origin so it can read blob: URLs and local PDF bytes.
 * pdfjs-dist version must match react-pdf (see package.json).
 *
 * The worker is imported with Vite's `?worker` suffix instead of pointing
 * `workerSrc` at the emitted `pdf.worker.min-*.mjs` asset: production Apache
 * has no MIME type registered for `.mjs`, so it served that file with no
 * Content-Type at all — and with `X-Content-Type-Options: nosniff` the
 * browser refuses to execute it as a module ("Setting up fake worker failed:
 * Failed to fetch dynamically imported module"). A `?worker` import is
 * emitted as a plain `.js` chunk, which every static host serves correctly.
 */
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

export function applyPdfJsWorker(pdfjs) {
    try {
        pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
    } catch {
        // Fallback for environments where Worker construction is unavailable.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
        ).toString();
    }
}

export function getPdfDocumentOptions(pdfjsVersion) {
    const version = pdfjsVersion || '4.4.168';
    return {
        cMapUrl: `https://unpkg.com/pdfjs-dist@${version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${version}/standard_fonts/`,
        verbosity: 0,
    };
}

let reactPdfJsVersion = null;

export function setReactPdfJsVersion(version) {
    reactPdfJsVersion = version;
}

let cachedReactPdfOptions = null;
let cachedReactPdfOptionsVersion = null;

/**
 * react-pdf compares the `options` prop by reference: a fresh (but equal)
 * object on every render makes <Document> destroy and recreate its pdf.js
 * transport — while <TextLayer> is still streaming from the old one, which
 * throws `can't access property "sendWithStream", messageHandler is null`
 * and, without an error boundary, crashes the whole tree (e.g. the blocking
 * onboarding policy modal). Always hand back the same frozen object.
 */
export function getReactPdfDocumentOptions() {
    const version = reactPdfJsVersion || '4.4.168';
    if (!cachedReactPdfOptions || cachedReactPdfOptionsVersion !== version) {
        cachedReactPdfOptions = Object.freeze(getPdfDocumentOptions(version));
        cachedReactPdfOptionsVersion = version;
    }
    return cachedReactPdfOptions;
}

export function formatPdfFetchError(err) {
    const status = err.response?.status;
    if (status === 404) {
        return 'This document file is missing from storage. Please ask HR to re-upload the PDF.';
    }
    if (status === 403) {
        return 'You do not have permission to view this document.';
    }
    const apiMsg = err.response?.data?.error;
    if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg;
    if (err.message?.includes('API version') && err.message?.includes('Worker version')) {
        return 'PDF viewer configuration error. Please refresh the page and try again.';
    }
    if (err.message?.includes('detached')) {
        return 'Failed to load PDF document. Please close and open the viewer again.';
    }
    return err.message || 'Failed to load PDF.';
}

/** Create a blob URL for react-pdf (worker fetches the URL; no ArrayBuffer transfer). */
export function createPdfBlobUrl(arrayBuffer) {
    const blob = new Blob([arrayBuffer.slice(0)], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
}

export function revokePdfBlobUrl(url) {
    if (url) URL.revokeObjectURL(url);
}
