const nodemailer = require('nodemailer');
const sendgridMail = require('@sendgrid/mail');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');
const notificationRepository = require('../database/notification.repository');
const { renderTemplateContent } = require('../templates/template-renderer');

function sanitizeProviderValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const placeholderPatterns = [
    /^your_/i,
    /^SG\.your_/i,
    /^your-email@/i,
    /^your_email@/i,
  ];

  if (placeholderPatterns.some((pattern) => pattern.test(normalized))) {
    return null;
  }

  const placeholderValues = new Set([
    'your_email@gmail.com',
    'your_app_password',
    'your_sendgrid_api_key',
  ]);

  if (placeholderValues.has(normalized)) {
    return null;
  }

  return normalized;
}

function isMockEmailDeliveryEnabled() {
  return String(process.env.MOCK_EMAIL_DELIVERY || '').trim().toLowerCase() === 'true';
}

/**
 * Service d'envoi d'emails transactionnels
 * Utilise Nodemailer (SMTP) + SendGrid fallback avec rendu template natif
 */
class EmailService {
  constructor() {
    this.smtpTransporter = null;
    this.sendgridClient = null;
    this.smtpConfigured = false;
    this.sendgridConfigured = false;
    this.templates = new Map();
    this.initialized = false;
    this.initPromise = this.initialize();
  }

  /**
   * Initialise les services email (SMTP + SendGrid)
   */
  async initialize() {
    try {
      // Initialiser Nodemailer (SMTP)
      if (this.isSMTPConfigured()) {
        this.smtpTransporter = nodemailer.createTransport({
          host: sanitizeProviderValue(process.env.SMTP_HOST),
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: sanitizeProviderValue(process.env.SMTP_USER),
            pass: sanitizeProviderValue(process.env.SMTP_PASS)
          },
          pool: true, // Connection pooling
          maxConnections: 5,
          maxMessages: 100,
          tls: {
            rejectUnauthorized: process.env.NODE_ENV === 'production'
          }
        });

        // Vérifier la connexion SMTP
        this.smtpTransporter.verify((error, success) => {
          if (error) {
            logger.warn('SMTP verification failed', { error: error.message });
            this.smtpConfigured = false;
          } else {
            logger.info('SMTP service ready');
            this.smtpConfigured = true;
          }
        });
      }

      // Initialiser SendGrid comme fallback
      const sendgridApiKey = sanitizeProviderValue(process.env.SENDGRID_API_KEY);
      if (sendgridApiKey) {
        sendgridMail.setApiKey(sendgridApiKey);
        this.sendgridConfigured = true;
        logger.info('SendGrid service ready');
      }

      // Charger les templates Handlebars
      await this.loadTemplates();

      logger.info('Email service initialized', {
        smtp: this.smtpConfigured,
        sendgrid: this.sendgridConfigured,
        templates: this.templates.size
      });

    } catch (error) {
      logger.error('Failed to initialize email service', { error: error.message });
      this.smtpConfigured = false;
      this.sendgridConfigured = false;
    } finally {
      this.initialized = true;
    }
  }

  /**
   * S'assure que le service email est initialisé avant tout envoi
   */
  async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    await this.initPromise;
  }

  /**
   * Vérifie si SMTP est configuré
   */
  isSMTPConfigured() {
    return !!(
      sanitizeProviderValue(process.env.SMTP_HOST) &&
      sanitizeProviderValue(process.env.SMTP_USER) &&
      sanitizeProviderValue(process.env.SMTP_PASS)
    );
  }

  isRetryableSmtpError(error) {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toUpperCase();

    return [
      'ECONNRESET',
      'ECONNREFUSED',
      'ECONNECTION',
      'ETIMEDOUT',
      'ESOCKET',
      'EPIPE'
    ].includes(code) || message.includes('ECONNRESET') || message.includes('TIMEOUT');
  }

  recreateSmtpTransporter() {
    if (!this.isSMTPConfigured()) {
      this.smtpTransporter = null;
      this.smtpConfigured = false;
      return;
    }

    this.smtpTransporter = nodemailer.createTransport({
      host: sanitizeProviderValue(process.env.SMTP_HOST),
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: sanitizeProviderValue(process.env.SMTP_USER),
        pass: sanitizeProviderValue(process.env.SMTP_PASS)
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });
    this.smtpConfigured = true;
  }

  /**
   * Charge les templates depuis le système de fichiers
   */
  async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, '../../../templates');
      
      // Vérifier si le répertoire existe
      try {
        await fs.access(templatesDir);
      } catch {
        logger.warn('Email templates directory not found, using inline templates');
        return;
      }

      const files = await fs.readdir(templatesDir);
      
      for (const file of files) {
        if (file.endsWith('.html')) {
          const templateName = path.basename(file, '.html');
          const templateContent = await fs.readFile(path.join(templatesDir, file), 'utf8');
          this.templates.set(templateName, templateContent);
          logger.info(`Loaded template: ${templateName}`);
        }
      }

      logger.info(`Loaded ${this.templates.size} email templates`);
    } catch (error) {
      logger.error('Failed to load email templates', { error: error.message });
    }
  }

  /**
   * Envoie un email avec fallback automatique
   * @param {Object} mailOptions - Options de l'email
   * @param {Object} options - Options additionnelles
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendEmailWithFallback(mailOptions, options = {}) {
    const startTime = Date.now();
    
    // Essayer SMTP d'abord
    if (this.smtpConfigured) {
      try {
        const result = await this.smtpTransporter.sendMail(mailOptions);
        const responseTime = Date.now() - startTime;
        
        logger.info('Email sent via SMTP', {
          to: mailOptions.to,
          messageId: result.messageId,
          responseTime,
          provider: 'smtp'
        });
        
        return { 
          success: true, 
          provider: 'smtp', 
          messageId: result.messageId,
          responseTime
        };
      } catch (error) {
        if (this.isRetryableSmtpError(error)) {
          logger.warn('SMTP transient failure detected, retrying once with a fresh transporter', {
            error: error.message,
            code: error.code || null,
            to: mailOptions.to
          });

          try {
            this.recreateSmtpTransporter();
            const retryResult = await this.smtpTransporter.sendMail(mailOptions);
            const responseTime = Date.now() - startTime;

            logger.info('Email sent via SMTP after retry', {
              to: mailOptions.to,
              messageId: retryResult.messageId,
              responseTime,
              provider: 'smtp'
            });

            return {
              success: true,
              provider: 'smtp',
              messageId: retryResult.messageId,
              responseTime
            };
          } catch (retryError) {
            logger.warn('SMTP retry failed, trying SendGrid', {
              error: retryError.message,
              code: retryError.code || null,
              to: mailOptions.to
            });
          }
        }

        logger.warn('SMTP failed, trying SendGrid', { 
          error: error.message,
          to: mailOptions.to
        });
      }
    }

    // Fallback SendGrid
    if (this.sendgridConfigured) {
      try {
        const msg = {
          to: mailOptions.to,
          from: mailOptions.from,
          subject: mailOptions.subject,
          text: mailOptions.text,
          html: mailOptions.html
        };

        const result = await sendgridMail.send(msg);
        const responseTime = Date.now() - startTime;
        
        logger.info('Email sent via SendGrid', {
          to: mailOptions.to,
          messageId: result[0]?.headers?.['x-message-id'],
          responseTime,
          provider: 'sendgrid'
        });
        
        return { 
          success: true, 
          provider: 'sendgrid', 
          messageId: result[0]?.headers?.['x-message-id'],
          responseTime
        };
      } catch (error) {
        logger.error('SendGrid failed', { 
          error: error.message,
          to: mailOptions.to
        });
      }
    }

    // Aucun service disponible : mock explicite seulement
    if (isMockEmailDeliveryEnabled()) {
      const responseTime = Date.now() - startTime;
      logger.warn('Email mock - no provider configured', {
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      return {
        success: false,
        provider: 'mock',
        messageId: `mock-email-${Date.now()}`,
        responseTime,
        fallback: true,
        simulated: true,
        error: 'No real email provider configured',
        details: {
          message: 'Aucun provider email reel n est configure. Livraison simulee uniquement.',
          attempted_services: ['SMTP', 'SendGrid', 'Mock']
        }
      };
    }

    return {
      success: false,
      error: 'Tous les services email ont échoué',
      details: {
        message: 'Aucun service email disponible',
        attempted_services: ['SMTP', 'SendGrid', 'Fallback']
      }
    };
  }

  /**
   * Templates système (auth/payment) - pas de vérification de préférences, pas de userId requis
   * Ces emails sont critiques et doivent toujours être envoyés
   */
  static SYSTEM_TEMPLATES = [
    // Auth service - emails système
    'welcome',
    'account-activated',
    'account-suspended',
    'email-verification',
    'password-reset',
    'password-changed',
    'security-alert',
    // Payment service - emails système
    'payment-confirmation',
    'payment-failed',
    'refund-processed',
    'fraud-detected',
    // Autres emails système
    'daily-scan-report',
    'test-simple',
    'refund-processed-simple',
    'payment-failed-simple',
    'fraud-detected-simple'
  ];

  /**
   * Templates utilisateur (core) - vérification des préférences, userId requis
   * Ces emails concernent les invités/utilisateurs et respectent leurs préférences
   */
  static USER_TEMPLATES = [
    'event-invitation',
    'event-confirmation',
    'event-notification',
    'event-cancelled',
    'event-reminder',
    'ticket-generated',
    'ticket-purchased',
    'ticket-reminder',
    'appointment-reminder'
  ];

  /**
   * Vérifie si un template est un email système (auth/payment)
   * @param {string} template - Nom du template
   * @returns {boolean} True si c'est un email système
   */
  isSystemTemplate(template) {
    return EmailService.SYSTEM_TEMPLATES.includes(template);
  }

  /**
   * Envoie un email transactionnel avec retry automatique
   * @param {string} to - Email du destinataire
   * @param {string} template - Template à utiliser
   * @param {Object} data - Données du template
   * @param {Object} options - Options additionnelles (userId pour les emails utilisateur)
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendTransactionalEmail(to, template, data, options = {}) {
    try {
      await this.ensureInitialized();

      const isSystemEmail = this.isSystemTemplate(template);

      // Pour les emails utilisateur (non-système), vérifier les préférences si userId fourni
      if (!isSystemEmail && options.userId) {
        try {
          const preferencesService = require('../preferences/preferences.service');
          const preferenceCheck = await preferencesService.shouldSendNotification(options.userId, 'email');

          if (!preferenceCheck.shouldSend) {
            logger.info('Email skipped due to user preferences', {
              to,
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
                channel: 'email',
                preferenceReason: preferenceCheck.reason
              }
            };
          }

          logger.info('Email allowed by user preferences', {
            to,
            template,
            userId: options.userId,
            reason: preferenceCheck.reason
          });
        } catch (prefError) {
          // En cas d'erreur de vérification des préférences, on envoie par défaut
          logger.warn('Failed to check email preferences, sending by default', {
            to,
            template,
            userId: options.userId,
            error: prefError.message
          });
        }
      }

      const { subject, html, text } = await this.generateEmailContent(template, data, options);
      
      const mailOptions = {
        from: `"${options.fromName || 'Event Planner'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        text
      };

      const result = await this.sendEmailWithFallback(mailOptions, options);

      // Enregistrer la notification seulement pour les emails utilisateur (non-système) avec userId
      if (!isSystemEmail && options.userId) {
        try {
          const notification = await notificationRepository.createNotification({
            userId: options.userId,
            type: template,
            channel: 'email',
            subject: subject || data?.subject || null,
            content: `Email envoyé à ${to}`,
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
          logger.warn('Failed to record email notification in database', {
            to,
            template,
            error: dbError.message
          });
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to send transactional email', {
        to,
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
            type: 'email-retry',
            to,
            template,
            data,
            options: {
              ...options,
              retryCount: (options.retryCount || 0) + 1
            },
            originalError: error.message
          };

          await queueService.addEmailJob(jobData);

          logger.info('Retry job queued for failed email', {
            to,
            template,
            retryCount: jobData.options.retryCount
          });

          // Persister la notification avec statut pending (seulement pour emails utilisateur avec userId)
          if (!this.isSystemTemplate(template) && options.userId) {
            try {
              const notification = await notificationRepository.createNotification({
                userId: options.userId,
                type: template,
                channel: 'email',
                subject: data?.subject || null,
                content: `Email en attente de retry pour ${to}`,
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
              logger.warn('Failed to record pending notification in database', {
                to,
                template,
                error: dbError.message
              });
            }
          }

          return {
            success: false,
            retryQueued: true,
            error: 'Email send failed, retry queued',
            details: {
              message: error.message,
              retryCount: jobData.options.retryCount
            }
          };
        } catch (queueError) {
          logger.error('Failed to queue retry job', {
            error: queueError.message,
            to,
            template
          });
        }
      }

      return {
        success: false,
        error: 'Échec d\'envoi de l\'email transactionnel',
        details: {
          message: error.message,
          template,
          recipient: to
        }
      };
    }
  }

  /**
   * Génère le contenu d'un email avec template DB en priorité
   * @param {string} template - Nom du template
   * @param {Object} data - Données du template
   * @param {Object} options - Options
   * @returns {Promise<Object>} Contenu généré
   */
  async generateEmailContent(template, data, options = {}) {
    try {
      let html, text, subject;

      // 1. Essayer de récupérer le template depuis la DB
      const templatesService = require('../templates/templates.service');
      const dbTemplate = await templatesService.getTemplateByName(template, 'email');

      if (dbTemplate) {
        // Utiliser le template DB
        const rendered = await templatesService.renderTemplate(dbTemplate, data);
        subject = rendered.subject;
        html = rendered.htmlContent;
        text = rendered.textContent;

        console.log(`[DEBUG] Rendered template ${template} from DB (v${dbTemplate.version})`);
      } else {
        // Fallback: template filesystem
        let templateContent = this.templates.get(template);
        if (templateContent) {
          try {
            const compiledData = { ...data, ...options };
            console.log(`[DEBUG] Rendering template ${template} from filesystem with data:`, Object.keys(compiledData));
            html = renderTemplateContent(templateContent, compiledData);
            console.log(`[DEBUG] Template ${template} rendered successfully, HTML length:`, html.length);
            text = this.htmlToText(html);
            subject = data.subject || this.getDefaultSubject(template);
          } catch (templateError) {
            console.error(`[DEBUG] Template rendering failed for ${template}:`, templateError.message);
            html = this.generateFallbackHTML(template, data, options);
            text = this.htmlToText(html);
            subject = data.subject || `Notification Event Planner - ${template}`;
          }
        } else {
          if (this.templates.size === 0) {
            await this.loadTemplates();
            templateContent = this.templates.get(template);
          }

          if (templateContent) {
            const compiledData = { ...data, ...options };
            html = renderTemplateContent(templateContent, compiledData);
            text = this.htmlToText(html);
            subject = data.subject || this.getDefaultSubject(template);
            return { html, text, subject };
          }

          console.log(`[DEBUG] Template ${template} not found in DB or filesystem, using default template`);
          // Templates inline par défaut
          const defaultTemplate = this.getDefaultTemplate(template);
          html = renderTemplateContent(defaultTemplate.html, { ...data, ...options });
          text = defaultTemplate.text || this.htmlToText(html);
          subject = data.subject || defaultTemplate.subject;
        }
      }

      return { html, text, subject };
    } catch (error) {
      console.error(`[DEBUG] generateEmailContent failed for ${template}:`, error.message);
      logger.error('Failed to generate email content', {
        template,
        error: error.message,
        dataKeys: Object.keys(data)
      });

      return {
        success: false,
        error: 'Échec de génération du contenu',
        details: {
          message: error.message,
          template
        }
      };
    }
  }

  /**
   * Génère un HTML de fallback simple en cas d'erreur de template
   */
  generateFallbackHTML(template, data, options = {}) {
    const firstName = data.firstName || 'Utilisateur';
    const subject = data.subject || `Notification Event Planner - ${template}`;
    const primaryUrl =
      data.ticketAccessUrl ||
      data.ticketDownloadUrl ||
      data.responseUrl ||
      data.acceptUrl ||
      data.loginUrl ||
      data.eventUrl ||
      null;
    const secondaryUrl =
      data.ticketDownloadUrl && data.ticketDownloadUrl !== primaryUrl
        ? data.ticketDownloadUrl
        : data.responseUrl && data.responseUrl !== primaryUrl
          ? data.responseUrl
          : data.loginUrl && data.loginUrl !== primaryUrl
            ? data.loginUrl
            : null;
    const primaryLabel =
      template === 'event-invitation'
        ? "Voir l'invitation"
        : data.ticketDownloadUrl
          ? 'Telecharger'
          : 'Ouvrir';
    const secondaryLabel =
      data.ticketDownloadUrl && data.ticketDownloadUrl === secondaryUrl
        ? 'Telecharger le ticket'
        : data.responseUrl && data.responseUrl === secondaryUrl
          ? 'Repondre'
          : 'Se connecter';
    const eventName = data.eventName || data.eventTitle || options.eventName || null;
    const eventDate = data.eventDate || options.eventDate || null;
    const eventLocation = data.eventLocation || options.eventLocation || null;
    const description = data.description || options.description || null;
    const message = data.message || options.message || null;
    const organizer = data.organizerName || data.senderName || options.organizerName || null;
    const amount = data.amount || options.amount || null;
    const transactionId = data.transactionId || data.paymentReference || options.transactionId || null;
    const ticketCount = data.ticketCount || options.ticketCount || null;
    const acceptUrl = data.acceptUrl || null;
    const declineUrl = data.declineUrl || null;
    
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
        .container { background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #007bff; padding-bottom: 20px; }
        .content { margin-bottom: 30px; }
        .actions { margin: 24px 0; text-align: center; }
        .button { display: inline-block; margin: 6px; padding: 12px 20px; border-radius: 6px; background: #0f62fe; color: #fff; text-decoration: none; font-weight: 600; }
        .button-secondary { background: #3d70b2; }
        .link-box { margin-top: 20px; padding: 16px; border-radius: 8px; background: #f8fafc; }
        .link-row { margin: 8px 0; word-break: break-word; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Event Planner</h1>
            <h2>${subject}</h2>
        </div>
        
        <div class="content">
            <p>Bonjour ${firstName},</p>
            <p>Vous avez recu une notification de la plateforme Event Planner.</p>
            ${eventName ? `<p><strong>Evenement :</strong> ${eventName}</p>` : ''}
            ${eventDate ? `<p><strong>Date :</strong> ${eventDate}</p>` : ''}
            ${eventLocation ? `<p><strong>Lieu :</strong> ${eventLocation}</p>` : ''}
            ${organizer ? `<p><strong>Organisateur :</strong> ${organizer}</p>` : ''}
            ${description ? `<p><strong>Description :</strong> ${description}</p>` : ''}
            ${amount ? `<p><strong>Montant :</strong> ${amount}</p>` : ''}
            ${transactionId ? `<p><strong>Reference :</strong> ${transactionId}</p>` : ''}
            ${ticketCount ? `<p><strong>Nombre de tickets :</strong> ${ticketCount}</p>` : ''}
            ${message ? `<p><strong>Message :</strong> ${message}</p>` : ''}
            <p>Utilisez les liens ci-dessous pour ouvrir votre invitation, telecharger votre ticket ou repondre a cette notification.</p>
        </div>

        ${(primaryUrl || secondaryUrl || acceptUrl || declineUrl) ? `
        <div class="actions">
            ${primaryUrl ? `<a class="button" href="${primaryUrl}" target="_blank" rel="noopener noreferrer">${primaryLabel}</a>` : ''}
            ${secondaryUrl ? `<a class="button button-secondary" href="${secondaryUrl}" target="_blank" rel="noopener noreferrer">${secondaryLabel}</a>` : ''}
            ${acceptUrl ? `<a class="button" href="${acceptUrl}" target="_blank" rel="noopener noreferrer">Accepter</a>` : ''}
            ${declineUrl ? `<a class="button button-secondary" href="${declineUrl}" target="_blank" rel="noopener noreferrer">Decliner</a>` : ''}
        </div>` : ''}

        ${(primaryUrl || secondaryUrl || acceptUrl || declineUrl) ? `
        <div class="link-box">
            ${primaryUrl ? `<div class="link-row"><strong>${primaryLabel} :</strong> <a href="${primaryUrl}" target="_blank" rel="noopener noreferrer">Ouvrir</a></div>` : ''}
            ${secondaryUrl ? `<div class="link-row"><strong>${secondaryLabel} :</strong> <a href="${secondaryUrl}" target="_blank" rel="noopener noreferrer">Ouvrir</a></div>` : ''}
            ${acceptUrl ? `<div class="link-row"><strong>Accepter :</strong> <a href="${acceptUrl}" target="_blank" rel="noopener noreferrer">Confirmer ma presence</a></div>` : ''}
            ${declineUrl ? `<div class="link-row"><strong>Decliner :</strong> <a href="${declineUrl}" target="_blank" rel="noopener noreferrer">Refuser l'invitation</a></div>` : ''}
        </div>` : ''}

        <div class="footer">
            <p>Si vous n'arrivez pas a cliquer sur un bouton, copiez le lien correspondant dans votre navigateur.</p>
            <p>&copy; 2024 Event Planner. Tous droits reserves.</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Met en file d'attente des emails en masse
   * @param {Array} recipients - Liste des destinataires
   * @param {string} template - Template à utiliser
   * @param {Object} data - Données du template
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de la mise en queue
   */
  async queueBulkEmail(recipients, template, data, options = {}) {
    try {
      const queueService = require('../queues/queue.service');
      
      const jobData = {
        type: 'bulk-email',
        recipients,
        template,
        data,
        options,
        createdAt: new Date().toISOString()
      };

      const result = await queueService.addEmailJob(jobData);
      
      logger.email('Bulk email queued', {
        template,
        recipientsCount: recipients.length,
        jobId: result.jobId
      });

      return result;
    } catch (error) {
      logger.error('Failed to queue bulk email', {
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
   * Envoie un email de bienvenue
   * @param {string} to - Email du destinataire
   * @param {Object} userData - Données utilisateur
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendWelcomeEmail(to, userData, options = {}) {
    return await this.sendTransactionalEmail(to, 'welcome', {
      user: userData,
      loginUrl: options.loginUrl || 'https://app.eventplanner.com/login'
    }, options);
  }

  /**
   * Envoie un email de réinitialisation de mot de passe
   * @param {string} to - Email du destinataire
   * @param {string} resetToken - Token de réinitialisation
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendPasswordResetEmail(to, resetToken, options = {}) {
    return await this.sendTransactionalEmail(to, 'password-reset', {
      resetToken,
      resetUrl: options.resetUrl || `https://app.eventplanner.com/reset-password?token=${resetToken}`,
      expiresIn: options.expiresIn || '1 heure'
    }, options);
  }

  /**
   * Envoie un email de confirmation d'événement
   * @param {string} to - Email du destinataire
   * @param {Object} eventData - Données de l'événement
   * @param {Object} ticketData - Données du ticket
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendEventConfirmationEmail(to, eventData, ticketData, options = {}) {
    return await this.sendTransactionalEmail(to, 'event-confirmation', {
      event: eventData,
      ticket: ticketData,
      viewTicketUrl: options.viewTicketUrl || `https://app.eventplanner.com/tickets/${ticketData.id}`
    }, options);
  }

  /**
   * Envoie un email de notification d'événement
   * @param {string} to - Email du destinataire
   * @param {Object} eventData - Données de l'événement
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendEventNotificationEmail(to, eventData, options = {}) {
    return await this.sendTransactionalEmail(to, 'event-notification', {
      event: eventData,
      notificationType: options.type || 'reminder'
    }, options);
  }

  /**
   * Détermine si une erreur est retryable
   * @param {Error} error - L'erreur à analyser
   * @returns {boolean} True si l'erreur est retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'SMTP_CONNECTION_FAILED',
      'SENDGRID_API_ERROR',
      'EMAIL_SEND_FAILED',
      'TEMPLATE_RENDER_FAILED',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNRESET'
    ];

    const errorMessage = error.message || error.code || '';
    return retryableErrors.some(retryableError => errorMessage.includes(retryableError));
  }

  /**
   * Convertit du HTML en texte brut
   * @param {string} html - Contenu HTML
   * @returns {string} Texte brut
   */
  htmlToText(html) {
    if (!html) return '';
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Récupère le sujet par défaut pour un template
   * @param {string} template - Nom du template
   * @returns {string} Sujet par défaut
   */
  getDefaultSubject(template) {
    const subjects = {
      'welcome': 'Bienvenue sur Event Planner !',
      'email-verification': 'Votre code de verification Event Planner',
      'password-reset': 'Reinitialisation de votre mot de passe',
      'event-confirmation': 'Confirmation de votre inscription',
      'event-invitation': 'Vous etes invite a un evenement',
      'event-notification': 'Notification evenement',
      'ticket-reminder': 'Rappel de votre evenement'
    };
    
    return subjects[template] || 'Notification Event Planner';
  }

  /**
   * Récupère le template par défaut
   * @param {string} template - Nom du template
   * @returns {Object} Template par défaut
   */
  getDefaultTemplate(template) {
    const templates = {
      'welcome': {
        subject: 'Bienvenue sur Event Planner !',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">Bienvenue {{user.first_name}} !</h2>
            <p>Merci de vous etre inscrit sur Event Planner.</p>
            <p>Votre compte a ete cree avec succes.</p>
            <p><a href="{{loginUrl}}" style="background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Me connecter</a></p>
          </div>
        `
      },
      'email-verification': {
        subject: 'Votre code de verification Event Planner',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
            <div style="padding: 24px; border: 1px solid #dbe5f0; border-radius: 12px; background: #ffffff;">
              <p style="margin: 0 0 12px; color: #4b5563;">Bonjour {{firstName}},</p>
              <h2 style="margin: 0 0 12px; color: #0f172a;">Confirmez votre adresse email</h2>
              <p style="margin: 0 0 20px; line-height: 1.6;">
                Utilisez ce code de verification pour finaliser votre inscription sur Event Planner.
              </p>
              <div style="margin: 0 0 20px; padding: 18px; text-align: center; border-radius: 10px; background: #eff6ff; border: 1px solid #bfdbfe;">
                <div style="font-size: 28px; letter-spacing: 8px; font-weight: 700; color: #1d4ed8;">{{otpCode}}</div>
              </div>
              <p style="margin: 0 0 8px; line-height: 1.6;">
                Ce code expire dans {{expiresInMinutes}} minutes.
              </p>
              <p style="margin: 0; color: #6b7280; line-height: 1.6;">
                Si vous n'etes pas a l'origine de cette inscription, ignorez simplement cet email.
              </p>
            </div>
          </div>
        `
      },
      'password-reset': {
        subject: 'Reinitialisation de votre mot de passe',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e74c3c;">Reinitialisation du mot de passe</h2>
            <p>Vous avez demande la reinitialisation de votre mot de passe.</p>
            <p>Cliquez sur le lien ci-dessous pour reinitialiser votre mot de passe :</p>
            <p><a href="{{resetUrl}}" style="background: #e74c3c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reinitialiser</a></p>
            <p>Ce lien expirera dans {{expiresIn}}.</p>
          </div>
        `
      },
      'event-confirmation': {
        subject: 'Confirmation d\'inscription a {{event.title}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #27ae60;">Inscription confirmee !</h2>
            <p>Votre inscription a l'evenement <strong>{{event.title}}</strong> a ete confirmee.</p>
            <p><strong>Date:</strong> {{event.eventDate}}</p>
            <p><strong>Lieu:</strong> {{event.location}}</p>
            <p><strong>Type de ticket:</strong> {{ticket.type}}</p>
            <p><a href="{{viewTicketUrl}}" style="background: #27ae60; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Voir mon ticket</a></p>
          </div>
        `
      }
    };
    
    return templates[template] || {
      subject: 'Notification Event Planner',
      html: '<p>Notification Event Planner</p>'
    };
  }

  /**
   * Vérifie la santé du service email
   * @returns {Promise<Object>} État de santé du service
   */
  async healthCheck() {
    try {
      const results = {
        smtp: { configured: this.smtpConfigured, status: 'unknown' },
        sendgrid: { configured: this.sendgridConfigured, status: 'unknown' }
      };

      // Tester SMTP
      if (this.smtpConfigured && this.smtpTransporter) {
        try {
          await this.smtpTransporter.verify();
          results.smtp.status = 'healthy';
        } catch (error) {
          results.smtp.status = 'unhealthy';
          results.smtp.error = error.message;
        }
      }

      // Tester SendGrid
      if (this.sendgridConfigured) {
        results.sendgrid.status = 'healthy';
      }

      const overallHealthy = (this.smtpConfigured && results.smtp.status === 'healthy') ||
                           (this.sendgridConfigured && results.sendgrid.status === 'healthy');

      return {
        success: true,
        healthy: overallHealthy,
        providers: results,
        templates: this.templates.size
      };
    } catch (error) {
      logger.error('Email service health check failed', { error: error.message });
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
      mockDeliveryEnabled: isMockEmailDeliveryEnabled(),
      providers: {
        smtp: {
          configured: this.smtpConfigured,
          host: sanitizeProviderValue(process.env.SMTP_HOST),
          port: process.env.SMTP_PORT
        },
        sendgrid: {
          configured: this.sendgridConfigured
        }
      },
      templates: {
        loaded: this.templates.size,
        available: Array.from(this.templates.keys())
      }
    };
  }
}

module.exports = new EmailService();
