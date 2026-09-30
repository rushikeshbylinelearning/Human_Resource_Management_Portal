# HR Query Image Integration Guide

## Quick Integration Steps

The image upload components are already built and ready to use. Here's how to integrate them into HR Query components:

---

## 1. Update HRQueryChat.jsx

### Import Components
```jsx
import { ImageUploadInput, ImageViewerModal } from './ImageUpload';
import { getImageUrl } from '../utils/imageUtils';
import { useAuth } from '../context/AuthContext';
```

### Add State for Images
```jsx
// In the component
const { token } = useAuth();
const [queryImages, setQueryImages] = useState([]);
const [messageImages, setMessageImages] = useState([]);
const [imageViewerOpen, setImageViewerOpen] = useState(false);
const [selectedMessageImages, setSelectedMessageImages] = useState([]);
const [currentImageIndex, setCurrentImageIndex] = useState(0);
```

### Update Create Query Function
```jsx
const handleCreateQuery = async () => {
    if (!newQueryData.subject.trim() || !newQueryData.message.trim()) {
        setError('Subject and message are required');
        return;
    }

    setSending(true);
    try {
        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('subject', newQueryData.subject.trim());
        formData.append('category', newQueryData.category);
        formData.append('message', newQueryData.message.trim());
        formData.append('anonymousToHR', newQueryData.anonymousToHR);
        
        // Append images
        queryImages.forEach((image) => {
            formData.append('images', image);
        });

        await api.post('/hr-queries/create', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        
        setCreateDialogOpen(false);
        setNewQueryData({
            subject: '',
            category: 'General',
            message: '',
            anonymousToHR: false
        });
        setQueryImages([]);
        await fetchQueries();
    } catch (error) {
        console.error('Failed to create query:', error);
        setError('Failed to submit query');
    } finally {
        setSending(false);
    }
};
```

### Update Send Message Function
```jsx
const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('message', newMessage.trim());
        
        // Append images
        messageImages.forEach((image) => {
            formData.append('images', image);
        });

        await api.post(`/hr-queries/${selectedQuery._id}/message`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        
        setNewMessage('');
        setMessageImages([]);
        await fetchQueryDetails(selectedQuery._id);
    } catch (error) {
        console.error('Failed to send message:', error);
        setError('Failed to send message');
    } finally {
        setSending(false);
    }
};
```

### Add ImageUploadInput to Create Dialog
```jsx
<Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
    <DialogTitle>Ask HR a Question</DialogTitle>
    <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
                label="Subject"
                value={newQueryData.subject}
                onChange={(e) => setNewQueryData({ ...newQueryData, subject: e.target.value })}
            />
            {/* ... other fields ... */}
            <TextField
                label="Your Question"
                multiline
                rows={4}
                value={newQueryData.message}
                onChange={(e) => setNewQueryData({ ...newQueryData, message: e.target.value })}
            />
            
            {/* Add Image Upload */}
            <Divider>
                <Typography variant="caption">Attachments (Optional)</Typography>
            </Divider>
            <ImageUploadInput
                value={queryImages}
                onChange={setQueryImages}
                maxFiles={5}
                maxSizeKB={500}
                helperText="Attach images to help explain your question"
            />
        </Stack>
    </DialogContent>
    <DialogActions>
        <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleCreateQuery} variant="contained" disabled={sending}>
            {sending ? 'Submitting...' : 'Submit'}
        </Button>
    </DialogActions>
</Dialog>
```

### Display Images in Messages
```jsx
// In the message rendering section, add this after the message text:
{msg.attachments && msg.attachments.length > 0 && (
    <Box sx={{ mt: 1 }}>
        <Grid container spacing={1}>
            {msg.attachments.map((attachment, idx) => (
                <Grid item xs={4} key={attachment.fileId}>
                    <Paper
                        elevation={2}
                        sx={{
                            position: 'relative',
                            paddingTop: '100%',
                            borderRadius: 1,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            '&:hover': {
                                boxShadow: 4
                            }
                        }}
                        onClick={() => {
                            setSelectedMessageImages(msg.attachments);
                            setCurrentImageIndex(idx);
                            setImageViewerOpen(true);
                        }}
                    >
                        <Box
                            component="img"
                            src={getImageUrl('hr-query', selectedQuery._id, attachment.fileId)}
                            alt={attachment.originalName}
                            sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                            }}
                        />
                    </Paper>
                </Grid>
            ))}
        </Grid>
    </Box>
)}
```

### Add ImageUploadInput to Message Input
```jsx
// In the message input section at the bottom:
<Box sx={{ p: 2, borderTop: '1px solid #e0e0e0' }}>
    {/* Image Upload for Messages */}
    {messageImages.length > 0 && (
        <Box sx={{ mb: 1 }}>
            <ImageUploadInput
                value={messageImages}
                onChange={setMessageImages}
                maxFiles={5}
                maxSizeKB={500}
                showPreview={true}
            />
        </Box>
    )}
    
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
            fullWidth
            multiline
            maxRows={4}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
        />
        {/* Button to toggle image upload */}
        <IconButton
            onClick={() => {
                if (messageImages.length === 0) {
                    // Trigger file input (you'll need to add a ref)
                    document.getElementById('message-image-input').click();
                }
            }}
        >
            <ImageIcon />
        </IconButton>
        <IconButton
            onClick={handleSendMessage}
            disabled={sending || (!newMessage.trim() && messageImages.length === 0)}
        >
            <SendIcon />
        </IconButton>
    </Box>
</Box>
```

### Add ImageViewerModal
```jsx
// At the end of the component, before closing return:
<ImageViewerModal
    open={imageViewerOpen}
    onClose={() => setImageViewerOpen(false)}
    images={selectedMessageImages}
    currentIndex={currentImageIndex}
    resourceType="hr-query"
    resourceId={selectedQuery?._id}
    showDownload={true}
    showNavigation={true}
/>
```

---

## 2. Update HRQueryFloatingChat.jsx

Apply the same changes as above to the floating chat version:
- Add image upload to admin respond function
- Display images in message threads
- Add image viewer modal

---

## 3. Update admin/HRQueryManagement.jsx

For the admin view:
- Display attached images in query threads
- Add image viewer for admin view
- Show image count badges in query lists

---

## Quick Copy-Paste Snippets

### Complete Image Upload Section
```jsx
<Box>
    <Divider sx={{ my: 2 }}>
        <Typography variant="caption" color="text.secondary">
            Attachments (Optional)
        </Typography>
    </Divider>
    <ImageUploadInput
        value={images}
        onChange={setImages}
        maxFiles={5}
        maxSizeKB={500}
        showPreview={true}
        helperText="Attach images to help explain your question (max 5, 500KB each)"
    />
</Box>
```

### Complete Message Image Display
```jsx
{message.attachments && message.attachments.length > 0 && (
    <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}
        </Typography>
        <Grid container spacing={1}>
            {message.attachments.map((att, idx) => (
                <Grid item xs={6} sm={4} md={3} key={att.fileId}>
                    <Paper
                        elevation={2}
                        sx={{
                            position: 'relative',
                            paddingTop: '100%',
                            borderRadius: 1,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 }
                        }}
                        onClick={() => {
                            setSelectedMessageImages(message.attachments);
                            setCurrentImageIndex(idx);
                            setImageViewerOpen(true);
                        }}
                    >
                        <Box
                            component="img"
                            src={getImageUrl('hr-query', queryId, att.fileId)}
                            alt={att.originalName}
                            sx={{
                                position: 'absolute',
                                top: 0, left: 0,
                                width: '100%', height: '100%',
                                objectFit: 'cover'
                            }}
                        />
                    </Paper>
                </Grid>
            ))}
        </Grid>
    </Box>
)}
```

---

## Testing Checklist

After integration, test:
- [ ] Create HR query with images
- [ ] Send message with images
- [ ] View images in message thread
- [ ] Open full-screen image viewer
- [ ] Zoom in/out images
- [ ] Navigate between images
- [ ] Download images
- [ ] Admin can view and respond with images
- [ ] Mobile responsive
- [ ] Error handling (file too large, wrong type)

---

## Notes

1. **Backend Already Ready** - The backend API already supports multipart/form-data for HR queries
2. **Reusable Components** - ImageUploadInput and ImageViewerModal work for both IT Support and HR Queries
3. **Consistent UX** - Same image upload experience across the app
4. **Mobile Friendly** - All components are responsive and touch-friendly

---

## Estimated Time

- HRQueryChat.jsx updates: ~30 minutes
- HRQueryFloatingChat.jsx updates: ~20 minutes
- Admin view updates: ~15 minutes
- Testing: ~30 minutes

**Total: ~2 hours** for complete HR Query image integration

---

## Support

All components are documented and include:
- PropTypes (implicit via usage)
- Error handling
- Loading states
- Accessibility features

Refer to `utils/imageUtils.js` for utility functions and `components/ImageUpload/` for component usage.
