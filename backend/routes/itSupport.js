// backend/routes/itSupport.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const requireITSupportAccess = require('../middleware/requireITSupportAccess');
const uploadITSupportImageGridFS = require('../middleware/uploadITSupportImageGridFS');
const {
    createTicket,
    getMyTickets,
    getAllTickets,
    getTicketById,
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

// Admin/IT Staff routes - require IT support access permission
router.get('/tickets/export/excel', [authenticateToken, requireITSupportAccess], exportITTicketsToExcel);
router.get('/tickets', [authenticateToken, requireITSupportAccess], getAllTickets);
router.patch('/tickets/:id/status', [authenticateToken, requireITSupportAccess], updateTicketStatus);
router.patch('/tickets/:id/assign', [authenticateToken, requireITSupportAccess], assignTicket);
router.patch('/tickets/:id/priority', [authenticateToken, requireITSupportAccess], updateTicketPriority);

module.exports = router;
