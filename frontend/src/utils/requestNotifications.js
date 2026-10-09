// Helpers to split admin notification drawer compartments

export const REQUEST_NOTIFICATION_TYPES = [
    'resource_request',
    'resource_request_status',
    'hr_query_new',
    'hr_query_response',
    'hr_query_status_changed',
    'it_ticket_created',
    'it_ticket_status',
    'it_ticket_assigned',
    'it_ticket_priority',
    'it_ticket_comment',
    'it_ticket_cancelled',
];

export const isRequestNotification = (notification) => {
    if (!notification) return false;
    if (notification.category === 'request' || notification.category === 'hr_query' || notification.category === 'it_support') {
        return true;
    }
    return REQUEST_NOTIFICATION_TYPES.includes(notification.type);
};

export const partitionNotifications = (notifications = []) => {
    const attendance = [];
    const requests = [];
    for (const n of notifications) {
        if (isRequestNotification(n)) {
            requests.push(n);
        } else {
            attendance.push(n);
        }
    }
    return { attendance, requests };
};

export const countUnread = (list = []) => list.filter((n) => !n.read).length;
