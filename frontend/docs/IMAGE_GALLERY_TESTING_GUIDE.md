# Image Gallery Testing Guide - IT Support & HR Queries

## Overview
This guide helps you test the image upload and viewing functionality for IT Support tickets and HR Queries.

## Prerequisites
- Backend server running on port 5000
- Frontend server running on port 3000
- Valid user credentials (employee, IT staff, or admin)
- Sample images ready (JPEG, PNG, GIF, or WEBP, max 500KB each)

## Test Scenarios

### 1. IT Support - Image Upload

#### Test 1.1: Upload Single Image
1. Navigate to IT Support page
2. Click "Raise IT Ticket" button
3. Fill in the form:
   - Category: Select any category
   - Priority: Select any priority
   - Title: "Test ticket with single image"
   - Description: "Testing single image upload"
4. Click "Add Images" or drag-and-drop 1 image
5. Verify image preview appears
6. Verify file info shows (name, size)
7. Click "Submit Ticket"
8. **Expected:** Success message, ticket created

#### Test 1.2: Upload Multiple Images
1. Create new ticket
2. Upload 3 images at once
3. Verify all 3 previews appear
4. Verify you can remove individual images
5. Submit ticket
6. **Expected:** All 3 images attached

#### Test 1.3: Upload Maximum Images
1. Create new ticket
2. Try to upload 6 images (exceeds limit)
3. **Expected:** Error message "Maximum 5 images allowed"
4. Upload exactly 5 images
5. **Expected:** All 5 images attached successfully

#### Test 1.4: Invalid File Type
1. Create new ticket
2. Try to upload a PDF or TXT file
3. **Expected:** Error message "Only JPEG, PNG, GIF, and WEBP images are allowed"

#### Test 1.5: Oversized File
1. Create new ticket
2. Try to upload image larger than 500KB
3. **Expected:** Error message showing file size exceeds limit

### 2. IT Support - Viewing Images

#### Test 2.1: View in Ticket Card
1. Navigate to IT Support page
2. Find ticket with images
3. **Expected:** Image icon with count (e.g., "3") appears in card footer
4. Hover over icon
5. **Expected:** Tooltip shows "3 images attached"

#### Test 2.2: View in Details Modal
1. Click on ticket with images
2. Wait for modal to load
3. Scroll down to images section
4. **Expected:**
   - Divider with "X Image(s) Attached" chip
   - Grid of image thumbnails
   - All images visible

#### Test 2.3: Image Hover Effects
1. In details modal, hover over an image thumbnail
2. **Expected:**
   - Thumbnail raises slightly (translateY effect)
   - Shadow increases
   - Semi-transparent overlay appears with image icon

#### Test 2.4: Download Image
1. In details modal, hover over an image thumbnail
2. Click the download button (top-right of thumbnail)
3. **Expected:**
   - Download starts immediately
   - File saves with original filename
   - Click doesn't trigger image viewer

### 3. IT Support - Image Viewer

#### Test 3.1: Open Image Viewer
1. In details modal, click on an image thumbnail (not the download button)
2. **Expected:**
   - Full-screen modal opens
   - Image displays at center
   - Navigation controls visible (if multiple images)
   - Zoom controls visible
   - Download button visible

#### Test 3.2: Zoom Controls
1. Open image viewer
2. Click "+" (zoom in) button multiple times
3. **Expected:** Image scales up (up to 3x)
4. Click "-" (zoom out) button
5. **Expected:** Image scales down (minimum 0.25x)
6. Verify zoom level display updates

#### Test 3.3: Keyboard Navigation
1. Open image viewer with multiple images
2. Press Right Arrow key
3. **Expected:** Next image displays
4. Press Left Arrow key
5. **Expected:** Previous image displays
6. Press Escape key
7. **Expected:** Image viewer closes

#### Test 3.4: Mouse Navigation
1. Open image viewer with multiple images
2. Click right arrow button (">")
3. **Expected:** Next image displays
4. Click left arrow button ("<")
5. **Expected:** Previous image displays

#### Test 3.5: Thumbnail Navigation
1. Open image viewer with 3+ images
2. Look at bottom thumbnail strip
3. Click on different thumbnail
4. **Expected:**
   - That image displays
   - Active thumbnail highlighted

#### Test 3.6: Download from Viewer
1. Open image viewer
2. Click download button
3. **Expected:**
   - Image downloads with original filename
   - Viewer remains open

### 4. Operational Dashboard (Admin/IT Staff View)

#### Test 4.1: View All Tickets with Images
1. Login as admin or IT staff member
2. Navigate to Operational Dashboard → IT Support
3. **Expected:** All tickets show image counts in cards

#### Test 4.2: View Images in Admin Modal
1. Click on any ticket with images
2. **Expected:**
   - Same image gallery as user view
   - All images visible and downloadable
   - Image viewer works identically

#### Test 4.3: Update Ticket Status
1. Open ticket details modal (admin view)
2. Update status to "In Progress"
3. Add admin notes
4. Click "Update request"
5. **Expected:**
   - Status updates successfully
   - Modal refreshes
   - Images still visible after refresh

### 5. Browser Console Testing

#### Test 5.1: Check Debug Logs
1. Open Browser DevTools (F12)
2. Go to Console tab
3. Open a ticket with images
4. **Expected logs:**
   ```
   ITTicketCard - Ticket: ITS-XXXX Images: [...]
   Fetched full ticket: {...}
   ITTicketDetailsModal - Ticket data: {...}
   ITTicketDetailsModal - Images: [...]
   Rendering images section - fullTicket.images: [...]
   Should render images? true
   ```

#### Test 5.2: Check Network Requests
1. Open DevTools → Network tab
2. Open ticket details modal
3. **Expected requests:**
   - GET `/api/it-support/tickets/:id` - 200 OK
4. Click on an image thumbnail
5. **Expected requests:**
   - GET `/api/it-support/tickets/:ticketId/images/:imageId` - 200 OK

#### Test 5.3: Check for Errors
1. Open DevTools → Console tab
2. Perform all above tests
3. **Expected:** No errors in console
4. **If errors appear:** Note error message and stack trace

### 6. Edge Cases

#### Test 6.1: Ticket Without Images
1. Open ticket with no images
2. **Expected:**
   - No image icon in card
   - No image gallery section in details modal
   - No errors in console

#### Test 6.2: Slow Network
1. Open DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Open ticket with images
4. **Expected:**
   - Loading spinner shows while fetching
   - Images load progressively
   - No broken image icons

#### Test 6.3: Image Load Failure
1. Open ticket with images
2. If an image fails to load:
3. **Expected:**
   - Broken image placeholder or alt text
   - Download still attempts to work
   - Other images load normally

#### Test 6.4: Cancel Ticket
1. Open ticket with images (as creator)
2. Click "Cancel Ticket"
3. Confirm cancellation
4. **Expected:**
   - Ticket status changes to CANCELLED
   - Images still visible in cancelled ticket
   - Cannot add comments or modify

### 7. Performance Testing

#### Test 7.1: Multiple Tickets with Images
1. Create 10 tickets, each with 5 images
2. Load tickets list
3. **Expected:**
   - Page loads reasonably fast
   - No memory leaks
   - Scrolling is smooth

#### Test 7.2: Large Images
1. Create ticket with 5 images, each close to 500KB
2. Open details modal
3. **Expected:**
   - All images load
   - Thumbnails render quickly
   - Full-size viewer loads within 2-3 seconds

## Known Issues / Limitations

1. **Max 5 images per ticket** - enforced client and server side
2. **Max 500KB per image** - enforced client and server side
3. **Supported formats:** JPEG, JPG, PNG, GIF, WEBP only
4. **GridFS storage** - images stored in MongoDB, not filesystem
5. **Authentication required** - all image endpoints require valid JWT

## Troubleshooting

### Images not showing in modal
**Solution:** 
- Check browser console for errors
- Verify `fullTicket.images` array exists in console logs
- Refresh page and try again
- Clear browser cache

### Image download not working
**Solution:**
- Check if authentication token is valid
- Verify network request shows 200 OK
- Check if popup blocker is enabled
- Try different browser

### Upload fails silently
**Solution:**
- Check image size (must be ≤ 500KB)
- Check image format (must be JPEG/PNG/GIF/WEBP)
- Check backend logs for errors
- Verify multer middleware is configured

### Images load slowly
**Solution:**
- Compress images before uploading
- Check network connection
- Consider implementing lazy loading
- Consider adding image optimization

## Success Criteria

✅ All images upload successfully
✅ Image counts display correctly in cards
✅ Image gallery renders in details modal
✅ Image viewer opens and functions properly
✅ Zoom controls work (0.25x to 3x)
✅ Keyboard navigation works
✅ Download functionality works
✅ No errors in browser console
✅ Admins can view all images
✅ Users can view their own ticket images

## Cleanup After Testing

1. Delete test tickets (if allowed)
2. Clear browser cache
3. Remove debug logs from code (optional)
4. Close all open modals/dialogs
5. Logout and login to verify session handling
