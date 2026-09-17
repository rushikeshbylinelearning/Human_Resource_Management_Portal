// Winston logger configuration for better error tracking and performance monitoring
const winston = require('winston');
const path = require('path');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'attendance-system' },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Request logging middleware - only log errors and slow requests in production
const requestLogger = (req, res, next) => {
  // Skip logging in production for health checks and static assets
  const skipPaths = ['/health', '/metrics', '/cache-stats', '/api/socket.io'];
  const isStaticAsset = req.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
  
  if (process.env.NODE_ENV === 'production' && (skipPaths.some(p => req.url.startsWith(p)) || isStaticAsset)) {
    return next();
  }

  const start = Date.now();

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    // Only log errors (4xx, 5xx) or slow requests (>1s)
    const shouldLog = res.statusCode >= 400 || duration > 1000;
    
    if (shouldLog) {
      logger.info('Request', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      });
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Error logging helper
const logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    ...context
  });
};

module.exports = {
  logger,
  requestLogger,
  logError
};








