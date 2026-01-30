const emailService = require('../../core/email/email.service');
const smsService = require('../../core/sms/sms.service');
const queueService = require('../../core/queues/queue.service');
const { 
  successResponse, 
  createdResponse, 
  acceptedResponse, 
  queuedResponse,
  jobStatusResponse,
  queueStatsResponse,
  notificationResultResponse,
  bulkNotificationResultResponse,
  notFoundResponse,
  errorResponse
} = require('../../utils/response');
const logger = require('../../utils/logger');

/**
 * Contrôleur pour les notifications
 * Gère l'envoi d'emails, SMS et les traitements en lot
 */
class NotificationsController {
  /**
   * Envoie un email transactionnel
   */
  async sendEmail(req, res) {
    try {
      const { to, template, data, options = {} } = req.body;
      
      logger.email('Sending transactional email', {
        to,
        template,
        ip: req.ip
      });

      const result = await emailService.sendTransactionalEmail(to, template, data, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send email', {
        error: error.message,
        to: req.body.to,
        template: req.body.template
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi de l\'email', null, 'EMAIL_SEND_FAILED')
      );
    }
  }

  /**
   * Envoie un SMS transactionnel
   */
  async sendSMS(req, res) {
    try {
      const { phoneNumber, template, data, options = {} } = req.body;
      
      logger.sms('Sending transactional SMS', {
        phoneNumber: smsService.maskPhoneNumber(phoneNumber),
        template,
        ip: req.ip
      });

      const result = await smsService.sendTransactionalSMS(phoneNumber, template, data, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send SMS', {
        error: error.message,
        phoneNumber: smsService.maskPhoneNumber(req.body.phoneNumber),
        template: req.body.template
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi du SMS', null, 'SMS_SEND_FAILED')
      );
    }
  }

  /**
   * Met en file d'attente un email
   */
  async queueEmail(req, res) {
    try {
      const { to, template, data, options = {} } = req.body;
      
      const jobData = {
        type: 'transactional',
        to,
        template,
        data,
        options: {
          ...options,
          ip: req.ip
        }
      };

      const result = await queueService.addEmailJob(jobData);

      logger.queue('Email job queued', {
        jobId: result.jobId,
        to,
        template
      });

      return res.status(202).json(
        queuedResponse('Email mis en file d\'attente', result)
      );
    } catch (error) {
      logger.error('Failed to queue email', {
        error: error.message,
        to: req.body.to,
        template: req.body.template
      });

      return res.status(500).json(
        errorResponse('Échec de la mise en file d\'attente de l\'email', null, 'EMAIL_QUEUE_FAILED')
      );
    }
  }

  /**
   * Met en file d'attente un SMS
   */
  async queueSMS(req, res) {
    try {
      const { phoneNumber, template, data, options = {} } = req.body;
      
      const jobData = {
        type: 'transactional',
        phoneNumber,
        template,
        data,
        options: {
          ...options,
          ip: req.ip
        }
      };

      const result = await queueService.addSMSJob(jobData);

      logger.queue('SMS job queued', {
        jobId: result.jobId,
        phoneNumber: smsService.maskPhoneNumber(phoneNumber),
        template
      });

      return res.status(202).json(
        queuedResponse('SMS mis en file d\'attente', result)
      );
    } catch (error) {
      logger.error('Failed to queue SMS', {
        error: error.message,
        phoneNumber: smsService.maskPhoneNumber(req.body.phoneNumber),
        template: req.body.template
      });

      return res.status(500).json(
        errorResponse('Échec de la mise en file d\'attente du SMS', null, 'SMS_QUEUE_FAILED')
      );
    }
  }

  /**
   * Envoie des emails en lot
   */
  async sendBulkEmail(req, res) {
    try {
      const { recipients, template, data, options = {} } = req.body;
      
      logger.bulk('Sending bulk emails', {
        template,
        recipientsCount: recipients.length,
        ip: req.ip
      });

      const result = await emailService.queueBulkEmail(recipients, template, data, {
        ...options,
        ip: req.ip
      });

      return res.status(202).json(
        queuedResponse('Emails en lot mis en file d\'attente', result)
      );
    } catch (error) {
      logger.error('Failed to send bulk emails', {
        error: error.message,
        template: req.body.template,
        recipientsCount: req.body.recipients?.length
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi en lot des emails', null, 'BULK_EMAIL_FAILED')
      );
    }
  }

  /**
   * Envoie des SMS en lot
   */
  async sendBulkSMS(req, res) {
    try {
      const { recipients, template, data, options = {} } = req.body;
      
      logger.bulk('Sending bulk SMS', {
        template,
        recipientsCount: recipients.length,
        ip: req.ip
      });

      const result = await smsService.queueBulkSMS(recipients, template, data, {
        ...options,
        ip: req.ip
      });

      return res.status(202).json(
        queuedResponse('SMS en lot mis en file d\'attente', result)
      );
    } catch (error) {
      logger.error('Failed to send bulk SMS', {
        error: error.message,
        template: req.body.template,
        recipientsCount: req.body.recipients?.length
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi en lot des SMS', null, 'BULK_SMS_FAILED')
      );
    }
  }

  /**
   * Envoie des notifications mixtes en lot (email + SMS)
   */
  async sendBulkMixed(req, res) {
    try {
      const { recipients, template, data, options = {} } = req.body;
      
      logger.bulk('Sending bulk mixed notifications', {
        template,
        type: options.type || 'both',
        recipientsCount: recipients.length,
        ip: req.ip
      });

      const jobData = {
        type: options.type || 'both',
        recipients,
        template,
        data,
        options: {
          ...options,
          ip: req.ip
        }
      };

      const result = await queueService.addBulkJob(jobData);

      return res.status(202).json(
        queuedResponse('Notifications mixtes en lot mises en file d\'attente', result)
      );
    } catch (error) {
      logger.error('Failed to send bulk mixed notifications', {
        error: error.message,
        template: req.body.template,
        recipientsCount: req.body.recipients?.length
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi en lot des notifications mixtes', null, 'BULK_MIXED_FAILED')
      );
    }
  }

  /**
   * Récupère le statut d'un job
   */
  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;
      const { queueName = 'email' } = req.query;
      
      logger.queue('Getting job status', {
        jobId,
        queueName
      });

      const result = await queueService.getJobStatus(jobId, queueName);

      if (!result.success) {
        return res.status(404).json(
          notFoundResponse('Job', jobId)
        );
      }

      return res.status(200).json(
        jobStatusResponse(result.job)
      );
    } catch (error) {
      logger.error('Failed to get job status', {
        error: error.message,
        jobId: req.params.jobId
      });

      return res.status(500).json(
        errorResponse('Échec de la récupération du statut du job', null, 'JOB_STATUS_FAILED')
      );
    }
  }

  /**
   * Annule un job
   */
  async cancelJob(req, res) {
    try {
      const { jobId } = req.params;
      const { queueName = 'email' } = req.query;
      
      logger.queue('Cancelling job', {
        jobId,
        queueName
      });

      const result = await queueService.cancelJob(jobId, queueName);

      if (!result.success) {
        return res.status(404).json(
          notFoundResponse('Job', jobId)
        );
      }

      return res.status(200).json(
        successResponse('Job annulé avec succès', { jobId, cancelled: true })
      );
    } catch (error) {
      logger.error('Failed to cancel job', {
        error: error.message,
        jobId: req.params.jobId
      });

      return res.status(500).json(
        errorResponse('Échec de l\'annulation du job', null, 'JOB_CANCEL_FAILED')
      );
    }
  }

  /**
   * Récupère les statistiques des queues
   */
  async getQueueStats(req, res) {
    try {
      logger.queue('Getting queue statistics');

      const result = await queueService.getQueueStats();

      return res.status(200).json(
        queueStatsResponse(result.stats)
      );
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error.message
      });

      return res.status(500).json(
        errorResponse('Échec de la récupération des statistiques', null, 'QUEUE_STATS_FAILED')
      );
    }
  }

  /**
   * Nettoie les jobs terminés
   */
  async cleanCompletedJobs(req, res) {
    try {
      const { queueName } = req.query;
      
      logger.queue('Cleaning completed jobs', {
        queueName
      });

      const result = await queueService.cleanCompletedJobs(queueName);

      return res.status(200).json(
        successResponse('Jobs terminés nettoyés avec succès', {
          cleanedCount: result.cleanedCount,
          cleanedAt: result.cleanedAt
        })
      );
    } catch (error) {
      logger.error('Failed to clean completed jobs', {
        error: error.message,
        queueName: req.query.queueName
      });

      return res.status(500).json(
        errorResponse('Échec du nettoyage des jobs', null, 'CLEAN_JOBS_FAILED')
      );
    }
  }

  /**
   * Envoie un email de bienvenue
   */
  async sendWelcomeEmail(req, res) {
    try {
      const { to, userData, options = {} } = req.body;
      
      logger.email('Sending welcome email', {
        to,
        ip: req.ip
      });

      const result = await emailService.sendWelcomeEmail(to, userData, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send welcome email', {
        error: error.message,
        to: req.body.to
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi de l\'email de bienvenue', null, 'WELCOME_EMAIL_FAILED')
      );
    }
  }

  /**
   * Envoie un SMS de bienvenue
   */
  async sendWelcomeSMS(req, res) {
    try {
      const { phoneNumber, userData, options = {} } = req.body;
      
      logger.sms('Sending welcome SMS', {
        phoneNumber: smsService.maskPhoneNumber(phoneNumber),
        ip: req.ip
      });

      const result = await smsService.sendWelcomeSMS(phoneNumber, userData, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send welcome SMS', {
        error: error.message,
        phoneNumber: smsService.maskPhoneNumber(req.body.phoneNumber)
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi du SMS de bienvenue', null, 'WELCOME_SMS_FAILED')
      );
    }
  }

  /**
   * Envoie un email de réinitialisation de mot de passe
   */
  async sendPasswordResetEmail(req, res) {
    try {
      const { to, resetToken, options = {} } = req.body;
      
      logger.email('Sending password reset email', {
        to,
        ip: req.ip
      });

      const result = await emailService.sendPasswordResetEmail(to, resetToken, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send password reset email', {
        error: error.message,
        to: req.body.to
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi de l\'email de réinitialisation', null, 'PASSWORD_RESET_EMAIL_FAILED')
      );
    }
  }

  /**
   * Envoie un SMS de réinitialisation de mot de passe
   */
  async sendPasswordResetSMS(req, res) {
    try {
      const { phoneNumber, resetCode, options = {} } = req.body;
      
      logger.sms('Sending password reset SMS', {
        phoneNumber: smsService.maskPhoneNumber(phoneNumber),
        ip: req.ip
      });

      const result = await smsService.sendPasswordResetSMS(phoneNumber, resetCode, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send password reset SMS', {
        error: error.message,
        phoneNumber: smsService.maskPhoneNumber(req.body.phoneNumber)
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi du SMS de réinitialisation', null, 'PASSWORD_RESET_SMS_FAILED')
      );
    }
  }

  /**
   * Envoie un email de confirmation d'événement
   */
  async sendEventConfirmationEmail(req, res) {
    try {
      const { to, eventData, ticketData, options = {} } = req.body;
      
      logger.email('Sending event confirmation email', {
        to,
        eventId: eventData.id,
        ip: req.ip
      });

      const result = await emailService.sendEventConfirmationEmail(to, eventData, ticketData, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send event confirmation email', {
        error: error.message,
        to: req.body.to,
        eventId: req.body.eventData?.id
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi de l\'email de confirmation', null, 'EVENT_CONFIRMATION_EMAIL_FAILED')
      );
    }
  }

  /**
   * Envoie un SMS de confirmation d'événement
   */
  async sendEventConfirmationSMS(req, res) {
    try {
      const { phoneNumber, eventData, ticketData, options = {} } = req.body;
      
      logger.sms('Sending event confirmation SMS', {
        phoneNumber: smsService.maskPhoneNumber(phoneNumber),
        eventId: eventData.id,
        ip: req.ip
      });

      const result = await smsService.sendEventConfirmationSMS(phoneNumber, eventData, ticketData, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send event confirmation SMS', {
        error: error.message,
        phoneNumber: smsService.maskPhoneNumber(req.body.phoneNumber),
        eventId: req.body.eventData?.id
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi du SMS de confirmation', null, 'EVENT_CONFIRMATION_SMS_FAILED')
      );
    }
  }

  /**
   * Envoie un SMS OTP
   */
  async sendOTPSMS(req, res) {
    try {
      const { phoneNumber, otpCode, purpose, options = {} } = req.body;
      
      logger.sms('Sending OTP SMS', {
        phoneNumber: smsService.maskPhoneNumber(phoneNumber),
        purpose,
        ip: req.ip
      });

      const result = await smsService.sendOTPSMS(phoneNumber, otpCode, purpose, {
        ...options,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send OTP SMS', {
        error: error.message,
        phoneNumber: smsService.maskPhoneNumber(req.body.phoneNumber),
        purpose: req.body.purpose
      });

      return res.status(500).json(
        errorResponse('Échec de l\'envoi du SMS OTP', null, 'OTP_SMS_FAILED')
      );
    }
  }

  /**
   * Vérifie la santé du service de notification
   */
  async healthCheck(req, res) {
    try {
      const [emailHealth, smsHealth] = await Promise.all([
        emailService.healthCheck(),
        smsService.healthCheck()
      ]);

      const overallHealthy = emailHealth.healthy || smsHealth.healthy;

      return res.status(200).json(
        successResponse('Service de notification opérationnel', {
          email: emailHealth,
          sms: smsHealth,
          overall: {
            healthy: overallHealthy,
            providers: {
              email: emailHealth.healthy,
              sms: smsHealth.healthy
            }
          }
        })
      );
    } catch (error) {
      logger.error('Health check failed', {
        error: error.message
      });

      return res.status(503).json(
        errorResponse('Service de notification indisponible', null, 'HEALTH_CHECK_FAILED')
      );
    }
  }

  /**
   * Récupère les statistiques du service
   */
  async getStats(req, res) {
    try {
      const [emailStats, smsStats, queueStats] = await Promise.all([
        emailService.getStats(),
        smsService.getStats(),
        queueService.getQueueStats()
      ]);

      return res.status(200).json(
        successResponse('Statistiques du service de notification', {
          email: emailStats,
          sms: smsStats,
          queues: queueStats.stats
        })
      );
    } catch (error) {
      logger.error('Failed to get service stats', {
        error: error.message
      });

      return res.status(500).json(
        errorResponse('Échec de la récupération des statistiques', null, 'STATS_FAILED')
      );
    }
  }

  /**
   * Récupère le statut d'une notification
   */
  async getNotificationStatus(req, res) {
    try {
      const { notificationId } = req.params;
      
      const { getNotificationById } = require('../../core/database/notification.repository');
      
      const notification = await getNotificationById(notificationId);
      
      if (!notification) {
        return res.status(404).json(
          notFoundResponse('Notification non trouvée', 'NOTIFICATION_NOT_FOUND')
        );
      }
      
      const statusData = {
        notificationId: notification.id,
        type: notification.type,
        status: notification.status,
        recipient: notification.recipient_email || notification.recipient_phone,
        recipientName: notification.recipient_name,
        subject: notification.subject,
        template: notification.template_name,
        templateData: notification.template_data,
        provider: notification.provider,
        providerMessageId: notification.provider_message_id,
        providerResponse: notification.provider_response,
        priority: notification.priority,
        createdAt: notification.created_at,
        scheduledAt: notification.scheduled_at,
        sentAt: notification.sent_at,
        failedAt: notification.failed_at,
        updatedAt: notification.updated_at,
        errorMessage: notification.error_message,
        retryCount: notification.retry_count,
        eventId: notification.event_id,
        batchId: notification.batch_id,
        externalId: notification.external_id
      };
      
      return res.status(200).json(
        successResponse('Statut de la notification récupéré', statusData)
      );
    } catch (error) {
      logger.error('Failed to get notification status', {
        error: error.message,
        notificationId: req.params.notificationId
      });

      return res.status(500).json(
        errorResponse('Échec de la récupération du statut', null, 'STATUS_FAILED')
      );
    }
  }

  /**
   * Récupère l'historique des notifications
   */
  async getNotificationHistory(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        type, 
        status, 
        recipient, 
        eventId, 
        batchId,
        startDate,
        endDate,
        orderBy = 'created_at',
        orderDirection = 'DESC'
      } = req.query;
      
      const { getNotificationHistory } = require('../../core/database/notification.repository');
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const history = await getNotificationHistory({
        limit: parseInt(limit),
        offset,
        type,
        status,
        recipient,
        eventId,
        batchId,
        startDate,
        endDate,
        orderBy,
        orderDirection
      });
      
      return res.status(200).json(
        successResponse('Historique des notifications récupéré', {
          notifications: history.notifications,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: history.pagination.total,
            totalPages: Math.ceil(history.pagination.total / parseInt(limit)),
            hasMore: history.pagination.hasMore
          },
          filters: history.filters
        })
      );
    } catch (error) {
      logger.error('Failed to get notification history', {
        error: error.message,
        query: req.query
      });

      return res.status(500).json(
        errorResponse('Échec de la récupération de l\'historique', null, 'HISTORY_FAILED')
      );
    }
  }

  /**
   * Récupère les statistiques des notifications
   */
  async getNotificationStatistics(req, res) {
    try {
      const { 
        period = '7d', 
        eventId, 
        batchId,
        startDate,
        endDate 
      } = req.query;
      
      const { getNotificationStatistics } = require('../../core/database/notification.repository');
      
      // Calculer les dates selon la période
      let calculatedStartDate = startDate;
      let calculatedEndDate = endDate;
      
      if (!calculatedStartDate && !calculatedEndDate) {
        const now = new Date();
        switch (period) {
          case '1d':
            calculatedStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case '7d':
            calculatedStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            calculatedStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90d':
            calculatedStartDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          default:
            calculatedStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }
        calculatedEndDate = now;
      }
      
      const statistics = await getNotificationStatistics({
        startDate: calculatedStartDate?.toISOString(),
        endDate: calculatedEndDate?.toISOString(),
        eventId,
        batchId
      });
      
      return res.status(200).json(
        successResponse('Statistiques des notifications récupérées', {
          period,
          overview: statistics.overview,
          byType: statistics.byType,
          byProvider: statistics.byProvider,
          dailyStats: statistics.dailyStats,
          topTemplates: statistics.topTemplates,
          filters: statistics.filters
        })
      );
    } catch (error) {
      logger.error('Failed to get notification statistics', {
        error: error.message,
        period: req.query.period
      });

      return res.status(500).json(
        errorResponse('Échec de la récupération des statistiques', null, 'STATS_FAILED')
      );
    }
  }

  /**
   * Récupère l'historique des notifications
   */
  async getNotificationHistory(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        type, 
        status, 
        recipient, 
        eventId, 
        batchId,
        startDate,
        endDate,
        orderBy = 'created_at',
        orderDirection = 'DESC'
      } = req.query;
      
      const { getNotificationHistory } = require('../../core/database/notification.repository');
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const history = await getNotificationHistory({
        limit: parseInt(limit),
        offset,
        type,
        status,
        recipient,
        eventId,
        batchId,
        startDate,
        endDate,
        orderBy,
        orderDirection
      });
      
      return res.status(200).json(
        successResponse('Historique des notifications récupéré', {
          notifications: history.notifications,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: history.pagination.total,
            totalPages: Math.ceil(history.pagination.total / parseInt(limit)),
            hasMore: history.pagination.hasMore
          },
          filters: history.filters
        })
      );
    } catch (error) {
      logger.error('Failed to get notification history', {
        error: error.message,
        query: req.query
      });

      return res.status(500).json(
        errorResponse('Échec de la récupération de l\'historique', null, 'HISTORY_FAILED')
      );
    }
  }
}

module.exports = new NotificationsController();
