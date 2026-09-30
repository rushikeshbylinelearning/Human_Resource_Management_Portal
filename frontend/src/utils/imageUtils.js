// frontend/src/utils/imageUtils.js
// Utility functions for image handling
import api from '../api/axios';

/**
 * Validate image file
 * @param {File} file - File to validate
 * @param {number} maxSizeKB - Maximum file size in KB (default: 500)
 * @returns {Object} - { valid: boolean, error: string }
 */
export const validateImageFile = (file, maxSizeKB = 500) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSizeBytes = maxSizeKB * 1024;

    if (!file) {
        return { valid: false, error: 'No file provided' };
    }

    if (!allowedTypes.includes(file.type)) {
        return { 
            valid: false, 
            error: `Invalid file type. Only JPEG, PNG, GIF, and WEBP images are allowed.` 
        };
    }

    if (file.size > maxSizeBytes) {
        return { 
            valid: false, 
            error: `File size (${formatFileSize(file.size)}) exceeds the ${maxSizeKB}KB limit.` 
        };
    }

    return { valid: true, error: null };
};

/**
 * Validate multiple image files
 * @param {FileList|Array} files - Files to validate
 * @param {number} maxFiles - Maximum number of files (default: 5)
 * @param {number} maxSizeKB - Maximum file size in KB (default: 500)
 * @returns {Object} - { valid: boolean, errors: string[], validFiles: File[] }
 */
export const validateImageFiles = (files, maxFiles = 5, maxSizeKB = 500) => {
    const errors = [];
    const validFiles = [];
    const fileArray = Array.from(files);

    if (fileArray.length > maxFiles) {
        return {
            valid: false,
            errors: [`Maximum ${maxFiles} images allowed. You selected ${fileArray.length} images.`],
            validFiles: []
        };
    }

    fileArray.forEach((file, index) => {
        const validation = validateImageFile(file, maxSizeKB);
        if (validation.valid) {
            validFiles.push(file);
        } else {
            errors.push(`File ${index + 1} (${file.name}): ${validation.error}`);
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        validFiles
    };
};

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size (e.g., "245 KB", "1.2 MB")
 */
export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Create preview URL for image file
 * @param {File} file - Image file
 * @returns {string} - Object URL for preview
 */
export const createImagePreview = (file) => {
    return URL.createObjectURL(file);
};

/**
 * Clean up object URLs
 * @param {string|Array} urls - URL or array of URLs to revoke
 */
export const revokeImagePreview = (urls) => {
    const urlArray = Array.isArray(urls) ? urls : [urls];
    urlArray.forEach(url => {
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    });
};

/**
 * Normalize GridFS file id from ticket/query image metadata
 */
export const getImageFileId = (image) => {
    if (!image) return '';
    const id = image.fileId || image._id || image.id;
    if (!id) return '';
    if (typeof id === 'object' && typeof id.toString === 'function') {
        return id.toString();
    }
    return String(id);
};

/**
 * Axios path (baseURL already includes /api)
 */
export const getImageApiPath = (resourceType, resourceId, imageId) => {
    if (resourceType === 'it-support') {
        return `/it-support/tickets/${resourceId}/images/${imageId}`;
    }
    if (resourceType === 'hr-query') {
        return `/hr-queries/${resourceId}/images/${imageId}`;
    }
    return '';
};

/**
 * Browser path for same-origin img tags (not used for auth; prefer blob URLs)
 */
export const getImageUrl = (resourceType, resourceId, imageId) => {
    if (resourceType === 'it-support') {
        return `/api/it-support/tickets/${resourceId}/images/${imageId}`;
    }
    if (resourceType === 'hr-query') {
        return `/api/hr-queries/${resourceId}/images/${imageId}`;
    }
    return '';
};

const blobUrlCache = new Map();

/**
 * Fetch an image with the Bearer token and return a blob: URL
 */
export const getAuthenticatedImageBlobUrl = async (resourceType, resourceId, imageId) => {
    const fileId = imageId && typeof imageId === 'object' ? imageId.toString() : String(imageId || '');
    const key = `${resourceType}:${resourceId}:${fileId}`;
    if (blobUrlCache.has(key)) {
        return blobUrlCache.get(key);
    }

    const path = getImageApiPath(resourceType, resourceId, fileId);
    const response = await api.get(path, {
        responseType: 'blob',
        headers: { Accept: 'image/*,application/octet-stream' },
    });

    const blob = response.data;
    if (!(blob instanceof Blob) || blob.type?.includes('application/json')) {
        throw new Error('Failed to load image');
    }

    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache.set(key, objectUrl);
    return objectUrl;
};

/**
 * Download image using the authenticated API client
 */
export const downloadImage = async (resourceType, resourceId, imageId, originalName) => {
    try {
        const fileId = imageId && typeof imageId === 'object' ? imageId.toString() : String(imageId || '');
        const path = getImageApiPath(resourceType, resourceId, fileId);
        const response = await api.get(path, {
            responseType: 'blob',
            params: { download: true },
            headers: { Accept: 'image/*,application/octet-stream' },
        });

        const blob = response.data;
        if (!(blob instanceof Blob) || blob.type?.includes('application/json')) {
            throw new Error('Failed to download image');
        }

        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = originalName || 'image.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('Error downloading image:', error);
        throw error;
    }
};

/**
 * Check if file is an image
 * @param {File} file - File to check
 * @returns {boolean}
 */
export const isImageFile = (file) => {
    return file && file.type.startsWith('image/');
};

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} - File extension (e.g., "jpg")
 */
export const getFileExtension = (filename) => {
    return filename.split('.').pop().toLowerCase();
};

/**
 * Compress image if needed (future enhancement)
 * @param {File} file - Image file
 * @param {number} maxSizeKB - Target max size in KB
 * @returns {Promise<File>} - Compressed file
 */
export const compressImage = async (file, maxSizeKB = 500) => {
    // For now, just return the original file
    // Future: Implement actual compression using canvas or third-party library
    return file;
};
