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
      }),
      delay: Joi.number().integer().min(0).max(86400).optional().messages({
        'number.min': 'Le délai ne peut être négatif',
        'number.max': 'Le délai ne peut dépasser 86400 secondes (24h)'
      })
    }).optional()
  }),

  // Validation pour l'envoi de SMS
  sendSMS: Joi.object({
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
      'string.pattern.base': 'Le numéro de téléphone doit être au format international (+33612345678)',
      'any.required': 'Le numéro de téléphone est requis'
    }),
    template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'event-reminder', 'ticket-reminder', 'event-cancelled', 'payment-confirmation', 'otp').required().messages({
      'any.only': 'Le template doit être l\'un des suivants: welcome, password-reset, event-confirmation, event-reminder, ticket-reminder, event-cancelled, payment-confirmation, otp',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    }),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').optional().messages({
        'any.only': 'La priorité doit être l\'une des suivantes: low, normal, high'
      }),
      delay: Joi.number().integer().min(0).max(86400).optional().messages({
        'number.min': 'Le délai ne peut être négatif',
        'number.max': 'Le délai ne peut dépasser 86400 secondes (24h)'
      })
    }).optional()
  }),

  // Validation pour l'envoi en lot d'emails
  sendBulkEmail: Joi.object({
    recipients: Joi.array().items(
      Joi.string().email().messages({
        'string.email': 'L\'email du destinataire doit être valide'
      })
    ).min(1).max(1000).required().messages({
      'array.min': 'Au moins un destinataire est requis',
      'array.max': 'Maximum 1000 destinataires par lot',
      'any.required': 'La liste des destinataires est requise'
    }),
    template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'event-notification', 'ticket-reminder').required().messages({
      'any.only': 'Le template doit être l\'un des suivants: welcome, password-reset, event-confirmation, event-notification, ticket-reminder',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    }),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').optional().messages({
        'any.only': 'La priorité doit être l\'une des suivantes: low, normal, high'
      }),
      delay: Joi.number().integer().min(0).max(86400).optional().messages({
        'number.min': 'Le délai ne peut être négatif',
        'number.max': 'Le délai ne peut dépasser 86400 secondes (24h)'
      }),
      chunkSize: Joi.number().integer().min(1).max(500).optional().messages({
        'number.min': 'La taille des chunks doit être au moins 1',
        'number.max': 'La taille des chunks ne peut dépasser 500'
      })
    }).optional()
  }),

  // Validation pour l'envoi en lot de SMS
  sendBulkSMS: Joi.object({
    recipients: Joi.array().items(
      Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).messages({
        'string.pattern.base': 'Le numéro de téléphone doit être au format international (+33612345678)'
      })
    ).min(1).max(1000).required().messages({
      'array.min': 'Au moins un destinataire est requis',
      'array.max': 'Maximum 1000 destinataires par lot',
      'any.required': 'La liste des destinataires est requise'
    }),
    template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'event-reminder', 'ticket-reminder', 'event-cancelled', 'payment-confirmation', 'otp').required().messages({
      'any.only': 'Le template doit être l\'un des suivants: welcome, password-reset, event-confirmation, event-reminder, ticket-reminder, event-cancelled, payment-confirmation, otp',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    }),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').optional().messages({
        'any.only': 'La priorité doit être l\'une des suivantes: low, normal, high'
      }),
      delay: Joi.number().integer().min(0).max(86400).optional().messages({
        'number.min': 'Le délai ne peut être négatif',
        'number.max': 'Le délai ne peut dépasser 86400 secondes (24h)'
      }),
      chunkSize: Joi.number().integer().min(1).max(500).optional().messages({
        'number.min': 'La taille des chunks doit être au moins 1',
        'number.max': 'La taille des chunks ne peut dépasser 500'
      })
    }).optional()
  }),

  // Validation pour l'envoi en lot mixte (email + SMS)
  sendBulkMixed: Joi.object({
    recipients: Joi.array().items(
      Joi.object({
        email: Joi.string().email().optional().messages({
          'string.email': 'L\'email du destinataire doit être valide'
        }),
        phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
          'string.pattern.base': 'Le numéro de téléphone doit être au format international (+33612345678)'
        })
      }).or('email', 'phoneNumber').messages({
        'object.missing': 'Chaque destinataire doit avoir au moins un email ou un numéro de téléphone'
      })
    ).min(1).max(1000).required().messages({
      'array.min': 'Au moins un destinataire est requis',
      'array.max': 'Maximum 1000 destinataires par lot',
      'any.required': 'La liste des destinataires est requise'
    }),
    template: Joi.string().valid('welcome', 'password-reset', 'event-confirmation', 'event-notification', 'ticket-reminder', 'event-cancelled', 'payment-confirmation', 'otp').required().messages({
      'any.only': 'Le template doit être l\'un des suivants: welcome, password-reset, event-confirmation, event-notification, ticket-reminder, event-cancelled, payment-confirmation, otp',
      'any.required': 'Le template est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du template sont requises'
    }),
    options: Joi.object({
      type: Joi.string().valid('email', 'sms', 'both').default('both').messages({
        'any.only': 'Le type doit être l\'un des suivants: email, sms, both'
      }),
      priority: Joi.string().valid('low', 'normal', 'high').optional().messages({
        'any.only': 'La priorité doit être l\'une des suivantes: low, normal, high'
      }),
      delay: Joi.number().integer().min(0).max(86400).optional().messages({
        'number.min': 'Le délai ne peut être négatif',
        'number.max': 'Le délai ne peut dépasser 86400 secondes (24h)'
      }),
      chunkSize: Joi.number().integer().min(1).max(500).optional().messages({
        'number.min': 'La taille des chunks doit être au moins 1',
        'number.max': 'La taille des chunks ne peut dépasser 500'
      })
    }).optional()
  }),

  // Validation pour la récupération du statut d'un job
  getJobStatus: Joi.object({
    jobId: Joi.string().required().messages({
      'any.required': 'L\'ID du job est requis'
    }),
    queueName: Joi.string().valid('email', 'sms', 'bulk').default('email').messages({
      'any.only': 'Le nom de la queue doit être l\'un des suivants: email, sms, bulk'
    })
  }),

  // Validation pour l'annulation d'un job
  cancelJob: Joi.object({
    jobId: Joi.string().required().messages({
      'any.required': 'L\'ID du job est requis'
    }),
    queueName: Joi.string().valid('email', 'sms', 'bulk').default('email').messages({
      'any.only': 'Le nom de la queue doit être l\'un des suivants: email, sms, bulk'
    })
  }),

  // Validation pour le nettoyage des jobs
  cleanJobs: Joi.object({
    queueName: Joi.string().valid('email', 'sms', 'bulk').optional().messages({
      'any.only': 'Le nom de la queue doit être l\'un des suivants: email, sms, bulk'
    }),
    olderThan: Joi.number().integer().min(0).max(86400).optional().messages({
      'number.min': 'L\'âge ne peut être négatif',
      'number.max': 'L\'âge ne peut dépasser 86400 secondes (24h)'
    })
  }),

  // Validation pour les templates personnalisés
  customTemplate: Joi.object({
    name: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required().messages({
      'string.pattern.base': 'Le nom du template ne doit contenir que des lettres, chiffres, underscores et tirets',
      'any.required': 'Le nom du template est requis'
    }),
    type: Joi.string().valid('email', 'sms').required().messages({
      'any.only': 'Le type doit être email ou sms',
      'any.required': 'Le type est requis'
    }),
    subject: Joi.string().max(200).optional().messages({
      'string.max': 'Le sujet ne peut dépasser 200 caractères'
    }),
    content: Joi.string().min(1).max(10000).required().messages({
      'string.min': 'Le contenu ne peut être vide',
      'string.max': 'Le contenu ne peut dépasser 10000 caractères',
      'any.required': 'Le contenu est requis'
    }),
    variables: Joi.array().items(
      Joi.string().pattern(/^[a-zA-Z0-9_]+$/)
    ).optional().messages({
      'string.pattern.base': 'Les variables ne doivent contenir que des lettres, chiffres et underscores'
    })
  }),

  // Validation pour les webhooks
  webhook: Joi.object({
    event: Joi.string().required().messages({
      'any.required': 'L\'événement est requis'
    }),
    data: Joi.object().required().messages({
      'any.required': 'Les données du webhook sont requises'
    }),
    timestamp: Joi.date().iso().optional().messages({
      'date.format': 'Le timestamp doit être au format ISO'
    })
  })
};

/**
 * Middleware de validation
 * @param {Object} schema - Schéma Joi de validation
 * @param {string} source - Source des données ('body', 'params', 'query')
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
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

    // Remplacer les données validées dans la requête
    req[source] = value;
    
    logger.validation('Validation passed', {
      source,
      fields: Object.keys(value),
      ip: req.ip
    });

    next();
  };
}

/**
 * Middleware de validation pour les paramètres de requête
 * @param {Object} schema - Schéma Joi de validation
 */
function validateQuery(schema) {
  return validate(schema, 'query');
}

/**
 * Middleware de validation pour les paramètres de route
 * @param {Object} schema - Schéma Joi de validation
 */
function validateParams(schema) {
  return validate(schema, 'params');
}

/**
 * Middleware de validation pour le corps de la requête
 * @param {Object} schema - Schéma Joi de validation
 */
function validateBody(schema) {
  return validate(schema, 'body');
}

/**
 * Middleware de validation pour les emails
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
 * Middleware de validation pour les numéros de téléphone
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

/**
 * Middleware de validation pour les limites de taille
 * @param {number} maxSize - Taille maximale autorisée
 * @param {string} field - Champ à vérifier
 */
function validateSize(maxSize, field = 'recipients') {
  return (req, res, next) => {
    const data = req.body[field];
    
    if (Array.isArray(data) && data.length > maxSize) {
      return res.status(400).json(
        validationErrorResponse([{
          field,
          message: `Le nombre maximum autorisé est ${maxSize}`,
          value: data.length
        }])
      );
    }
    
    next();
  };
}

module.exports = {
  validate,
  validateQuery,
  validateParams,
  validateBody,
  validateEmail,
  validatePhoneNumber,
  validateSize,
  schemas
};
