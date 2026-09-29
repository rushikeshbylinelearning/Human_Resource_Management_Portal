/**
 * pdf.js worker must be same-origin so it can read blob: URLs and local PDF bytes.
 * pdfjs-dist version must match react-pdf (see package.json).
 */

export function applyPdfJsWorker(pdfjs) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
    ).toString();
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

export function getReactPdfDocumentOptions() {
    return getPdfDocumentOptions(reactPdfJsVersion);
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
