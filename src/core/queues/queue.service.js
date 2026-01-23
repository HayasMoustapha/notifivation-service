const Queue = require('bull');
const crypto = require('crypto');
const logger = require('../../utils/logger');

/**
 * Service de gestion des queues Redis pour les notifications
 * Gère les jobs d'envoi d'emails et SMS en mode asynchrone
 */
class QueueService {
  constructor() {
    this.queues = new Map();
    this.jobOptions = {
      removeOnComplete: parseInt(process.env.QUEUE_DEFAULT_JOB_OPTIONS_REMOVE_ON_COMPLETE) || 10,
      removeOnFail: 5,
      attempts: parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3,
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.RETRY_DELAY_BASE) || 2000
      }
    };
    
    this.initializeQueues();
  }

  /**
   * Initialise les queues Redis
   */
  initializeQueues() {
    try {
      // Queue pour les emails
      this.queues.set('email', new Queue('email notifications', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.QUEUE_REDIS_URL?.split('/')[3]) || 4
        },
        defaultJobOptions: {
          ...this.jobOptions,
          concurrency: parseInt(process.env.QUEUE_CONCURRENCY_EMAIL) || 5
        }
      }));

      // Queue pour les SMS
      this.queues.set('sms', new Queue('sms notifications', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.QUEUE_REDIS_URL?.split('/')[3]) || 4
        },
        defaultJobOptions: {
          ...this.jobOptions,
          concurrency: parseInt(process.env.QUEUE_CONCURRENCY_SMS) || 3
        }
      }));

      // Queue pour les traitements en lot
      this.queues.set('bulk', new Queue('bulk notifications', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.QUEUE_REDIS_URL?.split('/')[3]) || 4
        },
        defaultJobOptions: {
          ...this.jobOptions,
          concurrency: parseInt(process.env.QUEUE_CONCURRENCY_BULK) || 2
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
      emailQueue.process(async (job) => {
        return await this.processEmailJob(job);
      });
    }

    // Worker pour les SMS
    const smsQueue = this.queues.get('sms');
    if (smsQueue) {
      smsQueue.process(async (job) => {
        return await this.processSMSJob(job);
      });
    }

    // Worker pour les traitements en lot
    const bulkQueue = this.queues.get('bulk');
    if (bulkQueue) {
      bulkQueue.process(async (job) => {
        return await this.processBulkJob(job);
      });
    }

    // Gestion des événements
    this.setupQueueEvents();
  }

  /**
   * Configure les événements des queues
   */
  setupQueueEvents() {
    this.queues.forEach((queue, name) => {
      queue.on('completed', (job, result) => {
        logger.info(`Job completed in queue ${name}`, {
          jobId: job.id,
          type: job.data.type,
          duration: job.duration
        });
      });

      queue.on('failed', (job, err) => {
        logger.error(`Job failed in queue ${name}`, {
          jobId: job.id,
          type: job.data.type,
          error: err.message,
          attemptsMade: job.attemptsMade
        });
      });

      queue.on('stalled', (job) => {
        logger.warn(`Job stalled in queue ${name}`, {
          jobId: job.id,
          type: job.data.type
        });
      });
    });
  }

  /**
   * Ajoute un job d'email à la queue
   * @param {Object} jobData - Données du job
   * @returns {Promise<Object>} Job créé
   */
  async addEmailJob(jobData) {
    try {
      const jobId = this.generateJobId();
      const job = {
        id: jobId,
        ...jobData,
        createdAt: new Date().toISOString()
      };

      const queue = this.queues.get('email');
      if (!queue) {
        throw new Error('Email queue not available');
      }

      const result = await queue.add('email', job, {
        jobId,
        delay: jobData.delay || 0,
        attempts: jobData.attempts || this.jobOptions.attempts
      });

      logger.info('Email job added to queue', {
        jobId,
        type: jobData.type,
        to: jobData.to
      });

      return {
        success: true,
        jobId,
        job: result
      };
    } catch (error) {
      logger.error('Failed to add email job to queue', {
        error: error.message
      });
      
      throw new Error(`Échec d'ajout du job email: ${error.message}`);
    }
  }

  /**
   * Ajoute un job SMS à la queue
   * @param {Object} jobData - Données du job
   * @returns {Promise<Object>} Job créé
   */
  async addSMSJob(jobData) {
    try {
      const jobId = this.generateJobId();
      const job = {
        id: jobId,
        ...jobData,
        createdAt: new Date().toISOString()
      };

      const queue = this.queues.get('sms');
      if (!queue) {
        throw new Error('SMS queue not available');
      }

      const result = await queue.add('sms', job, {
        jobId,
        delay: jobData.delay || 0,
        attempts: jobData.attempts || this.jobOptions.attempts
      });

      logger.info('SMS job added to queue', {
        jobId,
        type: jobData.type,
        phoneNumber: this.maskPhoneNumber(jobData.phoneNumber)
      });

      return {
        success: true,
        jobId,
        job: result
      };
    } catch (error) {
      logger.error('Failed to add SMS job to queue', {
        error: error.message
      });
      
      throw new Error(`Échec d'ajout du job SMS: ${error.message}`);
    }
  }

  /**
   * Ajoute un job de traitement en lot
   * @param {Object} jobData - Données du job
   * @returns {Promise<Object>} Job créé
   */
  async addBulkJob(jobData) {
    try {
      const jobId = this.generateJobId();
      const job = {
        id: jobId,
        ...jobData,
        createdAt: new Date().toISOString()
      };

      const queue = this.queues.get('bulk');
      if (!queue) {
        throw new Error('Bulk queue not available');
      }

      const result = await queue.add('bulk', job, {
        jobId,
        delay: jobData.delay || 0,
        attempts: jobData.attempts || this.jobOptions.attempts
      });

      logger.info('Bulk job added to queue', {
        jobId,
        type: jobData.type,
        recipientsCount: jobData.recipients?.length || 0
      });

      return {
        success: true,
        jobId,
        job: result
      };
    } catch (error) {
      logger.error('Failed to add bulk job to queue', {
        error: error.message
      });
      
      throw new Error(`Échec d'ajout du job bulk: ${error.message}`);
    }
  }

  /**
   * Traite un job d'email
   * @param {Object} job - Job à traiter
   * @returns {Promise<Object>} Résultat du traitement
   */
  async processEmailJob(job) {
    try {
      const { type, to, template, data, options } = job.data;
      
      // Importer le service email
      const emailService = require('../email/email.service');
      
      let result;
      
      switch (type) {
        case 'transactional':
          result = await emailService.sendTransactionalEmail(to, template, data, options);
          break;
        case 'welcome':
          result = await emailService.sendWelcomeEmail(to, data, options);
          break;
        case 'password-reset':
          result = await emailService.sendPasswordResetEmail(to, data.resetToken, options);
          break;
        case 'event-confirmation':
          result = await emailService.sendEventConfirmationEmail(to, data.event, data.ticket, options);
          break;
        case 'event-notification':
          result = await emailService.sendEventNotificationEmail(to, data.event, options);
          break;
        default:
          result = await emailService.sendTransactionalEmail(to, template, data, options);
      }
      
      return {
        success: result.success,
        jobId: job.id,
        type,
        provider: result.provider,
        messageId: result.messageId,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to process email job', {
        jobId: job.id,
        type: job.data.type,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Traite un job SMS
   * @param {Object} job - Job à traiter
   * @returns {Promise<Object>} Résultat du traitement
   */
  async processSMSJob(job) {
    try {
      const { type, phoneNumber, template, data, options } = job.data;
      
      // Importer le service SMS
      const smsService = require('../sms/sms.service');
      
      let result;
      
      switch (type) {
        case 'transactional':
          result = await smsService.sendTransactionalSMS(phoneNumber, template, data, options);
          break;
        case 'welcome':
          result = await smsService.sendWelcomeSMS(phoneNumber, data, options);
          break;
        case 'password-reset':
          result = await smsService.sendPasswordResetSMS(phoneNumber, data.resetCode, options);
          break;
        case 'event-confirmation':
          result = await smsService.sendEventConfirmationSMS(phoneNumber, data.event, data.ticket, options);
          break;
        case 'event-reminder':
          result = await smsService.sendEventReminderSMS(phoneNumber, data.event, options);
          break;
        case 'otp':
          result = await smsService.sendOTPSMS(phoneNumber, data.otpCode, data.purpose, options);
          break;
        default:
          result = await smsService.sendTransactionalSMS(phoneNumber, template, data, options);
      }
      
      return {
        success: result.success,
        jobId: job.id,
        type,
        provider: result.provider,
        messageId: result.messageId,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to process SMS job', {
        jobId: job.id,
        type: job.data.type,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Traite un job en lot
   * @param {Object} job - Job à traiter
   * @returns {Promise<Object>} Résultat du traitement
   */
  async processBulkJob(job) {
    try {
      const { type, recipients, template, data, options } = job.data;
      
      // Importer les services
      const emailService = require('../email/email.service');
      const smsService = require('../sms/sms.service');
      
      const results = {
        email: { sent: 0, failed: 0, errors: [] },
        sms: { sent: 0, failed: 0, errors: [] }
      };
      
      const chunkSize = parseInt(process.env.BATCH_CHUNK_SIZE) || 100;
      const chunks = this.chunkArray(recipients, chunkSize);
      
      // Traiter les chunks en parallèle
      await Promise.all(chunks.map(async (chunk, chunkIndex) => {
        if (type === 'email' || type === 'both') {
          for (const recipient of chunk) {
            try {
              await emailService.sendTransactionalEmail(
                recipient.email || recipient,
                template,
                { ...data, ...recipient },
                options
              );
              results.email.sent++;
            } catch (error) {
              results.email.failed++;
              results.email.errors.push({
                recipient: recipient.email || recipient,
                error: error.message
              });
            }
          }
        }
        
        if (type === 'sms' || type === 'both') {
          for (const recipient of chunk) {
            try {
              await smsService.sendTransactionalSMS(
                recipient.phoneNumber || recipient,
                template,
                { ...data, ...recipient },
                options
              );
              results.sms.sent++;
            } catch (error) {
              results.sms.failed++;
              results.sms.errors.push({
                recipient: recipient.phoneNumber || recipient,
                error: error.message
              });
            }
          }
        }
      }));
      
      const totalSent = results.email.sent + results.sms.sent;
      const totalFailed = results.email.failed + results.sms.failed;
      
      logger.info('Bulk job processed', {
        jobId: job.id,
        type,
        totalRecipients: recipients.length,
        totalSent,
        totalFailed,
        chunks: chunks.length
      });
      
      return {
        success: totalFailed === 0,
        jobId: job.id,
        type,
        results,
        totalRecipients: recipients.length,
        totalSent,
        totalFailed,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to process bulk job', {
        jobId: job.id,
        type: job.data.type,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Récupère le statut d'un job
   * @param {string} jobId - ID du job
   * @param {string} queueName - Nom de la queue
   * @returns {Promise<Object>} Statut du job
   */
  async getJobStatus(jobId, queueName = 'email') {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return {
          success: false,
          error: `Queue ${queueName} not found`
        };
      }

      const job = await queue.getJob(jobId);
      
      if (!job) {
        return {
          success: false,
          error: `Job ${jobId} not found`
        };
      }

      return {
        success: true,
        job: {
          id: job.id,
          data: job.data,
          progress: job.progress(),
          state: job.getState(),
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason
        }
      };
    } catch (error) {
      logger.error('Failed to get job status', {
        jobId,
        queueName,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de récupération du statut: ${error.message}`
      };
    }
  }

  /**
   * Annule un job
   * @param {string} jobId - ID du job
   * @param {string} queueName - Nom de la queue
   * @returns {Promise<Object>} Résultat de l'annulation
   */
  async cancelJob(jobId, queueName = 'email') {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return {
          success: false,
          error: `Queue ${queueName} not found`
        };
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return {
          success: false,
          error: `Job ${jobId} not found`
        };
      }

      await job.remove();
      
      logger.info('Job cancelled successfully', {
        jobId,
        queueName,
        type: job.data.type
      });

      return {
        success: true,
        cancelled: true,
        jobId
      };
    } catch (error) {
      logger.error('Failed to cancel job', {
        jobId,
        queueName,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec d'annulation du job: ${error.message}`
      };
    }
  }

  /**
   * Récupère les statistiques des queues
   * @returns {Promise<Object>} Statistiques des queues
   */
  async getQueueStats() {
    try {
      const stats = {};
      
      for (const [name, queue] of this.queues) {
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
      }

      return {
        success: true,
        stats,
        retrievedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec de récupération des statistiques: ${error.message}`
      };
    }
  }

  /**
   * Nettoie les jobs terminés
   * @param {string} queueName - Nom de la queue (optionnel)
   * @returns {Promise<Object>} Résultat du nettoyage
   */
  async cleanCompletedJobs(queueName = null) {
    try {
      let cleanedCount = 0;
      
      if (queueName) {
        const queue = this.queues.get(queueName);
        if (queue) {
          const completed = await queue.getCompleted();
          await Promise.all(completed.map(job => job.remove()));
          cleanedCount = completed.length;
        }
      } else {
        for (const queue of this.queues.values()) {
          const completed = await queue.getCompleted();
          await Promise.all(completed.map(job => job.remove()));
          cleanedCount += completed.length;
        }
      }

      logger.info('Completed jobs cleaned', {
        queueName,
        cleanedCount
      });

      return {
        success: true,
        cleanedCount,
        cleanedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to clean completed jobs', {
        queueName,
        error: error.message
      });
      
      return {
        success: false,
        error: `Échec du nettoyage: ${error.message}`
      };
    }
  }

  /**
   * Divise un tableau en chunks
   * @param {Array} array - Tableau à diviser
   * @param {number} size - Taille des chunks
   * @returns {Array} Tableau de chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Masque partiellement un numéro de téléphone
   * @param {string} phoneNumber - Numéro à masquer
   * @returns {string} Numéro masqué
   */
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 4) {
      return '***';
    }
    
    const visible = phoneNumber.substring(0, 3) + '***' + phoneNumber.substring(phoneNumber.length - 2);
    return visible;
  }

  /**
   * Génère un ID de job unique
   * @returns {string} ID de job
   */
  generateJobId() {
    return `job_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Arrête toutes les queues
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      const shutdownPromises = Array.from(this.queues.values()).map(queue => queue.close());
      await Promise.all(shutdownPromises);
      
      logger.info('All notification queues shut down successfully');
    } catch (error) {
      logger.error('Error shutting down queues', {
        error: error.message
      });
    }
  }
}

module.exports = new QueueService();
