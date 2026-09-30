# Image Upload Quick Reference Card

## 🎯 Quick Stats
- **Max Image Size:** 500KB per image
- **Max Images:** 5 per ticket/message
- **Formats:** JPEG, JPG, PNG, GIF, WEBP
- **Storage:** MongoDB GridFS
- **Buckets:** `itSupportImages`, `hrQueryImages`

---

## 📍 API Endpoints

### IT Support Tickets

```http
# Create ticket with images
POST /api/it-support/tickets
Content-Type: multipart/form-data
Authorization: Bearer {token}

Fields: category, title, description, priority, location, images[]

# View image
GET /api/it-support/tickets/:ticketId/images/:imageId
GET /api/it-support/tickets/:ticketId/images/:imageId?download=true

# Delete image (owner only, OPEN/ACKNOWLEDGED tickets)
DELETE /api/it-support/tickets/:ticketId/images/:imageId
```

### HR Queries

```http
# Create query with images
POST /api/hr-queries/create
Content-Type: multipart/form-data
Authorization: Bearer {token}

Fields: subject, message, category, anonymousToHR, images[]

# Add message with images (employee)
POST /api/hr-queries/:queryId/message
Content-Type: multipart/form-data
Fields: message, images[]

# Respond with images (HR/Admin)
POST /api/hr-queries/admin/:queryId/respond
Content-Type: multipart/form-data
Fields: message, images[]

# View image
GET /api/hr-queries/:queryId/images/:imageId
GET /api/hr-queries/:queryId/images/:imageId?download=true
```

---

## 💻 Frontend Code Snippets

### Upload Images (FormData)

```javascript
const formData = new FormData();
formData.append('title', 'Issue title');
formData.append('description', 'Issue description');

// Add multiple images
Array.from(imageFiles).forEach(file => {
    formData.append('images', file);
});

await fetch('/api/it-support/tickets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
});
```

### Display Image

```jsx
<img 
    src={`/api/it-support/tickets/${ticketId}/images/${imageId}`}
    alt={imageName}
    onClick={() => openViewer()}
/>
```

### Download Image

```javascript
const downloadImage = async (ticketId, imageId, filename) => {
    const res = await fetch(
        `/api/it-support/tickets/${ticketId}/images/${imageId}?download=true`,
        { headers: { 'Authorization': `Bearer ${token}` }}
    );
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
};
```

### File Input Validation

```javascript
const validateImages = (files) => {
    const errors = [];
    
    if (files.length > 5) {
        errors.push('Maximum 5 images allowed');
    }
    
    for (const file of files) {
        if (file.size > 500 * 1024) {
            errors.push(`${file.name} exceeds 500KB`);
        }
        
        if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
            errors.push(`${file.name} is not a valid image format`);
        }
    }
    
    return errors;
};
```

---

## 🗄️ Database Schema

### IT Support Ticket
```javascript
images: [{
    fileId: ObjectId,        // GridFS file ID
    filename: String,        // it-support-{uuid}.{ext}
    originalName: String,    // user's filename
    mimetype: String,        // image/jpeg
    size: Number,            // bytes
    uploadedAt: Date
}]
```

### HR Query Message
```javascript
messages: [{
    // ... other fields
    attachments: [{
        fileId: ObjectId,        // GridFS file ID
        filename: String,        // hr-query-{uuid}.{ext}
        originalName: String,    // user's filename
        mimetype: String,        // image/jpeg
        size: Number,            // bytes
        uploadedAt: Date
    }]
}]
```

---

## 🔒 Access Control

### IT Support Images:
- ✅ Ticket owner
- ✅ Assigned IT staff
- ✅ Admins
- ✅ Users with `canManageITSupport` permission

### HR Query Images:
- ✅ Query owner (employee)
- ✅ HR staff
- ✅ Admins
- ✅ Users with `canManageHRQueries` permission

---

## ❌ Common Errors

| Error | Meaning | Solution |
|-------|---------|----------|
| 400 - exceeds 500KB | File too large | Compress image |
| 400 - Invalid file type | Wrong format | Use JPEG/PNG/GIF/WEBP |
| 400 - Maximum 5 images | Too many files | Select max 5 images |
| 401 - Authentication required | No token | Add Bearer token to headers |
| 403 - Access denied | Not authorized | Check user permissions |
| 404 - Image not found | Invalid ID | Verify image exists |

---

## 🧪 Testing Commands

```bash
# Test IT Support image upload
curl -X POST http://localhost:5000/api/it-support/tickets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "category=Computer / Laptop" \
  -F "title=Test issue" \
  -F "description=Test description" \
  -F "priority=Medium" \
  -F "images=@path/to/image1.jpg" \
  -F "images=@path/to/image2.png"

# Test image download
curl -X GET http://localhost:5000/api/it-support/tickets/TICKET_ID/images/IMAGE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o downloaded_image.jpg

# Test HR Query with image
curl -X POST http://localhost:5000/api/hr-queries/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "subject=Test query" \
  -F "message=Test message" \
  -F "category=General" \
  -F "images=@path/to/image.jpg"
```

---

## 📝 File Locations

### Backend Files:
```
backend/
├── middleware/
│   ├── uploadITSupportImageGridFS.js
│   └── uploadHRQueryImageGridFS.js
├── models/
│   ├── ITSupportTicket.js (updated)
│   └── HRQuery.js (updated)
├── controllers/
│   └── itSupportController.js (updated)
├── routes/
│   ├── itSupport.js (updated)
│   └── hrQueries.js (updated)
└── docs/
    ├── IT_SUPPORT_IMAGE_INTEGRATION.md
    ├── HR_QUERY_IMAGE_INTEGRATION.md
    ├── IMAGE_UPLOAD_IMPLEMENTATION_SUMMARY.md
    └── IMAGE_UPLOAD_QUICK_REFERENCE.md
```

---

## 🎨 Frontend Components Needed

1. **File Input Component** - With preview and validation
2. **Image Gallery Component** - Thumbnail grid for tickets/queries
3. **Image Viewer Modal** - Full-size view with zoom/navigate
4. **Image Upload Progress** - Optional loading indicator
5. **Help & Support FAB** - Updated with image support

---

## 🚀 Implementation Priority

1. **Phase 1:** IT Support ticket creation with images ⭐
2. **Phase 2:** IT Support image viewer and download ⭐
3. **Phase 3:** HR Query creation with images ⭐
4. **Phase 4:** HR Query messaging with images ⭐
5. **Phase 5:** Admin dashboard image viewing ⭐⭐
6. **Phase 6:** Help & Support FAB integration ⭐⭐
7. **Phase 7:** Mobile responsive design ⭐⭐⭐

---

## 📚 Documentation

- **Detailed Integration Guide:** See IT_SUPPORT_IMAGE_INTEGRATION.md and HR_QUERY_IMAGE_INTEGRATION.md
- **Full Summary:** See IMAGE_UPLOAD_IMPLEMENTATION_SUMMARY.md
- **This Guide:** Quick reference for developers

---

## ✅ Implementation Checklist

### Backend (Complete ✅)
- [x] GridFS middleware for IT Support
- [x] GridFS middleware for HR Queries
- [x] Model updates
- [x] Controller functions
- [x] Route configuration
- [x] Access control
- [x] Error handling
- [x] Documentation

### Frontend (To Do)
- [ ] File input components
- [ ] Image preview on upload
- [ ] Gallery display components
- [ ] Image viewer modal
- [ ] Download functionality
- [ ] Delete functionality (IT tickets)
- [ ] Help & Support FAB updates
- [ ] Mobile responsive styling
- [ ] Error handling UI
- [ ] Loading states

---

## 🎯 Success Criteria

✅ Users can attach up to 5 images (500KB each) when creating IT Support tickets
✅ Users can attach images to HR Query messages
✅ Admins/IT staff can attach images to responses
✅ Images are viewable in a custom viewer with zoom and navigation
✅ Images can be downloaded
✅ Proper access control is enforced
✅ Mobile-friendly interface
✅ Error messages are clear and helpful

---

**Status:** Backend Complete ✅ | Frontend Integration Pending ⏳

**Last Updated:** 2026-09-30
