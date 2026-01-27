const express = require('express');
const Joi = require('joi');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { 
  SecurityMiddleware, 
  ValidationMiddleware, 
  ContextInjector 
} = require('../../../../shared');
const { notificationErrorHandler } = require('../../error/notification.errorHandler');
const logger = require('../../utils/logger');
const { errorResponse } = require('../../utils/response');

/**
 * Routes pour les notifications
 */

// Apply authentication to all routes (sauf webhooks et health)
router.use(SecurityMiddleware.authenticated());

// Apply context injection for all authenticated routes
router.use(ContextInjector.injectUserContext());

// Apply error handler for all routes
router.use(notificationErrorHandler);

// POST /api/notifications/email - Envoyer un email transactionnel
router.post('/email',
  SecurityMiddleware.withPermissions('notifications.email.send'),
  ValidationMiddleware.createNotificationsValidator('sendEmail'),
  notificationsController.sendEmail
);

// POST /api/notifications/sms - Envoyer un SMS transactionnel
router.post('/sms',
  SecurityMiddleware.withPermissions('notifications.sms.send'),
  ValidationMiddleware.createNotificationsValidator('sendSMS'),
  notificationsController.sendSMS
);

// POST /api/notifications/email/queue - Mettre en file d'attente un email
router.post('/email/queue',
  SecurityMiddleware.withPermissions('notifications.email.queue'),
  ValidationMiddleware.createNotificationsValidator('queueEmail'),
  notificationsController.queueEmail
);

// POST /api/notifications/sms/queue - Mettre en file d'attente un SMS
router.post('/sms/queue',
  SecurityMiddleware.withPermissions('notifications.sms.queue'),
  ValidationMiddleware.createNotificationsValidator('queueSMS'),
  notificationsController.queueSMS
);

// POST /api/notifications/email/bulk - Envoyer des emails en lot
router.post('/email/bulk',
  SecurityMiddleware.withPermissions('notifications.email.bulk'),
  ValidationMiddleware.createNotificationsValidator('sendBulkEmail'),
  notificationsController.sendBulkEmail
);

// POST /api/notifications/sms/bulk - Envoyer des SMS en lot
router.post('/sms/bulk',
  SecurityMiddleware.withPermissions('notifications.sms.bulk'),
  ValidationMiddleware.createNotificationsValidator('sendBulkSMS'),
  notificationsController.sendBulkSMS
);

// POST /api/notifications/bulk/mixed - Envoyer des notifications mixtes en lot
router.post('/bulk/mixed',
  SecurityMiddleware.withPermissions('notifications.bulk.mixed'),
  ValidationMiddleware.createNotificationsValidator('sendBulkMixed'),
  notificationsController.sendBulkMixed
);

// GET /api/notifications/job/:jobId/status - Récupérer le statut d'un job
router.get('/job/:jobId/status',
  SecurityMiddleware.withPermissions('notifications.jobs.read'),
  ValidationMiddleware.validateParams({
    jobId: Joi.string().required()
  }),
  notificationsController.getJobStatus
);

// DELETE /api/notifications/job/:jobId/cancel - Annuler un job
router.delete('/job/:jobId/cancel',
  SecurityMiddleware.withPermissions('notifications.jobs.cancel'),
  ValidationMiddleware.validateParams({
    jobId: Joi.string().required()
  }),
  notificationsController.cancelJob
);

// GET /api/notifications/queues/stats - Récupérer les statistiques des queues
router.get('/queues/stats',
  SecurityMiddleware.withPermissions('notifications.stats.read'),
  notificationsController.getQueueStats
);

// POST /api/notifications/queues/clean - Nettoyer les jobs terminés
router.post('/queues/clean',
  SecurityMiddleware.withPermissions('notifications.admin'),
  ValidationMiddleware.validateQuery({
    older_than_hours: Joi.number().integer().min(1).default(24),
    status: Joi.string().valid('completed', 'failed', 'cancelled').optional()
  }),
  notificationsController.cleanCompletedJobs
);

// Routes spécialisées pour les notifications courantes

// POST /api/notifications/welcome/email - Email de bienvenue
router.post('/welcome/email',
  SecurityMiddleware.withPermissions('notifications.welcome.send'),
  ValidationMiddleware.createNotificationsValidator('sendEmail'),
  notificationsController.sendWelcomeEmail
);

// POST /api/notifications/welcome/sms - SMS de bienvenue
router.post('/welcome/sms',
  SecurityMiddleware.withPermissions('notifications.welcome.send'),
  ValidationMiddleware.createNotificationsValidator('sendSMS'),
  notificationsController.sendWelcomeSMS
);

// POST /api/notifications/password-reset/email - Email de réinitialisation de mot de passe
router.post('/password-reset/email',
  SecurityMiddleware.withPermissions('notifications.password-reset.send'),
  ValidationMiddleware.createNotificationsValidator('sendEmail'),
  notificationsController.sendPasswordResetEmail
);

// POST /api/notifications/password-reset/sms - SMS de réinitialisation de mot de passe
router.post('/password-reset/sms',
  SecurityMiddleware.withPermissions('notifications.password-reset.send'),
  ValidationMiddleware.createNotificationsValidator('sendSMS'),
  notificationsController.sendPasswordResetSMS
);

// POST /api/notifications/event-confirmation/email - Email de confirmation d'événement
router.post('/event-confirmation/email',
  SecurityMiddleware.withPermissions('notifications.event-confirmation.send'),
  ValidationMiddleware.createNotificationsValidator('sendEmail'),
  notificationsController.sendEventConfirmationEmail
);

// POST /api/notifications/event-confirmation/sms - SMS de confirmation d'événement
router.post('/event-confirmation/sms',
  SecurityMiddleware.withPermissions('notifications.event-confirmation.send'),
  ValidationMiddleware.createNotificationsValidator('sendSMS'),
  notificationsController.sendEventConfirmationSMS
);

// POST /api/notifications/otp/sms - SMS OTP
router.post('/otp/sms',
  SecurityMiddleware.withPermissions('notifications.otp.send'),
  ValidationMiddleware.createNotificationsValidator('sendSMS'),
  notificationsController.sendOTPSMS
);

// Routes de santé et statistiques (pas de permission requise)

// GET /api/notifications/health - Vérifier la santé du service
router.get('/health',
  notificationsController.healthCheck
);

// GET /api/notifications/stats - Récupérer les statistiques du service
router.get('/stats',
  SecurityMiddleware.withPermissions('notifications.stats.read'),
  notificationsController.getStats
);

// Routes pour les webhooks externes (authentification par clé API)

// POST /api/notifications/webhooks/email - Webhook pour les emails externes
router.post('/webhooks/email',
  SecurityMiddleware.requireAPIKey(),
  ValidationMiddleware.createNotificationsValidator('webhook'),
  notificationsController.sendEmail
);

// POST /api/notifications/webhooks/sms - Webhook pour les SMS externes
router.post('/webhooks/sms',
  SecurityMiddleware.requireAPIKey(),
  ValidationMiddleware.createNotificationsValidator('webhook'),
  notificationsController.sendSMS
);

// POST /api/notifications/webhooks/bulk - Webhook pour les notifications en lot
router.post('/webhooks/bulk',
  SecurityMiddleware.requireAPIKey(),
  ValidationMiddleware.createNotificationsValidator('sendBulkMixed'),
  notificationsController.sendBulkMixed
);

// Routes pour les intégrations tierces (authentification par webhook secret)

// POST /api/notifications/integrations/stripe - Webhook Stripe
router.post('/integrations/stripe',
  SecurityMiddleware.requireWebhookSecret(),
  ValidationMiddleware.createNotificationsValidator('webhook'),
  async (req, res) => {
    try {
      const { event, data } = req.body;
      
      // Traiter les événements Stripe
      switch (event) {
        case 'payment_intent.succeeded':
          // Envoyer une confirmation de paiement
          await notificationsController.sendEmail({
            body: {
              to: data.customer_email,
              template: 'payment-confirmation',
              data: {
                payment: data,
                event: {
                  title: data.description || 'Paiement réussi'
                }
              }
            }
          });
          break;
        case 'invoice.payment_succeeded':
          // Envoyer une confirmation de facture
          await notificationsController.sendEmail({
            body: {
              to: data.customer_email,
              template: 'payment-confirmation',
              data: {
                payment: data,
                event: {
                  title: `Facture ${data.number}`
                }
              }
            }
          });
          break;
        default:
          logger.info('Unhandled Stripe webhook event', { event });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Stripe webhook processing failed', {
        error: error.message,
        event: req.body.event
      });

      return res.status(500).json(
        errorResponse('Échec du traitement du webhook Stripe', null, 'WEBHOOK_PROCESSING_FAILED')
      );
    }
  }
);

// POST /api/notifications/integrations/github - Webhook GitHub
router.post('/integrations/github',
  SecurityMiddleware.requireWebhookSecret(),
  ValidationMiddleware.createNotificationsValidator('webhook'),
  async (req, res) => {
    try {
      const { event, data } = req.body;
      
      // Traiter les événements GitHub
      switch (event) {
        case 'push':
          // Notification de déploiement
          if (data.ref === 'refs/heads/main') {
            await notificationsController.sendEmail({
              body: {
                to: 'admin@eventplanner.com',
                template: 'event-notification',
                data: {
                  event: {
                    title: 'Déploiement en production',
                    description: `Nouveau déploiement sur la branche main par ${data.pusher.name}`
                  }
                }
              }
            });
          }
          break;
        default:
          logger.info('Unhandled GitHub webhook event', { event });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('GitHub webhook processing failed', {
        error: error.message,
        event: req.body.event
      });

      return res.status(500).json(
        errorResponse('Échec du traitement du webhook GitHub', null, 'WEBHOOK_PROCESSING_FAILED')
      );
    }
  }
);

// Route d'information pour le service
router.get('/', (req, res) => {
  res.json({
    service: 'Notification API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      email: 'POST /api/notifications/email',
      sms: 'POST /api/notifications/sms',
      emailQueue: 'POST /api/notifications/email/queue',
      smsQueue: 'POST /api/notifications/sms/queue',
      emailBulk: 'POST /api/notifications/email/bulk',
      smsBulk: 'POST /api/notifications/sms/bulk',
      mixedBulk: 'POST /api/notifications/bulk/mixed',
      jobStatus: 'GET /api/notifications/job/:jobId/status',
      cancelJob: 'DELETE /api/notifications/job/:jobId/cancel',
      queueStats: 'GET /api/notifications/queues/stats',
      queueClean: 'POST /api/notifications/queues/clean',
      welcomeEmail: 'POST /api/notifications/welcome/email',
      welcomeSMS: 'POST /api/notifications/welcome/sms',
      passwordResetEmail: 'POST /api/notifications/password-reset/email',
      passwordResetSMS: 'POST /api/notifications/password-reset/sms',
      eventConfirmationEmail: 'POST /api/notifications/event-confirmation/email',
      eventConfirmationSMS: 'POST /api/notifications/event-confirmation/sms',
      otpSMS: 'POST /api/notifications/otp/sms',
      health: 'GET /api/notifications/health',
      stats: 'GET /api/notifications/stats',
      webhookEmail: 'POST /api/notifications/webhooks/email',
      webhookSMS: 'POST /api/notifications/webhooks/sms',
      webhookBulk: 'POST /api/notifications/webhooks/bulk',
      integrationStripe: 'POST /api/notifications/integrations/stripe',
      integrationGithub: 'POST /api/notifications/integrations/github'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
