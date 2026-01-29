const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { validateBody, validateParams, schemas } = require('../../middleware/validation');

/**
 * Routes pour les notifications - Service de notification pur
 */

// POST /api/notifications/email - Envoyer un email transactionnel
router.post('/email',
  validateBody(schemas.sendEmail),
  notificationsController.sendEmail
);

// POST /api/notifications/sms - Envoyer un SMS transactionnel
router.post('/sms',
  validateBody(schemas.sendSMS),
  notificationsController.sendSMS
);

// POST /api/notifications/email/queue - Mettre en file d'attente un email
router.post('/email/queue',
  validateBody(schemas.sendEmail),
  notificationsController.queueEmail
);

// POST /api/notifications/sms/queue - Mettre en file d'attente un SMS
router.post('/sms/queue',
  validateBody(schemas.sendSMS),
  notificationsController.queueSMS
);

// POST /api/notifications/email/bulk - Envoyer des emails en lot
router.post('/email/bulk',
  validateBody(schemas.sendBulkEmail),
  notificationsController.sendBulkEmail
);

// POST /api/notifications/sms/bulk - Envoyer des SMS en lot
router.post('/sms/bulk',
  validateBody(schemas.sendBulkSMS),
  notificationsController.sendBulkSMS
);

// POST /api/notifications/bulk/mixed - Envoyer des notifications mixtes en lot
router.post('/bulk/mixed',
  validateBody(schemas.sendBulkMixed),
  notificationsController.sendBulkMixed
);

// GET /api/notifications/job/:jobId/status - Récupérer le statut d'un job
router.get('/job/:jobId/status',
  validateParams(schemas.getJobStatus),
  notificationsController.getJobStatus
);

// DELETE /api/notifications/job/:jobId/cancel - Annuler un job
router.delete('/job/:jobId/cancel',
  validateParams(schemas.cancelJob),
  notificationsController.cancelJob
);

// GET /api/notifications/queues/stats - Récupérer les statistiques des queues
router.get('/queues/stats',
  notificationsController.getQueueStats
);

// POST /api/notifications/queues/clean - Nettoyer les jobs terminés
router.post('/queues/clean',
  validateBody(schemas.cleanJobs),
  notificationsController.cleanCompletedJobs
);

// Routes spécialisées pour les notifications courantes
// Toutes utilisent la signature unifiée: template + data

// POST /api/notifications/welcome/email - Email de bienvenue
router.post('/welcome/email',
  validateBody(schemas.sendEmail),
  notificationsController.sendWelcomeEmail
);

// POST /api/notifications/welcome/sms - SMS de bienvenue
router.post('/welcome/sms',
  validateBody(schemas.sendSMS),
  notificationsController.sendWelcomeSMS
);

// POST /api/notifications/password-reset/email - Email de réinitialisation de mot de passe
router.post('/password-reset/email',
  validateBody(schemas.sendEmail),
  notificationsController.sendPasswordResetEmail
);

// POST /api/notifications/password-reset/sms - SMS de réinitialisation de mot de passe
router.post('/password-reset/sms',
  validateBody(schemas.sendSMS),
  notificationsController.sendPasswordResetSMS
);

// POST /api/notifications/event-confirmation/email - Email de confirmation d'événement
router.post('/event-confirmation/email',
  validateBody(schemas.sendEmail),
  notificationsController.sendEventConfirmationEmail
);

// POST /api/notifications/event-confirmation/sms - SMS de confirmation d'événement
router.post('/event-confirmation/sms',
  validateBody(schemas.sendSMS),
  notificationsController.sendEventConfirmationSMS
);

// POST /api/notifications/otp/sms - SMS OTP
router.post('/otp/sms',
  validateBody(schemas.sendSMS),
  notificationsController.sendOTPSMS
);

// Routes de santé et statistiques (pas de permission requise)

// GET /api/notifications/health - Vérifier la santé du service
router.get('/health',
  notificationsController.healthCheck
);

// GET /api/notifications/stats - Récupérer les statistiques du service
router.get('/stats',
  notificationsController.getStats
);

// Routes pour les webhooks externes
// Utilisent aussi la signature unifiée

// POST /api/notifications/webhooks/email - Webhook pour les emails externes
router.post('/webhooks/email',
  validateBody(schemas.sendEmail),
  notificationsController.sendEmail
);

// POST /api/notifications/webhooks/sms - Webhook pour les SMS externes
router.post('/webhooks/sms',
  validateBody(schemas.sendSMS),
  notificationsController.sendSMS
);

// POST /api/notifications/webhooks/bulk - Webhook pour les notifications en lot externes
router.post('/webhooks/bulk',
  validateBody(schemas.sendBulkMixed),
  notificationsController.sendBulkMixed
);

module.exports = router;
