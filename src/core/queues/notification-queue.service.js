const Queue = require('bull');
const redis = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Service de gestion des queues Redis pour les notifications
 * Gère les queues d'email, SMS et notifications en masse
 */
class NotificationQueueService {
  constructor() {
    this.queues = new Map();
    this.jobOptions = {
      removeOnComplete: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE) || 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    };
    
    this.initializeQueues();
  }

  /**
   * Initialise les queues Redis
   */
  async initializeQueues() {
    try {
      // S'assurer que Redis est connecté
      const redisConnected = await redis.connect();
      if (!redisConnected) {
        logger.error('Redis not available, queue initialization failed');
        return;
      }

      // Queue pour les emails
      this.queues.set('email', new Queue('email notifications', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.QUEUE_REDIS_DB) || 1
        },
        defaultJobOptions: this.jobOptions
      }));

      // Queue pour les SMS
      this.queues.set('sms', new Queue('sms notifications', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.QUEUE_REDIS_DB) || 1
        },
        defaultJobOptions: this.jobOptions
      }));

      // Queue pour les notifications en masse
      this.queues.set('bulk', new Queue('bulk notifications', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.QUEUE_REDIS_DB) || 1
        },
        defaultJobOptions: {
          ...this.jobOptions,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      }));

      // Queue pour les notifications programmées
      this.queues.set('scheduled', new Queue('scheduled notifications', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.QUEUE_REDIS_DB) || 1
        },
        defaultJobOptions: {
          ...this.jobOptions,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000
          }
        }
      }));

      // Configuration des workers
      this.setupWorkers();
      
      logger.info('Notification queues initialized successfully', {
        queues: Array.from(this.queues.keys())
      });
    } catch (error) {
      logger.error('Failed to initialize notification queues', {
        error: error.message
      });
    }
  }

  /**
   * Configure les workers pour traiter les jobs
   */
  setupWorkers() {
    // Worker pour les emails
    const emailQueue = this.queues.get('email');
    if (emailQueue) {
      emailQueue.process(parseInt(process.env.EMAIL_QUEUE_CONCURRENCY) || 5, async (job) => {
        return await this.processEmailJob(job);
      });
    }

    // Worker pour les SMS
    const smsQueue = this.queues.get('sms');
    if (smsQueue) {
      smsQueue.process(parseInt(process.env.SMS_QUEUE_CONCURRENCY) || 3, async (job) => {
        return await this.processSMSJob(job);
      });
    }

    // Worker pour les notifications en masse
    const bulkQueue = this.queues.get('bulk');
    if (bulkQueue) {
      bulkQueue.process(2, async (job) => {
        return await this.processBulkJob(job);
      });
    }

    // Worker pour les notifications programmées
    const scheduledQueue = this.queues.get('scheduled');
    if (scheduledQueue) {
      scheduledQueue.process(2, async (job) => {
        return await this.processScheduledJob(job);
      });
    }
  }

  /**
   * Ajoute un job d'email à la queue
   */
  async addEmailJob(emailData, options = {}) {
    const queue = this.queues.get('email');
    if (!queue) {
      throw new Error('Email queue not available');
    }

    const job = await queue.add('send-email', emailData, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      attempts: options.attempts || 3,
      removeOnComplete: options.removeOnComplete !== false
    });

    logger.info('Email job added to queue', {
      jobId: job.id,
      to: emailData.to,
      template: emailData.template
    });

    return job;
  }

  /**
   * Ajoute un job SMS à la queue
   */
  async addSMSJob(smsData, options = {}) {
    const queue = this.queues.get('sms');
    if (!queue) {
      throw new Error('SMS queue not available');
    }

    const job = await queue.add('send-sms', smsData, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      attempts: options.attempts || 3,
      removeOnComplete: options.removeOnComplete !== false
    });

    logger.info('SMS job added to queue', {
      jobId: job.id,
      to: this.maskPhoneNumber(smsData.to),
      type: smsData.type
    });

    return job;
  }

  /**
   * Ajoute un job de notification en masse
   */
  async addBulkJob(bulkData, options = {}) {
    const queue = this.queues.get('bulk');
    if (!queue) {
      throw new Error('Bulk queue not available');
    }

    const job = await queue.add('send-bulk', bulkData, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      attempts: options.attempts || 5,
      removeOnComplete: options.removeOnComplete !== false
    });

    logger.info('Bulk notification job added to queue', {
      jobId: job.id,
      type: bulkData.type,
      count: bulkData.recipients?.length || 0
    });

    return job;
  }

  /**
   * Ajoute une notification programmée
   */
  async addScheduledJob(notificationData, scheduledAt, options = {}) {
    const queue = this.queues.get('scheduled');
    if (!queue) {
      throw new Error('Scheduled queue not available');
    }

    const delay = new Date(scheduledAt).getTime() - Date.now();
    if (delay < 0) {
      throw new Error('Scheduled time must be in the future');
    }

    const job = await queue.add('scheduled-notification', {
      ...notificationData,
      scheduledAt
    }, {
      delay,
      priority: options.priority || 0,
      attempts: options.attempts || 3,
      removeOnComplete: options.removeOnComplete !== false
    });

    logger.info('Scheduled notification job added to queue', {
      jobId: job.id,
      scheduledAt,
      type: notificationData.type
    });

    return job;
  }

  /**
   * Traite un job d'email
   */
  async processEmailJob(job) {
    const { data } = job;
    const startTime = Date.now();

    try {
      const emailService = require('../core/email/email.service');
      
      // Envoyer l'email
      const result = await emailService.sendEmail(data);
      
      const processingTime = Date.now() - startTime;
      
      if (result.success) {
        logger.info('Email job processed successfully', {
          jobId: job.id,
          to: data.to,
          template: data.template,
          processingTime,
          messageId: result.messageId
        });
        
        return {
          success: true,
          messageId: result.messageId,
          processingTime
        };
      } else {
        logger.error('Email job processing failed', {
          jobId: job.id,
          to: data.to,
          error: result.error,
          processingTime
        });
        
        throw new Error(result.error);
      }
    } catch (error) {
      logger.error('Email job processing error', {
        jobId: job.id,
        error: error.message,
        data: job.data
      });
      
      throw error;
    }
  }

  /**
   * Traite un job SMS
   */
  async processSMSJob(job) {
    const { data } = job;
    const startTime = Date.now();

    try {
      const smsService = require('../core/sms/sms.service');
      
      // Envoyer le SMS
      const result = await smsService.sendSMSWithFallback(data.to, data.message, data.options);
      
      const processingTime = Date.now() - startTime;
      
      if (result.success) {
        logger.info('SMS job processed successfully', {
          jobId: job.id,
          to: this.maskPhoneNumber(data.to),
          provider: result.provider,
          processingTime,
          messageSid: result.messageSid
        });
        
        return {
          success: true,
          messageSid: result.messageSid,
          provider: result.provider,
          processingTime
        };
      } else {
        logger.error('SMS job processing failed', {
          jobId: job.id,
          to: this.maskPhoneNumber(data.to),
          error: result.error,
          processingTime
        });
        
        throw new Error(result.error);
      }
    } catch (error) {
      logger.error('SMS job processing error', {
        jobId: job.id,
        error: error.message,
        data: job.data
      });
      
      throw error;
    }
  }

  /**
   * Traite un job de notification en masse
   */
  async processBulkJob(job) {
    const { data } = job;
    const startTime = Date.now();
    const results = [];

    try {
      const { type, recipients, template, templateData } = data;
      
      // Traiter chaque destinataire
      for (const recipient of recipients) {
        try {
          let result;
          
          if (type === 'email') {
            const emailService = require('../core/email/email.service');
            result = await emailService.sendEmail({
              ...templateData,
              to: recipient.email
            });
          } else if (type === 'sms') {
            const smsService = require('../core/sms/sms.service');
            result = await smsService.sendSMSWithFallback(
              recipient.phoneNumber,
              templateData.message,
              templateData.options
            );
          }
          
          results.push({
            recipient,
            success: result.success,
            messageId: result.messageId || result.messageSid,
            error: result.success ? null : result.error
          });
        } catch (error) {
          results.push({
            recipient,
            success: false,
            error: error.message
          });
        }
      }
      
      const processingTime = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      
      logger.info('Bulk job processed', {
        jobId: job.id,
        type,
        totalRecipients: recipients.length,
        successCount,
        failureCount: recipients.length - successCount,
        processingTime
      });
      
      return {
        success: successCount > 0,
        results,
        summary: {
          total: recipients.length,
          success: successCount,
          failed: recipients.length - successCount
        },
        processingTime
      };
    } catch (error) {
      logger.error('Bulk job processing error', {
        jobId: job.id,
        error: error.message,
        data: job.data
      });
      
      throw error;
    }
  }

  /**
   * Traite une notification programmée
   */
  async processScheduledJob(job) {
    const { data } = job;
    const startTime = Date.now();

    try {
      const { scheduledAt, type, ...notificationData } = data;
      
      // Vérifier que l'heure est correcte
      const now = Date.now();
      if (new Date(scheduledAt).getTime() > now + 60000) { // 1 minute de tolérance
        throw new Error('Scheduled time is too far in the future');
      }
      
      // Traiter la notification selon le type
      let result;
      if (type === 'email') {
        const emailService = require('../core/email/email.service');
        result = await emailService.sendEmail(notificationData);
      } else if (type === 'sms') {
        const smsService = require('../core/sms/sms.service');
        result = await smsService.sendSMSWithFallback(
          notificationData.to,
          notificationData.message,
          notificationData.options
        );
      }
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Scheduled notification processed', {
        jobId: job.id,
        type,
        scheduledAt,
        processingTime,
        success: result.success
      });
      
      return {
        success: result.success,
        messageId: result.messageId || result.messageSid,
        scheduledAt,
        processedAt: new Date().toISOString(),
        processingTime
      };
    } catch (error) {
      logger.error('Scheduled job processing error', {
        jobId: job.id,
        error: error.message,
        data: job.data
      });
      
      throw error;
    }
  }

  /**
   * Récupère les statistiques des queues
   */
  async getQueueStats() {
    const stats = {};
    
    for (const [name, queue] of this.queues) {
      try {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        
        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          total: waiting.length + active.length + completed.length + failed.length
        };
      } catch (error) {
        logger.error(`Failed to get stats for queue ${name}`, {
          error: error.message
        });
        stats[name] = { error: error.message };
      }
    }
    
    return stats;
  }

  /**
   * Nettoie les jobs terminés
   */
  async cleanCompletedJobs(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      const cleaned = await queue.clean(0, 'completed');
      logger.info(`Cleaned ${cleaned} completed jobs from ${queueName} queue`);
      return cleaned;
    } catch (error) {
      logger.error(`Failed to clean queue ${queueName}`, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Masque un numéro de téléphone pour les logs
   */
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 4) {
      return phoneNumber;
    }
    return phoneNumber.slice(0, 2) + '****' + phoneNumber.slice(-2);
  }

  /**
   * Ferme toutes les queues
   */
  async close() {
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
        logger.info(`Queue ${name} closed`);
      } catch (error) {
        logger.error(`Failed to close queue ${name}`, {
          error: error.message
        });
      }
    }
    
    await redis.disconnect();
  }
}

module.exports = new NotificationQueueService();
