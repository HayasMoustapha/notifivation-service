require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');

const logger = require('./utils/logger');
const healthRoutes = require('./health/health.routes');
const notificationsRoutes = require('./api/routes/notifications.routes');
const migrator = require('./database/migrator');

/**
 * Serveur principal du Notification Service
 */
class NotificationServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3002;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure les middlewares
   */
  setupMiddleware() {
    // Sécurité
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Webhook-Signature']
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Sécurité contre les injections NoSQL
    this.app.use(mongoSanitize());

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim())
        }
      }));
    }

    // Rate limiting général
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
      message: {
        success: false,
        message: 'Trop de requêtes, veuillez réessayer plus tard',
        error: {
          code: 'RATE_LIMIT_EXCEEDED'
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);

    // Rate limiting spécifique pour les emails
    const emailLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: parseInt(process.env.EMAIL_RATE_LIMIT) || 10, // limit each IP to 10 emails per minute
      message: {
        success: false,
        message: 'Limite d\'emails atteinte, veuillez réessayer plus tard',
        error: {
          code: 'EMAIL_RATE_LIMIT_EXCEEDED'
        }
      },
      keyGenerator: (req) => {
        // Utiliser l'ID utilisateur si authentifié, sinon l'IP
        return req.user?.id || req.ip;
      }
    });
    this.app.use('/api/notifications/email', emailLimiter);

    // Rate limiting spécifique pour les SMS
    const smsLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: parseInt(process.env.SMS_RATE_LIMIT) || 5, // limit each IP to 5 SMS per minute
      message: {
        success: false,
        message: 'Limite de SMS atteinte, veuillez réessayer plus tard',
        error: {
          code: 'SMS_RATE_LIMIT_EXCEEDED'
        }
      },
      keyGenerator: (req) => {
        // Utiliser l'ID utilisateur si authentifié, sinon l'IP
        return req.user?.id || req.ip;
      }
    });
    this.app.use('/api/notifications/sms', smsLimiter);

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type')
      });
      next();
    });
  }

  /**
   * Configure les routes
   */
  setupRoutes() {
    // Route racine
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Notification Service',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        capabilities: {
          email: true,
          sms: true,
          bulk: true,
          webhooks: true,
          templates: true
        }
      });
    });

    // Routes de santé
    this.app.use('/health', healthRoutes);

    // Routes API
    this.app.use('/api/notifications', notificationsRoutes);

    // Route API racine
    this.app.get('/api', (req, res) => {
      res.json({
        service: 'Notification API',
        version: process.env.npm_package_version || '1.0.0',
        endpoints: {
          notifications: '/api/notifications',
          health: '/health'
        },
        documentation: '/api/docs',
        timestamp: new Date().toISOString()
      });
    });

    // Route pour les métriques Prometheus si activé
    if (process.env.ENABLE_METRICS === 'true') {
      const promClient = require('prom-client');
      
      // Créer un registre de métriques
      const register = new promClient.Registry();
      
      // Ajouter des métriques par défaut
      promClient.collectDefaultMetrics({ register });
      
      // Métriques personnalisées
      const emailCounter = new promClient.Counter({
        name: 'notification_emails_total',
        help: 'Total number of emails sent',
        labelNames: ['provider', 'template', 'status']
      });
      
      const smsCounter = new promClient.Counter({
        name: 'notification_sms_total',
        help: 'Total number of SMS sent',
        labelNames: ['provider', 'template', 'status']
      });
      
      const queueGauge = new promClient.Gauge({
        name: 'notification_queue_jobs',
        help: 'Number of jobs in queues',
        labelNames: ['queue', 'status']
      });
      
      register.registerMetric(emailCounter);
      register.registerMetric(smsCounter);
      register.registerMetric(queueGauge);
      
      // Endpoint pour les métriques
      this.app.get('/metrics', async (req, res) => {
        try {
          res.set('Content-Type', register.contentType);
          res.end(await register.metrics());
        } catch (error) {
          logger.error('Failed to generate metrics', {
            error: error.message
          });
          res.status(500).end();
        }
      });
    }

    // Route 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route non trouvée',
        error: {
          code: 'NOT_FOUND',
          path: req.originalUrl
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Configure la gestion des erreurs
   */
  setupErrorHandling() {
    // Gestionnaire d'erreurs global
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Ne pas envoyer le stack trace en production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      const errorResponse = {
        success: false,
        message: isDevelopment ? error.message : 'Erreur interne du serveur',
        error: {
          code: 'INTERNAL_SERVER_ERROR'
        },
        timestamp: new Date().toISOString()
      };

      if (isDevelopment) {
        errorResponse.error.stack = error.stack;
      }

      res.status(error.status || 500).json(errorResponse);
    });

    // Gestion des promesses rejetées non capturées
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason.message || reason
      });
    });

    // Gestion des exceptions non capturées
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack
      });
      
      // Arrêter le serveur proprement
      this.gracefulShutdown('SIGTERM');
    });

    // Gestion des signaux système
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received');
      this.gracefulShutdown('SIGINT');
    });
  }

  /**
   * Démarre le serveur
   */
  async start() {
    try {
      // Run database migrations first
      logger.info('🔄 Running database migrations...');
      const migrationResult = await migrator.migrate();
      
      if (migrationResult.executed > 0) {
        logger.info(`✅ Successfully executed ${migrationResult.executed} migrations`);
      } else {
        logger.info('✅ Database is up to date');
      }

      logger.info('🚀 Starting Notification Service server...');
      
      this.server = this.app.listen(this.port, () => {
        logger.info(`Notification Service started successfully`, {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          version: process.env.npm_package_version || '1.0.0',
          pid: process.pid,
          capabilities: {
            email: true,
            sms: true,
            bulk: true,
            webhooks: true,
            templates: true,
            metrics: process.env.ENABLE_METRICS === 'true'
          }
        });
      });
    } catch (error) {
      logger.error('❌ Failed to start server:', error);
      process.exit(1);
    }

    this.server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof this.port === 'string'
        ? 'Pipe ' + this.port
        : 'Port ' + this.port;

      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
  }

  /**
   * Arrête proprement le serveur
   * @param {string} signal - Signal reçu
   */
  async gracefulShutdown(signal) {
    logger.info(`Graceful shutdown initiated by ${signal}`);

    try {
      // Arrêter d'accepter de nouvelles connexions
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // Arrêter les queues Redis si présentes
      try {
        const queueService = require('./core/queues/queue.service');
        await queueService.shutdown();
        logger.info('Redis queues shut down');
      } catch (error) {
        logger.error('Error shutting down Redis queues', {
          error: error.message
        });
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        error: error.message
      });
      process.exit(1);
    }
  }
}

// Démarrer le serveur si ce fichier est exécuté directement
if (require.main === module) {
  const server = new NotificationServer();
  server.start().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = NotificationServer;
