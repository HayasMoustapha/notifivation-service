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

// Constante par défaut pour l'utilisateur ID
const DEFAULT_USER_ID = 1;

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

      // Utilisation de l'utilisateur par défaut
      const userId = DEFAULT_USER_ID;

      const result = await emailService.sendTransactionalEmail(to, template, data, {
        ...options,
        userId,
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
        errorResponse('Failed to send email')
      );
    }
  }

  /**
   * Envoie un SMS
   */
  async sendSMS(req, res) {
    try {
      const { to, message, options = {} } = req.body;

      // Utilisation de l'utilisateur par défaut
      const userId = DEFAULT_USER_ID;

      const result = await smsService.sendSMS(to, message, {
        ...options,
        userId,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send SMS', {
        error: error.message,
        to: req.body.to
      });

      return res.status(500).json(
        errorResponse('Failed to send SMS')
      );
    }
  }

  /**
   * Envoie une notification multi-canaux
   */
  async sendNotification(req, res) {
    try {
      const { channels, recipients, template, data, options = {} } = req.body;

      // Utilisation de l'utilisateur par défaut
      const userId = DEFAULT_USER_ID;

      const result = await queueService.queueNotification({
        channels,
        recipients,
        template,
        data,
        options: {
          ...options,
          userId,
          ip: req.ip
        }
      });

      return res.status(201).json(
        queuedResponse(result)
      );
    } catch (error) {
      logger.error('Failed to queue notification', {
        error: error.message,
        channels: req.body.channels,
        recipients: req.body.recipients
      });

      return res.status(500).json(
        errorResponse('Failed to queue notification')
      );
    }
  }

  /**
   * Envoie des notifications en lot
   */
  async sendBulkNotifications(req, res) {
    try {
      const { notifications, options = {} } = req.body;

      // Utilisation de l'utilisateur par défaut
      const userId = DEFAULT_USER_ID;

      const result = await queueService.queueBulkNotifications(notifications, {
        ...options,
        userId,
        ip: req.ip
      });

      return res.status(201).json(
        bulkNotificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to queue bulk notifications', {
        error: error.message,
        count: req.body.notifications?.length
      });

      return res.status(500).json(
        errorResponse('Failed to queue bulk notifications')
      );
    }
  }

  /**
   * Obtient le statut d'un job de notification
   */
  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;

      if (!jobId) {
        return res.status(400).json(
          errorResponse('Job ID is required')
        );
      }

      const result = await queueService.getJobStatus(jobId);

      if (!result.success) {
        return res.status(404).json(
          notFoundResponse('Job not found', result.error)
        );
      }

      return res.json(
        jobStatusResponse(result.data)
      );
    } catch (error) {
      logger.error('Failed to get job status', {
        error: error.message,
        jobId: req.params.jobId
      });

      return res.status(500).json(
        errorResponse('Failed to get job status')
      );
    }
  }

  /**
   * Obtient les statistiques des queues
   */
  async getQueueStats(req, res) {
    try {
      const result = await queueService.getQueueStats();

      return res.json(
        queueStatsResponse(result.data)
      );
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error.message
      });

      return res.status(500).json(
        errorResponse('Failed to get queue stats')
      );
    }
  }

  /**
   * Annule un job de notification
   */
  async cancelJob(req, res) {
    try {
      const { jobId } = req.params;

      if (!jobId) {
        return res.status(400).json(
          errorResponse('Job ID is required')
        );
      }

      const result = await queueService.cancelJob(jobId);

      if (!result.success) {
        return res.status(400).json(
          errorResponse(result.error)
        );
      }

      return res.json(
        successResponse('Job cancelled successfully', result.data)
      );
    } catch (error) {
      logger.error('Failed to cancel job', {
        error: error.message,
        jobId: req.params.jobId
      });

      return res.status(500).json(
        errorResponse('Failed to cancel job')
      );
    }
  }

  /**
   * Relance un job de notification échoué
   */
  async retryJob(req, res) {
    try {
      const { jobId } = req.params;

      if (!jobId) {
        return res.status(400).json(
          errorResponse('Job ID is required')
        );
      }

      const result = await queueService.retryJob(jobId);

      if (!result.success) {
        return res.status(400).json(
          errorResponse(result.error)
        );
      }

      return res.json(
        successResponse('Job retried successfully', result.data)
      );
    } catch (error) {
      logger.error('Failed to retry job', {
        error: error.message,
        jobId: req.params.jobId
      });

      return res.status(500).json(
        errorResponse('Failed to retry job')
      );
    }
  }

  /**
   * Nettoie les jobs terminés
   */
  async cleanupJobs(req, res) {
    try {
      const { olderThan } = req.query;

      const result = await queueService.cleanupJobs(olderThan ? new Date(olderThan) : null);

      return res.json(
        successResponse('Jobs cleaned up successfully', result.data)
      );
    } catch (error) {
      logger.error('Failed to cleanup jobs', {
        error: error.message
      });

      return res.status(500).json(
        errorResponse('Failed to cleanup jobs')
      );
    }
  }

  /**
   * Test d'envoi d'email
   */
  async testEmail(req, res) {
    try {
      const { to, template, data } = req.body;

      // Utilisation de l'utilisateur par défaut
      const userId = DEFAULT_USER_ID;

      const result = await emailService.sendTestEmail(to, template, data, {
        userId,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send test email', {
        error: error.message,
        to: req.body.to
      });

      return res.status(500).json(
        errorResponse('Failed to send test email')
      );
    }
  }

  /**
   * Test d'envoi de SMS
   */
  async testSMS(req, res) {
    try {
      const { to, message } = req.body;

      // Utilisation de l'utilisateur par défaut
      const userId = DEFAULT_USER_ID;

      const result = await smsService.sendTestSMS(to, message, {
        userId,
        ip: req.ip
      });

      return res.status(201).json(
        notificationResultResponse(result)
      );
    } catch (error) {
      logger.error('Failed to send test SMS', {
        error: error.message,
        to: req.body.to
      });

      return res.status(500).json(
        errorResponse('Failed to send test SMS')
      );
    }
  }
}

module.exports = new NotificationsController();
