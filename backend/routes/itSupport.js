// backend/routes/itSupport.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const requireITSupportAccess = require('../middleware/requireITSupportAccess');
const {
    createTicket,
    getMyTickets,
    getAllTickets,
    getTicketById,
    updateTicketStatus,
    assignTicket,
    updateTicketPriority,
    addComment,
    cancelTicket
} = require('../controllers/itSupportController');

// Employee routes - any authenticated user can create and view their own tickets
router.post('/tickets', authenticateToken, createTicket);
router.get('/tickets/mine', authenticateToken, getMyTickets);
router.get('/tickets/:id', authenticateToken, getTicketById);
router.post('/tickets/:id/comment', authenticateToken, addComment);
router.patch('/tickets/:id/cancel', authenticateToken, cancelTicket);

// Admin/IT Staff routes - require IT support access permission
router.get('/tickets', [authenticateToken, requireITSupportAccess], getAllTickets);
router.patch('/tickets/:id/status', [authenticateToken, requireITSupportAccess], updateTicketStatus);
router.patch('/tickets/:id/assign', [authenticateToken, requireITSupportAccess], assignTicket);
router.patch('/tickets/:id/priority', [authenticateToken, requireITSupportAccess], updateTicketPriority);

module.exports = router;
