/** Map IT ticket status to HR-style status keys for shared chip colors */
export const statusStyleKey = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'OPEN' || s === 'ACKNOWLEDGED') return 'open';
    if (s === 'IN_PROGRESS' || s === 'WAITING_FOR_USER') return 'in-progress';
    if (s === 'RESOLVED') return 'resolved';
    return 'closed';
};

export const formatStatusLabel = (status) =>
    (status || '')
        .split('_')
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(' ');

export const buildThreadMessages = (ticket) => {
    if (!ticket) return [];
    const createdById = ticket.createdBy?.toString?.() || String(ticket.createdBy || '');
    const messages = [
        {
            sender: 'employee',
            senderName: ticket.createdByName || 'Employee',
            message: ticket.description,
            timestamp: ticket.createdAt,
        },
    ];

    (ticket.comments || [])
        .filter((c) => !c.isInternal)
        .forEach((c) => {
            const authorId = c.author?.toString?.() || String(c.author || '');
            const isEmployee = authorId && authorId === createdById;
            messages.push({
                sender: isEmployee ? 'employee' : 'it',
                senderName: c.authorName || 'IT Support',
                message: c.comment,
                timestamp: c.timestamp,
            });
        });

    return messages;
};

export const ticketLastActivityAt = (ticket) =>
    ticket?.updatedAt || ticket?.createdAt;
