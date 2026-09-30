# HR Query Message Image Upload Integration Guide

## Overview
HR Query messages now support image attachments (JPEG, PNG, GIF, WEBP) with a maximum file size of 500KB per image and up to 5 images per message.

## Backend Changes Summary

### 1. New Middleware: `uploadHRQueryImageGridFS.js`
- Location: `backend/middleware/uploadHRQueryImageGridFS.js`
- Handles multipart/form-data file uploads
- Validates image types and size limits (500KB max)
- Stores images in MongoDB GridFS under bucket: `hrQueryImages`
- Supports up to 5 images per message

### 2. Updated Model: `HRQuery.js`
Updated `attachments` field in messages array:
```javascript
attachments: [{
    fileId: ObjectId,          // GridFS file ID
    filename: String,          // Generated secure filename
    originalName: String,      // User's original filename
    mimetype: String,          // Image MIME type
    size: Number,              // File size in bytes
    uploadedAt: Date          // Upload timestamp
}]
```

### 3. Updated Routes: `hrQueries.js`
New endpoint:
```
GET /api/hr-queries/:queryId/images/:imageId        - View/download image
```

Updated endpoints (now support multipart/form-data):
```
POST /api/hr-queries/create                          - Create query with images
POST /api/hr-queries/:queryId/message                - Add message with images (employee)
POST /api/hr-queries/admin/:queryId/respond          - Respond with images (admin/HR)
```

## API Usage

### Creating an HR Query with Images

**Endpoint:** `POST /api/hr-queries/create`

**Content-Type:** `multipart/form-data`

**Request Fields:**
```
subject         - (required) Query subject (max 200 chars)
message         - (required) Initial message
category        - (optional) Category: Policy, Leave, Attendance, Payroll, Benefits, Compliance, General, Other
anonymousToHR   - (optional) Boolean, hide identity from HR
images          - (optional) Image files (max 5, 500KB each, JPEG/PNG/GIF/WEBP only)
```

**Frontend Example (JavaScript/FormData):**
```javascript
const formData = new FormData();
formData.append('subject', 'Question about leave policy');
formData.append('message', 'I need clarification on...');
formData.append('category', 'Leave');
formData.append('anonymousToHR', 'false');

// Add multiple images
const imageFiles = document.getElementById('imageInput').files;
for (let i = 0; i < imageFiles.length; i++) {
    formData.append('images', imageFiles[i]);
}

// Send request
const response = await fetch('/api/hr-queries/create', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}` // JWT token
    },
    body: formData
});

const result = await response.json();
console.log('Query created:', result.queryId);
```

**React Example:**
```jsx
const [images, setImages] = useState([]);
const [subject, setSubject] = useState('');
const [message, setMessage] = useState('');
const [category, setCategory] = useState('General');

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
    formData.append('subject', subject);
    formData.append('message', message);
    formData.append('category', category);
    
    images.forEach(image => {
        formData.append('images', image);
    });
    
    try {
        const res = await axios.post('/api/hr-queries/create', formData, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('Query created:', res.data.queryId);
    } catch (error) {
        console.error('Error creating query:', error.response?.data);
    }
};

return (
    <form onSubmit={handleSubmit}>
        <input 
            type="text" 
            value={subject} 
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            required
        />
        
        <textarea 
            value={message} 
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your message"
            required
        />
        
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="General">General</option>
            <option value="Leave">Leave</option>
            <option value="Attendance">Attendance</option>
            <option value="Payroll">Payroll</option>
            <option value="Benefits">Benefits</option>
            <option value="Policy">Policy</option>
            <option value="Compliance">Compliance</option>
            <option value="Other">Other</option>
        </select>
        
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
        
        <button type="submit">Submit Query</button>
    </form>
);
```

### Adding a Message with Images (Employee)

**Endpoint:** `POST /api/hr-queries/:queryId/message`

**Content-Type:** `multipart/form-data`

**Request Fields:**
```
message  - (required) Message text
images   - (optional) Image files (max 5, 500KB each)
```

**Frontend Example:**
```javascript
const addMessage = async (queryId, messageText, imageFiles) => {
    const formData = new FormData();
    formData.append('message', messageText);
    
    if (imageFiles && imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
            formData.append('images', imageFiles[i]);
        }
    }
    
    const response = await fetch(`/api/hr-queries/${queryId}/message`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });
    
    const result = await response.json();
    console.log('Message sent:', result.message);
};
```

### Admin/HR Responding with Images

**Endpoint:** `POST /api/hr-queries/admin/:queryId/respond`

**Content-Type:** `multipart/form-data`

**Request Fields:**
```
message  - (required) Response message text
images   - (optional) Image files (max 5, 500KB each)
```

**Frontend Example:**
```javascript
const respondToQuery = async (queryId, messageText, imageFiles) => {
    const formData = new FormData();
    formData.append('message', messageText);
    
    if (imageFiles && imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
            formData.append('images', imageFiles[i]);
        }
    }
    
    const response = await fetch(`/api/hr-queries/admin/${queryId}/respond`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });
    
    const result = await response.json();
    console.log('Response sent:', result.message);
};
```

### Viewing/Downloading Message Images

**Endpoint:** `GET /api/hr-queries/:queryId/images/:imageId`

**Query Parameters:**
- `download=true` - Force download instead of inline display

**Authorization:**
- Query owner (employee)
- Admins and HR staff
- Users with `canManageHRQueries` permission

**Frontend Example - Message Thread with Images:**
```jsx
const MessageThread = ({ query, token }) => {
    return (
        <div className="message-thread">
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
                            <h4>Attachments ({msg.attachments.length})</h4>
                            <div className="attachment-grid">
                                {msg.attachments.map((att) => (
                                    <div key={att.fileId} className="attachment-item">
                                        <img 
                                            src={`/api/hr-queries/${query._id}/images/${att.fileId}`}
                                            alt={att.originalName}
                                            onClick={() => openImageModal(query._id, att.fileId, att)}
                                            style={{ maxWidth: '150px', cursor: 'pointer' }}
                                        />
                                        <div className="attachment-info">
                                            <span>{att.originalName}</span>
                                            <span>{(att.size / 1024).toFixed(2)} KB</span>
                                        </div>
                                        <button onClick={() => downloadImage(query._id, att.fileId, att.originalName)}>
                                            Download
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// Download function
const downloadImage = async (queryId, imageId, originalName) => {
    const url = `/api/hr-queries/${queryId}/images/${imageId}?download=true`;
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
const openImageModal = (queryId, imageId, imageInfo) => {
    // Show modal with full-size image
    const imageUrl = `/api/hr-queries/${queryId}/images/${imageId}`;
    // Your modal implementation here
};
```

**Custom Image Viewer Component (Shared with IT Support):**
```jsx
import React, { useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

const MessageImageViewerModal = ({ 
    isOpen, 
    onClose, 
    queryId, 
    images,      // All attachments from the message
    currentIndex, 
    token,
    apiBase = '/api/hr-queries'  // Can be changed to '/api/it-support/tickets' for IT support
}) => {
    const [zoom, setZoom] = useState(1);
    const [currentIdx, setCurrentIdx] = useState(currentIndex);
    
    if (!isOpen || !images || images.length === 0) return null;
    
    const currentImage = images[currentIdx];
    const imageUrl = `${apiBase}/${queryId}/images/${currentImage.fileId}`;
    
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
        <div className="image-viewer-overlay" onClick={onClose}>
            <div className="image-viewer-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{currentImage.originalName}</h3>
                    <div className="modal-controls">
                        <button onClick={() => setZoom(zoom + 0.25)} title="Zoom In">
                            <ZoomIn size={20} />
                        </button>
                        <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} title="Zoom Out">
                            <ZoomOut size={20} />
                        </button>
                        <button onClick={handleDownload} title="Download">
                            <Download size={20} />
                        </button>
                        <button onClick={onClose} title="Close">
                            <X size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="image-display-area">
                    {images.length > 1 && (
                        <button 
                            className="nav-button nav-prev"
                            onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                            disabled={currentIdx === 0}
                        >
                            <ChevronLeft size={30} />
                        </button>
                    )}
                    
                    <div className="image-container">
                        <img 
                            src={imageUrl}
                            alt={currentImage.originalName}
                            style={{ 
                                transform: `scale(${zoom})`,
                                transition: 'transform 0.2s ease'
                            }}
                        />
                    </div>
                    
                    {images.length > 1 && (
                        <button 
                            className="nav-button nav-next"
                            onClick={() => setCurrentIdx(Math.min(images.length - 1, currentIdx + 1))}
                            disabled={currentIdx === images.length - 1}
                        >
                            <ChevronRight size={30} />
                        </button>
                    )}
                </div>
                
                <div className="modal-footer">
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

export default MessageImageViewerModal;
```

## UI/UX Recommendations

### 1. Query Creation Form
- Add file input for images
- Show image previews before submission
- Display file size validation
- Show count of attached images
- Limit to 5 images with visual feedback

### 2. Message Thread View
- Display messages in conversation format
- Show image thumbnails inline with each message
- Click thumbnail to open full-size viewer
- Show download button for each image
- Indicate sender type (employee/hr/admin) with styling

### 3. Operational Dashboard (Admin/HR)
- Same message thread view
- Custom image viewer with zoom/navigate
- Easy image download access
- Show image metadata on hover
- Support keyboard navigation (arrow keys)

### 4. Help & Support FAB Button
- Show unread message count badge
- Display image attachment icons in thread preview
- Include full image viewer in overlay
- Support inline image viewing without leaving FAB

### 5. Reply/Response Interface
- File input for adding images to replies
- Preview images before sending
- Show upload progress (optional)
- Clear selected images option

## CSS Styling Example

```css
/* Message Thread */
.message-thread {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
}

.message {
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 1rem;
    background: #fff;
}

.message.employee {
    margin-right: 2rem;
    background: #f0f7ff;
}

.message.hr, .message.admin {
    margin-left: 2rem;
    background: #f0fff4;
}

.message-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e0e0e0;
}

.message-body {
    margin-bottom: 1rem;
    line-height: 1.6;
}

/* Message Attachments */
.message-attachments {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e0e0e0;
}

.attachment-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
    margin-top: 0.5rem;
}

.attachment-item {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 0.5rem;
    text-align: center;
}

.attachment-item img {
    width: 100%;
    height: 120px;
    object-fit: cover;
    border-radius: 4px;
    cursor: pointer;
    transition: transform 0.2s;
}

.attachment-item img:hover {
    transform: scale(1.05);
}

.attachment-info {
    margin: 0.5rem 0;
    font-size: 0.875rem;
    color: #666;
}

/* Image Viewer Modal */
.image-viewer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.image-viewer-modal {
    background: white;
    border-radius: 12px;
    max-width: 95vw;
    max-height: 95vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.modal-header {
    padding: 1rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e0e0e0;
    background: #f9f9f9;
}

.modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
}

.modal-controls {
    display: flex;
    gap: 0.5rem;
}

.modal-controls button {
    padding: 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
}

.modal-controls button:hover {
    background: rgba(0, 0, 0, 0.05);
}

.image-display-area {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #000;
}

.image-container {
    overflow: auto;
    max-width: 100%;
    max-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.image-container img {
    max-width: 100%;
    max-height: 70vh;
    object-fit: contain;
}

.nav-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.9);
    border: none;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    z-index: 10;
}

.nav-button:hover:not(:disabled) {
    background: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.nav-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.nav-prev {
    left: 1rem;
}

.nav-next {
    right: 1rem;
}

.modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #e0e0e0;
    background: #f9f9f9;
}

.image-counter {
    text-align: center;
    font-weight: 600;
    margin-bottom: 0.5rem;
}

.image-metadata {
    display: flex;
    justify-content: center;
    gap: 1.5rem;
    font-size: 0.875rem;
    color: #666;
}
```

## Error Handling

Same as IT Support tickets:
- File too large (400)
- Invalid file type (400)
- Too many images (400)
- Unauthorized access (403)
- Image not found (404)

## Testing Checklist

- [ ] Create HR query with images
- [ ] Add message with images (employee)
- [ ] Respond with images (HR/Admin)
- [ ] View images in message thread
- [ ] Download images
- [ ] Image viewer zoom controls
- [ ] Navigate between multiple images in a message
- [ ] Mobile responsive layout
- [ ] Anonymous queries show images correctly
- [ ] Access control (only authorized users can view)

## Security & Performance

Same considerations as IT Support tickets:
- 500KB size limit enforced
- File type validation
- Access control on all endpoints
- Secure filenames (UUIDs)
- GridFS streaming (memory efficient)
- Authentication required

## Integration with Help & Support FAB

Both IT Support tickets and HR Queries should show image attachments in the Help & Support FAB button:

```jsx
const HelpSupportFAB = ({ userId, token }) => {
    const [showOverlay, setShowOverlay] = useState(false);
    const [activeTab, setActiveTab] = useState('it'); // 'it' or 'hr'
    const [selectedItem, setSelectedItem] = useState(null);
    const [imageViewerOpen, setImageViewerOpen] = useState(false);
    const [currentImages, setCurrentImages] = useState([]);
    const [currentImageIdx, setCurrentImageIdx] = useState(0);
    
    const openImageViewer = (item, images, startIndex = 0) => {
        setCurrentImages(images);
        setCurrentImageIdx(startIndex);
        setImageViewerOpen(true);
    };
    
    return (
        <>
            <button className="fab-button" onClick={() => setShowOverlay(true)}>
                <HelpCircle />
            </button>
            
            {showOverlay && (
                <div className="fab-overlay">
                    <div className="fab-content">
                        <Tabs value={activeTab} onChange={setActiveTab}>
                            <Tab value="it">IT Support</Tab>
                            <Tab value="hr">HR Queries</Tab>
                        </Tabs>
                        
                        {activeTab === 'it' && (
                            <ITTicketList 
                                userId={userId}
                                token={token}
                                onImageClick={openImageViewer}
                            />
                        )}
                        
                        {activeTab === 'hr' && (
                            <HRQueryList 
                                userId={userId}
                                token={token}
                                onImageClick={openImageViewer}
                            />
                        )}
                    </div>
                </div>
            )}
            
            <MessageImageViewerModal 
                isOpen={imageViewerOpen}
                onClose={() => setImageViewerOpen(false)}
                queryId={selectedItem?._id}
                images={currentImages}
                currentIndex={currentImageIdx}
                token={token}
                apiBase={activeTab === 'it' ? '/api/it-support/tickets' : '/api/hr-queries'}
            />
        </>
    );
};
```
