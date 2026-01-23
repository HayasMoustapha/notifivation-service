const express = require('express');
const router = express.Router();
const emailService = require('../core/email/email.service');
const smsService = require('../core/sms/sms.service');
const queueService = require('../core/queues/queue.service');
const logger = require('../utils/logger');

/**
 * Routes de santé pour le Notification Service
 */

// GET /health - Health check simple
router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'notification',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    res.status(200).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/detailed - Health check détaillé
router.get('/detailed', async (req, res) => {
  try {
    const [emailHealth, smsHealth, queueStats] = await Promise.all([
      emailService.healthCheck(),
      smsService.healthCheck(),
      queueService.getQueueStats()
    ]);

    const detailedStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'notification',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid
      },
      dependencies: {
        redis: await checkRedisConnection(),
        database: await checkDatabaseConnection()
      },
      services: {
        email: emailHealth,
        sms: smsHealth,
        queues: queueStats.stats
      },
      overall: {
        healthy: emailHealth.healthy || smsHealth.healthy,
        providers: {
          email: emailHealth.healthy,
          sms: smsHealth.healthy,
          queues: Object.values(queueStats.stats).some(q => q.waiting > 0 || q.active > 0)
        }
      }
    };

    res.status(200).json(detailedStatus);
  } catch (error) {
    logger.error('Detailed health check failed', {
      error: error.message
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/ready - Readiness probe
router.get('/ready', async (req, res) => {
  try {
    // Vérifier que les dépendances critiques sont prêtes
    const redisReady = await checkRedisConnection();
    const databaseReady = await checkDatabaseConnection();
    
    // Vérifier qu'au moins un provider de notification est prêt
    const [emailHealth, smsHealth] = await Promise.all([
      emailService.healthCheck(),
      smsService.healthCheck()
    ]);
    
    const notificationsReady = emailHealth.healthy || smsHealth.healthy;
    const isReady = redisReady && databaseReady && notificationsReady;
    
    const status = {
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      dependencies: {
        redis: redisReady,
        database: databaseReady,
        notifications: notificationsReady
      },
      providers: {
        email: emailHealth.healthy,
        sms: smsHealth.healthy
      }
    };

    res.status(isReady ? 200 : 503).json(status);
  } catch (error) {
    logger.error('Readiness check failed', {
      error: error.message
    });

    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/live - Liveness probe
router.get('/live', (req, res) => {
  try {
    const livenessStatus = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid,
      memory: process.memoryUsage()
    };

    res.status(200).json(livenessStatus);
  } catch (error) {
    logger.error('Liveness check failed', {
      error: error.message
    });

    res.status(503).json({
      status: 'not alive',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/components/:component - Health check d'un composant spécifique
router.get('/components/:component', async (req, res) => {
  try {
    const { component } = req.params;
    
    let result;
    
    switch (component) {
      case 'email':
        result = await emailService.healthCheck();
        break;
      case 'sms':
        result = await smsService.healthCheck();
        break;
      case 'queues':
        const queueStats = await queueService.getQueueStats();
        result = {
          success: true,
          healthy: true,
          stats: queueStats.stats
        };
        break;
      case 'redis':
        const redisStatus = await checkRedisConnection();
        result = {
          success: true,
          healthy: redisStatus,
          connection: redisStatus ? 'connected' : 'disconnected'
        };
        break;
      case 'database':
        const dbStatus = await checkDatabaseConnection();
        result = {
          success: true,
          healthy: dbStatus,
          connection: dbStatus ? 'connected' : 'disconnected'
        };
        break;
      default:
        return res.status(404).json({
          success: false,
          message: `Component ${component} not found`,
          available: ['email', 'sms', 'queues', 'redis', 'database']
        });
    }

    res.status(result.success && result.healthy ? 200 : 503).json(result);
  } catch (error) {
    logger.error(`Component health check failed for ${req.params.component}`, {
      error: error.message
    });

    res.status(503).json({
      success: false,
      healthy: false,
      error: error.message
    });
  }
});

// GET /health/providers - État des providers de notification
router.get('/providers', async (req, res) => {
  try {
    const [emailStats, smsStats] = await Promise.all([
      emailService.getStats(),
      smsService.getStats()
    ]);

    const providers = {
      email: {
        ...emailStats.providers,
        configured: emailStats.providers.smtp.configured || emailStats.providers.sendgrid.configured,
        healthy: emailStats.providers.smtp.configured || emailStats.providers.sendgrid.configured
      },
      sms: {
        ...smsStats.providers,
        configured: smsStats.providers.twilio.configured || smsStats.providers.vonage.configured,
        healthy: smsStats.providers.twilio.configured || smsStats.providers.vonage.configured
      }
    };

    res.status(200).json({
      success: true,
      providers,
      overall: {
        email: providers.email.configured,
        sms: providers.sms.configured,
        any: providers.email.configured || providers.sms.configured
      }
    });
  } catch (error) {
    logger.error('Providers health check failed', {
      error: error.message
    });

    res.status(503).json({
      success: false,
      error: error.message
    });
  }
});

// GET /health/queues - État des queues
router.get('/queues', async (req, res) => {
  try {
    const queueStats = await queueService.getQueueStats();
    
    res.status(200).json({
      success: true,
      stats: queueStats.stats,
      summary: {
        totalJobs: Object.values(queueStats.stats).reduce((sum, q) => sum + q.total, 0),
        activeJobs: Object.values(queueStats.stats).reduce((sum, q) => sum + q.active, 0),
        waitingJobs: Object.values(queueStats.stats).reduce((sum, q) => sum + q.waiting, 0),
        failedJobs: Object.values(queueStats.stats).reduce((sum, q) => sum + q.failed, 0)
      }
    });
  } catch (error) {
    logger.error('Queues health check failed', {
      error: error.message
    });

    res.status(503).json({
      success: false,
      error: error.message
    });
  }
});

// POST /health/test - Test de connectivité
router.post('/test', async (req, res) => {
  try {
    const { component } = req.body;
    
    let result;
    
    switch (component) {
      case 'email':
        result = await emailService.healthCheck();
        break;
      case 'sms':
        result = await smsService.testConnectivity();
        break;
      case 'redis':
        result = await checkRedisConnection();
        break;
      case 'database':
        result = await checkDatabaseConnection();
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Component must be: email, sms, redis, or database'
        });
    }

    res.status(result.success || result ? 200 : 503).json({
      success: result.success || result,
      component,
      testedAt: new Date().toISOString(),
      result
    });
  } catch (error) {
    logger.error('Health test failed', {
      error: error.message,
      component: req.body.component
    });

    res.status(503).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Vérifie la connexion Redis
 * @returns {Promise<boolean>} True si connecté
 */
async function checkRedisConnection() {
  try {
    // Importer le service Redis si disponible
    // const redis = require('../config/redis');
    // await redis.ping();
    // return true;
    
    // Placeholder pour l'instant
    return true;
  } catch (error) {
    logger.error('Redis connection check failed', {
      error: error.message
    });
    return false;
  }
}

/**
 * Vérifie la connexion à la base de données
 * @returns {Promise<boolean>} True si connectée
 */
async function checkDatabaseConnection() {
  try {
    // Importer la configuration de la base de données
    // const database = require('../config/database');
    // await database.query('SELECT 1');
    // return true;
    
    // Placeholder pour l'instant
    return true;
  } catch (error) {
    logger.error('Database connection check failed', {
      error: error.message
    });
    return false;
  }
}

module.exports = router;
