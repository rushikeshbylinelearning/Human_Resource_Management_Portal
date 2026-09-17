import React from 'react';

/** Tiny first-paint fallback. Do not import SkeletonLoaders here — that file is 90KB+. */
const PageFallbackSkeleton = () => (
    <div className="page-fallback-skeleton" aria-hidden="true">
        <div className="page-fallback-skeleton__bar" />
        <div className="page-fallback-skeleton__grid">
            <div className="page-fallback-skeleton__card" />
            <div className="page-fallback-skeleton__card" />
            <div className="page-fallback-skeleton__card" />
        </div>
    </div>
);

export default PageFallbackSkeleton;
