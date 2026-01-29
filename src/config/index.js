/**
 * Configuration centrale du Notification Service
 * Exporte tous les modules de configuration
 *
 * Note: Ce service est passif et technique, il n'a pas besoin d'authClient
 * L'authentification est gérée par event-planner-core
 */

const { getDatabase, databaseConfig } = require('./database');

module.exports = {
  getDatabase,
  databaseConfig
};
