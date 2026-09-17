/**
 * Lazy-loaded heavy library wrappers
 * These libraries are only loaded when actually needed, reducing the initial bundle size
 */

/**
 * Lazy load xlsx library (413 KB)
 * Used for Excel file parsing and generation
 */
export const loadXLSX = () => import('xlsx');

/**
 * Lazy load jsPDF library (378 KB)
 * Used for PDF generation
 */
export const loadJsPDF = () => import('jspdf');

const loadJsPDFAutoTable = () => import('jspdf-autotable');

/**
 * Load jsPDF + autotable together for table-based PDF exports.
 */
export async function loadJsPDFWithAutoTable() {
    const [jsPDFMod, autoTableMod] = await Promise.all([
        loadJsPDF(),
        loadJsPDFAutoTable(),
    ]);
    return {
        jsPDF: jsPDFMod.default ?? jsPDFMod.jsPDF,
        autoTable: autoTableMod.default ?? autoTableMod.autoTable,
    };
}

let pdfjsWorkerConfigured = false;

/**
 * Lazy load pdfjs-dist (used for PDF text extraction, e.g. poll import).
 * Worker is configured once, on first load.
 */
export async function loadPdfjs() {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjsWorkerConfigured) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
        ).toString();
        pdfjsWorkerConfigured = true;
    }
    return pdfjs;
}

let reactPdfConfigured = false;

/**
 * Lazy load react-pdf (Document/Page) and its CSS, configuring the pdf.js worker.
 */
export async function loadReactPdf() {
    const [mod] = await Promise.all([
        import('react-pdf'),
        import('react-pdf/dist/Page/AnnotationLayer.css'),
        import('react-pdf/dist/Page/TextLayer.css'),
    ]);
    if (!reactPdfConfigured) {
        mod.pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
        ).toString();
        reactPdfConfigured = true;
    }
    return mod;
}
