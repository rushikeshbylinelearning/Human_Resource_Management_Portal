# Image Upload Implementation Summary

## Overview
Successfully implemented image upload functionality for both IT Support tickets and HR Queries with GridFS storage, supporting up to 5 images per submission/message with a 500KB limit per image.

## What Was Implemented

### 1. IT Support Tickets - Image Upload

#### New Files Created:
- `backend/middleware/uploadITSupportImageGridFS.js` - Middleware for handling IT Support image uploads
- `backend/docs/IT_SUPPORT_IMAGE_INTEGRATION.md` - Complete integration guide

#### Modified Files:
- `backend/models/ITSupportTicket.js` - Added `images` field to schema
- `backend/controllers/itSupportController.js` - Added image handling logic and new endpoints
- `backend/routes/itSupport.js` - Updated routes with middleware and new image endpoints

#### New Endpoints:
```
POST   /api/it-support/tickets                           - Now supports multipart/form-data with images
GET    /api/it-support/tickets/:ticketId/images/:imageId - View/download ticket images
DELETE /api/it-support/tickets/:ticketId/images/:imageId - Delete ticket images (owner only)
```

#### GridFS Bucket: `itSupportImages`

---

### 2. HR Queries - Image Upload

#### New Files Created:
- `backend/middleware/uploadHRQueryImageGridFS.js` - Middleware for handling HR Query image uploads
- `backend/docs/HR_QUERY_IMAGE_INTEGRATION.md` - Complete integration guide

#### Modified Files:
- `backend/models/HRQuery.js` - Updated `attachments` field in messages to use GridFS fileId
- `backend/routes/hrQueries.js` - Added image support to create, message, and respond routes

#### Updated Endpoints:
```
POST /api/hr-queries/create                              - Now supports multipart/form-data with images
POST /api/hr-queries/:queryId/message                    - Now supports images (employee)
POST /api/hr-queries/admin/:queryId/respond              - Now supports images (admin/HR)
GET  /api/hr-queries/:queryId/images/:imageId           - View/download message images
```

#### GridFS Bucket: `hrQueryImages`

---

## Technical Specifications

### Image Constraints:
- **Allowed Formats:** JPEG, JPG, PNG, GIF, WEBP
- **Max File Size:** 500KB per image
- **Max Images:** 5 per ticket/message
- **Storage:** MongoDB GridFS
- **Validation:** Both file extension and MIME type checked

### Security Features:
1. **Authentication Required:** All endpoints require valid JWT token
2. **Access Control:**
   - IT Support: Owner, assigned IT staff, admins, or users with `canManageITSupport` permission
   - HR Queries: Owner, HR/Admin, or users with `canManageHRQueries` permission
3. **Secure Filenames:** UUIDs prevent collisions and path traversal attacks
4. **Server-Side Validation:** File size and type strictly enforced
5. **Isolated Storage:** GridFS with separate buckets for IT and HR

### Data Schema:

**IT Support Ticket Images:**
```javascript
images: [{
    fileId: ObjectId,          // GridFS file ID
    filename: String,          // Generated secure filename (it-support-{uuid}.{ext})
    originalName: String,      // User's original filename
    mimetype: String,          // Image MIME type
    size: Number,              // File size in bytes
    uploadedAt: Date          // Upload timestamp
}]
```

**HR Query Message Attachments:**
```javascript
attachments: [{
    fileId: ObjectId,          // GridFS file ID
    filename: String,          // Generated secure filename (hr-query-{uuid}.{ext})
    originalName: String,      // User's original filename
    mimetype: String,          // Image MIME type
    size: Number,              // File size in bytes
    uploadedAt: Date          // Upload timestamp
}]
```

---

## Frontend Integration Requirements

### 1. IT Support Ticket Creation Form

**Update form to support file uploads:**
```jsx
<form onSubmit={handleSubmit}>
    {/* Existing fields: category, title, description, priority, location */}
    
    <div className="form-field">
        <label htmlFor="images">Attach Images (Optional)</label>
        <input 
            id="images"
            type="file" 
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            multiple
            max={5}
            onChange={handleImageChange}
        />
        <small>Maximum 5 images, 500KB each. Formats: JPEG, PNG, GIF, WEBP</small>
        {selectedImages.length > 0 && (
            <div className="image-preview">
                {selectedImages.map((img, idx) => (
                    <div key={idx} className="preview-item">
                        <img src={URL.createObjectURL(img)} alt={img.name} />
                        <span>{img.name} ({(img.size / 1024).toFixed(2)} KB)</span>
                        <button onClick={() => removeImage(idx)}>Remove</button>
                    </div>
                ))}
            </div>
        )}
    </div>
    
    <button type="submit">Create Ticket</button>
</form>
```

**Submit handler:**
```javascript
const handleSubmit = async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('category', category);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('priority', priority);
    formData.append('location', location);
    
    // Append all images
    selectedImages.forEach(image => {
        formData.append('images', image);
    });
    
    try {
        const response = await axios.post('/api/it-support/tickets', formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                // Content-Type is set automatically by axios for FormData
            }
        });
        
        console.log('Ticket created:', response.data.ticket);
        // Handle success (show notification, redirect, etc.)
    } catch (error) {
        console.error('Error:', error.response?.data?.error);
        // Handle error (show error message)
    }
};
```

### 2. Ticket Details View (User & Admin)

**Display attached images:**
```jsx
const TicketDetails = ({ ticket, token }) => {
    const [viewerOpen, setViewerOpen] = useState(false);
    const [currentImageIdx, setCurrentImageIdx] = useState(0);
    
    const openImageViewer = (index) => {
        setCurrentImageIdx(index);
        setViewerOpen(true);
    };
    
    return (
        <div className="ticket-details">
            <h2>{ticket.title}</h2>
            <p>{ticket.description}</p>
            
            {ticket.images && ticket.images.length > 0 && (
                <div className="ticket-images">
                    <h3>Attached Images ({ticket.images.length})</h3>
                    <div className="image-gallery">
                        {ticket.images.map((image, idx) => (
                            <div key={image.fileId} className="gallery-item">
                                <img 
                                    src={`/api/it-support/tickets/${ticket._id}/images/${image.fileId}`}
                                    alt={image.originalName}
                                    onClick={() => openImageViewer(idx)}
                                />
                                <div className="image-info">
                                    <span className="image-name">{image.originalName}</span>
                                    <span className="image-size">{(image.size / 1024).toFixed(2)} KB</span>
                                </div>
                                <button 
                                    onClick={() => downloadImage(ticket._id, image.fileId, image.originalName)}
                                    className="download-btn"
                                >
                                    Download
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <ImageViewerModal 
                isOpen={viewerOpen}
                onClose={() => setViewerOpen(false)}
                ticketId={ticket._id}
                images={ticket.images}
                currentIndex={currentImageIdx}
                token={token}
            />
        </div>
    );
};
```

### 3. HR Query Creation & Messaging

**Similar implementation to IT Support but with message thread:**
```jsx
const HRQueryThread = ({ query, token }) => {
    return (
        <div className="query-thread">
            <h2>{query.subject}</h2>
            
            <div className="messages">
                {query.messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.sender}`}>
                        <div className="message-header">
                            <strong>{msg.senderName}</strong>
                            <span>{new Date(msg.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="message-body">
                            {msg.message}
                        </div>
                        
                        {msg.attachments && msg.attachments.length > 0 && (
                            <div className="message-attachments">
                                {msg.attachments.map((att, attIdx) => (
                                    <div key={att.fileId} className="attachment-item">
                                        <img 
                                            src={`/api/hr-queries/${query._id}/images/${att.fileId}`}
                                            alt={att.originalName}
                                            onClick={() => openImageViewer(msg.attachments, attIdx)}
                                        />
                                        <span>{att.originalName}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            <MessageForm queryId={query._id} token={token} />
        </div>
    );
};
```

### 4. Image Viewer Component (Reusable)

**Create a shared component for both IT Support and HR Queries:**
```jsx
// components/ImageViewerModal.jsx
import React, { useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

const ImageViewerModal = ({ 
    isOpen, 
    onClose, 
    resourceId,      // ticketId or queryId
    images, 
    currentIndex = 0, 
    token,
    apiEndpoint      // '/api/it-support/tickets' or '/api/hr-queries'
}) => {
    const [zoom, setZoom] = useState(1);
    const [currentIdx, setCurrentIdx] = useState(currentIndex);
    
    if (!isOpen || !images || images.length === 0) return null;
    
    const currentImage = images[currentIdx];
    const imageUrl = `${apiEndpoint}/${resourceId}/images/${currentImage.fileId}`;
    
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
    
    const goToPrevious = () => {
        if (currentIdx > 0) {
            setCurrentIdx(currentIdx - 1);
            setZoom(1);
        }
    };
    
    const goToNext = () => {
        if (currentIdx < images.length - 1) {
            setCurrentIdx(currentIdx + 1);
            setZoom(1);
        }
    };
    
    // Keyboard navigation
    React.useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') goToPrevious();
            if (e.key === 'ArrowRight') goToNext();
            if (e.key === 'Escape') onClose();
        };
        
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, currentIdx]);
    
    return (
        <div className="image-viewer-overlay" onClick={onClose}>
            <div className="image-viewer-modal" onClick={(e) => e.stopPropagation()}>
                <div className="viewer-header">
                    <h3>{currentImage.originalName}</h3>
                    <div className="viewer-controls">
                        <button onClick={() => setZoom(zoom + 0.25)} disabled={zoom >= 3}>
                            <ZoomIn size={20} />
                        </button>
                        <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} disabled={zoom <= 0.25}>
                            <ZoomOut size={20} />
                        </button>
                        <span className="zoom-level">{(zoom * 100).toFixed(0)}%</span>
                        <button onClick={handleDownload}>
                            <Download size={20} />
                        </button>
                        <button onClick={onClose}>
                            <X size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="viewer-body">
                    {images.length > 1 && (
                        <button 
                            className="nav-btn nav-prev"
                            onClick={goToPrevious}
                            disabled={currentIdx === 0}
                        >
                            <ChevronLeft size={30} />
                        </button>
                    )}
                    
                    <div className="image-container">
                        <img 
                            src={imageUrl}
                            alt={currentImage.originalName}
                            style={{ transform: `scale(${zoom})` }}
                        />
                    </div>
                    
                    {images.length > 1 && (
                        <button 
                            className="nav-btn nav-next"
                            onClick={goToNext}
                            disabled={currentIdx === images.length - 1}
                        >
                            <ChevronRight size={30} />
                        </button>
                    )}
                </div>
                
                <div className="viewer-footer">
                    {images.length > 1 && (
                        <div className="image-counter">
                            {currentIdx + 1} / {images.length}
                        </div>
                    )}
                    <div className="image-metadata">
                        <span>Size: {(currentImage.size / 1024).toFixed(2)} KB</span>
                        <span>Type: {currentImage.mimetype}</span>
                        <span>Uploaded: {new Date(currentImage.uploadedAt).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageViewerModal;
```

---

## Help & Support FAB Integration

**Update the FAB button component to show images:**
```jsx
const HelpSupportFAB = () => {
    const [showOverlay, setShowOverlay] = useState(false);
    const [activeTab, setActiveTab] = useState('it'); // 'it' or 'hr'
    const [viewerState, setViewerState] = useState({
        open: false,
        resourceId: null,
        images: [],
        currentIndex: 0,
        apiEndpoint: ''
    });
    
    const openImageViewer = (resourceId, images, index, type) => {
        setViewerState({
            open: true,
            resourceId,
            images,
            currentIndex: index,
            apiEndpoint: type === 'it' ? '/api/it-support/tickets' : '/api/hr-queries'
        });
    };
    
    return (
        <>
            <button className="fab-button" onClick={() => setShowOverlay(true)}>
                <HelpCircle />
            </button>
            
            {showOverlay && (
                <div className="fab-overlay">
                    <div className="fab-header">
                        <h2>Help & Support</h2>
                        <button onClick={() => setShowOverlay(false)}>
                            <X />
                        </button>
                    </div>
                    
                    <div className="fab-tabs">
                        <button 
                            className={activeTab === 'it' ? 'active' : ''}
                            onClick={() => setActiveTab('it')}
                        >
                            IT Support
                        </button>
                        <button 
                            className={activeTab === 'hr' ? 'active' : ''}
                            onClick={() => setActiveTab('hr')}
                        >
                            HR Queries
                        </button>
                    </div>
                    
                    <div className="fab-content">
                        {activeTab === 'it' ? (
                            <ITSupportList onImageClick={(id, imgs, idx) => openImageViewer(id, imgs, idx, 'it')} />
                        ) : (
                            <HRQueryList onImageClick={(id, imgs, idx) => openImageViewer(id, imgs, idx, 'hr')} />
                        )}
                    </div>
                </div>
            )}
            
            <ImageViewerModal 
                isOpen={viewerState.open}
                onClose={() => setViewerState({ ...viewerState, open: false })}
                resourceId={viewerState.resourceId}
                images={viewerState.images}
                currentIndex={viewerState.currentIndex}
                token={getToken()}
                apiEndpoint={viewerState.apiEndpoint}
            />
        </>
    );
};
```

---

## Testing Checklist

### IT Support Tickets:
- [ ] Create ticket without images (should work as before)
- [ ] Create ticket with 1 image
- [ ] Create ticket with 5 images (max limit)
- [ ] Try to upload 6 images (should fail with error)
- [ ] Try to upload image > 500KB (should fail)
- [ ] Try to upload non-image file (should fail)
- [ ] View ticket with images as owner
- [ ] View ticket with images as IT staff
- [ ] View ticket with images as admin
- [ ] Try to view ticket images as unauthorized user (should fail)
- [ ] Download image
- [ ] Delete image as owner (OPEN ticket)
- [ ] Try to delete image from RESOLVED ticket (should fail)
- [ ] Image viewer zoom in/out
- [ ] Image viewer navigate between images
- [ ] Image viewer keyboard navigation (arrow keys, ESC)
- [ ] Mobile responsive layout

### HR Queries:
- [ ] Create query without images
- [ ] Create query with images
- [ ] Add message with images (employee)
- [ ] Respond with images (HR/Admin)
- [ ] View images in message thread
- [ ] Download images from messages
- [ ] Anonymous queries show images correctly
- [ ] Image viewer in operational dashboard
- [ ] Access control for images
- [ ] Mobile responsive layout

### Help & Support FAB:
- [ ] FAB shows IT tickets with image count
- [ ] FAB shows HR queries with image count
- [ ] Click image thumbnail opens viewer
- [ ] Download from FAB viewer
- [ ] Navigate between images in FAB viewer
- [ ] Switch between IT and HR tabs preserves state

---

## Error Messages Reference

| Error Code | Message | Cause |
|------------|---------|-------|
| 400 | `Image {filename} exceeds 500KB limit.` | File size > 500KB |
| 400 | `Invalid file type: {filename}. Only images (JPEG, PNG, GIF, WEBP) are allowed.` | Invalid file type |
| 400 | `Maximum 5 images allowed per ticket/message.` | Too many files |
| 400 | `Content-Type must be multipart/form-data.` | Wrong content type |
| 401 | `Authentication required.` | Missing or invalid token |
| 403 | `Access denied.` | User not authorized to view resource |
| 404 | `Ticket/Query not found.` | Invalid resource ID |
| 404 | `Image not found in this ticket/query.` | Invalid image ID |
| 404 | `Image file not found in storage.` | Image deleted from GridFS |
| 500 | `Failed to upload images to GridFS` | Server error during upload |
| 500 | `Failed to retrieve image.` | Server error during download |

---

## Database Queries

### Find all IT tickets with images:
```javascript
db.itsupporttickets.find({ "images.0": { $exists: true } })
```

### Find all HR queries with message attachments:
```javascript
db.hrqueries.find({ "messages.attachments.0": { $exists: true } })
```

### Count total images in IT Support:
```javascript
db.itsupporttickets.aggregate([
    { $project: { imageCount: { $size: { $ifNull: ["$images", []] } } } },
    { $group: { _id: null, total: { $sum: "$imageCount" } } }
])
```

### List all GridFS files for IT Support:
```javascript
db.itSupportImages.files.find()
```

### List all GridFS files for HR Queries:
```javascript
db.hrQueryImages.files.find()
```

### Clean up orphaned GridFS files (images not referenced in tickets/queries):
```javascript
// Run this as a maintenance script periodically
// IT Support
const allTickets = await ITSupportTicket.find({}).select('images').lean();
const referencedImageIds = new Set();
allTickets.forEach(ticket => {
    ticket.images?.forEach(img => {
        referencedImageIds.add(img.fileId.toString());
    });
});

const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'itSupportImages' });
const allFiles = await bucket.find().toArray();

for (const file of allFiles) {
    if (!referencedImageIds.has(file._id.toString())) {
        await bucket.delete(file._id);
        console.log('Deleted orphaned file:', file._id);
    }
}
```

---

## Performance Considerations

1. **GridFS Streaming:** Images are streamed from GridFS, not loaded entirely into memory
2. **Lazy Loading:** Consider implementing lazy loading for image thumbnails in lists
3. **Caching:** Add cache headers to image responses (future enhancement)
4. **Thumbnail Generation:** Consider generating thumbnails for faster gallery loading (future enhancement)
5. **CDN:** For production with high traffic, consider serving images through CDN (future enhancement)

---

## Future Enhancements

1. **Image Compression:** Auto-compress images on upload to reduce storage
2. **Thumbnail Generation:** Generate and store thumbnails for faster loading
3. **Image Cropping/Editing:** Allow basic image editing before upload
4. **Drag & Drop:** Implement drag-and-drop file upload interface
5. **Paste from Clipboard:** Allow pasting screenshots directly
6. **Progress Indicator:** Show upload progress for large files
7. **Image Annotations:** Allow drawing/annotating on images to highlight issues
8. **Video Support:** Extend to support short video clips (with size limits)
9. **OCR:** Extract text from uploaded images for searchability
10. **Image Carousel:** Swipe gesture support for mobile

---

## Documentation Files

1. **IT_SUPPORT_IMAGE_INTEGRATION.md** - Complete IT Support image integration guide
2. **HR_QUERY_IMAGE_INTEGRATION.md** - Complete HR Query image integration guide
3. **IMAGE_UPLOAD_IMPLEMENTATION_SUMMARY.md** - This file (overview and summary)

---

## Support

For questions or issues with the image upload functionality:
1. Check the detailed integration guides (IT_SUPPORT_IMAGE_INTEGRATION.md and HR_QUERY_IMAGE_INTEGRATION.md)
2. Verify authentication tokens are being sent correctly
3. Check browser console for client-side errors
4. Check server logs for backend errors
5. Verify file size and type constraints are met
6. Test with different image formats to isolate issues

---

## Deployment Notes

### Before deploying to production:

1. **Test thoroughly** with all supported image formats
2. **Verify GridFS indexes** are created properly
3. **Check MongoDB storage capacity** for image storage needs
4. **Configure backup strategy** for GridFS buckets
5. **Monitor storage usage** and set up alerts
6. **Test performance** with concurrent uploads
7. **Verify access control** is working correctly
8. **Test on mobile devices** for responsive design
9. **Check error handling** for all edge cases
10. **Document for end users** how to attach and view images

### Environment Variables (if needed):
```env
# Image upload configuration
MAX_IMAGE_SIZE=512000  # 500KB in bytes
MAX_IMAGES_PER_UPLOAD=5
ALLOWED_IMAGE_TYPES=jpeg,jpg,png,gif,webp
```

---

## Status: ✅ COMPLETE

All backend functionality for image uploads has been implemented and is ready for frontend integration. The system supports:

✅ IT Support ticket image attachments (up to 5 images, 500KB each)
✅ HR Query message image attachments (up to 5 images, 500KB each)
✅ Secure GridFS storage with separate buckets
✅ Image viewing and downloading endpoints
✅ Access control and authentication
✅ File validation and error handling
✅ Comprehensive documentation for frontend developers

**Next Steps:** Frontend implementation following the integration guides provided.
