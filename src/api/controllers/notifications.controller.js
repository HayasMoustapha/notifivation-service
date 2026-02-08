const emailService = require('../../core/email/email.service');
const smsService = require('../../core/sms/sms.service');
const queueService = require('../../core/queues/queue.service');
const pushService = require('../../core/push/push.service');
const inAppService = require('../../core/in-app/in-app.service');
const preferencesService = require('../../core/preferences/preferences.service');
const templatesService = require('../../core/templates/templates.service');
const notificationRepository = require('../../core/database/notification.repository');
const {
  successResponse,
  createdResponse,
  acceptedResponse,
  queuedResponse,
  jobStatusResponse,
  queueStatsResponse,
  notificationResultResponse,
  notFoundResponse,
  errorResponse
} = require('../../utils/response');
const logger = require('../../utils/logger');

/**
 * Contrôleur pour les notifications
 * Aligné avec le schema du diagramme (notifications, notification_logs, notification_templates, notification_preferences)
 */
class NotificationsController {

  // ========================================
  // EMAIL
  // ========================================

  async sendEmail(req, res) {
    try {
      const { to, template, data, options = {}, userId } = req.body;

      // Passer le userId au service d'email pour la gestion des préférences et notifications
      const result = await emailService.sendTransactionalEmail(to, template, data, {
        ...options,
        userId: userId || data?.userId || null,
        ip: req.ip
      });

      // Note: La création de notification est gérée par le service d'email
      // pour les templates utilisateur (non-système) avec userId valide

      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send email', { error: error.message, to: req.body.to });
      return res.status(500).json(errorResponse('Échec de l\'envoi de l\'email', null, 'EMAIL_SEND_FAILED'));
    }
  }

  async queueEmail(req, res) {
    try {
      const { to, template, data, options = {} } = req.body;

      const result = await queueService.addEmailJob({
        type: 'transactional',
        to,
        template,
        data,
        options: { ...options, ip: req.ip }
      });

      return res.status(202).json(queuedResponse('Email mis en file d\'attente', result));
    } catch (error) {
      logger.error('Failed to queue email', { error: error.message });
      return res.status(500).json(errorResponse('Échec de la mise en file d\'attente', null, 'EMAIL_QUEUE_FAILED'));
    }
  }

  async sendBulkEmail(req, res) {
    try {
      const { recipients, template, data, options = {} } = req.body;

      const result = await emailService.queueBulkEmail(recipients, template, data, {
        ...options,
        ip: req.ip
      });

      return res.status(202).json(queuedResponse('Emails en lot mis en file d\'attente', result));
    } catch (error) {
      logger.error('Failed to send bulk emails', { error: error.message });
      return res.status(500).json(errorResponse('Échec de l\'envoi en lot', null, 'BULK_EMAIL_FAILED'));
    }
  }

  // ========================================
  // SMS
  // ========================================

  async sendSMS(req, res) {
    try {
      const { to, template, data, options = {}, userId } = req.body;

      // En développement, simuler l'envoi
      if (process.env.NODE_ENV === 'development') {
        const mockResult = {
          success: true,
          messageId: `mock-sms-${Date.now()}`,
          to,
          sentAt: new Date().toISOString(),
          provider: 'mock',
          template
        };

        return res.status(201).json(notificationResultResponse(mockResult));
      }

      // Passer le userId au service SMS pour la gestion des préférences et notifications
      const result = await smsService.sendTransactionalSMS(to, template, data, {
        ...options,
        userId: userId || data?.userId || null,
        ip: req.ip
      });

      // Note: La création de notification est gérée par le service SMS
      // pour les templates utilisateur (non-système) avec userId valide

      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send SMS', { error: error.message });
      return res.status(500).json(errorResponse('Échec de l\'envoi du SMS', null, 'SMS_SEND_FAILED'));
    }
  }

  async queueSMS(req, res) {
    try {
      const { to, template, data, options = {} } = req.body;

      const result = await queueService.addSMSJob({
        type: 'transactional',
        phoneNumber: to,
        template,
        data,
        options: { ...options, ip: req.ip }
      });

      return res.status(202).json(queuedResponse('SMS mis en file d\'attente', result));
    } catch (error) {
      logger.error('Failed to queue SMS', { error: error.message });
      return res.status(500).json(errorResponse('Échec de la mise en file d\'attente du SMS', null, 'SMS_QUEUE_FAILED'));
    }
  }

  // ========================================
  // PUSH
  // ========================================

  async sendPush(req, res) {
    try {
      const { token, template, data, options = {} } = req.body;

      const result = await pushService.sendTransactionalPush(token, template, data, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send push notification', { error: error.message });
      return res.status(500).json(errorResponse('Échec de l\'envoi push', null, 'PUSH_SEND_FAILED'));
    }
  }

  async queuePush(req, res) {
    try {
      const { token, template, data, options = {} } = req.body;

      const result = await queueService.addPushJob({
        type: 'transactional',
        token,
        template,
        data,
        options: { ...options, ip: req.ip }
      });

      return res.status(202).json(queuedResponse('Push mise en file d\'attente', result));
    } catch (error) {
      logger.error('Failed to queue push', { error: error.message });
      return res.status(500).json(errorResponse('Échec de la mise en file d\'attente push', null, 'PUSH_QUEUE_FAILED'));
    }
  }

  async sendBulkPush(req, res) {
    try {
      const { tokens, template, data, options = {} } = req.body;

      const result = await pushService.sendBulkPush(tokens, template, data, {
        ...options,
        ip: req.ip
      });

      return res.status(202).json(acceptedResponse('Notifications push en lot envoyées', result));
    } catch (error) {
      logger.error('Failed to send bulk push', { error: error.message });
      return res.status(500).json(errorResponse('Échec de l\'envoi push en lot', null, 'BULK_PUSH_FAILED'));
    }
  }

  // ========================================
  // BULK MIXED
  // ========================================

  async sendBulkMixed(req, res) {
    try {
      const { recipients, template, data, options = {} } = req.body;

      const result = await queueService.addBulkJob({
        type: options.type || 'both',
        recipients,
        template,
        data,
        options: { ...options, ip: req.ip }
      });

      return res.status(202).json(queuedResponse('Notifications mixtes mises en file d\'attente', result));
    } catch (error) {
      logger.error('Failed to send bulk mixed', { error: error.message });
      return res.status(500).json(errorResponse('Échec de l\'envoi mixte en lot', null, 'BULK_MIXED_FAILED'));
    }
  }

  // ========================================
  // IN-APP NOTIFICATIONS
  // ========================================

  async createInAppNotification(req, res) {
    try {
      const { userId, type, title, message } = req.body;

      const notification = await inAppService.createNotification({
        userId,
        type,
        title,
        message
      });

      return res.status(201).json(createdResponse('Notification in-app créée', notification));
    } catch (error) {
      logger.error('Failed to create in-app notification', { error: error.message });
      return res.status(500).json(errorResponse('Échec de la création in-app', null, 'IN_APP_CREATE_FAILED'));
    }
  }

  async getUserInAppNotifications(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 50, isRead, type } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const result = await inAppService.getUserNotifications(userId, {
        limit: parseInt(limit),
        offset,
        isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
        type
      });

      return res.status(200).json(successResponse('Notifications in-app récupérées', result));
    } catch (error) {
      logger.error('Failed to get in-app notifications', { error: error.message });
      return res.status(500).json(errorResponse('Échec récupération in-app', null, 'IN_APP_GET_FAILED'));
    }
  }

  async markInAppNotificationAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const { userId } = req.body;

      const notification = await inAppService.markAsRead(notificationId, userId);
      return res.status(200).json(successResponse('Notification marquée comme lue', notification));
    } catch (error) {
      logger.error('Failed to mark as read', { error: error.message });
      return res.status(500).json(errorResponse('Échec du marquage comme lu', null, 'IN_APP_MARK_READ_FAILED'));
    }
  }

  async markAllInAppNotificationsAsRead(req, res) {
    try {
      const { userId } = req.params;
      const { type } = req.body;

      const result = await inAppService.markAllAsRead(userId, { type });
      return res.status(200).json(successResponse('Toutes les notifications marquées comme lues', result));
    } catch (error) {
      logger.error('Failed to mark all as read', { error: error.message });
      return res.status(500).json(errorResponse('Échec du marquage en lot', null, 'IN_APP_MARK_ALL_READ_FAILED'));
    }
  }

  async deleteInAppNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const { userId } = req.body;

      const deleted = await inAppService.deleteNotification(notificationId, userId);

      if (!deleted) {
        return res.status(404).json(notFoundResponse('Notification in-app non trouvée', 'IN_APP_NOT_FOUND'));
      }

      return res.status(200).json(successResponse('Notification supprimée', { notificationId }));
    } catch (error) {
      logger.error('Failed to delete in-app notification', { error: error.message });
      return res.status(500).json(errorResponse('Échec de la suppression', null, 'IN_APP_DELETE_FAILED'));
    }
  }

  async getInAppNotificationStats(req, res) {
    try {
      const { userId } = req.params;
      const stats = await inAppService.getUserStats(userId);
      return res.status(200).json(successResponse('Statistiques in-app', stats));
    } catch (error) {
      logger.error('Failed to get in-app stats', { error: error.message });
      return res.status(500).json(errorResponse('Échec des statistiques in-app', null, 'IN_APP_STATS_FAILED'));
    }
  }

  // ========================================
  // PREFERENCES
  // ========================================

  async getUserPreferences(req, res) {
    try {
      const { userId } = req.params;
      const preferences = await preferencesService.getUserPreferences(userId);

      if (!preferences) {
        return res.status(404).json(notFoundResponse('Préférences non trouvées', 'PREFERENCES_NOT_FOUND'));
      }

      return res.status(200).json(successResponse('Préférences récupérées', preferences));
    } catch (error) {
      logger.error('Failed to get preferences', { error: error.message });
      return res.status(500).json(errorResponse('Échec récupération préférences', null, 'PREFERENCES_GET_FAILED'));
    }
  }

  async updateUserPreferences(req, res) {
    try {
      const { userId } = req.params;
      const preferences = req.body;

      const updated = await preferencesService.updateUserPreferences(userId, preferences);
      return res.status(200).json(successResponse('Préférences mises à jour', updated));
    } catch (error) {
      logger.error('Failed to update preferences', { error: error.message });
      return res.status(500).json(errorResponse('Échec mise à jour préférences', null, 'PREFERENCES_UPDATE_FAILED'));
    }
  }

  async resetUserPreferences(req, res) {
    try {
      const { userId } = req.params;
      const reset = await preferencesService.resetUserPreferences(userId);
      return res.status(200).json(successResponse('Préférences réinitialisées', { reset }));
    } catch (error) {
      logger.error('Failed to reset preferences', { error: error.message });
      return res.status(500).json(errorResponse('Échec réinitialisation préférences', null, 'PREFERENCES_RESET_FAILED'));
    }
  }

  async unsubscribeUser(req, res) {
    try {
      const { userId } = req.body;
      const preferences = await preferencesService.unsubscribeUser(userId);
      return res.status(200).json(successResponse('Utilisateur désabonné', preferences));
    } catch (error) {
      logger.error('Failed to unsubscribe user', { error: error.message });
      return res.status(500).json(errorResponse('Échec du désabonnement', null, 'UNSUBSCRIBE_FAILED'));
    }
  }

  async checkNotificationPreferences(req, res) {
    try {
      const { userId } = req.params;
      const { channel } = req.query;

      const result = await preferencesService.shouldSendNotification(userId, channel);
      return res.status(200).json(successResponse('Vérification des préférences', {
        shouldSend: result.shouldSend,
        reason: result.reason,
        userId,
        channel
      }));
    } catch (error) {
      logger.error('Failed to check preferences', { error: error.message });
      return res.status(500).json(errorResponse('Échec vérification préférences', null, 'PREFERENCES_CHECK_FAILED'));
    }
  }

  async getPreferencesStats(req, res) {
    try {
      const stats = await preferencesService.getPreferencesStats();
      return res.status(200).json(successResponse('Statistiques des préférences', stats));
    } catch (error) {
      logger.error('Failed to get preferences stats', { error: error.message });
      return res.status(500).json(errorResponse('Échec statistiques préférences', null, 'PREFERENCES_STATS_FAILED'));
    }
  }

  // ========================================
  // TEMPLATES
  // ========================================

  async createTemplate(req, res) {
    try {
      const templateData = req.body;

      const validation = templatesService.validateTemplate(templateData);
      if (!validation.valid) {
        return res.status(400).json(errorResponse('Template invalide', validation.errors, 'TEMPLATE_VALIDATION_FAILED'));
      }

      const template = await templatesService.createTemplate(templateData);
      return res.status(201).json(createdResponse('Template créé', template));
    } catch (error) {
      logger.error('Failed to create template', { error: error.message });
      return res.status(500).json(errorResponse('Échec création template', null, 'TEMPLATE_CREATE_FAILED'));
    }
  }

  async getTemplate(req, res) {
    try {
      const { name } = req.params;
      const { channel } = req.query;

      const template = await templatesService.getTemplateByName(name, channel);
      if (!template) {
        return res.status(404).json(notFoundResponse('Template non trouvé', 'TEMPLATE_NOT_FOUND'));
      }

      return res.status(200).json(successResponse('Template récupéré', template));
    } catch (error) {
      logger.error('Failed to get template', { error: error.message });
      return res.status(500).json(errorResponse('Échec récupération template', null, 'TEMPLATE_GET_FAILED'));
    }
  }

  async updateTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const updates = req.body;

      const template = await templatesService.updateTemplate(templateId, updates);
      return res.status(200).json(successResponse('Template mis à jour', template));
    } catch (error) {
      logger.error('Failed to update template', { error: error.message });
      return res.status(500).json(errorResponse('Échec mise à jour template', null, 'TEMPLATE_UPDATE_FAILED'));
    }
  }

  async deleteTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const deleted = await templatesService.deleteTemplate(templateId);

      if (!deleted) {
        return res.status(404).json(notFoundResponse('Template non trouvé', 'TEMPLATE_NOT_FOUND'));
      }

      return res.status(200).json(successResponse('Template supprimé', { templateId }));
    } catch (error) {
      logger.error('Failed to delete template', { error: error.message });
      return res.status(500).json(errorResponse('Échec suppression template', null, 'TEMPLATE_DELETE_FAILED'));
    }
  }

  async listTemplates(req, res) {
    try {
      const { channel, page = 1, limit = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const result = await templatesService.listTemplates({
        channel,
        limit: parseInt(limit),
        offset
      });

      return res.status(200).json(successResponse('Templates récupérés', result));
    } catch (error) {
      logger.error('Failed to list templates', { error: error.message });
      return res.status(500).json(errorResponse('Échec liste templates', null, 'TEMPLATE_LIST_FAILED'));
    }
  }

  async previewTemplate(req, res) {
    try {
      const { name } = req.params;
      const { data, channel } = req.body;

      const template = await templatesService.getTemplateByName(name, channel);
      if (!template) {
        return res.status(404).json(notFoundResponse('Template non trouvé', 'TEMPLATE_NOT_FOUND'));
      }

      const rendered = await templatesService.renderTemplate(template, data);
      return res.status(200).json(successResponse('Aperçu du template', {
        template: { name: template.name, channel: template.channel },
        rendered,
        previewData: data
      }));
    } catch (error) {
      logger.error('Failed to preview template', { error: error.message });
      return res.status(500).json(errorResponse('Échec aperçu template', null, 'TEMPLATE_PREVIEW_FAILED'));
    }
  }

  async importTemplates(req, res) {
    try {
      const { templatesDir } = req.body;
      const result = await templatesService.importFromFiles(templatesDir);
      return res.status(200).json(successResponse('Import terminé', result));
    } catch (error) {
      logger.error('Failed to import templates', { error: error.message });
      return res.status(500).json(errorResponse('Échec import templates', null, 'TEMPLATE_IMPORT_FAILED'));
    }
  }

  // ========================================
  // TRANSACTIONAL SHORTCUTS
  // ========================================

  async sendWelcomeEmail(req, res) {
    try {
      const { to, userData, options = {} } = req.body;
      const result = await emailService.sendWelcomeEmail(to, userData, { ...options, ip: req.ip });
      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send welcome email', { error: error.message });
      return res.status(500).json(errorResponse('Échec email de bienvenue', null, 'WELCOME_EMAIL_FAILED'));
    }
  }

  async sendWelcomeSMS(req, res) {
    try {
      const { phoneNumber, userData, options = {} } = req.body;
      const result = await smsService.sendWelcomeSMS(phoneNumber, userData, { ...options, ip: req.ip });
      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send welcome SMS', { error: error.message });
      return res.status(500).json(errorResponse('Échec SMS de bienvenue', null, 'WELCOME_SMS_FAILED'));
    }
  }

  async sendPasswordResetEmail(req, res) {
    try {
      const { to, resetToken, options = {} } = req.body;
      const result = await emailService.sendPasswordResetEmail(to, resetToken, { ...options, ip: req.ip });
      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send password reset email', { error: error.message });
      return res.status(500).json(errorResponse('Échec email réinitialisation', null, 'PASSWORD_RESET_EMAIL_FAILED'));
    }
  }

  async sendPasswordResetSMS(req, res) {
    try {
      const { phoneNumber, resetCode, options = {} } = req.body;
      const result = await smsService.sendPasswordResetSMS(phoneNumber, resetCode, { ...options, ip: req.ip });
      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send password reset SMS', { error: error.message });
      return res.status(500).json(errorResponse('Échec SMS réinitialisation', null, 'PASSWORD_RESET_SMS_FAILED'));
    }
  }

  async sendEventConfirmationEmail(req, res) {
    try {
      const { to, eventData, ticketData, options = {} } = req.body;
      const result = await emailService.sendEventConfirmationEmail(to, eventData, ticketData, { ...options, ip: req.ip });
      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send event confirmation email', { error: error.message });
      return res.status(500).json(errorResponse('Échec email confirmation', null, 'EVENT_CONFIRMATION_EMAIL_FAILED'));
    }
  }

  async sendEventConfirmationSMS(req, res) {
    try {
      const { phoneNumber, eventData, ticketData, options = {} } = req.body;
      const result = await smsService.sendEventConfirmationSMS(phoneNumber, eventData, ticketData, { ...options, ip: req.ip });
      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send event confirmation SMS', { error: error.message });
      return res.status(500).json(errorResponse('Échec SMS confirmation', null, 'EVENT_CONFIRMATION_SMS_FAILED'));
    }
  }

  async sendOTPSMS(req, res) {
    try {
      const { phoneNumber, otpCode, purpose, options = {} } = req.body;
      const result = await smsService.sendOTPSMS(phoneNumber, otpCode, purpose, { ...options, ip: req.ip });
      return res.status(201).json(notificationResultResponse(result));
    } catch (error) {
      logger.error('Failed to send OTP SMS', { error: error.message });
      return res.status(500).json(errorResponse('Échec SMS OTP', null, 'OTP_SMS_FAILED'));
    }
  }

  // ========================================
  // HISTORY & STATISTICS
  // ========================================

  async getNotificationHistory(req, res) {
    try {
      const { page = 1, limit = 50, type, status, channel, userId, startDate, endDate, orderBy, orderDirection } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const history = await notificationRepository.getNotificationHistory({
        limit: parseInt(limit),
        offset,
        type,
        status,
        channel,
        userId,
        startDate,
        endDate,
        orderBy,
        orderDirection
      });

      return res.status(200).json(successResponse('Historique des notifications', {
        notifications: history.notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: history.pagination.total,
          totalPages: Math.ceil(history.pagination.total / parseInt(limit)),
          hasMore: history.pagination.hasMore
        }
      }));
    } catch (error) {
      logger.error('Failed to get notification history', { error: error.message });
      return res.status(500).json(errorResponse('Échec récupération historique', null, 'HISTORY_FAILED'));
    }
  }

  async getNotificationStatistics(req, res) {
    try {
      const { period = '7d', startDate, endDate, userId } = req.query;

      let filters = { userId };
      if (period) {
        const periodMs = { '1d': 86400000, '7d': 604800000, '30d': 2592000000, '90d': 7776000000 };
        if (periodMs[period]) {
          filters.startDate = new Date(Date.now() - periodMs[period]).toISOString();
          filters.endDate = new Date().toISOString();
        }
      }
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const stats = await notificationRepository.getNotificationStatistics(filters);

      return res.status(200).json(successResponse('Statistiques', {
        ...stats,
        generatedAt: new Date().toISOString()
      }));
    } catch (error) {
      logger.error('Failed to get statistics', { error: error.message });
      return res.status(500).json(errorResponse('Échec statistiques', null, 'STATS_FAILED'));
    }
  }

  async retryNotification(req, res) {
    try {
      const { notificationId } = req.params;

      const notification = await notificationRepository.getNotificationById(notificationId);
      if (!notification) {
        return res.status(404).json(notFoundResponse('Notification non trouvée', 'NOTIFICATION_NOT_FOUND'));
      }

      if (notification.status !== 'failed') {
        return res.status(400).json(errorResponse('Seules les notifications échouées peuvent être relancées', null, 'NOTIFICATION_NOT_FAILED'));
      }

      let result;
      switch (notification.channel) {
        case 'email':
          result = await emailService.sendTransactionalEmail(notification.content, notification.type, {});
          break;
        case 'sms':
          result = await smsService.sendTransactionalSMS(notification.content, notification.type, {});
          break;
        case 'push':
          result = await pushService.sendTransactionalPush(notification.content, notification.type, {});
          break;
        default:
          return res.status(400).json(errorResponse('Type non supporté pour retry', null, 'UNSUPPORTED_TYPE'));
      }

      if (result.success) {
        await notificationRepository.updateNotificationStatus(notificationId, 'sent', {
          sentAt: new Date().toISOString()
        });
      }

      await notificationRepository.createNotificationLog({
        notificationId: parseInt(notificationId),
        provider: result.provider || 'retry',
        response: result,
        errorMessage: result.success ? null : (result.error || 'Retry failed')
      });

      return res.status(200).json(successResponse('Notification relancée', { notificationId, result }));
    } catch (error) {
      logger.error('Failed to retry notification', { error: error.message });
      return res.status(500).json(errorResponse('Échec du retry', null, 'RETRY_FAILED'));
    }
  }

  // ========================================
  // QUEUES
  // ========================================

  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;
      const { queueName = 'email' } = req.query;

      const result = await queueService.getJobStatus(jobId, queueName);
      if (!result.success) {
        return res.status(404).json(notFoundResponse('Job', jobId));
      }

      return res.status(200).json(jobStatusResponse(result.job));
    } catch (error) {
      logger.error('Failed to get job status', { error: error.message });
      return res.status(500).json(errorResponse('Échec statut job', null, 'JOB_STATUS_FAILED'));
    }
  }

  async cancelJob(req, res) {
    try {
      const { jobId } = req.params;
      const { queueName = 'email' } = req.query;

      const result = await queueService.cancelJob(jobId, queueName);
      if (!result.success) {
        return res.status(404).json(notFoundResponse('Job', jobId));
      }

      return res.status(200).json(successResponse('Job annulé', { jobId, cancelled: true }));
    } catch (error) {
      logger.error('Failed to cancel job', { error: error.message });
      return res.status(500).json(errorResponse('Échec annulation job', null, 'JOB_CANCEL_FAILED'));
    }
  }

  async getQueueStats(req, res) {
    try {
      const result = await queueService.getQueueStats();
      return res.status(200).json(queueStatsResponse(result.stats));
    } catch (error) {
      logger.error('Failed to get queue stats', { error: error.message });
      return res.status(500).json(errorResponse('Échec statistiques queues', null, 'QUEUE_STATS_FAILED'));
    }
  }

  async cleanCompletedJobs(req, res) {
    try {
      const result = await queueService.cleanCompletedJobs();
      return res.status(200).json(successResponse('Jobs nettoyés', {
        cleanedCount: result.cleanedCount,
        cleanedAt: result.cleanedAt
      }));
    } catch (error) {
      logger.error('Failed to clean jobs', { error: error.message });
      return res.status(500).json(errorResponse('Échec nettoyage jobs', null, 'CLEAN_JOBS_FAILED'));
    }
  }

  async cleanQueues(req, res) {
    try {
      const result = await queueService.cleanCompletedJobs();
      return res.status(200).json(successResponse('Queues nettoyées', {
        cleanedCount: result.cleanedCount,
        cleanedAt: result.cleanedAt
      }));
    } catch (error) {
      logger.error('Failed to clean queues', { error: error.message });
      return res.status(500).json(errorResponse('Échec nettoyage queues', null, 'CLEANUP_FAILED'));
    }
  }

  // ========================================
  // HEALTH & STATS
  // ========================================

  async healthCheck(req, res) {
    try {
      const [emailHealth, smsHealth] = await Promise.all([
        emailService.healthCheck(),
        smsService.healthCheck()
      ]);

      return res.status(200).json(successResponse('Service opérationnel', {
        email: emailHealth,
        sms: smsHealth,
        overall: { healthy: emailHealth.healthy || smsHealth.healthy }
      }));
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      return res.status(503).json(errorResponse('Service indisponible', null, 'HEALTH_CHECK_FAILED'));
    }
  }

  async getStats(req, res) {
    try {
      const [emailStats, smsStats, queueStats] = await Promise.all([
        emailService.getStats(),
        smsService.getStats(),
        queueService.getQueueStats()
      ]);

      return res.status(200).json(successResponse('Statistiques du service', {
        email: emailStats,
        sms: smsStats,
        queues: queueStats.stats
      }));
    } catch (error) {
      logger.error('Failed to get stats', { error: error.message });
      return res.status(500).json(errorResponse('Échec statistiques', null, 'STATS_FAILED'));
    }
  }
}

module.exports = new NotificationsController();
