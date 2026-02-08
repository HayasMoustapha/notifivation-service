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
const { validateBody, validateParams, validateQuery, schemas } = require('../../middleware/validation');

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
 * 📤 ENVOYER UNE NOTIFICATION PUSH
 * POST /api/notifications/push
 * Envoie une notification push transactionnelle immédiatement
 */
router.post('/push',
  validateBody(schemas.sendPush),
  notificationsController.sendPush
);

/**
 * 📤 METTRE EN FILE D'ATTENTE UNE NOTIFICATION PUSH
 * POST /api/notifications/push/queue
 * Met une notification push en file d'attente pour traitement asynchrone
 */
router.post('/push/queue',
  validateBody(schemas.sendPush),
  notificationsController.queuePush
);

/**
 * 📤 ENVOYER NOTIFICATIONS PUSH EN LOT
 * POST /api/notifications/push/bulk
 * Envoie plusieurs notifications push en une seule requête
 */
router.post('/push/bulk',
  validateBody(schemas.sendBulkPush),
  notificationsController.sendBulkPush
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
// � ROUTES NOTIFICATIONS IN-APP
// ========================================

/**
 * 🔔 CRÉER UNE NOTIFICATION IN-APP
 * POST /api/notifications/in-app
 * Crée une notification pour l'interface utilisateur
 */
router.post('/in-app',
  validateBody(schemas.createInAppNotification),
  notificationsController.createInAppNotification
);

/**
 * 🔔 RÉCUPÉRER LES NOTIFICATIONS IN-APP D'UN UTILISATEUR
 * GET /api/notifications/in-app/users/:userId
 * Récupère les notifications in-app d'un utilisateur avec pagination et filtres
 */
router.get('/in-app/users/:userId',
  validateParams(schemas.params.userId),
  notificationsController.getUserInAppNotifications
);

/**
 * 🔔 MARQUER UNE NOTIFICATION COMME LUE
 * PUT /api/notifications/in-app/:notificationId/read
 * Marque une notification spécifique comme lue
 */
router.put('/in-app/:notificationId/read',
  validateParams(schemas.params.notificationId),
  validateBody(schemas.markAsRead),
  notificationsController.markInAppNotificationAsRead
);

/**
 * 🔔 MARQUER TOUTES LES NOTIFICATIONS COMME LUES
 * PUT /api/notifications/in-app/users/:userId/read-all
 * Marque toutes les notifications d'un utilisateur comme lues
 */
router.put('/in-app/users/:userId/read-all',
  validateParams(schemas.params.userId),
  validateBody(schemas.markAllAsRead),
  notificationsController.markAllInAppNotificationsAsRead
);

/**
 * 🔔 SUPPRIMER UNE NOTIFICATION IN-APP
 * DELETE /api/notifications/in-app/:notificationId
 * Supprime une notification in-app
 */
router.delete('/in-app/:notificationId',
  validateParams(schemas.params.notificationId),
  validateBody(schemas.deleteInAppNotification),
  notificationsController.deleteInAppNotification
);

/**
 * 🔔 STATISTIQUES DES NOTIFICATIONS IN-APP
 * GET /api/notifications/in-app/users/:userId/stats
 * Récupère les statistiques des notifications in-app d'un utilisateur
 */
router.get('/in-app/users/:userId/stats',
  validateParams(schemas.params.userId),
  notificationsController.getInAppNotificationStats
);

/**
 * ⚙️ RÉCUPÉRER LES PRÉFÉRENCES UTILISATEUR
 * GET /api/notifications/users/:userId/preferences
 * Récupère les préférences de notification d'un utilisateur
 */
router.get('/users/:userId/preferences',
  validateParams(schemas.params.userId),
  notificationsController.getUserPreferences
);

/**
 * ⚙️ METTRE À JOUR LES PRÉFÉRENCES UTILISATEUR
 * PUT /api/notifications/users/:userId/preferences
 * Met à jour les préférences de notification d'un utilisateur
 */
router.put('/users/:userId/preferences',
  validateParams(schemas.params.userId),
  validateBody(schemas.updateUserPreferences),
  notificationsController.updateUserPreferences
);

/**
 * ⚙️ RÉINITIALISER LES PRÉFÉRENCES UTILISATEUR
 * DELETE /api/notifications/users/:userId/preferences
 * Réinitialise les préférences d'un utilisateur aux valeurs par défaut
 */
router.delete('/users/:userId/preferences',
  validateParams(schemas.params.userId),
  notificationsController.resetUserPreferences
);

/**
 * ⚙️ DÉSABONNER UN UTILISATEUR
 * POST /api/notifications/unsubscribe
 * Désabonne un utilisateur de toutes les notifications
 */
router.post('/unsubscribe',
  validateBody(schemas.unsubscribeUser),
  notificationsController.unsubscribeUser
);

/**
 * ⚙️ VÉRIFIER LES PRÉFÉRENCES
 * GET /api/notifications/users/:userId/preferences/check
 * Vérifie si une notification doit être envoyée selon les préférences
 */
router.get('/users/:userId/preferences/check',
  validateParams(schemas.params.userId),
  notificationsController.checkNotificationPreferences
);

/**
 * 📊 STATISTIQUES DES PRÉFÉRENCES
 * GET /api/notifications/preferences/stats
 * Récupère les statistiques des préférences utilisateur
 */
router.get('/preferences/stats',
  notificationsController.getPreferencesStats
);

/**
 * 📝 CRÉER UN TEMPLATE
 * POST /api/notifications/templates
 * Crée un nouveau template de notification
 */
router.post('/templates',
  validateBody(schemas.createTemplate),
  notificationsController.createTemplate
);

/**
 * 📝 RÉCUPÉRER UN TEMPLATE PAR NOM
 * GET /api/notifications/templates/:name
 * Récupère un template par son nom
 */
router.get('/templates/:name',
  validateParams(schemas.params.templateName),
  notificationsController.getTemplate
);

/**
 * 📝 METTRE À JOUR UN TEMPLATE
 * PUT /api/notifications/templates/:templateId
 * Met à jour un template existant
 */
router.put('/templates/:templateId',
  validateParams(schemas.params.templateId),
  validateBody(schemas.updateTemplate),
  notificationsController.updateTemplate
);

/**
 * 📝 SUPPRIMER UN TEMPLATE
 * DELETE /api/notifications/templates/:templateId
 * Supprime (désactive) un template
 */
router.delete('/templates/:templateId',
  validateParams(schemas.params.templateId),
  notificationsController.deleteTemplate
);

/**
 * 📝 LISTER LES TEMPLATES
 * GET /api/notifications/templates
 * Liste les templates avec filtres et pagination
 */
router.get('/templates',
  notificationsController.listTemplates
);

/**
 * 📝 APERÇU D'UN TEMPLATE
 * POST /api/notifications/templates/:name/preview
 * Génère un aperçu d'un template avec des données de test
 */
router.post('/templates/:name/preview',
  validateParams(schemas.params.templateName),
  validateBody(schemas.previewTemplate),
  notificationsController.previewTemplate
);

/**
 * 📝 IMPORTER DES TEMPLATES
 * POST /api/notifications/templates/import
 * Importe des templates depuis des fichiers
 */
router.post('/templates/import',
  validateBody(schemas.importTemplates),
  notificationsController.importTemplates
);

/**
 * 📋 HISTORIQUE NOTIFICATIONS
 * GET /api/notifications/history
 * Récupère l'historique des notifications
 */
router.get('/history',
  validateQuery(schemas.getHistory),
  notificationsController.getNotificationHistory
);

/**
 * � RELANCER UNE NOTIFICATION
 * POST /api/notifications/:notificationId/retry
 * Relance manuellement une notification échouée
 */
router.post('/:notificationId/retry',
  validateParams(schemas.params.notificationId),
  notificationsController.retryNotification
);

/**
 * �📈 STATISTIQUES NOTIFICATIONS
 * GET /api/notifications/statistics
 * Récupère les statistiques des notifications
 */
router.get('/statistics',
  validateQuery(schemas.getStatistics),
  notificationsController.getNotificationStatistics
);

/**
 * 🧹 NETTOYAGE DES FILES D'ATTENTE
 * POST /api/notifications/queues/clean
 * Nettoie les anciennes notifications terminées
 */
router.post('/queues/clean',
  validateBody(schemas.cleanQueues),
  notificationsController.cleanQueues
);

module.exports = router;
