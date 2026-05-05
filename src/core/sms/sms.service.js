const axios = require('axios');
const twilio = require('twilio');
const { Vonage } = require('@vonage/server-sdk');
const logger = require('../../utils/logger');
const notificationRepository = require('../database/notification.repository');
const { normalizePhoneNumber } = require('../../utils/phone-normalization');

function sanitizeProviderValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const placeholderPatterns = [/^your_/i, /^\+1234567890$/];
  if (placeholderPatterns.some((pattern) => pattern.test(normalized))) {
    return null;
  }

  const placeholderValues = new Set([
    'your_twilio_account_sid',
    'your_twilio_auth_token',
    'your_vonage_api_key',
    'your_vonage_api_secret',
    'your_textbelt_api_key',
    'EventPlanner',
  ]);

  if (placeholderValues.has(normalized)) {
    return null;
  }

  return normalized;
}

function isMockSmsDeliveryEnabled() {
  return String(process.env.MOCK_SMS_DELIVERY || '').trim().toLowerCase() === 'true';
}

/**
 * Service d'envoi de SMS transactionnels
 * Utilise Twilio + Vonage fallback avec haute disponibilitÃ©
 */
class SMSService {
  /**
   * Templates systÃ¨me (auth/payment) - pas de vÃ©rification de prÃ©fÃ©rences, pas de userId requis
   * Ces SMS sont critiques et doivent toujours Ãªtre envoyÃ©s
   */
  static SYSTEM_TEMPLATES = [
    'otp',
    'security-alert',
    'password-reset',
    'payment-confirmation'
  ];

  /**
   * Templates utilisateur (core) - vÃ©rification des prÃ©fÃ©rences, userId requis
   * Ces SMS concernent les invitÃ©s/utilisateurs et respectent leurs prÃ©fÃ©rences
   */
  static USER_TEMPLATES = [
    'appointment-reminder',
    'event-invitation',
    'event-reminder',
    'ticket-reminder',
    'event-confirmation'
  ];

  /**
   * VÃ©rifie si un template est un SMS systÃ¨me (auth/payment)
   * @param {string} template - Nom du template
   * @returns {boolean} True si c'est un SMS systÃ¨me
   */
  isSystemTemplate(template) {
    return SMSService.SYSTEM_TEMPLATES.includes(template);
  }

  constructor() {
    this.twilioClient = null;
    this.vonageClient = null;
    this.twilioConfigured = false;
    this.vonageConfigured = false;
    this.textbeltConfigured = false;
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

      if (this.isTextbeltConfigured()) {
        this.textbeltConfigured = true;
        logger.info('Textbelt SMS fallback initialized');
      }

      if (!this.twilioConfigured && !this.vonageConfigured && !this.textbeltConfigured) {
        logger.warn('No SMS service configured - SMS disabled');
      }

    } catch (error) {
      logger.error('Failed to initialize SMS service', { error: error.message });
      this.twilioConfigured = false;
      this.vonageConfigured = false;
      this.textbeltConfigured = false;
    }
  }

  /**
   * VÃ©rifie si Twilio est configurÃ©
   */
  isTwilioConfigured() {
    const accountSid = sanitizeProviderValue(process.env.TWILIO_ACCOUNT_SID);
    const authToken = sanitizeProviderValue(process.env.TWILIO_AUTH_TOKEN);
    const phoneNumber = sanitizeProviderValue(process.env.TWILIO_PHONE_NUMBER);

    return !!(
      accountSid &&
      /^AC[0-9a-f]{32}$/i.test(accountSid) &&
      authToken &&
      phoneNumber
    );
  }

  /**
   * VÃ©rifie si Vonage est configurÃ©
   */
  isVonageConfigured() {
    return !!(
      sanitizeProviderValue(process.env.VONAGE_API_KEY) &&
      sanitizeProviderValue(process.env.VONAGE_API_SECRET)
    );
  }

  /**
   * V?rifie si Textbelt est configur?
   */
  isTextbeltConfigured() {
    return !!(
      sanitizeProviderValue(process.env.TEXTBELT_API_KEY) ||
      String(process.env.TEXTBELT_USE_FREE_KEY || '').trim().toLowerCase() === 'true'
    );
  }

  /**
   * R?cup?re la cl? Textbelt effective
   */
  getTextbeltApiKey() {
    const configuredKey = sanitizeProviderValue(process.env.TEXTBELT_API_KEY);
    if (configuredKey) {
      return configuredKey;
    }

    if (String(process.env.TEXTBELT_USE_FREE_KEY || '').trim().toLowerCase() === 'true') {
      return 'textbelt';
    }

    return null;
  }

  /**
   * Envoie un SMS avec fallback automatique
   * @param {string} phoneNumber - NumÃ©ro de tÃ©lÃ©phone du destinataire
   * @param {string} message - Message Ã  envoyer
   * @param {Object} options - Options additionnelles
   * @returns {Promise<Object>} RÃ©sultat de l'envoi
   */
  async sendSMSWithFallback(phoneNumber, message, options = {}) {
    const startTime = Date.now();
    const normalizedPhone = this.formatPhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return {
        success: false,
        error: 'Aucun numero de telephone valide n a ete fourni.',
        details: {
          message: 'Le numero de telephone fourni est vide ou invalide.'
        }
      };
    }
    
    // Essayer Twilio d'abord
    if (this.twilioConfigured) {
      try {
        const result = await this.twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: normalizedPhone
        });
        
        const responseTime = Date.now() - startTime;
        
        logger.sms('SMS sent via Twilio', {
          phoneNumber: this.maskPhoneNumber(normalizedPhone),
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
          phoneNumber: this.maskPhoneNumber(normalizedPhone)
        });
      }
    }

    // Fallback Vonage
    if (this.vonageConfigured) {
      try {
        const result = await this.vonageClient.sms.send({
          to: normalizedPhone,
          from: process.env.VONAGE_FROM_NUMBER || 'EventPlanner',
          text: message
        });

        if (result.messages[0].status === '0') {
          const responseTime = Date.now() - startTime;
          
          logger.sms('SMS sent via Vonage', {
            phoneNumber: this.maskPhoneNumber(normalizedPhone),
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
          phoneNumber: this.maskPhoneNumber(normalizedPhone)
        });
      }
    }

    // Fallback Textbelt
    if (this.textbeltConfigured) {
      try {
        const textbeltKey = this.getTextbeltApiKey();
        let textbeltMessage = message;

        if (textbeltKey === 'textbelt') {
          const withoutUrls = message.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
          textbeltMessage =
            withoutUrls && withoutUrls !== message
              ? `${withoutUrls} Voir email pour le lien.`
              : withoutUrls || message;
        }

        const result = await axios.post(
          'https://textbelt.com/text',
          {
            phone: normalizedPhone,
            message: textbeltMessage,
            key: textbeltKey,
            sender:
              sanitizeProviderValue(process.env.TEXTBELT_SENDER) ||
              sanitizeProviderValue(process.env.VONAGE_FROM_NUMBER) ||
              'EventPlanner'
          },
          {
            timeout: parseInt(process.env.TEXTBELT_TIMEOUT_MS, 10) || 15000,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            }
          }
        );

        if (result.data?.success) {
          const responseTime = Date.now() - startTime;

          logger.sms('SMS sent via Textbelt', {
            phoneNumber: this.maskPhoneNumber(normalizedPhone),
            messageId: result.data.textId,
            responseTime,
            provider: 'textbelt',
            quotaRemaining: result.data.quotaRemaining
          });

          return {
            success: true,
            provider: 'textbelt',
            messageId: result.data.textId,
            responseTime,
            quotaRemaining: result.data.quotaRemaining
          };
        }

        throw new Error(result.data?.error || 'Textbelt send failed');
      } catch (error) {
        logger.error('Textbelt failed', {
          error: error.message,
          phoneNumber: this.maskPhoneNumber(normalizedPhone)
        });
      }
    }

    if (isMockSmsDeliveryEnabled()) {
      const responseTime = Date.now() - startTime;
      logger.warn('SMS mock - no provider configured', {
        phoneNumber: this.maskPhoneNumber(normalizedPhone),
        message: message.substring(0, 50) + '...'
      });
      return {
        success: false,
        provider: 'mock',
        messageId: `mock-sms-${Date.now()}`,
        responseTime,
        fallback: true,
        simulated: true,
        error: 'No real SMS provider configured',
        details: {
          message: 'Aucun provider SMS reel n est configure. Livraison simulee uniquement.',
          attempted_services: ['Twilio', 'Vonage', 'Textbelt', 'Mock']
        }
      };
    }

    // Aucun service disponible
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.warn('SMS fallback - no service configured', {
        phoneNumber: this.maskPhoneNumber(normalizedPhone),
        message: message.substring(0, 50) + '...'
      });
      return { success: false, fallback: true, reason: 'No SMS service configured' };
    }

    return {
      success: false,
      error: 'Tous les services SMS ont Ã©chouÃ©',
      details: {
        message: 'Aucun service SMS disponible',
        attempted_services: ['Twilio', 'Vonage', 'Textbelt', 'Fallback']
      }
    };
  }

  /**
   * Envoie un SMS transactionnel avec retry automatique
   * @param {string} phoneNumber - NumÃ©ro de tÃ©lÃ©phone du destinataire
   * @param {string} template - Template Ã  utiliser
   * @param {Object} data - DonnÃ©es du template
   * @param {Object} options - Options additionnelles (userId pour vÃ©rifier les prÃ©fÃ©rences)
   * @returns {Promise<Object>} RÃ©sultat de l'envoi
   */
  async sendTransactionalSMS(phoneNumber, template, data, options = {}) {
    try {
      const isSystemSMS = this.isSystemTemplate(template);

      // Pour les SMS utilisateur (non-systÃ¨me), vÃ©rifier les prÃ©fÃ©rences si userId fourni
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
          // En cas d'erreur de vÃ©rification des prÃ©fÃ©rences pour SMS utilisateur, on skip
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

      // Enregistrer la notification seulement pour les SMS utilisateur (non-systÃ¨me) avec userId
      if (!isSystemSMS && options.userId) {
        try {
          const notification = await notificationRepository.createNotification({
            userId: options.userId,
            type: template,
            channel: 'sms',
            subject: null,
            content: `SMS envoyÃ© Ã  ${this.maskPhoneNumber(phoneNumber)}`,
            status: result.success ? 'sent' : 'failed',
            sentAt: result.success ? new Date().toISOString() : null
          });

          // CrÃ©er un log avec les dÃ©tails du provider
          if (notification && notification.id) {
            await notificationRepository.createNotificationLog({
              notificationId: notification.id,
              provider: result.provider || 'unknown',
              response: result,
              errorMessage: result.success ? null : (result.error || result.details?.message || null)
            });
          }
        } catch (dbError) {
          // Ne pas faire Ã©chouer l'envoi si l'enregistrement en DB Ã©choue
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

      // VÃ©rifier si l'erreur est retryable
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
        error: 'Ã‰chec d\'envoi du SMS transactionnel',
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
   * @param {string} template - Template Ã  utiliser
   * @param {Object} data - DonnÃ©es du template
   * @param {Object} options - Options
   * @returns {Promise<Object>} RÃ©sultat de la mise en queue
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
        error: 'Ã‰chec de mise en queue',
        details: {
          message: error.message,
          recipientCount: recipients.length,
          template
        }
      };
    }
  }

  /**
   * GÃ©nÃ¨re un message SMS avec template DB en prioritÃ©
   * @param {string} template - Nom du template
   * @param {Object} data - DonnÃ©es du template
   * @param {Object} options - Options
   * @returns {string} Message gÃ©nÃ©rÃ©
   */
  async generateSMSMessage(template, data, options = {}) {
    try {
      let message;

      // 1. Essayer de rÃ©cupÃ©rer le template depuis la DB
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
          'password-reset': `Event Planner: Code de rÃ©initialisation: {{resetCode}}. Valable {{expiresIn}}.`,
          'event-invitation': `Event Planner: Invitation pour {{eventName}} le {{eventDate}} a {{eventTime}}. Lieu: {{eventLocation}}. Acces: {{ticketAccessUrl}}`,
          'event-confirmation': `Event Planner: Confirmation pour "{{event.title}}". Date: {{event.date}}. Lieu: {{event.location}}. Code: {{ticket.code}}`,
          'event-reminder': `Event Planner: Rappel! {{event.title}} a lieu demain Ã  {{event.time}}. Lieu: {{event.location}}`,
          'ticket-reminder': `Event Planner: N'oubliez pas votre Ã©vÃ©nement {{event.title}} aujourd'hui Ã  {{event.time}}!`,
          'event-cancelled': `Event Planner: L'Ã©vÃ©nement {{event.title}} a Ã©tÃ© annulÃ©. Contactez-nous pour plus d'informations.`,
          'payment-confirmation': `Event Planner: Paiement reÃ§u pour {{event.title}}. Montant: {{payment.amount}}â‚¬. Merci!`,
          'otp': `Event Planner: Votre code de vÃ©rification est {{otpCode}}. Valable {{expiresIn}}.`
        };

        message = inlineTemplates[template] || `Event Planner: ${template}`;

        // Remplacer les variables
        Object.keys(data).forEach(key => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          message = message.replace(regex, data[key] || '');
        });
      }

      // Limiter Ã  160 caractÃ¨res (standard SMS)
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
   * @param {string} phoneNumber - NumÃ©ro de tÃ©lÃ©phone
   * @param {Object} userData - DonnÃ©es utilisateur
   * @param {Object} options - Options
   * @returns {Promise<Object>} RÃ©sultat de l'envoi
   */
  async sendWelcomeSMS(phoneNumber, userData, options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'welcome', {
      user: userData
    }, options);
  }

  /**
   * Envoie un SMS de rÃ©initialisation de mot de passe
   * @param {string} phoneNumber - NumÃ©ro de tÃ©lÃ©phone
   * @param {string} resetCode - Code de rÃ©initialisation
   * @param {Object} options - Options
   * @returns {Promise<Object>} RÃ©sultat de l'envoi
   */
  async sendPasswordResetSMS(phoneNumber, resetCode, options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'password-reset', {
      resetCode,
      expiresIn: options.expiresIn || '10 minutes'
    }, options);
  }

  /**
   * Envoie un SMS de confirmation d'Ã©vÃ©nement
   * @param {string} phoneNumber - NumÃ©ro de tÃ©lÃ©phone
   * @param {Object} eventData - DonnÃ©es de l'Ã©vÃ©nement
   * @param {Object} ticketData - DonnÃ©es du ticket
   * @param {Object} options - Options
   * @returns {Promise<Object>} RÃ©sultat de l'envoi
   */
  async sendEventConfirmationSMS(phoneNumber, eventData, ticketData, options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'event-confirmation', {
      event: eventData,
      ticket: ticketData
    }, options);
  }

  /**
   * Envoie un SMS de rappel d'Ã©vÃ©nement
   * @param {string} phoneNumber - NumÃ©ro de tÃ©lÃ©phone
   * @param {Object} eventData - DonnÃ©es de l'Ã©vÃ©nement
   * @param {Object} options - Options
   * @returns {Promise<Object>} RÃ©sultat de l'envoi
   */
  async sendEventReminderSMS(phoneNumber, eventData, options = {}) {
    return await this.sendTransactionalSMS(phoneNumber, 'event-reminder', {
      event: eventData,
      time: options.time || '18h00'
    }, options);
  }

  /**
   * Envoie un SMS avec code OTP
   * @param {string} phoneNumber - NumÃ©ro de tÃ©lÃ©phone
   * @param {string} otpCode - Code OTP
   * @param {string} purpose - But du code
   * @param {Object} options - Options
   * @returns {Promise<Object>} RÃ©sultat de l'envoi
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
   * Valide un numÃ©ro de tÃ©lÃ©phone
   * @param {string} phoneNumber - NumÃ©ro Ã  valider
   * @returns {boolean} True si valide
   */
  validatePhoneNumber(phoneNumber) {
    // Expression rÃ©guliÃ¨re pour valider les numÃ©ros internationaux
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''));
  }

  /**
   * Formate un numÃ©ro de tÃ©lÃ©phone
   * @param {string} phoneNumber - NumÃ©ro Ã  formater
   * @returns {string} NumÃ©ro formatÃ©
   */
  formatPhoneNumber(phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return '';
    }
    // Supprimer tous les caractÃ¨res non numÃ©riques sauf le +
    return normalizedPhone.replace(/[^\d+]/g, '');
  }

  /**
   * Masque partiellement un numÃ©ro de tÃ©lÃ©phone pour les logs
   * @param {string} phoneNumber - NumÃ©ro Ã  masquer
   * @returns {string} NumÃ©ro masquÃ©
   */
  maskPhoneNumber(phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone || typeof normalizedPhone !== 'string' || normalizedPhone.length < 4) {
      return '***';
    }
    
    const formatted = this.formatPhoneNumber(normalizedPhone);
    if (!formatted || formatted.length < 4) {
      return '***';
    }
    
    const visible = formatted.substring(0, 3) + '***' + formatted.substring(formatted.length - 2);
    return visible;
  }

  /**
   * VÃ©rifie la santÃ© du service SMS
   * @returns {Promise<Object>} Ã‰tat de santÃ© du service
   */
  async healthCheck() {
    try {
      const results = {
        twilio: { configured: this.twilioConfigured, status: 'unknown' },
        vonage: { configured: this.vonageConfigured, status: 'unknown' },
        textbelt: { configured: this.textbeltConfigured, status: 'unknown' }
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

      if (this.textbeltConfigured) {
        results.textbelt.status = 'available';
        results.textbelt.mode = this.getTextbeltApiKey() === 'textbelt' ? 'free-key' : 'api-key';
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
   * RÃ©cupÃ¨re les statistiques du service
   * @returns {Object} Statistiques
   */
  getStats() {
    return {
      mockDeliveryEnabled: isMockSmsDeliveryEnabled(),
      providers: {
        twilio: {
          configured: this.twilioConfigured,
          accountSid: sanitizeProviderValue(process.env.TWILIO_ACCOUNT_SID),
          phoneNumber: this.maskPhoneNumber(sanitizeProviderValue(process.env.TWILIO_PHONE_NUMBER))
        },
        vonage: {
          configured: this.vonageConfigured,
          fromNumber: sanitizeProviderValue(process.env.VONAGE_FROM_NUMBER)
        },
        textbelt: {
          configured: this.textbeltConfigured,
          mode: this.getTextbeltApiKey() === 'textbelt' ? 'free-key' : (this.textbeltConfigured ? 'api-key' : null),
          sender: sanitizeProviderValue(process.env.TEXTBELT_SENDER)
        }
      }
    };
  }

  /**
   * VÃ©rifie si au moins un service SMS est configurÃ©
   * @returns {boolean} True si configurÃ©
   */
  isReady() {
    return this.twilioConfigured || this.vonageConfigured || this.textbeltConfigured;
  }

  /**
   * DÃ©termine si une erreur est retryable
   * @param {Error} error - L'erreur Ã  analyser
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
   * Test la connectivitÃ© avec les services SMS
   * @returns {Promise<Object>} RÃ©sultat des tests
   */
  async testConnectivity() {
    const results = {
      twilio: { success: false, error: null },
      vonage: { success: false, error: null },
      textbelt: { success: false, error: null },
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

    if (this.textbeltConfigured) {
      results.textbelt = {
        success: false,
        mode: this.getTextbeltApiKey() === 'textbelt' ? 'free-key' : 'api-key',
        note: 'Fallback configured, but live delivery must be verified with an actual send'
      };
    }

    results.overall = results.twilio.success || results.vonage.success;
    return results;
  }
}

module.exports = new SMSService();


