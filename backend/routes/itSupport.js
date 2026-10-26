// backend/routes/itSupport.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const {
    requireITSupportAccess,
    requireITSupportWriteAccess,
    requireITSupportAssignAccess
} = require('../middleware/requireITSupportAccess');
const uploadITSupportImageGridFS = require('../middleware/uploadITSupportImageGridFS');
const {
    createTicket,
    getMyTickets,
    getAllTickets,
    getTicketById,
    getAssignableStaff,
    updateTicketStatus,
    assignTicket,
    updateTicketPriority,
    addComment,
    cancelTicket,
    getTicketImage,
    deleteTicketImage,
    exportITTicketsToExcel
} = require('../controllers/itSupportController');

// Employee routes - any authenticated user can create and view their own tickets
router.post('/tickets', authenticateToken, uploadITSupportImageGridFS, createTicket);
router.get('/tickets/mine', authenticateToken, getMyTickets);
router.get('/tickets/:id', authenticateToken, getTicketById);
router.post('/tickets/:id/comment', authenticateToken, addComment);
router.patch('/tickets/:id/cancel', authenticateToken, cancelTicket);

// Image viewing/downloading - accessible by ticket owner, assigned IT staff, or admins
router.get('/tickets/:ticketId/images/:imageId', authenticateToken, getTicketImage);
router.delete('/tickets/:ticketId/images/:imageId', authenticateToken, deleteTicketImage);

// IT staff routes — view (read-only or write) vs write-only mutations
// Note: static paths must be registered before /tickets/:id
router.get('/tickets/export/excel', [authenticateToken, requireITSupportAccess], exportITTicketsToExcel);
router.get('/assignees', [authenticateToken, requireITSupportAccess], getAssignableStaff);
router.get('/tickets', [authenticateToken, requireITSupportAccess], getAllTickets);
router.patch('/tickets/:id/status', [authenticateToken, requireITSupportWriteAccess], updateTicketStatus);
router.patch('/tickets/:id/assign', [authenticateToken, requireITSupportAssignAccess], assignTicket);
router.patch('/tickets/:id/priority', [authenticateToken, requireITSupportWriteAccess], updateTicketPriority);

module.exports = router;
