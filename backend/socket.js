// backend/socket.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const jwtUtils = require('./utils/jwtUtils');
const User = require('./models/User');
const NewNotificationService = require('./services/NewNotificationService');
const { setIO } = require('./socketManager');
const SSOVerification = require('./utils/ssoVerification');
const { buildAllowedOrigins } = require('./config/security');

const init = (httpServer) => {
    // --- START OF FIX ---
    // Simplified and corrected CORS configuration for robust handshake handling.
    const io = new Server(httpServer, {
        path: '/api/socket.io/',
        cors: {
            origin: buildAllowedOrigins(),
            methods: ["GET", "POST"],
            credentials: true,
        },
        transports: ['websocket', 'polling'], // Prioritize WebSocket
        allowEIO3: true,
    });
    // --- END OF FIX ---

    // Set the global io instance in the manager
    setIO(io);

    // Debug connection events
    io.on('connection', (socket) => {
        // Connection handled in authenticated handler below
        
        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
    });

    // Engine-level connection errors only
    io.engine.on('connection_error', (err) => {
        console.error('Socket.io connection error:', err.code, err.message);
    });

    // Enhanced Authentication Middleware - supports both AMS JWT and SSO tokens
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            let decoded = null;
            let user = null;

            // First, try to decode the token header to determine the algorithm
            let tokenHeader;
            try {
                const decoded = jwt.decode(token, { complete: true });
                if (!decoded || !decoded.header) {
                    return next(new Error('Authentication error: Invalid token format - missing header'));
                }
                tokenHeader = decoded.header;
                
                if (!tokenHeader.kid) {
                    return next(new Error('Authentication error: Missing key ID (kid) in token header'));
                }
            } catch (e) {
                return next(new Error('Authentication error: Invalid token format'));
            }

            // Verify JWT token using RS256 only
            if (tokenHeader?.alg === 'RS256') {
                try {
                    const kid = tokenHeader.kid;
                    if (!kid) {
                        return next(new Error('Authentication error: Missing key ID (kid)'));
                    }
                    
                    // Determine token type based on kid
                    if (kid.startsWith('sso-key-')) {
                        // SSO token - verify using JWKS
                        decoded = await jwtUtils.verifySSOTokenWithJWKS(token);
                        
                        const userId = decoded.userId || decoded.sub;
                        if (!userId) {
                            throw new Error('No user ID in SSO token');
                        }
                        
                        const userEmail = decoded.email;
                        if (!userEmail) {
                            throw new Error('No email in SSO token');
                        }
                        
                        const mongoose = require('mongoose');
                        if (mongoose.connection.readyState !== 1) {
                            throw new Error('MongoDB not connected - cannot query user');
                        }

                        const { normalizeEmail, caseInsensitiveEmailClause } = require('./utils/emailUtils');
                        const normalizedEmail = normalizeEmail(userEmail);
                        const rawLowerEmail = String(userEmail).toLowerCase();
                        const emailMatches = [normalizedEmail, rawLowerEmail, userEmail]
                            .map((value) => caseInsensitiveEmailClause(value))
                            .filter(Boolean)
                            .map((clause) => ({ email: clause }));

                        user = emailMatches.length
                            ? await User.findOne({
                                isActive: { $ne: false },
                                $or: emailMatches,
                            }).lean()
                            : null;
                        if (!user) {
                            throw new Error('User not found for SSO token email: ' + userEmail);
                        }
                    } else {
                        // AMS local token - verify using local public key
                        decoded = jwtUtils.verify(token);
                        
                        const userId = decoded.userId || decoded.id;
                        if (!userId) {
                            throw new Error('No user ID in AMS token');
                        }
                        
                        const mongoose = require('mongoose');
                        if (mongoose.connection.readyState !== 1) {
                            throw new Error('MongoDB not connected - cannot query user');
                        }
                        
                        user = await User.findById(userId).lean();
                        if (!user) {
                            throw new Error('User not found for AMS token');
                        }
                    }
                } catch (err) {
                    return next(new Error('Authentication error: Invalid token - ' + err.message));
                }
            } else {
                return next(new Error('Authentication error: Unsupported token algorithm - only RS256 is supported'));
            }


            if (!user) {
                return next(new Error('Authentication error: Invalid token or user not found'));
            }

            // Set socket user data
            socket.userId = user._id.toString();
            socket.userRole = user.role;
            socket.fullName = user.fullName;
            socket.userEmail = user.email;
            
            next();
        } catch (err) {
            console.error('❌ Socket authentication error:', err.message);
            next(new Error('Authentication error: Invalid token or server issue.'));
        }
    });

    // Connection Handler
    io.on('connection', (socket) => {
        // Join a personal room for targeted notifications
        socket.join(`user_${socket.userId}`);
        
        // Admins also join a general admin room for broadcasts
        if (['Admin', 'HR'].includes(socket.userRole)) {
            socket.join('admin_room');
        }

        // Join announcements channel
        socket.join('announcements');

        // Handle announcement messages
        socket.on('sendAnnouncement', (data) => {
            // Broadcast to all users EXCEPT the sender
            socket.to('announcements').emit('receiveAnnouncement', data);
        });

        // Handle announcement updates
        socket.on('updateAnnouncement', (data) => {
            // Broadcast to all users including sender for updates
            io.to('announcements').emit('announcementUpdated', data);
        });

        // Handle announcement deletions
        socket.on('deleteAnnouncement', (data) => {
            // Broadcast to all users including sender for deletions
            io.to('announcements').emit('announcementDeleted', data);
        });

        // Handle announcement pin/unpin
        socket.on('pinAnnouncement', (data) => {
            // Broadcast to all users including sender
            io.to('announcements').emit('announcementPinned', data);
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            // Silent disconnect handling
        });
    });
    return io;
};

module.exports = { init };