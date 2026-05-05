const express = require('express');

const router = express.Router();

const emailService = require('../core/email/email.service');
const smsService = require('../core/sms/sms.service');
const queueService = require('../core/queues/queue.service');
const DatabaseBootstrap = require('../services/database-bootstrap.service');
const { getDatabase } = require('../config/database');
const {
  buildDeliveryMatrix,
  buildReadinessSnapshot,
  checkRedisConnection,
} = require('./provider-readiness');
const logger = require('../utils/logger');

/**
 * Routes de santé pour le Notification Service.
 * Elles distinguent maintenant:
 * - le runtime local réellement opérationnel
 * - les providers mock disponibles
 * - les providers live configurés
 * - les providers live déjà prouvés par un check runtime
 */

router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'notification',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    res.status(200).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

router.get('/detailed', async (req, res) => {
  try {
    const [deliveryMatrix, queueStats, redisStatus, databaseStatus] = await Promise.all([
      getDeliveryMatrix(),
      queueService.getQueueStats(),
      checkRedisConnection(),
      checkDatabaseConnection(),
    ]);

    const readiness = buildReadinessSnapshot({
      databaseStatus,
      redisStatus,
      deliveryMatrix,
    });

    const dependenciesHealthy = redisStatus.healthy && databaseStatus.healthy;

    const detailedStatus = {
      status: dependenciesHealthy ? 'healthy' : 'degraded',
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
        pid: process.pid,
      },
      dependencies: {
        redis: redisStatus,
        database: databaseStatus,
      },
      services: {
        email: deliveryMatrix.email,
        sms: deliveryMatrix.sms,
        queues: queueStats.stats,
      },
      overall: {
        runtimeReady: readiness.runtimeReady,
        readiness: readiness.status,
        localDeliveryAvailable: readiness.localDeliveryAvailable,
        blockedByMissingLiveProviders: readiness.blockedByMissingLiveProviders,
        liveProvidersReady: deliveryMatrix.overall.anyRealProviderLiveProved,
      },
    };

    res.status(dependenciesHealthy ? 200 : 503).json(detailedStatus);
  } catch (error) {
    logger.error('Detailed health check failed', {
      error: error.message,
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

router.get('/ready', async (req, res) => {
  try {
    const [deliveryMatrix, redisStatus, databaseStatus] = await Promise.all([
      getDeliveryMatrix(),
      checkRedisConnection(),
      checkDatabaseConnection(),
    ]);

    const readiness = buildReadinessSnapshot({
      databaseStatus,
      redisStatus,
      deliveryMatrix,
    });

    const status = {
      status: readiness.status,
      timestamp: new Date().toISOString(),
      runtimeReady: readiness.runtimeReady,
      localDeliveryAvailable: readiness.localDeliveryAvailable,
      blockedByMissingLiveProviders: readiness.blockedByMissingLiveProviders,
      checks: {
        redis: redisStatus,
        database: databaseStatus,
        delivery: {
          email: deliveryMatrix.email.status,
          sms: deliveryMatrix.sms.status,
          anyRealProviderConfigured: deliveryMatrix.overall.anyRealProviderConfigured,
          anyRealProviderLiveProved: deliveryMatrix.overall.anyRealProviderLiveProved,
          anyMockProviderAvailable: deliveryMatrix.overall.anyMockProviderAvailable,
        },
      },
    };

    res.status(readiness.runtimeReady ? 200 : 503).json(status);
  } catch (error) {
    logger.error('Readiness check failed', {
      error: error.message,
    });

    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

router.get('/live', (req, res) => {
  try {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid,
      memory: process.memoryUsage(),
    });
  } catch (error) {
    logger.error('Liveness check failed', {
      error: error.message,
    });

    res.status(503).json({
      status: 'not alive',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

router.get('/components/:component', async (req, res) => {
  try {
    const { component } = req.params;

    if (component === 'email' || component === 'sms') {
      const deliveryMatrix = await getDeliveryMatrix();
      const channel = deliveryMatrix[component];
      const httpStatus = channel.localDeliveryAvailable ? 200 : 503;

      return res.status(httpStatus).json({
        success: true,
        healthy: channel.healthy,
        liveProved: channel.liveProved,
        configured: channel.configured,
        mockAvailable: channel.mockAvailable,
        localDeliveryAvailable: channel.localDeliveryAvailable,
        status: channel.status,
        providers: channel.providers,
      });
    }

    if (component === 'queues') {
      const queueStats = await queueService.getQueueStats();
      return res.status(200).json({
        success: true,
        healthy: true,
        stats: queueStats.stats,
      });
    }

    if (component === 'redis') {
      const redisStatus = await checkRedisConnection();
      return res.status(redisStatus.healthy ? 200 : 503).json({
        success: true,
        healthy: redisStatus.healthy,
        connection: redisStatus.connected ? 'connected' : 'disconnected',
        status: redisStatus.status,
        error: redisStatus.error || null,
      });
    }

    if (component === 'database') {
      const dbStatus = await checkDatabaseConnection();
      return res.status(dbStatus.healthy ? 200 : 503).json({
        success: true,
        healthy: dbStatus.healthy,
        connection: dbStatus.connected ? 'connected' : 'disconnected',
        schemaReady: dbStatus.schemaReady,
        missingTables: dbStatus.missingTables,
        error: dbStatus.error || null,
      });
    }

    return res.status(404).json({
      success: false,
      message: `Component ${component} not found`,
      available: ['email', 'sms', 'queues', 'redis', 'database'],
    });
  } catch (error) {
    logger.error(`Component health check failed for ${req.params.component}`, {
      error: error.message,
    });

    res.status(503).json({
      success: false,
      healthy: false,
      error: error.message,
    });
  }
});

router.get('/providers', async (req, res) => {
  try {
    const deliveryMatrix = await getDeliveryMatrix();

    res.status(200).json({
      success: true,
      providers: {
        email: deliveryMatrix.email,
        sms: deliveryMatrix.sms,
      },
      overall: deliveryMatrix.overall,
    });
  } catch (error) {
    logger.error('Providers health check failed', {
      error: error.message,
    });

    res.status(503).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/config', async (req, res) => {
  try {
    const deliveryMatrix = await getDeliveryMatrix();

    res.status(200).json({
      success: true,
      config: {
        email: {
          configured: deliveryMatrix.email.configured,
          liveProved: deliveryMatrix.email.liveProved,
          mockAvailable: deliveryMatrix.email.mockAvailable,
          status: deliveryMatrix.email.status,
        },
        sms: {
          configured: deliveryMatrix.sms.configured,
          liveProved: deliveryMatrix.sms.liveProved,
          mockAvailable: deliveryMatrix.sms.mockAvailable,
          status: deliveryMatrix.sms.status,
        },
        anyRealProviderConfigured: deliveryMatrix.overall.anyRealProviderConfigured,
        anyRealProviderLiveProved: deliveryMatrix.overall.anyRealProviderLiveProved,
        anyMockProviderAvailable: deliveryMatrix.overall.anyMockProviderAvailable,
        providers: {
          email: deliveryMatrix.email.providers,
          sms: deliveryMatrix.sms.providers,
        },
      },
    });
  } catch (error) {
    logger.error('Configuration health check failed', {
      error: error.message,
    });

    res.status(503).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/queues', async (req, res) => {
  try {
    const queueStats = await queueService.getQueueStats();

    res.status(200).json({
      success: true,
      stats: queueStats.stats,
      summary: {
        totalJobs: Object.values(queueStats.stats).reduce((sum, queue) => sum + queue.total, 0),
        activeJobs: Object.values(queueStats.stats).reduce((sum, queue) => sum + queue.active, 0),
        waitingJobs: Object.values(queueStats.stats).reduce((sum, queue) => sum + queue.waiting, 0),
        failedJobs: Object.values(queueStats.stats).reduce((sum, queue) => sum + queue.failed, 0),
      },
    });
  } catch (error) {
    logger.error('Queues health check failed', {
      error: error.message,
    });

    res.status(503).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { component } = req.body;

    let result;

    switch (component) {
      case 'email':
        result = (await getDeliveryMatrix()).email;
        break;
      case 'sms':
        result = (await getDeliveryMatrix()).sms;
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
          message: 'Component must be: email, sms, redis, or database',
        });
    }

    const testSucceeded =
      typeof result?.healthy === 'boolean'
        ? result.healthy || result.localDeliveryAvailable === true
        : false;

    res.status(testSucceeded ? 200 : 503).json({
      success: testSucceeded,
      component,
      testedAt: new Date().toISOString(),
      result,
    });
  } catch (error) {
    logger.error('Health test failed', {
      error: error.message,
      component: req.body.component,
    });

    res.status(503).json({
      success: false,
      error: error.message,
    });
  }
});

async function getDeliveryMatrix() {
  const [emailStats, emailHealth, smsStats, smsHealth] = await Promise.all([
    Promise.resolve(emailService.getStats()),
    emailService.healthCheck(),
    Promise.resolve(smsService.getStats()),
    smsService.healthCheck(),
  ]);

  return buildDeliveryMatrix({
    emailStats,
    emailHealth,
    smsStats,
    smsHealth,
  });
}

async function checkDatabaseConnection() {
  try {
    await getDatabase().query('SELECT 1');
    const schemaStatus = await DatabaseBootstrap.getSchemaStatus();

    return {
      success: true,
      healthy: schemaStatus.ready,
      connected: true,
      schemaReady: schemaStatus.ready,
      missingTables: schemaStatus.missingTables,
    };
  } catch (error) {
    logger.error('Database connection check failed', {
      error: error.message,
    });
    return {
      success: false,
      healthy: false,
      connected: false,
      schemaReady: false,
      missingTables: [],
      error: error.message,
    };
  }
}

module.exports = router;
