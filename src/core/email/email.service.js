const nodemailer = require('nodemailer');
const sendgridMail = require('@sendgrid/mail');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');

/**
 * Service d'envoi d'emails transactionnels
 * Utilise Nodemailer (SMTP) + SendGrid fallback avec templates Handlebars
 */
class EmailService {
  constructor() {
    this.smtpTransporter = null;
    this.sendgridClient = null;
    this.smtpConfigured = false;
    this.sendgridConfigured = false;
    this.templates = new Map();
    this.initialize();
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
    }
  }

  /**
   * Vérifie si SMTP est configuré
   */
  isSMTPConfigured() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  /**
   * Charge les templates Handlebars depuis le système de fichiers
   */
  async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, '../templates/email');
      
      // Vérifier si le répertoire existe
      try {
        await fs.access(templatesDir);
      } catch {
        logger.warn('Email templates directory not found, using inline templates');
        return;
      }

      const files = await fs.readdir(templatesDir);
      
      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const templateName = path.basename(file, '.hbs');
          const templateContent = await fs.readFile(path.join(templatesDir, file), 'utf8');
          this.templates.set(templateName, handlebars.compile(templateContent));
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

    // Aucun service disponible
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.warn('Email fallback - no service configured', {
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      return { success: false, fallback: true, reason: 'No email service configured' };
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
   * Envoie un email transactionnel
   * @param {string} to - Email du destinataire
   * @param {string} template - Template à utiliser
   * @param {Object} data - Données du template
   * @param {Object} options - Options additionnelles
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendTransactionalEmail(to, template, data, options = {}) {
    try {
      const { subject, html, text } = await this.generateEmailContent(template, data, options);
      
      const mailOptions = {
        from: `"${options.fromName || 'Event Planner'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        text
      };

      const result = await this.sendEmailWithFallback(mailOptions, options);

      logger.email('Transactional email sent', {
        to,
        template,
        provider: result.provider,
        messageId: result.messageId,
        ip: options.ip
      });

      return result;
    } catch (error) {
      logger.error('Failed to send transactional email', {
        to,
        template,
        error: error.message,
        ip: options.ip
      });
      
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
   * Génère le contenu de l'email
   * @param {string} template - Nom du template
   * @param {Object} data - Données du template
   * @param {Object} options - Options
   * @returns {Promise<Object>} Contenu généré
   */
  async generateEmailContent(template, data, options = {}) {
    try {
      let html, text, subject;

      // Utiliser le template Handlebars si disponible
      const templateFn = this.templates.get(template);
      if (templateFn) {
        html = templateFn({ ...data, ...options });
        text = this.htmlToText(html);
        subject = data.subject || this.getDefaultSubject(template);
      } else {
        // Templates inline par défaut
        const defaultTemplate = this.getDefaultTemplate(template);
        const compiledTemplate = handlebars.compile(defaultTemplate.html);
        html = compiledTemplate({ ...data, ...options });
        text = defaultTemplate.text || this.htmlToText(html);
        subject = data.subject || defaultTemplate.subject;
      }

      return { html, text };
    } catch (error) {
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
   * Convertit HTML en texte brut
   * @param {string} html - Contenu HTML
   * @returns {string} Texte brut
   */
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '') // Supprimer les balises HTML
      .replace(/\s+/g, ' ') // Normaliser les espaces
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
