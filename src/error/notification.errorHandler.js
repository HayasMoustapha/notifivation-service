const { ErrorHandlerFactory } = require('../../../shared');

/**
 * Error Handler personnalisé pour Notification Service
 * Utilise ErrorHandlerFactory pour créer un gestionnaire d'erreurs spécialisé
 */

// Créer l'error handler pour notifications avec les types d'erreurs spécifiques
const notificationErrorHandler = ErrorHandlerFactory.create('Notification Service', {
  customErrorTypes: {
    // Erreurs Email
    'SMTP_CONNECTION_FAILED': {
      statusCode: 503,
      code: 'EMAIL_SERVICE_UNAVAILABLE',
      message: 'Service email temporairement indisponible',
      details: 'Impossible de se connecter au serveur SMTP',
      retryable: true,
      category: 'technical',
      severity: 'high'
    },
    'SENDGRID_API_ERROR': {
      statusCode: 503,
      code: 'EMAIL_SERVICE_UNAVAILABLE',
      message: 'Service email temporairement indisponible',
      details: 'Erreur API SendGrid',
      retryable: true,
      category: 'technical',
      severity: 'high'
    },
    'TEMPLATE_NOT_FOUND': {
      statusCode: 400,
      code: 'TEMPLATE_NOT_FOUND',
      message: 'Template email non trouvé',
      details: 'Le template demandé n\'existe pas',
      retryable: false,
      category: 'business',
      severity: 'medium'
    },
    'INVALID_EMAIL_ADDRESS': {
      statusCode: 400,
      code: 'INVALID_EMAIL',
      message: 'Adresse email invalide',
      details: 'L\'adresse email fournie n\'est pas valide',
      retryable: false,
      category: 'validation',
      severity: 'low'
    },
    'EMAIL_SEND_FAILED': {
      statusCode: 500,
      code: 'EMAIL_SEND_FAILED',
      message: 'Échec envoi email',
      details: 'Erreur lors de l\'envoi de l\'email',
      retryable: true,
      category: 'technical',
      severity: 'high'
    },

    // Erreurs SMS
    'TWILIO_API_ERROR': {
      statusCode: 503,
      code: 'SMS_SERVICE_UNAVAILABLE',
      message: 'Service SMS temporairement indisponible',
      details: 'Erreur API Twilio',
      retryable: true,
      category: 'technical',
      severity: 'high'
    },
    'INVALID_PHONE_NUMBER': {
      statusCode: 400,
      code: 'INVALID_PHONE',
      message: 'Numéro de téléphone invalide',
      details: 'Le numéro de téléphone fourni n\'est pas valide',
      retryable: false,
      category: 'validation',
      severity: 'low'
    },
    'SMS_SEND_FAILED': {
      statusCode: 500,
      code: 'SMS_SEND_FAILED',
      message: 'Échec envoi SMS',
      details: 'Erreur lors de l\'envoi du SMS',
      retryable: true,
      category: 'technical',
      severity: 'high'
    },
    'INSUFFICIENT_BALANCE': {
      statusCode: 402,
      code: 'SMS_INSUFFICIENT_BALANCE',
      message: 'Crédit SMS insuffisant',
      details: 'Solde insuffisant pour envoyer des SMS',
      retryable: false,
      category: 'business',
      severity: 'medium'
    },

    // Erreurs Queue/Job
    'QUEUE_CONNECTION_FAILED': {
      statusCode: 503,
      code: 'QUEUE_SERVICE_UNAVAILABLE',
      message: 'Service de queue indisponible',
      details: 'Impossible de se connecter à Redis',
      retryable: true,
      category: 'technical',
      severity: 'high'
    },
    'JOB_NOT_FOUND': {
      statusCode: 404,
      code: 'JOB_NOT_FOUND',
      message: 'Job non trouvé',
      details: 'Le job demandé n\'existe pas',
      retryable: false,
      category: 'business',
      severity: 'medium'
    },
    'JOB_ALREADY_COMPLETED': {
      statusCode: 409,
      code: 'JOB_ALREADY_COMPLETED',
      message: 'Job déjà terminé',
      details: 'Ce job ne peut plus être modifié',
      retryable: false,
      category: 'business',
      severity: 'low'
    },
    'QUEUE_FULL': {
      statusCode: 503,
      code: 'QUEUE_FULL',
      message: 'Queue saturée',
      details: 'La queue de traitement est pleine',
      retryable: true,
      category: 'technical',
      severity: 'medium'
    },
    'INVALID_JOB_DATA': {
      statusCode: 400,
      code: 'INVALID_JOB_DATA',
      message: 'Données job invalides',
      details: 'Les données fournies pour le job sont invalides',
      retryable: false,
      category: 'validation',
      severity: 'low'
    },

    // Erreurs Template
    'TEMPLATE_SYNTAX_ERROR': {
      statusCode: 400,
      code: 'TEMPLATE_SYNTAX_ERROR',
      message: 'Erreur syntaxe template',
      details: 'Erreur de syntaxe dans le template',
      retryable: false,
      category: 'validation',
      severity: 'medium'
    },
    'TEMPLATE_VARIABLE_MISSING': {
      statusCode: 400,
      code: 'TEMPLATE_VARIABLE_MISSING',
      message: 'Variable template manquante',
      details: 'Variable requise manquante dans le template',
      retryable: false,
      category: 'validation',
      severity: 'low'
    },
    'TEMPLATE_RENDER_FAILED': {
      statusCode: 500,
      code: 'TEMPLATE_RENDER_FAILED',
      message: 'Échec rendu template',
      details: 'Erreur lors du rendu du template',
      retryable: true,
      category: 'technical',
      severity: 'medium'
    },

    // Erreurs Webhook
    'WEBHOOK_SIGNATURE_INVALID': {
      statusCode: 401,
      code: 'WEBHOOK_SIGNATURE_INVALID',
      message: 'Signature webhook invalide',
      details: 'La signature du webhook ne correspond pas',
      retryable: false,
      category: 'security',
      severity: 'high'
    },
    'WEBHOOK_PROCESSING_FAILED': {
      statusCode: 500,
      code: 'WEBHOOK_PROCESSING_FAILED',
      message: 'Échec traitement webhook',
      details: 'Erreur lors du traitement du webhook',
      retryable: true,
      category: 'technical',
      severity: 'medium'
    },
    'WEBHOOK_EVENT_UNKNOWN': {
      statusCode: 400,
      code: 'WEBHOOK_EVENT_UNKNOWN',
      message: 'Événement webhook inconnu',
      details: 'L\'événement webhook n\'est pas géré',
      retryable: false,
      category: 'business',
      severity: 'low'
    },

    // Erreurs Bulk Operations
    'BULK_LIMIT_EXCEEDED': {
      statusCode: 400,
      code: 'BULK_LIMIT_EXCEEDED',
      message: 'Limite bulk dépassée',
      details: 'Trop d\'éléments dans la requête bulk',
      retryable: false,
      category: 'validation',
      severity: 'medium'
    },
    'BULK_PARTIAL_FAILURE': {
      statusCode: 207,
      code: 'BULK_PARTIAL_FAILURE',
      message: 'Échec partiel bulk',
      details: 'Certaines opérations bulk ont échoué',
      retryable: false,
      category: 'business',
      severity: 'medium'
    },
    'BULK_VALIDATION_FAILED': {
      statusCode: 400,
      code: 'BULK_VALIDATION_FAILED',
      message: 'Validation bulk échouée',
      details: 'Certaines données bulk sont invalides',
      retryable: false,
      category: 'validation',
      severity: 'low'
    }
  }
});

module.exports = notificationErrorHandler;
