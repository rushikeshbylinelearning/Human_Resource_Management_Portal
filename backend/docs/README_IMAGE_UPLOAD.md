# Image Upload Feature - Documentation Index

## 📚 Overview

This folder contains comprehensive documentation for the **Image Upload Feature** implemented for IT Support tickets and HR Queries.

---

## 📁 Documentation Files

### 1. **IMAGE_UPLOAD_QUICK_REFERENCE.md** ⭐ START HERE
**Best for:** Quick lookup, API reference, code snippets

Contains:
- API endpoints at a glance
- Quick code examples
- Common errors reference
- Testing commands
- Implementation checklist

**Read this first** if you need to integrate the feature quickly.

---

### 2. **IT_SUPPORT_IMAGE_INTEGRATION.md** 📘 DETAILED GUIDE
**Best for:** Complete IT Support ticket image integration

Contains:
- Detailed API documentation
- React and Vanilla JS examples
- Custom image viewer component code
- CSS styling examples
- Complete testing checklist
- Error handling guide

**Use this** when building the IT Support ticket interface.

---

### 3. **HR_QUERY_IMAGE_INTEGRATION.md** 📗 DETAILED GUIDE
**Best for:** Complete HR Query message image integration

Contains:
- Detailed API documentation
- Message thread implementation
- Image upload in conversations
- Admin/HR response with images
- Help & Support FAB integration
- Complete examples

**Use this** when building the HR Query interface.

---

### 4. **IMAGE_UPLOAD_IMPLEMENTATION_SUMMARY.md** 📋 TECHNICAL DOC
**Best for:** Understanding the complete implementation

Contains:
- Full backend implementation details
- Database schema reference
- Security features
- Performance considerations
- Deployment notes
- Future enhancements
- Maintenance queries

**Read this** to understand the technical architecture.

---

### 5. **Postman_Image_Upload_Collection.json** 🚀 API TESTING
**Best for:** Testing the API endpoints

Contains:
- Ready-to-import Postman collection
- All IT Support and HR Query endpoints
- Pre-configured request examples
- Environment variables setup

**Import this** into Postman to test the APIs immediately.

---

## 🎯 Quick Start Guide

### For Backend Developers:
1. Read **IMAGE_UPLOAD_QUICK_REFERENCE.md** for API overview
2. Review **IMAGE_UPLOAD_IMPLEMENTATION_SUMMARY.md** for technical details
3. Import **Postman_Image_Upload_Collection.json** to test endpoints
4. Run `npm run test:image-upload` to verify implementation

### For Frontend Developers:
1. Read **IMAGE_UPLOAD_QUICK_REFERENCE.md** for quick start
2. Use **IT_SUPPORT_IMAGE_INTEGRATION.md** for IT ticket forms
3. Use **HR_QUERY_IMAGE_INTEGRATION.md** for HR query interfaces
4. Copy the provided React components and customize them

### For QA/Testers:
1. Import **Postman_Image_Upload_Collection.json**
2. Follow testing checklists in detailed guides
3. Test with various image formats and sizes
4. Verify access control for different user roles

---

## 🚀 Testing the Implementation

### 1. Run the Test Script
```bash
cd backend
npm run test:image-upload
```

This will verify:
- ✅ Models are updated correctly
- ✅ Middleware files exist
- ✅ Controller functions are implemented
- ✅ Routes are configured
- ✅ Dependencies are installed
- ✅ Documentation is complete

### 2. Test with Postman
1. Import `Postman_Image_Upload_Collection.json` into Postman
2. Set environment variable `auth_token` with your JWT token
3. Set environment variable `base_url` (default: http://localhost:5000)
4. Test each endpoint with sample images

### 3. Manual Testing
```bash
# Test IT Support ticket creation with image
curl -X POST http://localhost:5000/api/it-support/tickets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "category=Computer / Laptop" \
  -F "title=Screen issue" \
  -F "description=Screen flickering problem" \
  -F "priority=High" \
  -F "images=@path/to/test-image.jpg"

# Test HR Query creation with image
curl -X POST http://localhost:5000/api/hr-queries/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "subject=Leave policy question" \
  -F "message=Need clarification" \
  -F "category=Leave" \
  -F "images=@path/to/test-image.png"
```

---

## 📊 Implementation Status

### Backend (100% Complete ✅)
- ✅ GridFS middleware for IT Support
- ✅ GridFS middleware for HR Queries
- ✅ Model updates (ITSupportTicket, HRQuery)
- ✅ Controller enhancements
- ✅ Route configuration
- ✅ Access control & security
- ✅ Error handling
- ✅ Comprehensive documentation
- ✅ Test scripts
- ✅ Postman collection

### Frontend (Pending ⏳)
- ⏳ File input components
- ⏳ Image preview functionality
- ⏳ Gallery display components
- ⏳ Image viewer modal
- ⏳ Download functionality
- ⏳ Delete functionality (IT tickets)
- ⏳ Help & Support FAB updates
- ⏳ Mobile responsive styling

---

## 🔑 Key Features

✨ **Upload:** Up to 5 images per ticket/message (500KB each)
✨ **Formats:** JPEG, JPG, PNG, GIF, WEBP
✨ **Storage:** MongoDB GridFS (separate buckets)
✨ **Security:** JWT authentication + role-based access
✨ **View/Download:** Inline viewing or file download
✨ **Delete:** Ticket owners can delete (before resolution)
✨ **Mobile:** Fully responsive design ready

---

## 🔒 Security Features

1. **Authentication** - JWT token required for all endpoints
2. **Authorization** - Role-based access control (owner, IT staff, HR, admin)
3. **Validation** - Server-side file type and size validation
4. **Secure Filenames** - UUID-based naming prevents collisions
5. **Isolated Storage** - Separate GridFS buckets (itSupportImages, hrQueryImages)
6. **Access Logging** - Console logs for audit trail

---

## 📱 API Endpoints Summary

### IT Support Tickets
```
POST   /api/it-support/tickets                           - Create with images
GET    /api/it-support/tickets/:id                       - Get ticket details
GET    /api/it-support/tickets/:ticketId/images/:imageId - View/download image
DELETE /api/it-support/tickets/:ticketId/images/:imageId - Delete image
```

### HR Queries
```
POST /api/hr-queries/create                              - Create with images
POST /api/hr-queries/:queryId/message                    - Add message with images
POST /api/hr-queries/admin/:queryId/respond              - Respond with images
GET  /api/hr-queries/:queryId/images/:imageId           - View/download image
```

---

## 🎨 Frontend Components Needed

### Priority 1 - Essential
1. **FileInputComponent** - Multi-file selection with validation
2. **ImagePreviewComponent** - Show thumbnails before upload
3. **ImageGalleryComponent** - Display uploaded images in grid
4. **ImageViewerModal** - Full-size viewer with zoom/navigate

### Priority 2 - Enhanced UX
5. **UploadProgressIndicator** - Loading state during upload
6. **DragDropZone** - Drag and drop file upload
7. **ImageCounter** - "3 of 5 images selected" indicator
8. **DeleteConfirmation** - Confirm before deleting images

---

## 💡 Code Examples

### React File Upload Hook
```jsx
const useImageUpload = (maxImages = 5, maxSize = 500 * 1024) => {
    const [images, setImages] = useState([]);
    const [errors, setErrors] = useState([]);
    
    const validateAndAddImages = (files) => {
        const newErrors = [];
        const validFiles = [];
        
        if (images.length + files.length > maxImages) {
            newErrors.push(`Maximum ${maxImages} images allowed`);
            return { success: false, errors: newErrors };
        }
        
        for (const file of files) {
            if (file.size > maxSize) {
                newErrors.push(`${file.name} exceeds size limit`);
            } else if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
                newErrors.push(`${file.name} is not a valid image`);
            } else {
                validFiles.push(file);
            }
        }
        
        if (newErrors.length > 0) {
            setErrors(newErrors);
            return { success: false, errors: newErrors };
        }
        
        setImages([...images, ...validFiles]);
        return { success: true, files: validFiles };
    };
    
    const removeImage = (index) => {
        setImages(images.filter((_, i) => i !== index));
    };
    
    const clearImages = () => {
        setImages([]);
        setErrors([]);
    };
    
    return {
        images,
        errors,
        validateAndAddImages,
        removeImage,
        clearImages
    };
};
```

### Image Viewer Component
See detailed implementation in:
- **IT_SUPPORT_IMAGE_INTEGRATION.md** (lines 300-400)
- **HR_QUERY_IMAGE_INTEGRATION.md** (lines 350-450)

---

## 🐛 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Images not uploading | Check file size (<500KB) and format (JPEG/PNG/GIF/WEBP) |
| "Authentication required" | Add Bearer token to Authorization header |
| "Access denied" | Verify user has correct permissions |
| Images not displaying | Check image URL and authentication |
| GridFS bucket not found | Normal - created on first upload |

---

## 📞 Support

### Questions about Implementation?
1. Check the relevant detailed guide
2. Review code examples in documentation
3. Run the test script: `npm run test:image-upload`
4. Test endpoints with Postman collection

### Found a Bug?
1. Check server logs for errors
2. Verify file size and format constraints
3. Test with different image files
4. Check authentication token validity

### Need Help with Frontend?
- All React components are provided in the detailed guides
- Copy and customize the code examples
- Follow the CSS styling examples provided
- Refer to the quick reference for API details

---

## 🎓 Learning Path

**Day 1:** Backend Understanding
1. Read IMAGE_UPLOAD_QUICK_REFERENCE.md
2. Review IMAGE_UPLOAD_IMPLEMENTATION_SUMMARY.md
3. Run test script to verify setup

**Day 2:** API Testing
1. Import Postman collection
2. Test all IT Support endpoints
3. Test all HR Query endpoints
4. Understand responses and errors

**Day 3-4:** Frontend Integration
1. Build file input component
2. Implement image preview
3. Create image gallery display
4. Build image viewer modal

**Day 5:** Testing & Polish
1. Test all user flows
2. Add error handling
3. Optimize for mobile
4. Final QA and documentation

---

## ✅ Pre-Deployment Checklist

- [ ] Run `npm run test:image-upload` - all checks pass
- [ ] Test with Postman - all endpoints working
- [ ] Verify GridFS buckets are created
- [ ] Check MongoDB storage capacity
- [ ] Test with various image formats
- [ ] Verify access control for all roles
- [ ] Test on mobile devices
- [ ] Review server logs for errors
- [ ] Backup database before deployment
- [ ] Document any configuration changes

---

## 📈 Monitoring & Maintenance

### Storage Monitoring
```javascript
// Check GridFS storage usage
db.itSupportImages.files.aggregate([
    { $group: { _id: null, totalSize: { $sum: "$length" }, count: { $sum: 1 } } }
])

db.hrQueryImages.files.aggregate([
    { $group: { _id: null, totalSize: { $sum: "$length" }, count: { $sum: 1 } } }
])
```

### Cleanup Orphaned Files
Run periodically to remove unused images:
```bash
node scripts/cleanup-orphaned-images.js
```
(Note: Script needs to be created based on cleanup logic in IMPLEMENTATION_SUMMARY.md)

---

## 🚀 Future Enhancements

Potential improvements (not yet implemented):
1. Auto-compression on upload
2. Thumbnail generation for faster loading
3. Drag & drop interface
4. Paste from clipboard
5. Image annotation/drawing tools
6. Video support (short clips)
7. OCR text extraction
8. CDN integration for serving images

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-09-30 | Initial implementation complete |
|  |  | - GridFS storage for IT Support & HR Queries |
|  |  | - Image upload/view/download/delete |
|  |  | - Complete documentation |
|  |  | - Test scripts and Postman collection |

---

## 📄 License & Credits

Part of the Attendance System project.
Implementation completed: September 30, 2026

---

**Status:** ✅ Backend Complete | ⏳ Frontend Integration Ready

For questions or issues, refer to the detailed guides in this folder.
