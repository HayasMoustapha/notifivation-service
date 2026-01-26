const twilio = require('twilio');
const { Vonage } = require('@vonage/server-sdk');
const logger = require('../../utils/logger');

/**
 * Service d'envoi de SMS transactionnels
 * Utilise Twilio + Vonage fallback avec haute disponibilité
 */
class SMSService {
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
   * Envoie un SMS transactionnel
   * @param {string} phoneNumber - Numéro de téléphone du destinataire
   * @param {string} template - Template à utiliser
   * @param {Object} data - Données du template
   * @param {Object} options - Options additionnelles
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendTransactionalSMS(phoneNumber, template, data, options = {}) {
    try {
      const message = this.generateSMSMessage(template, data, options);
      
      const result = await this.sendSMSWithFallback(phoneNumber, message, options);

      logger.sms('Transactional SMS sent', {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        template,
        provider: result.provider,
        messageId: result.messageId,
        ip: options.ip
      });

      return result;
    } catch (error) {
      logger.error('Failed to send transactional SMS', {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        template,
        error: error.message,
        ip: options.ip
      });
      
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
   * Génère le message SMS à partir d'un template
   * @param {string} template - Nom du template
   * @param {Object} data - Données du template
   * @param {Object} options - Options
   * @returns {string} Message généré
   */
  generateSMSMessage(template, data, options = {}) {
    const templates = {
      'welcome': `Bienvenue {{user.first_name}} ! Merci de vous être inscrit sur Event Planner. Votre compte est prêt.`,
      
      'password-reset': `Event Planner: Votre code de réinitialisation est {{resetCode}}. Valable {{expiresIn}}. Ne le partagez pas.`,
      
      'event-confirmation': `Event Planner: Confirmation! Vous êtes inscrit à {{event.title}} le {{event.eventDate}}. Lieu: {{event.location}}`,
      
      'event-reminder': `Event Planner: Rappel! {{event.title}} a lieu demain à {{event.time}}. Lieu: {{event.location}}`,
      
      'ticket-reminder': `Event Planner: N'oubliez pas votre événement {{event.title}} aujourd'hui à {{event.time}}!`,
      
      'event-cancelled': `Event Planner: L'événement {{event.title}} a été annulé. Contactez-nous pour plus d'informations.`,
      
      'payment-confirmation': `Event Planner: Paiement reçu pour {{event.title}}. Montant: {{payment.amount}}€. Merci!`,
      
      'otp': `Event Planner: Votre code de vérification est {{otpCode}}. Valable {{expiresIn}}.`
    };

    let message = templates[template] || `Event Planner: ${template}`;
    
    // Remplacer les variables
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      message = message.replace(regex, data[key]);
    });

    // Limiter à 160 caractères (standard SMS)
    if (message.length > 160) {
      message = message.substring(0, 157) + '...';
    }

    return message;
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
    // Supprimer tous les caractères non numériques sauf le +
    return phoneNumber.replace(/[^\d+]/g, '');
  }

  /**
   * Masque partiellement un numéro de téléphone pour les logs
   * @param {string} phoneNumber - Numéro à masquer
   * @returns {string} Numéro masqué
   */
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 4) {
      return '***';
    }
    
    const formatted = this.formatPhoneNumber(phoneNumber);
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
