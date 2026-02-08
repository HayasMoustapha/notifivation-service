const Joi = require('joi');
const { validationErrorResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Middleware de validation avec Joi
 */

/**
 * Schémas de validation pour les différentes requêtes
 */
const schemas = {
  // Validation pour l'envoi d'email
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
      'any.only': 'Le template doit être l\'un des suivants: welcome, account-activated, account-suspended, email-verification, password-reset, password-changed, event-confirmation, event-notification, event-cancelled, event-reminder, event-invitation, payment-confirmation, payment-failed, ticket-generated, ticket-purchased, ticket-reminder, security-alert, refund-processed, fraud-detected, daily-scan-report, appointment-reminder, test-simple, refund-processed-simple, payment-failed-simple, fraud-detected-simple',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    }),
    options: Joi.object({
      fromName: Joi.string().max(100).optional().messages({
        'string.max': 'Le nom de l\'expéditeur ne peut dépasser 100 caractères'
      }),
      priority: Joi.string().valid('low', 'normal', 'high').optional().messages({
        'any.only': 'La priorité doit être l\'une des suivantes: low, normal, high'
      })
    }).optional()
  }),

  // Validation pour l'envoi de SMS
  sendSMS: Joi.object({
    to: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required().messages({
      'string.pattern.base': 'Le numéro de téléphone doit être valide',
      'any.required': 'Le numéro de téléphone est requis'
    }),
    template: Joi.string().valid('otp', 'appointment-reminder', 'payment-confirmation', 'security-alert').required().messages({
      'any.only': 'Le template doit être l\'un des suivants: otp, appointment-reminder, payment-confirmation, security-alert',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    })
  }),

  // Validation pour l'envoi en lot d'emails
  sendBulkEmail: Joi.object({
    emails: Joi.array().items(Joi.object({
      to: Joi.string().email().required(),
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
      ).required(),
      data: Joi.object().required()
    })).min(1).max(100).required().messages({
      'array.min': 'Au moins un email est requis',
      'array.max': 'Maximum 100 emails par requête'
    })
  }),

  // Validation pour l'envoi en lot de SMS
  sendBulkSMS: Joi.object({
    sms: Joi.array().items(Joi.object({
      to: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
      template: Joi.string().valid('otp', 'appointment-reminder', 'payment-confirmation', 'security-alert').required(),
      data: Joi.object().required()
    })).min(1).max(100).required().messages({
      'array.min': 'Au moins un SMS est requis',
      'array.max': 'Maximum 100 SMS par requête'
    })
  }),

  // Validation pour l'envoi mixte en lot
  sendBulkMixed: Joi.object({
    emails: Joi.array().items(Joi.object({
      to: Joi.string().email().required(),
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
      ).required(),
      data: Joi.object().required()
    })).optional(),
    sms: Joi.array().items(Joi.object({
      to: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
      template: Joi.string().valid('otp', 'appointment-reminder', 'payment-confirmation', 'security-alert').required(),
      data: Joi.object().required()
    })).optional()
  }).or('emails', 'sms').messages({
    'object.missing': 'Au moins un tableau d\'emails ou de SMS est requis'
  }),

  // Validation pour l'envoi de notification push
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
  sendBulkPush: Joi.object({
    tokens: Joi.array().items(
      Joi.string().min(10).required()
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

  // Validation pour la création de notification in-app
  createInAppNotification: Joi.object({
    userId: Joi.string().uuid().required().messages({
      'string.uuid': 'L\'ID utilisateur doit être un UUID valide',
      'any.required': 'L\'ID utilisateur est requis'
    }),
    type: Joi.string().valid('info', 'success', 'warning', 'error', 'event', 'payment', 'system').required().messages({
      'any.only': 'Le type doit être l\'un des suivants: info, success, warning, error, event, payment, system',
      'any.required': 'Le type est requis'
    }),
    title: Joi.string().min(1).max(255).required().messages({
      'any.required': 'Le titre est requis'
    }),
    message: Joi.string().max(2000).optional(),
    data: Joi.object().optional(),
    category: Joi.string().max(50).optional(),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
    expiresAt: Joi.date().iso().optional(),
    actionUrl: Joi.string().uri().max(500).optional(),
    actionText: Joi.string().max(100).optional()
  }),

  // Validation pour marquer comme lu
  markAsRead: Joi.object({
    userId: Joi.string().uuid().optional()
  }),

  // Validation pour marquer tout comme lu
  markAllAsRead: Joi.object({
    type: Joi.string().valid('info', 'success', 'warning', 'error', 'event', 'payment', 'system').optional(),
    category: Joi.string().max(50).optional()
  }),

  // Validation pour suppression de notification in-app
  deleteInAppNotification: Joi.object({
    userId: Joi.string().uuid().optional()
  }),

  // Validation pour mise à jour des préférences utilisateur
  updateUserPreferences: Joi.object({
    channels: Joi.object({
      email: Joi.boolean().optional(),
      sms: Joi.boolean().optional(),
      push: Joi.boolean().optional(),
      inApp: Joi.boolean().optional()
    }).optional(),
    eventTypes: Joi.object({
      invitations: Joi.boolean().optional(),
      reminders: Joi.boolean().optional(),
      updates: Joi.boolean().optional(),
      paymentConfirmations: Joi.boolean().optional(),
      paymentFailures: Joi.boolean().optional(),
      accountChanges: Joi.boolean().optional(),
      marketingEmails: Joi.boolean().optional(),
      systemAlerts: Joi.boolean().optional()
    }).optional(),
    timing: Joi.object({
      reminderTiming: Joi.string().valid('1h', '6h', '12h', '24h', '48h', '1w').optional(),
      quietHoursStart: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
      quietHoursEnd: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
      timezone: Joi.string().max(50).optional()
    }).optional(),
    contacts: Joi.object({
      email: Joi.string().email().optional(),
      phone: Joi.string().pattern(/^[+]?[\d\s-()]+$/).optional(),
      pushTokens: Joi.array().items(Joi.string()).optional()
    }).optional()
  }),

  // Validation pour le désabonnement
  unsubscribeUser: Joi.object({
    userId: Joi.string().uuid().required().messages({
      'any.required': 'L\'ID utilisateur est requis'
    }),
    token: Joi.string().optional()
  }),

  // Validation pour la création de template
  createTemplate: Joi.object({
    name: Joi.string().min(1).max(100).required().messages({
      'any.required': 'Le nom du template est requis'
    }),
    type: Joi.string().valid('email', 'sms').required().messages({
      'any.required': 'Le type du template est requis'
    }),
    subject: Joi.string().max(255).optional(),
    htmlContent: Joi.string().optional(),
    textContent: Joi.string().optional(),
    variables: Joi.object().optional(),
    defaultData: Joi.object().optional(),
    description: Joi.string().optional(),
    category: Joi.string().max(50).optional()
  }),

  // Validation pour la mise à jour de template
  updateTemplate: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    subject: Joi.string().max(255).optional(),
    htmlContent: Joi.string().optional(),
    textContent: Joi.string().optional(),
    variables: Joi.object().optional(),
    defaultData: Joi.object().optional(),
    description: Joi.string().optional(),
    category: Joi.string().max(50).optional(),
    isActive: Joi.boolean().optional()
  }).min(1),

  // Validation pour l'aperçu de template
  previewTemplate: Joi.object({
    data: Joi.object().required().messages({
      'any.required': 'Les données de prévisualisation sont requises'
    }),
    type: Joi.string().valid('email', 'sms').optional()
  }),

  // Validation pour l'import de templates
  importTemplates: Joi.object({
    templatesDir: Joi.string().optional(),
    overwrite: Joi.boolean().default(false).optional()
  }),

  // Schémas pour les paramètres de route
  params: {
    notificationId: Joi.object({
      notificationId: Joi.string().uuid().required().messages({
        'string.uuid': 'L\'ID de notification doit être un UUID valide',
        'any.required': 'L\'ID de notification est requis'
      })
    }),
    userId: Joi.object({
      userId: Joi.string().uuid().required().messages({
        'string.uuid': 'L\'ID utilisateur doit être un UUID valide',
        'any.required': 'L\'ID utilisateur est requis'
      })
    }),
    templateName: Joi.object({
      name: Joi.string().min(1).max(100).required().messages({
        'any.required': 'Le nom du template est requis'
      })
    }),
    templateId: Joi.object({
      templateId: Joi.string().uuid().required().messages({
        'string.uuid': 'L\'ID du template doit être un UUID valide',
        'any.required': 'L\'ID du template est requis'
      })
    })
  },

  // Validation pour l'historique
  getHistory: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    type: Joi.string().valid('email', 'sms', 'all').default('all'),
    status: Joi.string().valid('pending', 'sent', 'failed', 'delivered').optional(),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().optional()
  }),

  // Validation pour les statistiques
  getStatistics: Joi.object({
    period: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
    type: Joi.string().valid('email', 'sms', 'all').default('all'),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().optional()
  }),

  // Validation pour le nettoyage des queues
  cleanQueues: Joi.object({
    olderThan: Joi.number().integer().min(1).max(168).default(24), // en heures, max 1 semaine
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
  validateEmail,
  validatePhoneNumber,
  schemas
};
