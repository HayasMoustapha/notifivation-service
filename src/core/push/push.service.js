/**
 * Service de notifications push
 * Gère l'envoi de notifications push via Firebase Cloud Messaging et Expo
 */

const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');
const logger = require('../../utils/logger');

class PushService {
  constructor() {
    this.firebaseConfigured = false;
    this.expoConfigured = false;
    this.firebaseApp = null;
    this.expoClient = null;
    this.initialized = false;
    this.initPromise = this.initialize();
  }

  /**
   * Initialise les services push
   */
  async initialize() {
    try {
      // Initialiser Firebase
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
        const serviceAccount = {
          type: "service_account",
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
        };

        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
        });

        this.firebaseConfigured = true;
        logger.info('Firebase push service initialized');
      }

      // Initialiser Expo
      if (process.env.EXPO_ACCESS_TOKEN) {
        this.expoClient = new Expo({
          accessToken: process.env.EXPO_ACCESS_TOKEN
        });
        this.expoConfigured = true;
        logger.info('Expo push service initialized');
      }

      logger.info('Push service initialized', {
        firebase: this.firebaseConfigured,
        expo: this.expoConfigured
      });

    } catch (error) {
      logger.error('Failed to initialize push service', { error: error.message });
      this.firebaseConfigured = false;
      this.expoConfigured = false;
    } finally {
      this.initialized = true;
    }
  }

  /**
   * S'assure que le service push est initialisé
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
   * Envoie une notification push avec fallback
   * @param {string} token - Token de l'appareil
   * @param {Object} payload - Payload de la notification
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendPushNotification(token, payload, options = {}) {
    await this.ensureInitialized();

    const startTime = Date.now();

    // Essayer Firebase d'abord
    if (this.firebaseConfigured) {
      try {
        const message = {
          token: token,
          notification: {
            title: payload.title,
            body: payload.body
          },
          data: payload.data || {},
          android: {
            priority: options.priority || 'high',
            notification: {
              sound: options.sound || 'default',
              clickAction: options.clickAction
            }
          },
          apns: {
            payload: {
              aps: {
                sound: options.sound || 'default',
                badge: options.badge || 1
              }
            }
          }
        };

        const response = await this.firebaseApp.messaging().send(message);
        const responseTime = Date.now() - startTime;

        logger.info('Push notification sent via Firebase', {
          token: this.maskToken(token),
          messageId: response,
          responseTime,
          provider: 'firebase'
        });

        return {
          success: true,
          provider: 'firebase',
          messageId: response,
          responseTime
        };

      } catch (error) {
        logger.warn('Firebase push failed, trying Expo', {
          error: error.message,
          token: this.maskToken(token)
        });
      }
    }

    // Fallback Expo
    if (this.expoConfigured && Expo.isExpoPushToken(token)) {
      try {
        const message = {
          to: token,
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          sound: options.sound || 'default',
          priority: options.priority || 'default',
          ttl: options.ttl || 86400,
          expiration: options.expiration,
          badge: options.badge || 1
        };

        const ticket = await this.expoClient.sendPushNotificationsAsync([message]);
        const responseTime = Date.now() - startTime;

        if (ticket[0].status === 'ok') {
          logger.info('Push notification sent via Expo', {
            token: this.maskToken(token),
            ticketId: ticket[0].id,
            responseTime,
            provider: 'expo'
          });

          return {
            success: true,
            provider: 'expo',
            messageId: ticket[0].id,
            responseTime
          };
        } else {
          throw new Error(`Expo error: ${ticket[0].details?.error}`);
        }

      } catch (error) {
        logger.error('Expo push failed', {
          error: error.message,
          token: this.maskToken(token)
        });
      }
    }

    // Mode développement - mock
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      const responseTime = Date.now() - startTime;
      logger.warn('Push notification mock - no provider configured', {
        token: this.maskToken(token),
        title: payload.title
      });

      return {
        success: true,
        provider: 'mock',
        messageId: `mock-push-${Date.now()}`,
        responseTime,
        mock: true
      };
    }

    return {
      success: false,
      error: 'Tous les services push ont échoué',
      details: {
        message: 'Aucun service push disponible',
        attempted_services: ['Firebase', 'Expo', 'Mock']
      }
    };
  }

  /**
   * Envoie une notification push transactionnelle
   * @param {string} token - Token de l'appareil
   * @param {string} template - Template à utiliser
   * @param {Object} data - Données du template
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendTransactionalPush(token, template, data, options = {}) {
    try {
      const notification = this.generatePushNotification(template, data, options);
      const result = await this.sendPushNotification(token, notification, options);

      // Log dans la base de données
      const notificationRepository = require('../database/notification.repository');
      await notificationRepository.createNotification({
        type: 'push',
        status: result.success ? 'sent' : 'failed',
        priority: options.priority || 2,
        subject: notification.title,
        content: notification.body,
        templateName: template,
        templateData: data || null,
        recipientPushToken: token,
        provider: result.provider || 'fallback',
        providerResponse: result,
        providerMessageId: result.messageId || null,
        sentAt: result.success ? new Date().toISOString() : null,
        failedAt: result.success ? null : new Date().toISOString(),
        errorMessage: result.success ? null : (result.error || result.details?.message || 'Push send failed'),
        errorCode: result.success ? null : 'PUSH_SEND_FAILED',
        retryCount: 0,
        maxRetries: 2
      });

      return result;

    } catch (error) {
      logger.error('Failed to send transactional push', {
        token: this.maskToken(token),
        template,
        error: error.message
      });

      // Vérifier si retryable
      const isRetryable = this.isRetryableError(error);
      if (isRetryable) {
        try {
          const queueService = require('../queues/queue.service');
          const jobData = {
            type: 'push-retry',
            token,
            template,
            data,
            options: {
              ...options,
              retryCount: (options.retryCount || 0) + 1
            },
            originalError: error.message
          };

          await queueService.addPushJob(jobData);

          logger.info('Retry job queued for failed push', {
            token: this.maskToken(token),
            template,
            retryCount: jobData.options.retryCount
          });

          return {
            success: false,
            retryQueued: true,
            error: 'Push send failed, retry queued'
          };
        } catch (queueError) {
          logger.error('Failed to queue retry job', {
            error: queueError.message,
            token: this.maskToken(token)
          });
        }
      }

      return {
        success: false,
        error: 'Échec envoi notification push',
        details: {
          message: error.message,
          template,
          token: this.maskToken(token)
        }
      };
    }
  }

  /**
   * Génère le contenu de la notification push
   * @param {string} template - Template
   * @param {Object} data - Données
   * @param {Object} options - Options
   * @returns {Object} Notification générée
   */
  generatePushNotification(template, data, options = {}) {
    const templates = {
      'event-reminder': {
        title: `Rappel: ${data.eventName}`,
        body: `Votre événement commence dans ${data.timeUntilStart}`,
        data: {
          eventId: data.eventId,
          type: 'event_reminder'
        }
      },
      'ticket-confirmation': {
        title: 'Billet confirmé !',
        body: `Votre billet pour ${data.eventName} est prêt`,
        data: {
          ticketId: data.ticketId,
          eventId: data.eventId,
          type: 'ticket_confirmation'
        }
      },
      'payment-success': {
        title: 'Paiement réussi',
        body: `Votre paiement de ${data.amount}€ a été confirmé`,
        data: {
          paymentId: data.paymentId,
          type: 'payment_success'
        }
      },
      'custom': {
        title: data.title || 'Notification',
        body: data.message || 'Vous avez une nouvelle notification',
        data: data.data || {}
      }
    };

    return templates[template] || templates['custom'];
  }

  /**
   * Envoie des notifications push en masse
   * @param {Array} tokens - Liste des tokens
   * @param {string} template - Template
   * @param {Object} data - Données
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultats
   */
  async sendBulkPush(tokens, template, data, options = {}) {
    try {
      const results = {
        sent: 0,
        failed: 0,
        errors: []
      };

      // Chunk pour éviter les limites d'API
      const chunkSize = 100;
      const chunks = this.chunkArray(tokens, chunkSize);

      for (const chunk of chunks) {
        const promises = chunk.map(token =>
          this.sendTransactionalPush(token, template, data, options)
        );

        const chunkResults = await Promise.allSettled(promises);

        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            results.sent++;
          } else {
            results.failed++;
            const error = result.status === 'rejected' ? result.reason : result.value.error;
            results.errors.push({
              token: this.maskToken(chunk[index]),
              error: error?.message || 'Unknown error'
            });
          }
        });
      }

      logger.info('Bulk push notifications sent', {
        template,
        totalTokens: tokens.length,
        sent: results.sent,
        failed: results.failed
      });

      return {
        success: results.failed === 0,
        results,
        summary: {
          total: tokens.length,
          sent: results.sent,
          failed: results.failed
        }
      };

    } catch (error) {
      logger.error('Failed to send bulk push notifications', {
        error: error.message,
        template,
        tokenCount: tokens.length
      });

      return {
        success: false,
        error: 'Échec envoi notifications push en masse',
        details: {
          message: error.message,
          template,
          tokenCount: tokens.length
        }
      };
    }
  }

  /**
   * Détermine si une erreur est retryable
   * @param {Error} error - Erreur
   * @returns {boolean} Retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'Unavailable',
      'Internal',
      'DeadlineExceeded',
      'ResourceExhausted',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND'
    ];

    const errorMessage = error.message || error.code || '';
    return retryableErrors.some(retryableError => errorMessage.includes(retryableError));
  }

  /**
   * Masque un token pour les logs
   * @param {string} token - Token complet
   * @returns {string} Token masqué
   */
  maskToken(token) {
    if (!token || token.length < 10) return token;
    return token.substring(0, 10) + '...' + token.substring(token.length - 10);
  }

  /**
   * Divise un tableau en chunks
   * @param {Array} array - Tableau
   * @param {number} size - Taille des chunks
   * @returns {Array} Chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Vérifie la santé du service
   * @returns {Promise<Object>} État du service
   */
  async healthCheck() {
    await this.ensureInitialized();

    return {
      healthy: this.firebaseConfigured || this.expoConfigured || process.env.NODE_ENV === 'development',
      services: {
        firebase: this.firebaseConfigured,
        expo: this.expoConfigured
      }
    };
  }

  /**
   * Récupère les statistiques
   * @returns {Promise<Object>} Statistiques
   */
  async getStats() {
    return {
      configured: {
        firebase: this.firebaseConfigured,
        expo: this.expoConfigured
      },
      capabilities: ['transactional', 'bulk']
    };
  }
}

module.exports = new PushService();
