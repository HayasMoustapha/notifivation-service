/**
 * Repository pour les notifications
 * Gère les opérations de base de données pour les notifications
 */

const { getDatabase } = require('../../config/database');

/**
 * Récupère une notification par son ID
 * @param {string} notificationId - ID de la notification
 * @returns {Promise<Object|null>} Notification ou null
 */
async function getNotificationById(notificationId) {
  const db = getDatabase();
  
  try {
    const query = `
      SELECT 
        id,
        type,
        status,
        priority,
        subject,
        content,
        html_content,
        template_name,
        template_data,
        recipient_email,
        recipient_phone,
        recipient_name,
        sender_id,
        event_id,
        batch_id,
        external_id,
        provider,
        provider_response,
        provider_message_id,
        scheduled_at,
        sent_at,
        failed_at,
        created_at,
        updated_at,
        error_message,
        retry_count
      FROM notifications 
      WHERE id = $1
    `;
    
    const result = await db.query(query, [notificationId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
    
  } catch (error) {
    console.error('[NOTIFICATION_REPOSITORY] Erreur récupération notification:', error.message);
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
      recipient,
      eventId,
      batchId,
      startDate,
      endDate,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = filters;
    
    // Construction des conditions WHERE
    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;
    
    if (status) {
      whereConditions.push(`status = $${paramIndex++}`);
      queryParams.push(status);
    }
    
    if (type) {
      whereConditions.push(`type = $${paramIndex++}`);
      queryParams.push(type);
    }
    
    if (recipient) {
      whereConditions.push(`(recipient_email ILIKE $${paramIndex++} OR recipient_phone ILIKE $${paramIndex++})`);
      queryParams.push(`%${recipient}%`, `%${recipient}%`);
    }
    
    if (eventId) {
      whereConditions.push(`event_id = $${paramIndex++}`);
      queryParams.push(eventId);
    }
    
    if (batchId) {
      whereConditions.push(`batch_id = $${paramIndex++}`);
      queryParams.push(batchId);
    }
    
    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex++}`);
      queryParams.push(startDate);
    }
    
    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex++}`);
      queryParams.push(endDate);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Validation de orderBy pour éviter SQL injection
    const allowedOrderBy = ['created_at', 'sent_at', 'failed_at', 'status', 'type', 'priority'];
    const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'created_at';
    
    const safeOrderDirection = ['ASC', 'DESC'].includes(orderDirection.toUpperCase()) ? orderDirection : 'DESC';
    
    // Requête principale
    const query = `
      SELECT 
        id,
        type,
        status,
        priority,
        subject,
        recipient_email,
        recipient_phone,
        recipient_name,
        template_name,
        provider,
        provider_message_id,
        scheduled_at,
        sent_at,
        failed_at,
        created_at,
        updated_at,
        error_message,
        retry_count,
        event_id,
        batch_id
      FROM notifications 
      ${whereClause}
      ORDER BY ${safeOrderBy} ${safeOrderDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    queryParams.push(limit, offset);
    
    // Requête de comptage
    const countQuery = `
      SELECT COUNT(*) as total
      FROM notifications 
      ${whereClause}
    `;
    
    const [result, countResult] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, queryParams.slice(0, -2)) // Exclure limit et offset
    ]);
    
    return {
      notifications: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(countResult.rows[0].total)
      },
      filters: {
        status,
        type,
        recipient,
        eventId,
        batchId,
        startDate,
        endDate
      }
    };
    
  } catch (error) {
    console.error('[NOTIFICATION_REPOSITORY] Erreur récupération historique:', error.message);
    throw error;
  }
}

/**
 * Récupère les statistiques des notifications
 * @param {Object} filters - Filtres pour les stats
 * @returns {Promise<Object>} Statistiques
 */
async function getNotificationStatistics(filters = {}) {
  const db = getDatabase();
  
  try {
    const {
      startDate,
      endDate,
      eventId,
      batchId
    } = filters;
    
    // Construction des conditions WHERE
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
    
    if (eventId) {
      whereConditions.push(`event_id = $${paramIndex++}`);
      queryParams.push(eventId);
    }
    
    if (batchId) {
      whereConditions.push(`batch_id = $${paramIndex++}`);
      queryParams.push(batchId);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Statistiques générales
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN type = 'email' THEN 1 END) as emails,
        COUNT(CASE WHEN type = 'sms' THEN 1 END) as sms,
        COUNT(CASE WHEN type = 'push' THEN 1 END) as push,
        AVG(CASE WHEN sent_at IS NOT NULL THEN EXTRACT(EPOCH FROM (sent_at - created_at)) END) as avg_delivery_time_seconds
      FROM notifications 
      ${whereClause}
    `;
    
    // Statistiques par provider
    const providerStatsQuery = `
      SELECT 
        provider,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM notifications 
      ${whereClause}
      GROUP BY provider
      ORDER BY count DESC
    `;
    
    // Statistiques par jour (derniers 30 jours)
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
    
    // Statistiques par template
    const templateStatsQuery = `
      SELECT 
        template_name,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM notifications 
      ${whereClause}
      WHERE template_name IS NOT NULL
      GROUP BY template_name
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const [statsResult, providerResult, dailyResult, templateResult] = await Promise.all([
      db.query(statsQuery, queryParams),
      db.query(providerStatsQuery, queryParams),
      db.query(dailyStatsQuery, queryParams),
      db.query(templateStatsQuery, queryParams)
    ]);
    
    const stats = statsResult.rows[0];
    
    return {
      overview: {
        total: parseInt(stats.total),
        sent: parseInt(stats.sent),
        failed: parseInt(stats.failed),
        pending: parseInt(stats.pending),
        queued: parseInt(stats.queued),
        processing: parseInt(stats.processing),
        successRate: stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0,
        avgDeliveryTimeSeconds: stats.avg_delivery_time_seconds ? Math.round(parseFloat(stats.avg_delivery_time_seconds)) : null
      },
      byType: {
        email: parseInt(stats.emails),
        sms: parseInt(stats.sms),
        push: parseInt(stats.push)
      },
      byProvider: providerResult.rows.map(row => ({
        provider: row.provider,
        total: parseInt(row.count),
        sent: parseInt(row.sent),
        failed: parseInt(row.failed),
        successRate: row.count > 0 ? Math.round((row.sent / row.count) * 100) : 0
      })),
      dailyStats: dailyResult.rows.map(row => ({
        date: row.date,
        total: parseInt(row.total),
        sent: parseInt(row.sent),
        failed: parseInt(row.failed)
      })),
      topTemplates: templateResult.rows.map(row => ({
        template: row.template_name,
        total: parseInt(row.count),
        sent: parseInt(row.sent),
        failed: parseInt(row.failed),
        successRate: row.count > 0 ? Math.round((row.sent / row.count) * 100) : 0
      })),
      filters: {
        startDate,
        endDate,
        eventId,
        batchId
      }
    };
    
  } catch (error) {
    console.error('[NOTIFICATION_REPOSITORY] Erreur récupération statistiques:', error.message);
    throw error;
  }
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
      type,
      status,
      priority = 1,
      subject = null,
      content = null,
      htmlContent = null,
      templateName = null,
      templateData = null,
      recipientEmail = null,
      recipientPhone = null,
      recipientName = null,
      senderId = null,
      eventId = null,
      batchId = null,
      externalId = null,
      provider = null,
      providerResponse = null,
      providerMessageId = null,
      scheduledAt = null,
      sentAt = null,
      failedAt = null,
      errorMessage = null,
      errorCode = null,
      retryCount = 0,
      maxRetries = 3
    } = payload;

    const query = `
      INSERT INTO notifications (
        type,
        status,
        priority,
        subject,
        content,
        html_content,
        template_name,
        template_data,
        recipient_email,
        recipient_phone,
        recipient_name,
        sender_id,
        event_id,
        batch_id,
        external_id,
        provider,
        provider_response,
        provider_message_id,
        scheduled_at,
        sent_at,
        failed_at,
        error_message,
        error_code,
        retry_count,
        max_retries
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      )
      RETURNING *
    `;

    const values = [
      type,
      status,
      priority,
      subject,
      content,
      htmlContent,
      templateName,
      templateData,
      recipientEmail,
      recipientPhone,
      recipientName,
      senderId,
      eventId,
      batchId,
      externalId,
      provider,
      providerResponse,
      providerMessageId,
      scheduledAt,
      sentAt,
      failedAt,
      errorMessage,
      errorCode,
      retryCount,
      maxRetries
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('[NOTIFICATION_REPOSITORY] Erreur création notification:', error.message);
    throw error;
  }
}

module.exports = {
  createNotification,
  getNotificationById,
  getNotificationHistory,
  getNotificationStatistics
};
