const nodemailer = require('nodemailer');
const sendgridMail = require('@sendgrid/mail');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');
const notificationRepository = require('../database/notification.repository');

function getValueByPath(obj, pathStr) {
  if (!pathStr) return undefined;
  return pathStr.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function parseTokens(expr) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  let match;
  while ((match = re.exec(expr)) !== null) {
    if (match[1] !== undefined) tokens.push(match[1]);
    else if (match[2] !== undefined) tokens.push(match[2]);
    else tokens.push(match[3]);
  }
  return tokens;
}

function evaluateCondition(expr, data) {
  const trimmed = expr.trim();
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1).trim();
    const tokens = parseTokens(inner);
    const op = tokens[0];
    if (op === 'eq') {
      const left = getValueByPath(data, tokens[1]) ?? tokens[1];
      const right = getValueByPath(data, tokens[2]) ?? tokens[2];
      return String(left) === String(right);
    }
    if (op === 'gt') {
      const leftVal = getValueByPath(data, tokens[1]) ?? tokens[1];
      const rightVal = getValueByPath(data, tokens[2]) ?? tokens[2];
      const left = Number(leftVal);
      const right = Number(rightVal);
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      return left > right;
    }
    return false;
  }

  const value = getValueByPath(data, trimmed);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return Boolean(value);
}

function renderTemplateContent(template, data) {
  if (!template) return '';
  let output = template;

  const ifBlockRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  let safety = 0;
  while (ifBlockRegex.test(output) && safety < 50) {
    safety += 1;
    output = output.replace(ifBlockRegex, (match, condition, content) => {
      return evaluateCondition(condition, data) ? content : '';
    });
  }

  output = output.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key) => {
    const value = getValueByPath(data, key);
    return value === undefined || value === null ? '' : String(value);
  });

  return output;
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
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
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
      if (process.env.SENDGRID_API_KEY) {
        sendgridMail.setApiKey(process.env.SENDGRID_API_KEY);
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
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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

    // Aucun service disponible : en dev/test on mocke pour ne pas bloquer les workflows
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      const responseTime = Date.now() - startTime;
      logger.warn('Email mock - no provider configured', {
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      return {
        success: true,
        provider: 'mock',
        messageId: `mock-email-${Date.now()}`,
        responseTime,
        fallback: true
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
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Event Planner</h1>
            <h2>${subject}</h2>
        </div>
        
        <div class="content">
            <p>Bonjour ${firstName},</p>
            <p>Ceci est une notification concernant votre compte Event Planner.</p>
            <p>Type de notification: <strong>${template}</strong></p>
            
            ${data.description ? `<p>Description: ${data.description}</p>` : ''}
            ${data.amount ? `<p>Montant: ${data.amount} ${data.currency || 'EUR'}</p>` : ''}
            ${data.eventName ? `<p>Événement: ${data.eventName}</p>` : ''}
            ${data.transactionId ? `<p>Transaction: ${data.transactionId}</p>` : ''}
            ${data.ticketCount ? `<p>Tickets: ${data.ticketCount}</p>` : ''}
            
            <p>Pour plus d'informations, connectez-vous à votre compte Event Planner.</p>
        </div>
        
        <div class="footer">
            <p>Merci de votre confiance dans Event Planner.</p>
            <p>© 2024 Event Planner. Tous droits réservés.</p>
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
      'password-reset': 'Réinitialisation de votre mot de passe',
      'event-confirmation': 'Confirmation de votre inscription',
      'event-notification': 'Notification d\'événement',
      'ticket-reminder': 'Rappel de votre événement'
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
            <p>Merci de vous être inscrit sur Event Planner.</p>
            <p>Votre compte a été créé avec succès.</p>
            <p><a href="{{loginUrl}}" style="background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Me connecter</a></p>
          </div>
        `
      },
      'password-reset': {
        subject: 'Réinitialisation de votre mot de passe',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e74c3c;">Réinitialisation du mot de passe</h2>
            <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
            <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe:</p>
            <p><a href="{{resetUrl}}" style="background: #e74c3c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Réinitialiser</a></p>
            <p>Ce lien expirera dans {{expiresIn}}.</p>
          </div>
        `
      },
      'event-confirmation': {
        subject: 'Confirmation d\'inscription à {{event.title}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #27ae60;">Inscription confirmée !</h2>
            <p>Votre inscription à l'événement <strong>{{event.title}}</strong> a été confirmée.</p>
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
      providers: {
        smtp: {
          configured: this.smtpConfigured,
          host: process.env.SMTP_HOST,
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
