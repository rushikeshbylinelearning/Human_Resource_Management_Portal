# IT Support Ticket Image Upload Integration Guide

## Overview
IT Support tickets now support image attachments (JPEG, PNG, GIF, WEBP) with a maximum file size of 500KB per image and up to 5 images per ticket.

## Backend Changes Summary

### 1. New Middleware: `uploadITSupportImageGridFS.js`
- Location: `backend/middleware/uploadITSupportImageGridFS.js`
- Handles multipart/form-data file uploads
- Validates image types and size limits (500KB max)
- Stores images in MongoDB GridFS under bucket: `itSupportImages`
- Supports up to 5 images per ticket

### 2. Updated Model: `ITSupportTicket.js`
Added new `images` field to store image metadata:
```javascript
images: [{
    fileId: ObjectId,          // GridFS file ID
    filename: String,          // Generated secure filename
    originalName: String,      // User's original filename
    mimetype: String,          // Image MIME type
    size: Number,              // File size in bytes
    uploadedAt: Date          // Upload timestamp
}]
```

### 3. Updated Controller: `itSupportController.js`
New functions added:
- `getTicketImage(req, res)` - View/download ticket images
- `deleteTicketImage(req, res)` - Delete ticket images (owner only, before resolution)

Updated function:
- `createTicket(req, res)` - Now handles image uploads via `req.uploadedImages`

### 4. Updated Routes: `itSupport.js`
New endpoints:
```
GET    /api/it-support/tickets/:ticketId/images/:imageId        - View/download image
DELETE /api/it-support/tickets/:ticketId/images/:imageId        - Delete image (owner only)
```

Updated endpoint:
```
POST   /api/it-support/tickets                                  - Now supports multipart/form-data
```

## API Usage

### Creating a Ticket with Images

**Endpoint:** `POST /api/it-support/tickets`

**Content-Type:** `multipart/form-data`

**Request Fields:**
```
category     - (required) Issue category
title        - (required) Ticket title (max 200 chars)
description  - (required) Issue description (max 3000 chars)
priority     - (optional) Priority level: Low, Medium, High, Critical
location     - (optional) Location/Desk/Workstation (max 200 chars)
images       - (optional) Image files (max 5, 500KB each, JPEG/PNG/GIF/WEBP only)
```

**Frontend Example (JavaScript/FormData):**
```javascript
const formData = new FormData();
formData.append('category', 'Computer / Laptop');
formData.append('title', 'Screen flickering issue');
formData.append('description', 'My laptop screen flickers when...');
formData.append('priority', 'High');
formData.append('location', 'Desk 42, 3rd Floor');

// Add multiple images
const imageFiles = document.getElementById('imageInput').files;
for (let i = 0; i < imageFiles.length; i++) {
    formData.append('images', imageFiles[i]);
}

// Send request
const response = await fetch('/api/it-support/tickets', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}` // JWT token
        // DON'T set Content-Type - browser will set it automatically with boundary
    },
    body: formData
});

const result = await response.json();
console.log('Ticket created:', result.ticket);
console.log('Images uploaded:', result.ticket.images.length);
```

**React Example:**
```jsx
const [images, setImages] = useState([]);

const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    
    // Validate file size
    const oversized = files.filter(f => f.size > 500 * 1024);
    if (oversized.length > 0) {
        alert('Some images exceed 500KB limit');
        return;
    }
    
    // Limit to 5 images
    if (files.length > 5) {
        alert('Maximum 5 images allowed');
        return;
    }
    
    setImages(files);
};

const handleSubmit = async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('category', category);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('priority', priority);
    formData.append('location', location);
    
    images.forEach(image => {
        formData.append('images', image);
    });
    
    try {
        const res = await axios.post('/api/it-support/tickets', formData, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('Ticket created:', res.data.ticket);
    } catch (error) {
        console.error('Error creating ticket:', error.response?.data);
    }
};

return (
    <form onSubmit={handleSubmit}>
        {/* ... other fields ... */}
        
        <div>
            <label>Attach Images (Optional, max 5, 500KB each)</label>
            <input 
                type="file" 
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                multiple
                onChange={handleImageChange}
            />
            <small>Selected: {images.length} image(s)</small>
        </div>
        
        <button type="submit">Create Ticket</button>
    </form>
);
```

**Success Response:**
```json
{
    "message": "IT Support ticket created successfully.",
    "ticket": {
        "ticketId": "IT-2026-0042",
        "_id": "65f8...",
        "category": "Computer / Laptop",
        "title": "Screen flickering issue",
        "description": "My laptop screen flickers when...",
        "priority": "High",
        "status": "OPEN",
        "images": [
            {
                "fileId": "65f8a1b2c3d4e5f6g7h8i9j0",
                "filename": "it-support-12345-abc-def.jpg",
                "originalName": "screen_issue.jpg",
                "mimetype": "image/jpeg",
                "size": 245678,
                "uploadedAt": "2026-09-30T10:30:00.000Z",
                "_id": "65f8..."
            }
        ],
        "createdBy": "65e7...",
        "createdByName": "John Doe",
        "createdAt": "2026-09-30T10:30:00.000Z"
    }
}
```

### Viewing/Downloading Images

**Endpoint:** `GET /api/it-support/tickets/:ticketId/images/:imageId`

**Query Parameters:**
- `download=true` - Force download instead of inline display

**Authorization:**
- Ticket owner
- Assigned IT staff
- Admins
- Users with `canManageITSupport` permission

**Frontend Example - Display Image:**
```jsx
// In your ticket details component
const ImageGallery = ({ ticket, token }) => {
    return (
        <div className="image-gallery">
            {ticket.images?.map((image) => (
                <div key={image.fileId} className="image-item">
                    <img 
                        src={`/api/it-support/tickets/${ticket._id}/images/${image.fileId}?token=${token}`}
                        alt={image.originalName}
                        style={{ maxWidth: '200px', cursor: 'pointer' }}
                        onClick={() => openImageModal(ticket._id, image.fileId)}
                    />
                    <div className="image-info">
                        <span>{image.originalName}</span>
                        <span>{(image.size / 1024).toFixed(2)} KB</span>
                    </div>
                    <button onClick={() => downloadImage(ticket._id, image.fileId, image.originalName)}>
                        Download
                    </button>
                </div>
            ))}
        </div>
    );
};

// Download function
const downloadImage = async (ticketId, imageId, originalName) => {
    const url = `/api/it-support/tickets/${ticketId}/images/${imageId}?download=true`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = originalName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
};

// Full-size modal viewer
const openImageModal = (ticketId, imageId) => {
    // Show modal with full-size image
    const imageUrl = `/api/it-support/tickets/${ticketId}/images/${imageId}`;
    // Your modal implementation here
};
```

**Custom Image Viewer Component (Suggested):**
```jsx
import React, { useState } from 'react';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react'; // or your icon library

const ImageViewerModal = ({ isOpen, onClose, ticketId, images, currentIndex, token }) => {
    const [zoom, setZoom] = useState(1);
    const [currentIdx, setCurrentIdx] = useState(currentIndex);
    
    if (!isOpen || !images || images.length === 0) return null;
    
    const currentImage = images[currentIdx];
    const imageUrl = `/api/it-support/tickets/${ticketId}/images/${currentImage.fileId}`;
    
    const handleDownload = async () => {
        const response = await fetch(`${imageUrl}?download=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = currentImage.originalName;
        link.click();
        window.URL.revokeObjectURL(url);
    };
    
    return (
        <div className="image-viewer-modal" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{currentImage.originalName}</h3>
                    <div className="modal-actions">
                        <button onClick={() => setZoom(zoom + 0.25)} title="Zoom In">
                            <ZoomIn />
                        </button>
                        <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} title="Zoom Out">
                            <ZoomOut />
                        </button>
                        <button onClick={handleDownload} title="Download">
                            <Download />
                        </button>
                        <button onClick={onClose} title="Close">
                            <X />
                        </button>
                    </div>
                </div>
                
                <div className="image-container">
                    <img 
                        src={imageUrl}
                        alt={currentImage.originalName}
                        style={{ transform: `scale(${zoom})` }}
                    />
                </div>
                
                {images.length > 1 && (
                    <div className="image-navigation">
                        <button 
                            onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                            disabled={currentIdx === 0}
                        >
                            Previous
                        </button>
                        <span>{currentIdx + 1} / {images.length}</span>
                        <button 
                            onClick={() => setCurrentIdx(Math.min(images.length - 1, currentIdx + 1))}
                            disabled={currentIdx === images.length - 1}
                        >
                            Next
                        </button>
                    </div>
                )}
                
                <div className="image-info">
                    <span>Size: {(currentImage.size / 1024).toFixed(2)} KB</span>
                    <span>Type: {currentImage.mimetype}</span>
                    <span>Uploaded: {new Date(currentImage.uploadedAt).toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
};

export default ImageViewerModal;
```

### Deleting Images

**Endpoint:** `DELETE /api/it-support/tickets/:ticketId/images/:imageId`

**Authorization:**
- Only ticket owner can delete
- Only from OPEN or ACKNOWLEDGED tickets

**Frontend Example:**
```javascript
const deleteImage = async (ticketId, imageId) => {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
        const response = await fetch(
            `/api/it-support/tickets/${ticketId}/images/${imageId}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        
        if (response.ok) {
            const result = await response.json();
            console.log('Image deleted:', result.message);
            // Refresh ticket data
        } else {
            const error = await response.json();
            alert(error.error);
        }
    } catch (error) {
        console.error('Error deleting image:', error);
    }
};
```

## UI/UX Recommendations

### 1. Ticket Creation Form
- Add file input field with `multiple` attribute
- Show image previews before upload
- Display file size validation errors
- Show upload progress (optional)
- Limit to 5 images with clear messaging

### 2. Ticket Details View (User Side)
- Display thumbnail gallery of attached images
- Click to open full-size modal viewer
- Show download button for each image
- Show delete option (if ticket is still OPEN/ACKNOWLEDGED)

### 3. Operational Dashboard (Admin/IT Staff)
- Same thumbnail gallery view
- Custom image viewer modal with zoom controls
- Download button prominent
- Navigate between multiple images easily
- Show image metadata (size, type, upload date)

### 4. Help & Support FAB Button Integration
When displaying IT Support tickets in the Help & Support FAB:
- Show image count badge if images attached
- Clicking opens ticket with image gallery
- Include image viewer modal in the FAB overlay component

## Error Handling

### Common Errors:

1. **File too large (400)**
```json
{ "error": "Image screen_shot.png exceeds 500KB limit." }
```

2. **Invalid file type (400)**
```json
{ "error": "Invalid file type: document.pdf. Only images (JPEG, PNG, GIF, WEBP) are allowed." }
```

3. **Too many images (400)**
```json
{ "error": "Maximum 5 images allowed per ticket." }
```

4. **Unauthorized access (403)**
```json
{ "error": "Access denied." }
```

5. **Image not found (404)**
```json
{ "error": "Image not found in this ticket." }
```

## CSS Styling Example

```css
/* Image Gallery */
.image-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
    margin: 1rem 0;
}

.image-item {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 0.5rem;
    text-align: center;
}

.image-item img {
    width: 100%;
    height: 150px;
    object-fit: cover;
    border-radius: 4px;
    cursor: pointer;
    transition: transform 0.2s;
}

.image-item img:hover {
    transform: scale(1.05);
}

/* Image Viewer Modal */
.image-viewer-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.modal-content {
    background: white;
    border-radius: 12px;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.modal-header {
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #ddd;
}

.modal-actions {
    display: flex;
    gap: 0.5rem;
}

.image-container {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
}

.image-container img {
    max-width: 100%;
    max-height: 100%;
    transition: transform 0.2s;
}

.image-navigation {
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #ddd;
}

.image-info {
    padding: 0.5rem 1rem;
    background: #f5f5f5;
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: #666;
}
```

## Testing Checklist

- [ ] Upload single image (< 500KB)
- [ ] Upload multiple images (up to 5)
- [ ] Validate 500KB size limit
- [ ] Validate image type restrictions
- [ ] Validate max 5 images limit
- [ ] View image inline
- [ ] Download image
- [ ] Delete image (as owner, OPEN ticket)
- [ ] Try to delete image (resolved ticket - should fail)
- [ ] Try to access image (unauthorized user - should fail)
- [ ] View ticket with images in admin dashboard
- [ ] Custom image viewer functionality
- [ ] Zoom in/out controls
- [ ] Navigate between multiple images
- [ ] Mobile responsive layout

## Security Considerations

1. **File Size Limit:** 500KB strictly enforced server-side
2. **File Type Validation:** Both extension and MIME type checked
3. **Access Control:** Only authorized users can view/download images
4. **Secure Filenames:** UUIDs prevent filename collisions and path traversal
5. **GridFS Storage:** Isolated storage in MongoDB, not filesystem
6. **Authentication Required:** All endpoints require valid JWT token

## Performance Considerations

1. **GridFS Streaming:** Images are streamed, not loaded entirely into memory
2. **Thumbnail Optimization:** Consider generating thumbnails for gallery view (future enhancement)
3. **Lazy Loading:** Load image previews only when needed
4. **Caching:** Set appropriate cache headers for image responses (future enhancement)

## Future Enhancements (Suggestions)

1. Add image thumbnail generation for faster gallery loading
2. Support drag-and-drop upload interface
3. Image annotation tools (draw on images to highlight issues)
4. Automatic image compression on upload
5. Support for PDF attachments (separate from images)
6. Image upload for comments (not just initial ticket creation)
