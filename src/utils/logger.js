const winston = require('winston');
const path = require('path');

/**
 * Service de logging Winston configuré pour le Notification Service
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'notification',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // Console transport pour le développement
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          return `${timestamp} [${service}] ${level}: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      )
    }),

    // File transport pour les logs d'erreur
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // File transport pour les logs combinés
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // File transport pour les logs de notifications
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'notifications.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ],

  // Gestion des exceptions non capturées
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'exceptions.log')
    })
  ],

  // Gestion des rejets de promesses non capturés
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.env.LOG_FILE_PATH || './logs', 'rejections.log')
    })
  ]
});

// Méthodes spécialisées pour différents types de logs
logger.auth = (message, meta = {}) => {
  logger.info(`[AUTH] ${message}`, { ...meta, category: 'auth' });
};

logger.security = (message, meta = {}) => {
  logger.warn(`[SECURITY] ${message}`, { ...meta, category: 'security' });
};

logger.email = (message, meta = {}) => {
  logger.info(`[EMAIL] ${message}`, { ...meta, category: 'email' });
};

logger.sms = (message, meta = {}) => {
  logger.info(`[SMS] ${message}`, { ...meta, category: 'sms' });
};

logger.queue = (message, meta = {}) => {
  logger.info(`[QUEUE] ${message}`, { ...meta, category: 'queue' });
};

logger.template = (message, meta = {}) => {
  logger.info(`[TEMPLATE] ${message}`, { ...meta, category: 'template' });
};

logger.performance = (message, meta = {}) => {
  logger.info(`[PERF] ${message}`, { ...meta, category: 'performance' });
};

logger.validation = (message, meta = {}) => {
  logger.warn(`[VALIDATION] ${message}`, { ...meta, category: 'validation' });
};

logger.external = (message, meta = {}) => {
  logger.info(`[EXTERNAL] ${message}`, { ...meta, category: 'external' });
};

logger.notification = (message, meta = {}) => {
  logger.info(`[NOTIFICATION] ${message}`, { ...meta, category: 'notification' });
};

logger.bulk = (message, meta = {}) => {
  logger.info(`[BULK] ${message}`, { ...meta, category: 'bulk' });
};

logger.rateLimit = (message, meta = {}) => {
  logger.warn(`[RATE_LIMIT] ${message}`, { ...meta, category: 'rate_limit' });
};

module.exports = logger;
