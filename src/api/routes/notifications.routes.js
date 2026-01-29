/**
 * 📧 ROUTES NOTIFICATIONS
 * 
 * RÔLE : Routes techniques pour l'envoi de notifications
 * UTILISATION : Emails transactionnels, SMS, files d'attente
 * 
 * NOTE : Service technique sans authentification
 * La sécurité est gérée par event-planner-core
 */

const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const { validateBody, validateParams, schemas } = require('../../middleware/validation');

// ========================================
// 📧 ROUTES EMAILS
// ========================================

/**
 * 📤 ENVOYER UN EMAIL
 * POST /api/notifications/email
 * Envoie un email transactionnel immédiatement
 */
router.post('/email',
  validateBody(schemas.sendEmail),
  notificationsController.sendEmail
);

/**
 * 📤 METTRE EN FILE D'ATTENTE UN EMAIL
 * POST /api/notifications/email/queue
 * Met un email en file d'attente pour traitement asynchrone
 */
router.post('/email/queue',
  validateBody(schemas.sendEmail),
  notificationsController.queueEmail
);

/**
 * 📤 ENVOYER EMAILS EN LOT
 * POST /api/notifications/email/bulk
 * Envoie plusieurs emails en une seule requête
 */
router.post('/email/bulk',
  validateBody(schemas.sendBulkEmail),
  notificationsController.sendBulkEmail
);

// ========================================
// 📱 ROUTES SMS
// ========================================

/**
 * 📤 ENVOYER UN SMS
 * POST /api/notifications/sms
 * Envoie un SMS transactionnel immédiatement
 */
router.post('/sms',
  validateBody(schemas.sendSMS),
  notificationsController.sendSMS
);

/**
 * 📤 METTRE EN FILE D'ATTENTE UN SMS
 * POST /api/notifications/sms/queue
 * Met un SMS en file d'attente pour traitement asynchrone
 */
router.post('/sms/queue',
  validateBody(schemas.sendSMS),
  notificationsController.queueSMS
);

/**
 * 📤 ENVOYER SMS EN LOT
 * POST /api/notifications/sms/bulk
 * Envoie plusieurs SMS en une seule requête
 */
router.post('/sms/bulk',
  validateBody(schemas.sendBulkSMS),
  notificationsController.sendBulkSMS
);

// ========================================
// 📊 ROUTES MIXTES
// ========================================

/**
 * 📤 ENVOYER NOTIFICATIONS MIXTES EN LOT
 * POST /api/notifications/bulk/mixed
 * Envoie un mélange d'emails et SMS en lot
 */
router.post('/bulk/mixed',
  validateBody(schemas.sendBulkMixed),
  notificationsController.sendBulkMixed
);

// ========================================
// 📋 ROUTES DE STATUT ET SUIVI
// ========================================

/**
 * 📊 STATUT NOTIFICATION
 * GET /api/notifications/:notificationId/status
 * Récupère le statut d'une notification
 */
router.get('/:notificationId/status',
  validateParams(schemas.params.notificationId),
  notificationsController.getNotificationStatus
);

/**
 * 📋 HISTORIQUE NOTIFICATIONS
 * GET /api/notifications/history
 * Récupère l'historique des notifications
 */
router.get('/history',
  validateBody(schemas.getHistory),
  notificationsController.getNotificationHistory
);

/**
 * 📈 STATISTIQUES NOTIFICATIONS
 * GET /api/notifications/statistics
 * Récupère les statistiques des notifications
 */
router.get('/statistics',
  validateBody(schemas.getStatistics),
  notificationsController.getNotificationStatistics
);

module.exports = router;
