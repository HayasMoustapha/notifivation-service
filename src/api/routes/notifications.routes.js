const express = require('express');
const Joi = require('joi');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const RobustAuthMiddleware = require('../../../../shared/middlewares/robust-auth-middleware');
const notificationErrorHandler = require('../../error/notification.errorHandler');
const logger = require('../../utils/logger');
const { errorResponse } = require('../../utils/response');

// Middleware de validation Joi
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: error.details[0].message,
        code: 'VALIDATION_ERROR'
      });
    }
    next();
  };
};

/**
 * Routes pour les notifications
 */

// Apply robust authentication to all routes
router.use(RobustAuthMiddleware.authenticate());

// Apply error handler for all routes
router.use(notificationErrorHandler);

// POST /api/notifications/email - Envoyer un email transactionnel
router.post('/email',
  validate(Joi.object({
    to: Joi.string().email().required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendEmail
);

// POST /api/notifications/sms - Envoyer un SMS transactionnel
router.post('/sms',
  validate(Joi.object({
    phoneNumber: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendSMS
);

// POST /api/notifications/email/queue - Mettre en file d'attente un email
router.post('/email/queue',
  validate(Joi.object({
    to: Joi.string().email().required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').default('normal'),
      send_at: Joi.date().optional()
    }).optional()
  })),
  notificationsController.queueEmail
);

// POST /api/notifications/sms/queue - Mettre en file d'attente un SMS
router.post('/sms/queue',
  validate(Joi.object({
    to: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
    message: Joi.string().required(),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').default('normal')
    }).optional()
  })),
  notificationsController.queueSMS
);

// POST /api/notifications/email/bulk - Envoyer des emails en lot
router.post('/email/bulk',
  validate(Joi.object({
    emails: Joi.array().items(Joi.string().email()).required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').default('normal')
    }).optional()
  })),
  notificationsController.sendBulkEmail
);

// POST /api/notifications/sms/bulk - Envoyer des SMS en lot
router.post('/sms/bulk',
  validate(Joi.object({
    phones: Joi.array().items(Joi.string().pattern(/^[+]?[\d\s-()]+$/)).required(),
    message: Joi.string().required(),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').default('normal')
    }).optional()
  })),
  notificationsController.sendBulkSMS
);

// POST /api/notifications/bulk/mixed - Envoyer des notifications mixtes en lot
router.post('/bulk/mixed',
  validate(Joi.object({
    emails: Joi.array().items(Joi.string().email()).optional(),
    phones: Joi.array().items(Joi.string().pattern(/^[+]?[\d\s-()]+$/)).optional(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object({
      priority: Joi.string().valid('low', 'normal', 'high').default('normal')
    }).optional()
  })),
  notificationsController.sendBulkMixed
);

// GET /api/notifications/job/:jobId/status - Récupérer le statut d'un job
router.get('/job/:jobId/status',
  validate(Joi.object({
    jobId: Joi.string().required()
  })),
  notificationsController.getJobStatus
);

// DELETE /api/notifications/job/:jobId/cancel - Annuler un job
router.delete('/job/:jobId/cancel',
  validate(Joi.object({
    jobId: Joi.string().required()
  })),
  notificationsController.cancelJob
);

// GET /api/notifications/queues/stats - Récupérer les statistiques des queues
router.get('/queues/stats',
  notificationsController.getQueueStats
);

// POST /api/notifications/queues/clean - Nettoyer les jobs terminés
router.post('/queues/clean',
  validate(Joi.object({
    older_than_hours: Joi.number().integer().min(1).default(24),
    status: Joi.string().valid('completed', 'failed', 'cancelled').optional()
  })),
  notificationsController.cleanCompletedJobs
);

// Routes spécialisées pour les notifications courantes

// POST /api/notifications/welcome/email - Email de bienvenue
router.post('/welcome/email',
  validate(Joi.object({
    to: Joi.string().email().required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendWelcomeEmail
);

// POST /api/notifications/welcome/sms - SMS de bienvenue
router.post('/welcome/sms',
  validate(Joi.object({
    phoneNumber: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendWelcomeSMS
);

// POST /api/notifications/password-reset/email - Email de réinitialisation de mot de passe
router.post('/password-reset/email',
  validate(Joi.object({
    to: Joi.string().email().required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendPasswordResetEmail
);

// POST /api/notifications/password-reset/sms - SMS de réinitialisation de mot de passe
router.post('/password-reset/sms',
  validate(Joi.object({
    phoneNumber: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendPasswordResetSMS
);

// POST /api/notifications/event-confirmation/email - Email de confirmation d'événement
router.post('/event-confirmation/email',
  validate(Joi.object({
    to: Joi.string().email().required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendEventConfirmationEmail
);

// POST /api/notifications/event-confirmation/sms - SMS de confirmation d'événement
router.post('/event-confirmation/sms',
  validate(Joi.object({
    phoneNumber: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendEventConfirmationSMS
);

// POST /api/notifications/otp/sms - SMS OTP
router.post('/otp/sms',
  validate(Joi.object({
    phoneNumber: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
    template: Joi.string().required(),
    data: Joi.object().required(),
    options: Joi.object().optional()
  })),
  notificationsController.sendOTPSMS
);

// Routes de santé et statistiques (pas de permission requise)

// GET /api/notifications/health - Vérifier la santé du service
router.get('/health',
  notificationsController.healthCheck
);

// GET /api/notifications/stats - Récupérer les statistiques du service
router.get('/stats',
  notificationsController.getStats
);

// Routes pour les webhooks externes (authentification par clé API)

// POST /api/notifications/webhooks/email - Webhook pour les emails externes
router.post('/webhooks/email',
  validate(Joi.object({
    headers: Joi.object({
      'x-api-key': Joi.string().required()
    }),
    body: Joi.object({
      to: Joi.string().email().required(),
      template: Joi.string().required(),
      data: Joi.object().required(),
      options: Joi.object({
        priority: Joi.string().valid('low', 'normal', 'high').default('normal'),
        send_at: Joi.date().optional()
      }).optional()
    })
  })),
  notificationsController.sendEmail
);

// POST /api/notifications/webhooks/sms - Webhook pour les SMS externes
router.post('/webhooks/sms',
  validate(Joi.object({
    headers: Joi.object({
      'x-api-key': Joi.string().required()
    }),
    body: Joi.object({
      to: Joi.string().pattern(/^[+]?[\d\s-()]+$/).required(),
      message: Joi.string().required(),
      options: Joi.object({
        priority: Joi.string().valid('low', 'normal', 'high').default('normal')
      }).optional()
    })
  })),
  notificationsController.sendSMS
);

// POST /api/notifications/webhooks/bulk - Webhook pour les notifications en lot externes
router.post('/webhooks/bulk',
  validate(Joi.object({
    headers: Joi.object({
      'x-api-key': Joi.string().required()
    }),
    body: Joi.object({
      emails: Joi.array().items(Joi.string().email()).optional(),
      phones: Joi.array().items(Joi.string().pattern(/^[+]?[\d\s-()]+$/)).optional(),
      template: Joi.string().required(),
      data: Joi.object().required(),
      options: Joi.object({
        priority: Joi.string().valid('low', 'normal', 'high').default('normal')
      }).optional()
    })
  })),
  notificationsController.sendBulkMixed
);

module.exports = router;
