const twilio = require('twilio');
const { Vonage } = require('@vonage/server-sdk');
const logger = require('../../utils/logger');
const notificationRepository = require('../database/notification.repository');

/**
 * Service d'envoi de SMS transactionnels
 * Utilise Twilio + Vonage fallback avec haute disponibilité
 */
class SMSService {
  /**
   * Templates système (auth/payment) - pas de vérification de préférences, pas de userId requis
   * Ces SMS sont critiques et doivent toujours être envoyés
   */
  static SYSTEM_TEMPLATES = [
    'otp',
    'security-alert',
    'password-reset',
    'payment-confirmation'
  ];

  /**
   * Templates utilisateur (core) - vérification des préférences, userId requis
   * Ces SMS concernent les invités/utilisateurs et respectent leurs préférences
   */
  static USER_TEMPLATES = [
    'appointment-reminder',
    'event-reminder',
    'ticket-reminder',
    'event-confirmation'
  ];

  /**
   * Vérifie si un template est un SMS système (auth/payment)
   * @param {string} template - Nom du template
   * @returns {boolean} True si c'est un SMS système
   */
  isSystemTemplate(template) {
    return SMSService.SYSTEM_TEMPLATES.includes(template);
  }

  constructor() {
    this.twilioClient = null;
    this.vonageClient = null;
    this.twilioConfigured = false;
    this.vonageConfigured = false;
    this.initialize();
  }

  /**
   * Initialise les clients SMS (Twilio + Vonage)
   */
  async initialize() {
    try {
      // Initialiser Twilio
      if (this.isTwilioConfigured()) {
        this.twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        this.twilioConfigured = true;
        logger.info('Twilio SMS service initialized');
      }

      // Initialiser Vonage comme fallback
      if (this.isVonageConfigured()) {
        this.vonageClient = new Vonage({
          apiKey: process.env.VONAGE_API_KEY,
          apiSecret: process.env.VONAGE_API_SECRET
        });
        this.vonageConfigured = true;
        logger.info('Vonage SMS service initialized');
      }

      if (!this.twilioConfigured && !this.vonageConfigured) {
        logger.warn('No SMS service configured - SMS disabled');
      }

    } catch (error) {
      logger.error('Failed to initialize SMS service', { error: error.message });
      this.twilioConfigured = false;
      this.vonageConfigured = false;
    }
  }

  /**
   * Vérifie si Twilio est configuré
   */
  isTwilioConfigured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && 
             process.env.TWILIO_AUTH_TOKEN && 
             process.env.TWILIO_PHONE_NUMBER);
  }

  /**
   * Vérifie si Vonage est configuré
   */
  isVonageConfigured() {
    return !!(process.env.VONAGE_API_KEY && 
             process.env.VONAGE_API_SECRET);
  }

  /**
   * Envoie un SMS avec fallback automatique
   * @param {string} phoneNumber - Numéro de téléphone du destinataire
   * @param {string} message - Message à envoyer
   * @param {Object} options - Options additionnelles
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendSMSWithFallback(phoneNumber, message, options = {}) {
    const startTime = Date.now();
    
    // Essayer Twilio d'abord
    if (this.twilioConfigured) {
      try {
        const result = await this.twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phoneNumber
        });
        
        const responseTime = Date.now() - startTime;
        
        logger.sms('SMS sent via Twilio', {
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          messageSid: result.sid,
          status: result.status,
          responseTime,
          provider: 'twilio'
        });
        
        return { 
          success: true, 
          provider: 'twilio', 
          messageId: result.sid,
          responseTime
        };
      } catch (error) {
        logger.warn('Twilio failed, trying Vonage', { 
          error: error.message,
          phoneNumber: this.maskPhoneNumber(phoneNumber)
        });
      }
    }

    // Fallback Vonage
    if (this.vonageConfigured) {
      try {
        const result = await this.vonageClient.sms.send({
          to: phoneNumber,
          from: process.env.VONAGE_FROM_NUMBER || 'EventPlanner',
          text: message
        });

        if (result.messages[0].status === '0') {
          const responseTime = Date.now() - startTime;
          
          logger.sms('SMS sent via Vonage', {
            phoneNumber: this.maskPhoneNumber(phoneNumber),
            messageId: result.messages[0].messageId,
            responseTime,
            provider: 'vonage'
          });
          
          return { 
            success: true, 
            provider: 'vonage', 
            messageId: result.messages[0].messageId,
            responseTime
          };
        } else {
          throw new Error(`Vonage error: ${result.messages[0]['error-text']}`);
        }
      } catch (error) {
        logger.error('Vonage failed', { 
          error: error.message,
          phoneNumber: this.maskPhoneNumber(phoneNumber)
        });
      }
    }

    // Aucun service disponible
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.warn('SMS fallback - no service configured', {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        message: message.substring(0, 50) + '...'
      });
      return { success: false, fallback: true, reason: 'No SMS service configured' };
    }

    return {
      success: false,
      error: 'Tous les services SMS ont échoué',
      details: {
        message: 'Aucun service SMS disponible',
        attempted_services: ['Twilio', 'Vonage', 'Fallback']
      }
    };
  }

  /**
   * Envoie un SMS transactionnel avec retry automatique
   * @param {string} phoneNumber - Numéro de téléphone du destinataire
   * @param {string} template - Template à utiliser
   * @param {Object} data - Données du template
   * @param {Object} options - Options additionnelles (userId pour vérifier les préférences)
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendTransactionalSMS(phoneNumber, template, data, options = {}) {
    try {
      const isSystemSMS = this.isSystemTemplate(template);

      // Pour les SMS utilisateur (non-système), vérifier les préférences si userId fourni
      if (!isSystemSMS && options.userId) {
        try {
          const preferencesService = require('../preferences/preferences.service');
          const preferenceCheck = await preferencesService.shouldSendNotification(options.userId, 'sms');

          if (!preferenceCheck.shouldSend) {
            logger.sms('SMS skipped due to user preferences', {
              phoneNumber: this.maskPhoneNumber(phoneNumber),
              template,
              userId: options.userId,
              reason: preferenceCheck.reason
            });

            return {
              success: true,
              skipped: true,
              reason: 'user_preferences',
              details: {
                userId: options.userId,
                channel: 'sms',
                preferenceReason: preferenceCheck.reason
              }
            };
          }

          logger.sms('SMS allowed by user preferences', {
            phoneNumber: this.maskPhoneNumber(phoneNumber),
            template,
            userId: options.userId,
            reason: preferenceCheck.reason
          });
        } catch (prefError) {
          // En cas d'erreur de vérification des préférences pour SMS utilisateur, on skip
          logger.warn('Failed to check SMS preferences, skipping by default', {
            phoneNumber: this.maskPhoneNumber(phoneNumber),
            template,
            userId: options.userId,
            error: prefError.message
          });

          return {
            success: true,
            skipped: true,
            reason: 'preference_check_failed',
            details: {
              userId: options.userId,
              channel: 'sms',
              error: prefError.message
            }
          };
        }
      }

      const message = await this.generateSMSMessage(template, data, options);

      const result = await this.sendSMSWithFallback(phoneNumber, message, options);

      // Enregistrer la notification seulement pour les SMS utilisateur (non-système) avec userId
      if (!isSystemSMS && options.userId) {
        try {
          const notification = await notificationRepository.createNotification({
            userId: options.userId,
            type: template,
            channel: 'sms',
            subject: null,
            content: `SMS envoyé à ${this.maskPhoneNumber(phoneNumber)}`,
            status: result.success ? 'sent' : 'failed',
            sentAt: result.success ? new Date().toISOString() : null
          });

          // Créer un log avec les détails du provider
          if (notification && notification.id) {
            await notificationRepository.createNotificationLog({
              notificationId: notification.id,
              provider: result.provider || 'unknown',
              response: result,
              errorMessage: result.success ? null : (result.error || result.details?.message || null)
            });
          }
        } catch (dbError) {
          // Ne pas faire échouer l'envoi si l'enregistrement en DB échoue
          logger.warn('Failed to record SMS notification in database', {
            phoneNumber: this.maskPhoneNumber(phoneNumber),
            template,
            error: dbError.message
          });
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to send transactional SMS', {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        template,
        error: error.message,
        ip: options.ip
      });

      // Vérifier si l'erreur est retryable
      const isRetryable = this.isRetryableError(error);

      if (isRetryable) {
        // Mettre en queue un job retry
        try {
          const queueService = require('../queues/queue.service');
          const jobData = {
            type: 'sms-retry',
            phoneNumber,
            template,
            data,
            options: {
              ...options,
              retryCount: (options.retryCount || 0) + 1
            },
            originalError: error.message
          };

          await queueService.addSMSJob(jobData);

          logger.sms('Retry job queued for failed SMS', {
            phoneNumber: this.maskPhoneNumber(phoneNumber),
            template,
            retryCount: jobData.options.retryCount
          });

          // Persister la notification avec statut pending (seulement pour SMS utilisateur avec userId)
          if (!this.isSystemTemplate(template) && options.userId) {
            try {
              const notification = await notificationRepository.createNotification({
                userId: options.userId,
                type: template,
                channel: 'sms',
                subject: null,
                content: `SMS en attente de retry pour ${this.maskPhoneNumber(phoneNumber)}`,
                status: 'pending',
                sentAt: null
              });

              if (notification && notification.id) {
                await notificationRepository.createNotificationLog({
                  notificationId: notification.id,
                  provider: 'queue',
                  response: { retryQueued: true, retryCount: jobData.options.retryCount },
                  errorMessage: error.message
                });
              }
            } catch (dbError) {
              logger.warn('Failed to record pending SMS notification in database', {
                phoneNumber: this.maskPhoneNumber(phoneNumber),
                template,
                error: dbError.message
              });
            }
          }

          return {
            success: false,
            retryQueued: true,
            error: 'SMS send failed, retry queued',
            details: {
              message: error.message,
              retryCount: jobData.options.retryCount
            }
          };
        } catch (queueError) {
          logger.error('Failed to queue retry job', {
            error: queueError.message,
            phoneNumber: this.maskPhoneNumber(phoneNumber),
            template
          });
        }
      }

      return {
        success: false,
        error: 'Échec d\'envoi du SMS transactionnel',
        details: {
          message: error.message,
          template,
          recipient: this.maskPhoneNumber(phoneNumber)
        }
      };
    }
  }

  /**
   * Met en file d'attente des SMS en masse
   * @param {Array} recipients - Liste des destinataires
   * @param {string} template - Template à utiliser
   * @param {Object} data - Données du template
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de la mise en queue
   */
  async queueBulkSMS(recipients, template, data, options = {}) {
    try {
      const queueService = require('../queues/queue.service');
      
      const jobData = {
        type: 'bulk-sms',
        recipients,
        template,
        data,
        options,
        createdAt: new Date().toISOString()
      };

      const result = await queueService.addSMSJob(jobData);
      
      logger.sms('Bulk SMS queued', {
        template,
        recipientsCount: recipients.length,
        jobId: result.jobId
      });

      return result;
    } catch (error) {
      logger.error('Failed to queue bulk SMS', {
        recipientCount: recipients.length,
        template,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Échec de mise en queue',
        details: {
          message: error.message,
          recipientCount: recipients.length,
          template
        }
      };
    }
  }

  /**
   * Génère un message SMS avec template DB en priorité
   * @param {string} template - Nom du template
   * @param {Object} data - Données du template
   * @param {Object} options - Options
   * @returns {string} Message généré
   */
  async generateSMSMessage(template, data, options = {}) {
    try {
      let message;

      // 1. Essayer de récupérer le template depuis la DB
      const templatesService = require('../templates/templates.service');
      const dbTemplate = await templatesService.getTemplateByName(template, 'sms');

      if (dbTemplate) {
        // Utiliser le template DB
        const rendered = await templatesService.renderTemplate(dbTemplate, data);
        message = rendered.textContent;
      } else {
        // Fallback: templates inline
        const inlineTemplates = {
          'welcome': `Bienvenue sur Event Planner {{user.firstName || user.name}}! Votre compte est maintenant actif.`,
          'password-reset': `Event Planner: Code de réinitialisation: {{resetCode}}. Valable {{expiresIn}}.`,
          'event-confirmation': `Event Planner: Confirmation pour "{{event.title}}". Date: {{event.date}}. Lieu: {{event.location}}. Code: {{ticket.code}}`,
          'event-reminder': `Event Planner: Rappel! {{event.title}} a lieu demain à {{event.time}}. Lieu: {{event.location}}`,
          'ticket-reminder': `Event Planner: N'oubliez pas votre événement {{event.title}} aujourd'hui à {{event.time}}!`,
          'event-cancelled': `Event Planner: L'événement {{event.title}} a été annulé. Contactez-nous pour plus d'informations.`,
          'payment-confirmation': `Event Planner: Paiement reçu pour {{event.title}}. Montant: {{payment.amount}}€. Merci!`,
          'otp': `Event Planner: Votre code de vérification est {{otpCode}}. Valable {{expiresIn}}.`
        };

        message = inlineTemplates[template] || `Event Planner: ${template}`;

        // Remplacer les variables
        Object.keys(data).forEach(key => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          message = message.replace(regex, data[key] || '');
        });
      }

      // Limiter à 160 caractères (standard SMS)
      if (message.length > 160) {
        message = message.substring(0, 157) + '...';
      }

      return message;
    } catch (error) {
      logger.error('Failed to generate SMS message', {
        template,
        error: error.message
      });

      // Fallback minimal
      return `Event Planner: Notification ${template}`;
    }
  }

  /**
   * Envoie un SMS de bienvenue
   * @param {string} phoneNumber - Numéro de téléphone
   * @param {Object} userData - Données utilisateur
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendWelcomeSMS(phoneNumber, userData, options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'welcome', {
      user: userData
    }, options);
  }

  /**
   * Envoie un SMS de réinitialisation de mot de passe
   * @param {string} phoneNumber - Numéro de téléphone
   * @param {string} resetCode - Code de réinitialisation
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendPasswordResetSMS(phoneNumber, resetCode, options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'password-reset', {
      resetCode,
      expiresIn: options.expiresIn || '10 minutes'
    }, options);
  }

  /**
   * Envoie un SMS de confirmation d'événement
   * @param {string} phoneNumber - Numéro de téléphone
   * @param {Object} eventData - Données de l'événement
   * @param {Object} ticketData - Données du ticket
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendEventConfirmationSMS(phoneNumber, eventData, ticketData, options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'event-confirmation', {
      event: eventData,
      ticket: ticketData
    }, options);
  }

  /**
   * Envoie un SMS de rappel d'événement
   * @param {string} phoneNumber - Numéro de téléphone
   * @param {Object} eventData - Données de l'événement
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendEventReminderSMS(phoneNumber, eventData, options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'event-reminder', {
      event: eventData,
      time: options.time || '18h00'
    }, options);
  }

  /**
   * Envoie un SMS avec code OTP
   * @param {string} phoneNumber - Numéro de téléphone
   * @param {string} otpCode - Code OTP
   * @param {string} purpose - But du code
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendOTPSMS(phoneNumber, otpCode, purpose = 'verification', options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'otp', {
      otpCode,
      expiresIn: options.expiresIn || '5 minutes'
    }, {
      ...options,
      purpose
    });
  }

  /**
   * Valide un numéro de téléphone
   * @param {string} phoneNumber - Numéro à valider
   * @returns {boolean} True si valide
   */
  validatePhoneNumber(phoneNumber) {
    // Expression régulière pour valider les numéros internationaux
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''));
  }

  /**
   * Formate un numéro de téléphone
   * @param {string} phoneNumber - Numéro à formater
   * @returns {string} Numéro formaté
   */
  formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) {
      return '';
    }
    // Supprimer tous les caractères non numériques sauf le +
    return phoneNumber.replace(/[^\d+]/g, '');
  }

  /**
   * Masque partiellement un numéro de téléphone pour les logs
   * @param {string} phoneNumber - Numéro à masquer
   * @returns {string} Numéro masqué
   */
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.length < 4) {
      return '***';
    }
    
    const formatted = this.formatPhoneNumber(phoneNumber);
    if (!formatted || formatted.length < 4) {
      return '***';
    }
    
    const visible = formatted.substring(0, 3) + '***' + formatted.substring(formatted.length - 2);
    return visible;
  }

  /**
   * Vérifie la santé du service SMS
   * @returns {Promise<Object>} État de santé du service
   */
  async healthCheck() {
    try {
      const results = {
        twilio: { configured: this.twilioConfigured, status: 'unknown' },
        vonage: { configured: this.vonageConfigured, status: 'unknown' }
      };

      // Tester Twilio
      if (this.twilioConfigured && this.twilioClient) {
        try {
          const account = await this.twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
          results.twilio.status = 'healthy';
          results.twilio.accountSid = account.sid;
          results.twilio.friendlyName = account.friendlyName;
        } catch (error) {
          results.twilio.status = 'unhealthy';
          results.twilio.error = error.message;
        }
      }

      // Tester Vonage
      if (this.vonageConfigured && this.vonageClient) {
        try {
          const balance = await this.vonageClient.number.getBalance();
          results.vonage.status = 'healthy';
          results.vonage.balance = balance.value;
          results.vonage.currency = balance.currency;
        } catch (error) {
          results.vonage.status = 'unhealthy';
          results.vonage.error = error.message;
        }
      }

      const overallHealthy = (this.twilioConfigured && results.twilio.status === 'healthy') ||
                           (this.vonageConfigured && results.vonage.status === 'healthy');

      return {
        success: true,
        healthy: overallHealthy,
        providers: results
      };
    } catch (error) {
      logger.error('SMS service health check failed', { error: error.message });
      return {
        success: false,
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Récupère les statistiques du service
   * @returns {Object} Statistiques
   */
  getStats() {
    return {
      providers: {
        twilio: {
          configured: this.twilioConfigured,
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          phoneNumber: this.maskPhoneNumber(process.env.TWILIO_PHONE_NUMBER)
        },
        vonage: {
          configured: this.vonageConfigured,
          fromNumber: process.env.VONAGE_FROM_NUMBER
        }
      }
    };
  }

  /**
   * Vérifie si au moins un service SMS est configuré
   * @returns {boolean} True si configuré
   */
  isReady() {
    return this.twilioConfigured || this.vonageConfigured;
  }

  /**
   * Détermine si une erreur est retryable
   * @param {Error} error - L'erreur à analyser
   * @returns {boolean} True si l'erreur est retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'TWILIO_API_ERROR',
      'SMS_SEND_FAILED',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNRESET'
    ];

    const errorMessage = error.message || error.code || '';
    return retryableErrors.some(retryableError => errorMessage.includes(retryableError));
  }

  /**
   * Test la connectivité avec les services SMS
   * @returns {Promise<Object>} Résultat des tests
   */
  async testConnectivity() {
    const results = {
      twilio: { success: false, error: null },
      vonage: { success: false, error: null },
      overall: false
    };

    // Tester Twilio
    if (this.twilioConfigured) {
      try {
        const account = await this.twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        results.twilio = {
          success: true,
          accountSid: account.sid,
          friendlyName: account.friendlyName
        };
      } catch (error) {
        results.twilio.error = error.message;
      }
    }

    // Tester Vonage
    if (this.vonageConfigured) {
      try {
        const balance = await this.vonageClient.number.getBalance();
        results.vonage = {
          success: true,
          balance: balance.value,
          currency: balance.currency
        };
      } catch (error) {
        results.vonage.error = error.message;
      }
    }

    results.overall = results.twilio.success || results.vonage.success;
    return results;
  }
}

module.exports = new SMSService();
