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
    template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'event-notification', 'ticket-reminder').required().messages({
      'any.only': 'Le template doit être l\'un des suivants: welcome, password-reset, event-confirmation, event-notification, ticket-reminder',
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
    template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'otp', 'event-notification').required().messages({
      'any.only': 'Le template doit être l\'un des suivants: welcome, password-reset, event-confirmation, otp, event-notification',
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
      template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'event-notification', 'ticket-reminder').required(),
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
      template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'otp', 'event-notification').required(),
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
      template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'event-notification', 'ticket-reminder').required(),
      data: Joi.object().required()
    })).optional(),
    sms: Joi.array().items(Joi.object({
      to: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
      template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'otp', 'event-notification').required(),
      data: Joi.object().required()
    })).optional()
  }).or('emails', 'sms').messages({
    'object.missing': 'Au moins un tableau d\'emails ou de SMS est requis'
  }),

  // Schémas pour les paramètres de route
  params: {
    notificationId: Joi.string().uuid().required().messages({
      'string.uuid': 'L\'ID de notification doit être un UUID valide',
      'any.required': 'L\'ID de notification est requis'
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
    const data = req[source];
    
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
    req[source] = { ...req[source], ...value };
    
    logger.validation('Validation passed', {
      source,
      fields: Object.keys(value),
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
