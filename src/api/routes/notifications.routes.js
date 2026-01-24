const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { authenticate, requireAPIKey, requireWebhookSecret } = require('../../../shared');
const { requirePermission } = require('../../../shared');
const { validate, schemas } = require('../../middleware/validation');
const logger = require('../../utils/logger');
const { errorResponse } = require('../../utils/response');

/**
 * Routes pour les notifications
 */

// Middleware d'authentification pour la plupart des routes
router.use(authenticate);

// POST /api/notifications/email - Envoyer un email transactionnel
router.post('/email',
  requirePermission('notifications.email.send'),
  validate(schemas.sendEmail),
  notificationsController.sendEmail
);

// POST /api/notifications/sms - Envoyer un SMS transactionnel
router.post('/sms',
  requirePermission('notifications.sms.send'),
  validate(schemas.sendSMS),
  notificationsController.sendSMS
);

// POST /api/notifications/email/queue - Mettre en file d'attente un email
router.post('/email/queue',
  requirePermission('notifications.email.queue'),
  validate(schemas.sendEmail),
  notificationsController.queueEmail
);

// POST /api/notifications/sms/queue - Mettre en file d'attente un SMS
router.post('/sms/queue',
  requirePermission('notifications.sms.queue'),
  validate(schemas.sendSMS),
  notificationsController.queueSMS
);

// POST /api/notifications/email/bulk - Envoyer des emails en lot
router.post('/email/bulk',
  requirePermission('notifications.email.bulk'),
  validate(schemas.sendBulkEmail),
  notificationsController.sendBulkEmail
);

// POST /api/notifications/sms/bulk - Envoyer des SMS en lot
router.post('/sms/bulk',
  requirePermission('notifications.sms.bulk'),
  validate(schemas.sendBulkSMS),
  notificationsController.sendBulkSMS
);

// POST /api/notifications/bulk/mixed - Envoyer des notifications mixtes en lot
router.post('/bulk/mixed',
  requirePermission('notifications.bulk.mixed'),
  validate(schemas.sendBulkMixed),
  notificationsController.sendBulkMixed
);

// GET /api/notifications/job/:jobId/status - Récupérer le statut d'un job
router.get('/job/:jobId/status',
  requirePermission('notifications.jobs.read'),
  validate(schemas.getJobStatus, 'params'),
  notificationsController.getJobStatus
);

// DELETE /api/notifications/job/:jobId/cancel - Annuler un job
router.delete('/job/:jobId/cancel',
  requirePermission('notifications.jobs.cancel'),
  validate(schemas.cancelJob, 'params'),
  notificationsController.cancelJob
);

// GET /api/notifications/queues/stats - Récupérer les statistiques des queues
router.get('/queues/stats',
  requirePermission('notifications.stats.read'),
  notificationsController.getQueueStats
);

// POST /api/notifications/queues/clean - Nettoyer les jobs terminés
router.post('/queues/clean',
  requirePermission('notifications.admin'),
  validate(schemas.cleanJobs, 'query'),
  notificationsController.cleanCompletedJobs
);

// Routes spécialisées pour les notifications courantes

// POST /api/notifications/welcome/email - Email de bienvenue
router.post('/welcome/email',
  requirePermission('notifications.welcome.send'),
  validate(schemas.sendEmail),
  notificationsController.sendWelcomeEmail
);

// POST /api/notifications/welcome/sms - SMS de bienvenue
router.post('/welcome/sms',
  requirePermission('notifications.welcome.send'),
  validate(schemas.sendSMS),
  notificationsController.sendWelcomeSMS
);

// POST /api/notifications/password-reset/email - Email de réinitialisation de mot de passe
router.post('/password-reset/email',
  requirePermission('notifications.password-reset.send'),
  validate(schemas.sendEmail),
  notificationsController.sendPasswordResetEmail
);

// POST /api/notifications/password-reset/sms - SMS de réinitialisation de mot de passe
router.post('/password-reset/sms',
  requirePermission('notifications.password-reset.send'),
  validate(schemas.sendSMS),
  notificationsController.sendPasswordResetSMS
);

// POST /api/notifications/event-confirmation/email - Email de confirmation d'événement
router.post('/event-confirmation/email',
  requirePermission('notifications.event-confirmation.send'),
  validate(schemas.sendEmail),
  notificationsController.sendEventConfirmationEmail
);

// POST /api/notifications/event-confirmation/sms - SMS de confirmation d'événement
router.post('/event-confirmation/sms',
  requirePermission('notifications.event-confirmation.send'),
  validate(schemas.sendSMS),
  notificationsController.sendEventConfirmationSMS
);

// POST /api/notifications/otp/sms - SMS OTP
router.post('/otp/sms',
  requirePermission('notifications.otp.send'),
  validate(schemas.sendSMS),
  notificationsController.sendOTPSMS
);

// Routes de santé et statistiques (pas de permission requise)

// GET /api/notifications/health - Vérifier la santé du service
router.get('/health',
  notificationsController.healthCheck
);

// GET /api/notifications/stats - Récupérer les statistiques du service
router.get('/stats',
  requirePermission('notifications.stats.read'),
  notificationsController.getStats
);

// Routes pour les webhooks externes (authentification par clé API)

// POST /api/notifications/webhooks/email - Webhook pour les emails externes
router.post('/webhooks/email',
  requireAPIKey('API_KEY'),
  validate(schemas.webhook),
  notificationsController.sendEmail
);

// POST /api/notifications/webhooks/sms - Webhook pour les SMS externes
router.post('/webhooks/sms',
  requireAPIKey('API_KEY'),
  validate(schemas.webhook),
  notificationsController.sendSMS
);

// POST /api/notifications/webhooks/bulk - Webhook pour les notifications en lot
router.post('/webhooks/bulk',
  requireAPIKey('API_KEY'),
  validate(schemas.sendBulkMixed),
  notificationsController.sendBulkMixed
);

// Routes pour les intégrations tierces (authentification par webhook secret)

// POST /api/notifications/integrations/stripe - Webhook Stripe
router.post('/integrations/stripe',
  requireWebhookSecret('STRIPE_WEBHOOK_SECRET'),
  validate(schemas.webhook),
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
  requireWebhookSecret('GITHUB_WEBHOOK_SECRET'),
  validate(schemas.webhook),
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

module.exports = router;
