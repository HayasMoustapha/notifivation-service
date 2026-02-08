/**
 * Service de notifications in-app
 * Utilise la table notifications avec channel='in_app' (conforme au diagramme)
 */

const { getDatabase } = require('../../config/database');
const logger = require('../../utils/logger');

class InAppNotificationService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Crée une notification in-app
   * @param {Object} notificationData - Données de la notification
   * @returns {Promise<Object>} Notification créée
   */
  async createNotification(notificationData) {
    try {
      const {
        userId,
        type = 'info',
        title,
        message,
        templateId = null
      } = notificationData;

      const query = `
        INSERT INTO notifications (user_id, template_id, type, channel, subject, content, status)
        VALUES ($1, $2, $3, 'in_app', $4, $5, 'sent')
        RETURNING *
      `;

      const values = [userId, templateId, type, title, message];
      const result = await this.db.query(query, values);
      const notification = result.rows[0];

      logger.info('In-app notification created', {
        notificationId: notification.id,
        userId,
        type
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create in-app notification', {
        error: error.message,
        userId: notificationData.userId
      });
      throw error;
    }
  }

  /**
   * Récupère les notifications in-app d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @param {Object} options - Options de filtrage
   * @returns {Promise<Object>} Notifications et métadonnées
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        isRead,
        type
      } = options;

      const whereConditions = ['user_id = $1', "channel = 'in_app'"];
      const queryParams = [userId];
      let paramIndex = 2;

      if (isRead !== undefined) {
        if (isRead) {
          whereConditions.push('read_at IS NOT NULL');
        } else {
          whereConditions.push('read_at IS NULL');
        }
      }

      if (type) {
        whereConditions.push(`type = $${paramIndex++}`);
        queryParams.push(type);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const query = `
        SELECT id, user_id, template_id, type, subject, content, status,
               sent_at, read_at, created_at, updated_at
        FROM notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      queryParams.push(limit, offset);

      const countQuery = `
        SELECT COUNT(*) as total
        FROM notifications
        ${whereClause}
      `;

      const [result, countResult] = await Promise.all([
        this.db.query(query, queryParams),
        this.db.query(countQuery, queryParams.slice(0, -2))
      ]);

      const total = parseInt(countResult.rows[0].total);

      return {
        notifications: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < total
        }
      };
    } catch (error) {
      logger.error('Failed to get user notifications', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Marque une notification comme lue
   * @param {number} notificationId - ID de la notification
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object>} Notification mise à jour
   */
  async markAsRead(notificationId, userId) {
    try {
      const query = `
        UPDATE notifications
        SET read_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 AND channel = 'in_app'
        RETURNING *
      `;

      const result = await this.db.query(query, [notificationId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Notification not found or access denied');
      }

      logger.info('Notification marked as read', { notificationId, userId });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        error: error.message,
        notificationId,
        userId
      });
      throw error;
    }
  }

  /**
   * Marque toutes les notifications in-app d'un utilisateur comme lues
   * @param {string} userId - ID de l'utilisateur
   * @param {Object} filters - Filtres optionnels
   * @returns {Promise<Object>} Résultat
   */
  async markAllAsRead(userId, filters = {}) {
    try {
      const { type } = filters;

      let whereClause = "user_id = $1 AND channel = 'in_app' AND read_at IS NULL";
      const queryParams = [userId];
      let paramIndex = 2;

      if (type) {
        whereClause += ` AND type = $${paramIndex++}`;
        queryParams.push(type);
      }

      const query = `
        UPDATE notifications
        SET read_at = CURRENT_TIMESTAMP
        WHERE ${whereClause}
      `;

      const result = await this.db.query(query, queryParams);

      logger.info('All in-app notifications marked as read', {
        userId,
        updatedCount: result.rowCount
      });

      return {
        success: true,
        updatedCount: result.rowCount
      };
    } catch (error) {
      logger.error('Failed to mark all notifications as read', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Supprime une notification in-app
   * @param {number} notificationId - ID de la notification
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<boolean>} True si supprimée
   */
  async deleteNotification(notificationId, userId) {
    try {
      const query = "DELETE FROM notifications WHERE id = $1 AND user_id = $2 AND channel = 'in_app'";
      const result = await this.db.query(query, [notificationId, userId]);
      const deleted = result.rowCount > 0;

      if (deleted) {
        logger.info('In-app notification deleted', { notificationId, userId });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete notification', {
        error: error.message,
        notificationId,
        userId
      });
      throw error;
    }
  }

  /**
   * Récupère les statistiques des notifications in-app d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object>} Statistiques
   */
  async getUserStats(userId) {
    try {
      const query = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN read_at IS NULL THEN 1 END) as unread,
          COUNT(CASE WHEN type = 'error' THEN 1 END) as errors,
          COUNT(CASE WHEN type = 'warning' THEN 1 END) as warnings,
          COUNT(CASE WHEN type = 'success' THEN 1 END) as successes,
          COUNT(CASE WHEN type = 'info' THEN 1 END) as infos,
          MAX(created_at) as last_notification_at
        FROM notifications
        WHERE user_id = $1 AND channel = 'in_app'
      `;

      const result = await this.db.query(query, [userId]);
      const stats = result.rows[0];

      return {
        total: parseInt(stats.total),
        unread: parseInt(stats.unread),
        byType: {
          error: parseInt(stats.errors),
          warning: parseInt(stats.warnings),
          success: parseInt(stats.successes),
          info: parseInt(stats.infos)
        },
        lastNotificationAt: stats.last_notification_at
      };
    } catch (error) {
      logger.error('Failed to get user notification stats', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = new InAppNotificationService();
