/**
 * Auth Client pour Notification Service
 * Réutilise le client partagé avec configuration du logger local
 */
const authClient = require('../../../shared/auth-client');

// Tenter de configurer le logger du service si disponible
try {
  const logger = require('../utils/logger');
  authClient.setLogger(logger);
} catch (error) {
  // Logger par défaut si le logger du service n'est pas disponible
}

module.exports = authClient;
