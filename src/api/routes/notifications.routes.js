const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { validate, schemas } = require('../../middleware/validation');
const logger = require('../../utils/logger');
const { errorResponse } = require('../../utils/response');

/**
 * Routes pour les notifications
 */

// POST /api/notifications/email - Envoyer un email transactionnel
router.post('/email',
  validate(schemas.sendEmail),
  notificationsController.sendEmail
);

// POST /api/notifications/sms - Envoyer un SMS transactionnel
router.post('/sms',
  validate(schemas.sendSMS),
  notificationsController.sendSMS
);

// POST /api/notifications/email/queue - Mettre en file d'attente un email
router.post('/email/queue',
  validate(schemas.sendEmail),
  notificationsController.queueEmail
);

// POST /api/notifications/sms/queue - Mettre en file d'attente un SMS
router.post('/sms/queue',
  validate(schemas.sendSMS),
  notificationsController.queueSMS
);

// POST /api/notifications/send - Envoyer une notification multi-canaux
router.post('/send',
  validate(schemas.sendNotification),
  notificationsController.sendNotification
);

// POST /api/notifications/bulk - Envoyer des notifications en lot
router.post('/bulk',
  validate(schemas.sendBulkNotifications),
  notificationsController.sendBulkNotifications
);

// GET /api/notifications/jobs/:jobId/status - Obtenir le statut d'un job
router.get('/jobs/:jobId/status',
  notificationsController.getJobStatus
);

// POST /api/notifications/jobs/:jobId/cancel - Annuler un job
router.post('/jobs/:jobId/cancel',
  notificationsController.cancelJob
);

// POST /api/notifications/jobs/:jobId/retry - Relancer un job
router.post('/jobs/:jobId/retry',
  notificationsController.retryJob
);

// GET /api/notifications/queues/stats - Obtenir les statistiques des queues
router.get('/queues/stats',
  notificationsController.getQueueStats
);

// POST /api/notifications/queues/cleanup - Nettoyer les jobs terminés
router.post('/queues/cleanup',
  notificationsController.cleanupJobs
);

// POST /api/notifications/test/email - Test d'envoi d'email
router.post('/test/email',
  validate(schemas.sendEmail),
  notificationsController.testEmail
);

// POST /api/notifications/test/sms - Test d'envoi de SMS
router.post('/test/sms',
  validate(schemas.sendSMS),
  notificationsController.testSMS
);

// Health check
router.get('/health',
  notificationsController.healthCheck
);

// Root endpoint
router.get('/',
  (req, res) => {
    res.json({
      service: 'Notification API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        sendEmail: 'POST /api/notifications/email',
        sendSMS: 'POST /api/notifications/sms',
        queueEmail: 'POST /api/notifications/email/queue',
        queueSMS: 'POST /api/notifications/sms/queue',
        sendNotification: 'POST /api/notifications/send',
        bulkNotifications: 'POST /api/notifications/bulk',
        jobStatus: 'GET /api/notifications/jobs/:jobId/status',
        cancelJob: 'POST /api/notifications/jobs/:jobId/cancel',
        retryJob: 'POST /api/notifications/jobs/:jobId/retry',
        queueStats: 'GET /api/notifications/queues/stats',
        cleanupJobs: 'POST /api/notifications/queues/cleanup',
        testEmail: 'POST /api/notifications/test/email',
        testSMS: 'POST /api/notifications/test/sms'
      },
      timestamp: new Date().toISOString()
    });
  });

module.exports = router;
