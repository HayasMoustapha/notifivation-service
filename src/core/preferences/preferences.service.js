/**
 * Service de gestion des préférences de notification utilisateur
 * Schema conforme au diagramme : notification_preferences (une ligne par user+channel)
 */

const { getDatabase } = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * Normalise un userId (integer ou UUID) vers le format UUID
 * @param {string|number} userId - ID utilisateur (integer ou UUID)
 * @returns {string|null} UUID formaté ou null si invalide
 */
function normalizeUserId(userId) {
  // Aligné sur le schéma actuel: user_id BIGINT
  if (userId === null || userId === undefined || userId === '') {
    return null;
  }

  if (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) {
    return userId;
  }

  if (typeof userId === 'string' && /^\d+$/.test(userId)) {
    const numericId = Number(userId);
    return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
  }

  logger.warn('Invalid userId for BIGINT schema', { userId, type: typeof userId });
  return null;
}

class UserPreferencesService {
  constructor() {
    this.db = getDatabase();
    this.channels = ['email', 'sms', 'push', 'in_app'];
  }

  /**
   * Récupère les préférences d'un utilisateur
   * @param {string|number} userId - ID de l'utilisateur (integer ou UUID)
   * @returns {Promise<Object|null>} Préférences ou null
   */
  async getUserPreferences(userId) {
    try {
      const normalizedId = normalizeUserId(userId);

      // Si userId n'est pas valide, retourner null
      if (!normalizedId) {
        return null;
      }

      const query = `
        SELECT id, user_id, channel, is_enabled, created_at, updated_at
        FROM notification_preferences
        WHERE user_id = $1
        ORDER BY channel
      `;

      const result = await this.db.query(query, [normalizedId]);

      if (result.rows.length === 0) {
        return null;
      }

      const preferences = {};
      for (const row of result.rows) {
        preferences[row.channel] = row.is_enabled;
      }

      return {
        userId,
        channels: preferences,
        rows: result.rows
      };
    } catch (error) {
      logger.error('Failed to get user preferences', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Crée ou met à jour les préférences d'un utilisateur
   * @param {string|number} userId - ID de l'utilisateur (integer ou UUID)
   * @param {Object} preferences - Nouvelles préférences { channel: is_enabled }
   * @returns {Promise<Object|null>} Préférences mises à jour ou null si userId invalide
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const normalizedId = normalizeUserId(userId);

      // Si userId n'est pas valide, retourner null
      if (!normalizedId) {
        logger.warn('Cannot update preferences: userId is required', { userId });
        return null;
      }

      const { channels = {} } = preferences;

      const query = `
        INSERT INTO notification_preferences (user_id, channel, is_enabled)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, channel) DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled
        RETURNING *
      `;

      const results = [];
      for (const [channel, isEnabled] of Object.entries(channels)) {
        if (this.channels.includes(channel)) {
          const result = await this.db.query(query, [normalizedId, channel, isEnabled]);
          results.push(result.rows[0]);
        }
      }

      logger.info('User preferences updated', { userId: normalizedId, channels });
      return await this.getUserPreferences(userId);
    } catch (error) {
      logger.error('Failed to update user preferences', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Supprime les préférences d'un utilisateur (rétablit les valeurs par défaut)
   * @param {string|number} userId - ID de l'utilisateur (integer ou UUID)
   * @returns {Promise<boolean>} True si supprimé, false si userId invalide
   */
  async resetUserPreferences(userId) {
    try {
      const normalizedId = normalizeUserId(userId);

      // Si userId n'est pas valide, retourner false
      if (!normalizedId) {
        logger.warn('Cannot reset preferences: userId is required', { userId });
        return false;
      }

      const query = 'DELETE FROM notification_preferences WHERE user_id = $1';
      const result = await this.db.query(query, [normalizedId]);
      const deleted = result.rowCount > 0;

      if (deleted) {
        logger.info('User preferences reset to defaults', { userId: normalizedId });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to reset user preferences', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Désabonne un utilisateur de toutes les notifications
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object>} Préférences mises à jour
   */
  async unsubscribeUser(userId) {
    try {
      const channels = {};
      for (const channel of this.channels) {
        channels[channel] = false;
      }

      const result = await this.updateUserPreferences(userId, { channels });
      logger.info('User unsubscribed from all notifications', { userId });
      return result;
    } catch (error) {
      logger.error('Failed to unsubscribe user', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Vérifie si un utilisateur souhaite recevoir une notification sur un canal
   * @param {string|number} userId - ID de l'utilisateur (integer ou UUID)
   * @param {string} channel - Canal (email, sms, push, in_app)
   * @returns {Promise<Object>} Résultat de vérification
   */
  async shouldSendNotification(userId, channel) {
    try {
      const normalizedId = normalizeUserId(userId);

      // Si userId n'est pas valide, utiliser les préférences par défaut
      if (!normalizedId) {
        return {
          shouldSend: channel !== 'sms',
          reason: 'no_user_id'
        };
      }

      const query = `
        SELECT is_enabled
        FROM notification_preferences
        WHERE user_id = $1 AND channel = $2
      `;

      const result = await this.db.query(query, [normalizedId, channel]);

      if (result.rows.length === 0) {
        // Pas de préférences => envoyer par défaut sauf SMS
        return {
          shouldSend: channel !== 'sms',
          reason: 'default_preferences'
        };
      }

      return {
        shouldSend: result.rows[0].is_enabled,
        reason: result.rows[0].is_enabled ? 'allowed' : 'channel_disabled'
      };
    } catch (error) {
      logger.error('Failed to check notification preferences', {
        error: error.message,
        userId,
        channel
      });

      return {
        shouldSend: true,
        reason: 'error_fallback'
      };
    }
  }

  /**
   * Récupère les statistiques des préférences
   * @returns {Promise<Object>} Statistiques
   */
  async getPreferencesStats() {
    try {
      const query = `
        SELECT
          channel,
          COUNT(*) as total,
          COUNT(CASE WHEN is_enabled THEN 1 END) as enabled,
          COUNT(CASE WHEN NOT is_enabled THEN 1 END) as disabled
        FROM notification_preferences
        GROUP BY channel
        ORDER BY channel
      `;

      const result = await this.db.query(query);

      const stats = {};
      for (const row of result.rows) {
        stats[row.channel] = {
          total: parseInt(row.total),
          enabled: parseInt(row.enabled),
          disabled: parseInt(row.disabled)
        };
      }

      return {
        byChannel: stats,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get preferences stats', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new UserPreferencesService();
