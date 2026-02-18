/**
 * NOTIFICATION SERVICE - SERVEUR PRINCIPAL
 * 
 * RÔLE : Service technique d'envoi de notifications
 * UTILISATION : Emails transactionnels, SMS, files d'attente
 * PORT : 3002
 * 
 * FONCTIONNEMENT :
 * - Reçoit les requêtes de notification de event-planner-core
 * - Traite les emails via SendGrid
 * - Traite les SMS via Twilio/Vonage
 * - Gère les files d'attente Redis pour traitement asynchrone
 * 
 * NOTE : Service technique sans authentification
 * La sécurité est gérée par event-planner-core
 */

require('dotenv').config();

// Importation des modules nécessaires pour le serveur
const express = require('express'); // Framework web Node.js
const cors = require('cors'); // Middleware pour gérer le CORS (partage entre domaines)
const helmet = require('helmet'); // Middleware de sécurité HTTP
const compression = require('compression'); // Middleware pour compresser les réponses
const rateLimit = require('express-rate-limit'); // Middleware pour limiter les requêtes
const morgan = require('morgan'); // Middleware pour les logs de requêtes HTTP

// Importation des modules locaux
const logger = require('./utils/logger'); // Utilitaire de logging technique
const healthRoutes = require('./health/health.routes'); // Routes de santé
const notificationsRoutes = require('./api/routes/notifications.routes'); // Routes de notifications
const bootstrap = require('./bootstrap'); // Initialisation de la base de données

/**
 * CLASSE SERVEUR NOTIFICATION
 * 
 * Configure et démarre le serveur de notification technique
 */
class NotificationServer {
  constructor() {
    this.app = express(); // Crée l'application Express
    this.port = process.env.PORT || 3002; // Port du serveur (3002 par défaut)
    this.setupMiddleware(); // Configure les middlewares
    this.setupRoutes(); // Configure les routes
    this.setupErrorHandling(); // Configure la gestion des erreurs
  }

  /**
   * CONFIGURATION DES MIDDLEWARES
   * 
   * Les middlewares sont des fonctions qui s'exécutent avant les routes
   */
  setupMiddleware() {
    // MIDDLEWARE SÉCURITÉ : Protection HTTP avec Helmet
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"], // Sources par défaut
          styleSrc: ["'self'", "'unsafe-inline'"], // Styles inline autorisés
          scriptSrc: ["'self'"], // Scripts uniquement du même domaine
          imgSrc: ["'self'", "data:", "https:"], // Images autorisées
        },
      },
    }));

    // MIDDLEWARE CORS : Permet les requêtes depuis d'autres domaines
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000', // Domaine autorisé
      credentials: true, // Autorise les cookies et authentification
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Méthodes HTTP autorisées
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Webhook-Signature'] // En-têtes autorisés
    }));

    // MIDDLEWARE COMPRESSION : Compresse les réponses pour améliorer la performance
    this.app.use(compression());

    // MIDDLEWARE RATE LIMITING : Limite le nombre de requêtes par IP
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes par défaut
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requêtes max par fenêtre
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true, // En-têtes standards RateLimit
      legacyHeaders: false, // Pas d'en-têtes legacy
    });
    this.app.use('/api', limiter);

    // MIDDLEWARE LOGGING : Enregistre les requêtes HTTP
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim())
        }
      }));
    }

    // MIDDLEWARE PARSING : Analyse les corps des requêtes
    this.app.use(express.json({ limit: '10mb' })); // JSON avec limite de 10MB
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' })); // URL-encoded

    // 📊 MIDDLEWARE REQUEST ID : Ajoute un ID unique à chaque requête
    this.app.use((req, res, next) => {
      req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.id);
      
      // Log avec ID de requête pour traçabilité
      logger.info(`Request started: ${req.method} ${req.path}`, {
        requestId: req.id,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      next();
    });

    // 📧 RATE LIMITING SPÉCIFIQUE EMAILS : Protection contre le spam d'emails
    const emailLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: process.env.NODE_ENV === 'development'
        ? 1000
        : (parseInt(process.env.EMAIL_RATE_LIMIT) || 10), // 10 emails max par minute
      message: {
        success: false,
        message: 'Limite d\'emails atteinte, veuillez réessayer plus tard',
        error: { code: 'EMAIL_RATE_LIMIT_EXCEEDED' }
      }
    });
    this.app.use('/api/notifications/email', emailLimiter);

    // 📱 RATE LIMITING SPÉCIFIQUE SMS : Protection contre le spam de SMS
    const smsLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: parseInt(process.env.SMS_RATE_LIMIT) || 5, // 5 SMS max par minute
      message: {
        success: false,
        message: 'Limite de SMS atteinte, veuillez réessayer plus tard',
        error: { code: 'SMS_RATE_LIMIT_EXCEEDED' }
      }
    });
    this.app.use('/api/notifications/sms', smsLimiter);
  }

  /**
   * 🛣️ CONFIGURATION DES ROUTES
   * 
   * Définit toutes les routes du service de notification
   */
  setupRoutes() {
    // 🏥 ROUTES DE SANTÉ : Vérification de l'état du service
    this.app.use('/health', healthRoutes);

    // 📧 ROUTES DE NOTIFICATIONS : Traitement des emails et SMS
    this.app.use('/api/notifications', notificationsRoutes);

    // 📊 ROUTE INFO : Informations sur le service (pour monitoring)
    this.app.get('/api/info', (req, res) => {
      res.json({
        service: 'Notification Service',
        version: '2.0.0',
        description: 'Service technique d\'envoi de notifications',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        capabilities: {
          email: !!process.env.SENDGRID_API_KEY,
          sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          bulk: true,
          queue: !!process.env.REDIS_URL,
          templates: true
        }
      });
    });

    // Documentation Swagger — http://localhost:3002/docs
    const { specs: swaggerSpecs, swaggerUi, swaggerUiOptions } = require('./config/swagger');
    this.app.use('/docs', swaggerUi.serve);
    this.app.get('/docs', swaggerUi.setup(swaggerSpecs, swaggerUiOptions));

    // ❌ ROUTE 404 : Gestion des routes non trouvées (Express 5 syntax)
    this.app.use('/{*path}', (req, res) => {
      logger.warn(`Route not found: ${req.method} ${req.path}`, {
        requestId: req.id,
        method: req.method,
        path: req.path
      });
      
      res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.path}`,
        code: 'ROUTE_NOT_FOUND',
        requestId: req.id
      });
    });
  }

  /**
   * 🚨 CONFIGURATION DE LA GESTION DES ERREURS
   * 
   * Gère toutes les erreurs du serveur de manière centralisée
   */
  setupErrorHandling() {
    // 🚨 MIDDLEWARE D'ERREUR GLOBAL
    this.app.use((error, req, res, next) => {
      // Log détaillé de l'erreur
      logger.error('Unhandled error occurred', {
        requestId: req.id,
        error: error.message,
        stack: error.stack,
        method: req.method,
        path: req.path,
        ip: req.ip
      });

      // En développement, on renvoie le stack complet
      if (process.env.NODE_ENV === 'development') {
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: error.message,
          stack: error.stack,
          code: 'INTERNAL_ERROR',
          requestId: req.id
        });
      }

      // En production, on masque les détails sensibles
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
        requestId: req.id
      });
    });
  }

  /**
   * 🚀 DÉMARRAGE DU SERVEUR
   * 
   * Démarre le serveur et gère les erreurs de démarrage
   */
  async start() {
    try {
      // 🗄️ INITIALISATION DE LA BASE DE DONNÉES
      logger.info('Initializing database...');
      await bootstrap.initialize();
      logger.info('Database initialized successfully');

      // 🚀 DÉMARRAGE DU SERVEUR HTTP
      const server = this.app.listen(this.port, () => {
        logger.info(`Notification Service started successfully`, {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          timestamp: new Date().toISOString()
        });

        // 📊 LOG DES CAPACITÉS CONFIGURÉES
        const capabilities = {
          email: !!process.env.SENDGRID_API_KEY,
          sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          queue: !!process.env.REDIS_URL,
          templates: true
        };
        
        logger.info('Notification capabilities configured', capabilities);
      });

      // 🛑 GESTION GRACIEUSE DE L'ARRÊT
      const gracefulShutdown = async (signal) => {
        logger.info(`Received ${signal}, starting graceful shutdown...`);
        
        server.close(async () => {
          logger.info('HTTP server closed');
          
          try {
            // Fermeture des connexions à la base de données
            const { getDatabase } = require('./config/database');
            const database = getDatabase();
            if (database) {
              await database.end();
              logger.info('Database connections closed');
            }

            // Fermeture de la connexion Redis
            const redis = require('./config/redis');
            if (redis && redis.client) {
              await redis.client.quit();
              logger.info('Redis connection closed');
            }
            
            logger.info('Graceful shutdown completed');
            process.exit(0);
          } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
          }
        });

        // Timeout forcé après 30 secondes
        setTimeout(() => {
          logger.error('Forced shutdown after timeout');
          process.exit(1);
        }, 30000);
      };

      // 🎧 ÉCOUTE DES SIGNAUX D'ARRÊT
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      // 🚨 GESTION DES ERREURS NON CAPTURÉES
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
        gracefulShutdown('uncaughtException');
      });

      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        gracefulShutdown('unhandledRejection');
      });

      return server;

    } catch (error) {
      logger.error('Failed to start Notification Service:', error);
      process.exit(1);
    }
  }
}

// ========================================
// 🚀 DÉMARRAGE DU SERVICE
// ========================================

// Démarrage du serveur si ce fichier est exécuté directement
if (require.main === module) {
  const notificationServer = new NotificationServer();
  notificationServer.start();
}

// Export de la classe pour utilisation directe
module.exports = NotificationServer;

// Export de l'app Express pour les tests
const testServerInstance = new NotificationServer();
module.exports.app = testServerInstance.app;
