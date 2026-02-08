/**
 * Repository pour les notifications
 * Schema conforme au diagramme : notifications, notification_logs
 */

const { getDatabase } = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * Normalise un userId (integer ou UUID) vers le format UUID
 * @param {string|number} userId - ID utilisateur (integer ou UUID)
 * @returns {string|null} UUID formaté ou null si invalide
 */
function normalizeUserId(userId) {
  // Vérifier que userId est une valeur valide (non null, non undefined, non vide)
  if (userId === null || userId === undefined || userId === '') {
    return null;
  }

  // Si c'est déjà un UUID valide (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof userId === 'string' && uuidRegex.test(userId)) {
    return userId.toLowerCase();
  }

  // Si c'est un integer, le convertir en UUID (format: 00000000-0000-0000-0000-{12 digits padded})
  const numericId = parseInt(userId, 10);
  if (!isNaN(numericId) && numericId > 0) {
    const paddedId = numericId.toString().padStart(12, '0');
    return `00000000-0000-0000-0000-${paddedId}`;
  }

  // Si c'est une chaîne numérique
  if (typeof userId === 'string' && /^\d+$/.test(userId)) {
    const paddedId = userId.padStart(12, '0');
    return `00000000-0000-0000-0000-${paddedId}`;
  }

  // Fallback: retourner tel quel et laisser PostgreSQL gérer l'erreur
  logger.warn('Unable to normalize userId, using as-is', { userId, type: typeof userId });
  return String(userId);
}

/**
 * Crée une notification
 * @param {Object} payload - Données de la notification
 * @returns {Promise<Object>} Notification créée
 */
async function createNotification(payload) {
  const db = getDatabase();

  try {
    const {
      userId,
      templateId = null,
      type,
      channel,
      subject = null,
      content = null,
      status = 'pending',
      sentAt = null,
      readAt = null
    } = payload;

    // Normaliser le userId (integer ou UUID -> UUID)
    const normalizedUserId = normalizeUserId(userId);

    // Si userId n'est pas valide, ne pas créer la notification
    if (!normalizedUserId) {
      logger.warn('Skipping notification creation: userId is required', {
        type,
        channel,
        userId
      });
      return null;
    }

    const query = `
      INSERT INTO notifications (user_id, template_id, type, channel, subject, content, status, sent_at, read_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [normalizedUserId, templateId, type, channel, subject, content, status, sentAt, readAt];
    const result = await db.query(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to create notification', { error: error.message, userId: payload.userId });
    throw error;
  }
}

/**
 * Crée un log de notification
 * @param {Object} payload - Données du log
 * @returns {Promise<Object>} Log créé
 */
async function createNotificationLog(payload) {
  const db = getDatabase();

  try {
    const { notificationId, provider, response = null, errorMessage = null } = payload;

    const query = `
      INSERT INTO notification_logs (notification_id, provider, response, error_message)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [notificationId, provider, response ? JSON.stringify(response) : null, errorMessage];
    const result = await db.query(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to create notification log', { error: error.message });
    throw error;
  }
}

/**
 * Récupère une notification par son ID
 * @param {number} notificationId - ID de la notification
 * @returns {Promise<Object|null>} Notification ou null
 */
async function getNotificationById(notificationId) {
  const db = getDatabase();

  try {
    const query = `
      SELECT n.*, nl.provider, nl.response AS log_response, nl.error_message AS log_error
      FROM notifications n
      LEFT JOIN notification_logs nl ON nl.notification_id = n.id
      WHERE n.id = $1
    `;

    const result = await db.query(query, [notificationId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Failed to get notification by id', { error: error.message, notificationId });
    throw error;
  }
}

/**
 * Met à jour le statut d'une notification
 * @param {number} notificationId - ID de la notification
 * @param {string} status - Nouveau statut
 * @param {Object} extra - Champs supplémentaires (sentAt, readAt)
 * @returns {Promise<Object>} Notification mise à jour
 */
async function updateNotificationStatus(notificationId, status, extra = {}) {
  const db = getDatabase();

  try {
    const setParts = ['status = $1'];
    const values = [status];
    let paramIndex = 2;

    if (extra.sentAt) {
      setParts.push(`sent_at = $${paramIndex++}`);
      values.push(extra.sentAt);
    }
    if (extra.readAt) {
      setParts.push(`read_at = $${paramIndex++}`);
      values.push(extra.readAt);
    }

    values.push(notificationId);

    const query = `
      UPDATE notifications SET ${setParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Failed to update notification status', { error: error.message, notificationId });
    throw error;
  }
}

/**
 * Récupère l'historique des notifications avec filtres
 * @param {Object} filters - Filtres de recherche
 * @returns {Promise<Object>} Notifications et métadonnées
 */
async function getNotificationHistory(filters = {}) {
  const db = getDatabase();

  try {
    const {
      limit = 50,
      offset = 0,
      status,
      type,
      channel,
      userId,
      startDate,
      endDate,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = filters;

    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`n.status = $${paramIndex++}`);
      queryParams.push(status);
    }
    if (type) {
      whereConditions.push(`n.type = $${paramIndex++}`);
      queryParams.push(type);
    }
    if (channel) {
      whereConditions.push(`n.channel = $${paramIndex++}`);
      queryParams.push(channel);
    }
    if (userId) {
      const normalizedId = normalizeUserId(userId);
      if (normalizedId) {
        whereConditions.push(`n.user_id = $${paramIndex++}`);
        queryParams.push(normalizedId);
      }
    }
    if (startDate) {
      whereConditions.push(`n.created_at >= $${paramIndex++}`);
      queryParams.push(startDate);
    }
    if (endDate) {
      whereConditions.push(`n.created_at <= $${paramIndex++}`);
      queryParams.push(endDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const allowedOrderBy = ['created_at', 'sent_at', 'status', 'type', 'channel'];
    const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'created_at';
    const safeDir = ['ASC', 'DESC'].includes(orderDirection.toUpperCase()) ? orderDirection : 'DESC';

    const query = `
      SELECT n.id, n.user_id, n.template_id, n.type, n.channel, n.subject, n.content,
             n.status, n.sent_at, n.read_at, n.created_at, n.updated_at,
             nl.provider, nl.error_message AS log_error
      FROM notifications n
      LEFT JOIN notification_logs nl ON nl.notification_id = n.id
      ${whereClause}
      ORDER BY n.${safeOrderBy} ${safeDir}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    queryParams.push(limit, offset);

    const countQuery = `SELECT COUNT(*) as total FROM notifications n ${whereClause}`;

    const [result, countResult] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, queryParams.slice(0, -2))
    ]);

    return {
      notifications: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(countResult.rows[0].total)
      }
    };
  } catch (error) {
    logger.error('Failed to get notification history', { error: error.message });
    throw error;
  }
}

/**
 * Récupère les statistiques des notifications
 * @param {Object} filters - Filtres
 * @returns {Promise<Object>} Statistiques
 */
async function getNotificationStatistics(filters = {}) {
  const db = getDatabase();

  try {
    const { startDate, endDate, userId } = filters;

    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex++}`);
      queryParams.push(startDate);
    }
    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex++}`);
      queryParams.push(endDate);
    }
    if (userId) {
      const normalizedId = normalizeUserId(userId);
      if (normalizedId) {
        whereConditions.push(`user_id = $${paramIndex++}`);
        queryParams.push(normalizedId);
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN channel = 'email' THEN 1 END) as emails,
        COUNT(CASE WHEN channel = 'sms' THEN 1 END) as sms,
        COUNT(CASE WHEN channel = 'push' THEN 1 END) as push,
        COUNT(CASE WHEN channel = 'in_app' THEN 1 END) as in_app
      FROM notifications
      ${whereClause}
    `;

    const dailyStatsQuery = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM notifications
      ${whereClause}
      ${whereClause ? 'AND ' : 'WHERE '}created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const [statsResult, dailyResult] = await Promise.all([
      db.query(statsQuery, queryParams),
      db.query(dailyStatsQuery, queryParams)
    ]);

    const stats = statsResult.rows[0];

    return {
      overview: {
        total: parseInt(stats.total),
        sent: parseInt(stats.sent),
        failed: parseInt(stats.failed),
        pending: parseInt(stats.pending),
        successRate: stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0
      },
      byChannel: {
        email: parseInt(stats.emails),
        sms: parseInt(stats.sms),
        push: parseInt(stats.push),
        in_app: parseInt(stats.in_app)
      },
      dailyStats: dailyResult.rows.map(row => ({
        date: row.date,
        total: parseInt(row.total),
        sent: parseInt(row.sent),
        failed: parseInt(row.failed)
      }))
    };
  } catch (error) {
    logger.error('Failed to get notification statistics', { error: error.message });
    throw error;
  }
}

module.exports = {
  createNotification,
  createNotificationLog,
  getNotificationById,
  updateNotificationStatus,
  getNotificationHistory,
  getNotificationStatistics
};
