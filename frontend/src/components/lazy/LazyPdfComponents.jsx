import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { loadReactPdf } from '../../utils/lazyLibraries';

export const PdfDocument = lazyWithRetry(() =>
    loadReactPdf().then((mod) => ({ default: mod.Document }))
);

export const PdfPage = lazyWithRetry(() =>
    loadReactPdf().then((mod) => ({ default: mod.Page }))
);
