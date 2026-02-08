const Joi = require('joi');
const { validationErrorResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Middleware de validation avec Joi
 *
 * Aligné sur :
 *   1. Schema SQL (notification_templates, notifications, notification_preferences, notification_logs)
 *   2. Repository / Service / Controller
 */

/**
 * Schémas de validation pour les différentes requêtes
 */
const schemas = {
  // ========================================
  // EMAIL
  // ========================================

  // Validation pour l'envoi d'email
  // Controller: const { to, template, data, options } = req.body
  sendEmail: Joi.object({
    to: Joi.string().email().required().messages({
      'string.email': 'L\'email du destinataire doit être valide',
      'any.required': 'L\'email du destinataire est requis'
    }),
    template: Joi.string().valid(
      'welcome',
      'account-activated',
      'account-suspended',
      'email-verification',
      'password-reset',
      'password-changed',
      'event-confirmation',
      'event-notification',
      'event-cancelled',
      'event-reminder',
      'event-invitation',
      'payment-confirmation',
      'payment-failed',
      'ticket-generated',
      'ticket-purchased',
      'ticket-reminder',
      'security-alert',
      'refund-processed',
      'fraud-detected',
      'daily-scan-report',
      'appointment-reminder',
      'test-simple',
      'refund-processed-simple',
      'payment-failed-simple',
      'fraud-detected-simple'
    ).required().messages({
      'any.only': 'Le template spécifié n\'est pas valide',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    }),
    options: Joi.object({
      fromName: Joi.string().max(100).optional(),
      priority: Joi.string().valid('low', 'normal', 'high').optional()
    }).optional()
  }),

  // ========================================
  // SMS
  // ========================================

  // Validation pour l'envoi de SMS
  // Controller sendSMS: const { to, template, data, options } = req.body
  // Controller queueSMS: const { to, template, data, options } = req.body
  sendSMS: Joi.object({
    to: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required().messages({
      'string.pattern.base': 'Le numéro de téléphone doit être valide',
      'any.required': 'Le numéro de téléphone est requis'
    }),
    template: Joi.string().valid(
      'otp',
      'appointment-reminder',
      'payment-confirmation',
      'security-alert'
    ).required().messages({
      'any.only': 'Le template SMS doit être l\'un des suivants: otp, appointment-reminder, payment-confirmation, security-alert',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    })
  }),

  // ========================================
  // BULK
  // ========================================

  // Validation pour l'envoi en lot d'emails
  // Controller: const { recipients, template, data, options } = req.body
  // emailService.queueBulkEmail(recipients, template, data, options)
  sendBulkEmail: Joi.object({
    recipients: Joi.array().items(
      Joi.string().email()
    ).min(1).max(100).required().messages({
      'array.min': 'Au moins un destinataire est requis',
      'array.max': 'Maximum 100 destinataires par requête',
      'any.required': 'La liste des destinataires est requise'
    }),
    template: Joi.string().valid(
      'welcome',
      'account-activated',
      'password-reset',
      'event-confirmation',
      'event-notification',
      'event-cancelled',
      'payment-confirmation',
      'payment-failed',
      'ticket-generated',
      'ticket-reminder',
      'security-alert',
      'event-invitation',
      'refund-processed',
      'fraud-detected',
      'daily-scan-report'
    ).required().messages({
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    }),
    options: Joi.object({
      fromName: Joi.string().max(100).optional(),
      priority: Joi.string().valid('low', 'normal', 'high').optional()
    }).optional()
  }),

  // Validation pour l'envoi en lot de SMS (pas de route dédiée, mais gardé pour cohérence)
  sendBulkSMS: Joi.object({
    recipients: Joi.array().items(
      Joi.string().pattern(/^[+]?[\d\s-()]+$/)
    ).min(1).max(100).required().messages({
      'array.min': 'Au moins un destinataire est requis',
      'array.max': 'Maximum 100 destinataires par requête'
    }),
    template: Joi.string().valid(
      'otp',
      'appointment-reminder',
      'payment-confirmation',
      'security-alert'
    ).required(),
    data: Joi.object().required()
  }),

  // Validation pour l'envoi mixte en lot
  // Controller: const { recipients, template, data, options } = req.body
  // queueService.addBulkJob({ type: options.type, recipients, template, data, options })
  sendBulkMixed: Joi.object({
    recipients: Joi.array().items(
      Joi.string().required()
    ).min(1).max(100).required().messages({
      'array.min': 'Au moins un destinataire est requis',
      'array.max': 'Maximum 100 destinataires par requête'
    }),
    template: Joi.string().required().messages({
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données sont requises'
    }),
    options: Joi.object({
      type: Joi.string().valid('email', 'sms', 'both').optional()
    }).optional()
  }),

  // ========================================
  // PUSH
  // ========================================

  // Validation pour l'envoi de notification push
  // Controller: const { token, template, data, options } = req.body
  sendPush: Joi.object({
    token: Joi.string().min(10).required().messages({
      'string.min': 'Le token push doit contenir au moins 10 caractères',
      'any.required': 'Le token push est requis'
    }),
    template: Joi.string().valid(
      'event-reminder', 'ticket-confirmation', 'payment-success', 'custom'
    ).required().messages({
      'any.only': 'Le template push doit être l\'un des suivants: event-reminder, ticket-confirmation, payment-success, custom',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    }),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').optional(),
      sound: Joi.string().optional(),
      badge: Joi.number().integer().min(0).optional(),
      ttl: Joi.number().integer().min(0).optional()
    }).optional()
  }),

  // Validation pour l'envoi en lot de notifications push
  // Controller: const { tokens, template, data, options } = req.body
  sendBulkPush: Joi.object({
    tokens: Joi.array().items(
      Joi.string().min(10)
    ).min(1).max(500).required().messages({
      'array.min': 'Au moins un token push est requis',
      'array.max': 'Maximum 500 tokens par requête'
    }),
    template: Joi.string().valid(
      'event-reminder', 'ticket-confirmation', 'payment-success', 'custom'
    ).required(),
    data: Joi.object().required(),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').optional(),
      sound: Joi.string().optional(),
      badge: Joi.number().integer().min(0).optional()
    }).optional()
  }),

  // ========================================
  // IN-APP NOTIFICATIONS
  // ========================================

  // Validation pour la création de notification in-app
  // Controller: const { userId, type, title, message } = req.body
  // in-app.service: INSERT INTO notifications (user_id, template_id, type, channel, subject, content, ...)
  // Schema: user_id UUID NOT NULL, type VARCHAR(50) NOT NULL, subject VARCHAR(255), content TEXT
  createInAppNotification: Joi.object({
    userId: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.number().integer().positive()
    ).required().messages({
      'alternatives.match': 'L\'ID utilisateur doit être un UUID valide ou un nombre entier positif',
      'any.required': 'L\'ID utilisateur est requis'
    }),
    type: Joi.string().valid('info', 'success', 'warning', 'error', 'event', 'payment', 'system').required().messages({
      'any.only': 'Le type doit être l\'un des suivants: info, success, warning, error, event, payment, system',
      'any.required': 'Le type est requis'
    }),
    title: Joi.string().min(1).max(255).required().messages({
      'string.max': 'Le titre ne peut dépasser 255 caractères',
      'any.required': 'Le titre est requis'
    }),
    message: Joi.string().max(2000).optional()
  }),

  // Validation pour marquer comme lu
  // Controller: const { userId } = req.body
  markAsRead: Joi.object({
    userId: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.number().integer().positive()
    ).optional()
  }),

  // Validation pour marquer tout comme lu
  // Controller: const { type } = req.body
  markAllAsRead: Joi.object({
    type: Joi.string().valid('info', 'success', 'warning', 'error', 'event', 'payment', 'system').optional()
  }),

  // Validation pour suppression de notification in-app
  // Controller: const { userId } = req.body
  deleteInAppNotification: Joi.object({
    userId: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.number().integer().positive()
    ).optional()
  }),

  // ========================================
  // PREFERENCES
  // ========================================

  // Validation pour mise à jour des préférences utilisateur
  // Controller: const preferences = req.body -> preferencesService.updateUserPreferences(userId, preferences)
  // Service: const { channels = {} } = preferences; channels keys: 'email', 'sms', 'push', 'in_app'
  // Schema: notification_preferences (user_id, channel CHECK IN ('email','sms','push','in_app'), is_enabled BOOLEAN)
  updateUserPreferences: Joi.object({
    channels: Joi.object({
      email: Joi.boolean().optional(),
      sms: Joi.boolean().optional(),
      push: Joi.boolean().optional(),
      in_app: Joi.boolean().optional()
    }).min(1).required().messages({
      'object.min': 'Au moins un canal doit être spécifié',
      'any.required': 'L\'objet channels est requis'
    })
  }),

  // Validation pour le désabonnement
  // Controller: const { userId } = req.body -> preferencesService.unsubscribeUser(userId)
  unsubscribeUser: Joi.object({
    userId: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.number().integer().positive()
    ).required().messages({
      'alternatives.match': 'L\'ID utilisateur doit être un UUID valide ou un nombre entier positif',
      'any.required': 'L\'ID utilisateur est requis'
    })
  }),

  // ========================================
  // TEMPLATES
  // ========================================

  // Validation pour la création de template
  // Controller: const templateData = req.body -> templatesService.createTemplate(templateData)
  // Service: const { name, channel, subjectTemplate, bodyTemplate, variables } = templateData
  // Schema: notification_templates (name VARCHAR(100), channel CHECK IN ('email','sms','push'),
  //         subject_template VARCHAR(255), body_template TEXT, variables JSONB)
  createTemplate: Joi.object({
    name: Joi.string().min(3).max(100).required().messages({
      'string.min': 'Le nom du template doit contenir au moins 3 caractères',
      'any.required': 'Le nom du template est requis'
    }),
    channel: Joi.string().valid('email', 'sms', 'push').required().messages({
      'any.only': 'Le canal doit être email, sms ou push',
      'any.required': 'Le canal est requis'
    }),
    subjectTemplate: Joi.string().max(255).optional().messages({
      'string.max': 'Le sujet ne peut dépasser 255 caractères'
    }),
    bodyTemplate: Joi.string().optional(),
    variables: Joi.alternatives().try(
      Joi.object(),
      Joi.array().items(Joi.string())
    ).optional()
  }),

  // Validation pour la mise à jour de template
  // Controller: const updates = req.body -> templatesService.updateTemplate(templateId, updates)
  // Service allowedFields: subject_template (subjectTemplate), body_template (bodyTemplate), variables, channel
  updateTemplate: Joi.object({
    channel: Joi.string().valid('email', 'sms', 'push').optional(),
    subjectTemplate: Joi.string().max(255).optional(),
    bodyTemplate: Joi.string().optional(),
    variables: Joi.alternatives().try(
      Joi.object(),
      Joi.array().items(Joi.string())
    ).optional()
  }).min(1).messages({
    'object.min': 'Au moins un champ à mettre à jour est requis'
  }),

  // Validation pour l'aperçu de template
  // Controller: const { data, channel } = req.body
  previewTemplate: Joi.object({
    data: Joi.object().required().messages({
      'any.required': 'Les données de prévisualisation sont requises'
    }),
    channel: Joi.string().valid('email', 'sms', 'push').optional()
  }),

  // Validation pour l'import de templates
  importTemplates: Joi.object({
    templatesDir: Joi.string().optional(),
    overwrite: Joi.boolean().default(false).optional()
  }),

  // ========================================
  // PARAMS
  // ========================================

  // Schémas pour les paramètres de route
  params: {
    // Schema: notifications.id = BIGSERIAL (integer)
    notificationId: Joi.object({
      notificationId: Joi.alternatives().try(
        Joi.string().pattern(/^\d+$/),
        Joi.number().integer().positive()
      ).required().messages({
        'alternatives.match': 'L\'ID de notification doit être un nombre entier positif',
        'any.required': 'L\'ID de notification est requis'
      })
    }),
    // Schema: user_id UUID NOT NULL (peut aussi être integer selon contexte)
    userId: Joi.object({
      userId: Joi.alternatives().try(
        Joi.string().uuid(),
        Joi.number().integer().positive()
      ).required().messages({
        'alternatives.match': 'L\'ID utilisateur doit être un UUID valide ou un nombre entier positif',
        'any.required': 'L\'ID utilisateur est requis'
      })
    }),
    templateName: Joi.object({
      name: Joi.string().min(1).max(100).required().messages({
        'any.required': 'Le nom du template est requis'
      })
    }),
    // Schema: notification_templates.id = BIGSERIAL (integer)
    templateId: Joi.object({
      templateId: Joi.alternatives().try(
        Joi.string().pattern(/^\d+$/),
        Joi.number().integer().positive()
      ).required().messages({
        'alternatives.match': 'L\'ID du template doit être un nombre entier positif',
        'any.required': 'L\'ID du template est requis'
      })
    })
  },

  // ========================================
  // QUERY PARAMS (for GET endpoints)
  // ========================================

  // Validation pour l'historique
  // Controller: const { page, limit, type, status, channel, userId, startDate, endDate, orderBy, orderDirection } = req.query
  getHistory: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    type: Joi.string().optional(),
    status: Joi.string().valid('pending', 'sent', 'failed').optional(),
    channel: Joi.string().valid('email', 'sms', 'push', 'in_app').optional(),
    userId: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    orderBy: Joi.string().valid('created_at', 'sent_at', 'status', 'type', 'channel').default('created_at'),
    orderDirection: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC')
  }),

  // Validation pour les statistiques
  // Controller: const { period, startDate, endDate, userId } = req.query
  getStatistics: Joi.object({
    period: Joi.string().valid('1d', '7d', '30d', '90d').default('7d'),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    userId: Joi.string().optional()
  }),

  // Validation pour le nettoyage des queues
  cleanQueues: Joi.object({
    olderThan: Joi.number().integer().min(1).max(168).default(24),
    status: Joi.string().valid('completed', 'failed', 'all').default('completed'),
    limit: Joi.number().integer().min(1).max(10000).default(1000)
  })
};

/**
 * 🔧 MIDDLEWARE DE VALIDATION PRINCIPAL
 * 
 * @param {Object} schema - Schéma Joi de validation
 * @param {string} source - Source des données ('body', 'params', 'query')
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source] || {};
    
    // Permettre les champs injectés par le contexte
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: true, // Permettre les champs injectés par le contexte
      stripUnknown: false // Ne pas supprimer les champs injectés
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.validation('Validation failed', {
        source,
        errors,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(400).json(
        validationErrorResponse(errors)
      );
    }

    // Fusionner les données validées avec les données existantes
    req[source] = req[source] || {};
    const safeValue = value || {};
    
    req[source] = { ...req[source], ...safeValue };
    
    logger.validation('Validation passed', {
      source,
      fields: Object.keys(safeValue),
      ip: req.ip
    });

    next();
  };
}

/**
 * 🔍 MIDDLEWARE VALIDATION PARAMS
 * 
 * @param {Object} schema - Schéma Joi de validation
 */
function validateParams(schema) {
  return validate(schema, 'params');
}

/**
 * 📄 MIDDLEWARE VALIDATION BODY
 *
 * @param {Object} schema - Schéma Joi de validation
 */
function validateBody(schema) {
  return validate(schema, 'body');
}

/**
 * 🔍 MIDDLEWARE VALIDATION QUERY
 *
 * @param {Object} schema - Schéma Joi de validation
 */
function validateQuery(schema) {
  return validate(schema, 'query');
}

/**
 * 📧 MIDDLEWARE VALIDATION EMAIL
 */
function validateEmail(req, res, next) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (req.body.to && !emailRegex.test(req.body.to)) {
    return res.status(400).json(
      validationErrorResponse([{
        field: 'to',
        message: 'L\'email fourni n\'est pas valide',
        value: req.body.to
      }])
    );
  }
  
  next();
}

/**
 * 📱 MIDDLEWARE VALIDATION PHONE
 */
function validatePhoneNumber(req, res, next) {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  
  if (req.body.phoneNumber && !phoneRegex.test(req.body.phoneNumber)) {
    return res.status(400).json(
      validationErrorResponse([{
        field: 'phoneNumber',
        message: 'Le numéro de téléphone doit être au format international (+33612345678)',
        value: req.body.phoneNumber
      }])
    );
  }
  
  next();
}

module.exports = {
  validate,
  validateParams,
  validateBody,
  validateQuery,
  validateEmail,
  validatePhoneNumber,
  schemas
};
