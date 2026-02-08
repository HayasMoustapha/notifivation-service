/**
 * Service de gestion des templates de notification
 * Schema conforme au diagramme : notification_templates
 * Colonnes : id, name, channel, subject_template, body_template, variables
 */

const { getDatabase } = require('../../config/database');
const logger = require('../../utils/logger');

class NotificationTemplatesService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Crée un nouveau template
   * @param {Object} templateData - Données du template
   * @returns {Promise<Object>} Template créé
   */
  async createTemplate(templateData) {
    try {
      const {
        name,
        channel,
        subjectTemplate = null,
        bodyTemplate = null,
        variables = {}
      } = templateData;

      const query = `
        INSERT INTO notification_templates (name, channel, subject_template, body_template, variables)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const values = [name, channel, subjectTemplate, bodyTemplate, JSON.stringify(variables)];
      const result = await this.db.query(query, values);
      const template = result.rows[0];

      logger.info('Notification template created', {
        templateId: template.id,
        name: template.name,
        channel: template.channel
      });

      return template;
    } catch (error) {
      logger.error('Failed to create template', {
        error: error.message,
        name: templateData.name
      });
      throw error;
    }
  }

  /**
   * Récupère un template par nom
   * @param {string} name - Nom du template
   * @param {string} channel - Canal optionnel (email/sms/push)
   * @returns {Promise<Object|null>} Template ou null
   */
  async getTemplateByName(name, channel = null) {
    try {
      let query = `
        SELECT id, name, channel, subject_template, body_template, variables,
               created_at, updated_at
        FROM notification_templates
        WHERE name = $1
      `;

      const params = [name];

      if (channel) {
        query += ' AND channel = $2';
        params.push(channel);
      }

      query += ' LIMIT 1';

      const result = await this.db.query(query, params);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get template by name', {
        error: error.message,
        name,
        channel
      });
      throw error;
    }
  }

  /**
   * Récupère un template par ID
   * @param {number} templateId - ID du template
   * @returns {Promise<Object|null>} Template ou null
   */
  async getTemplateById(templateId) {
    try {
      const query = `
        SELECT id, name, channel, subject_template, body_template, variables,
               created_at, updated_at
        FROM notification_templates
        WHERE id = $1
      `;

      const result = await this.db.query(query, [templateId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Failed to get template by id', { error: error.message, templateId });
      throw error;
    }
  }

  /**
   * Met à jour un template
   * @param {number} templateId - ID du template
   * @param {Object} updates - Mises à jour
   * @returns {Promise<Object>} Template mis à jour
   */
  async updateTemplate(templateId, updates) {
    try {
      const allowedFields = {
        'subject_template': 'subjectTemplate',
        'body_template': 'bodyTemplate',
        'variables': 'variables',
        'channel': 'channel'
      };

      const setParts = [];
      const values = [];
      let paramIndex = 1;

      for (const [dbField, jsField] of Object.entries(allowedFields)) {
        if (updates[jsField] !== undefined || updates[dbField] !== undefined) {
          const value = updates[jsField] !== undefined ? updates[jsField] : updates[dbField];
          if (dbField === 'variables') {
            setParts.push(`${dbField} = $${paramIndex++}`);
            values.push(JSON.stringify(value));
          } else {
            setParts.push(`${dbField} = $${paramIndex++}`);
            values.push(value);
          }
        }
      }

      if (setParts.length === 0) {
        throw new Error('No valid fields to update');
      }

      const query = `
        UPDATE notification_templates
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex++}
        RETURNING *
      `;

      values.push(templateId);
      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Template not found');
      }

      logger.info('Template updated', {
        templateId,
        name: result.rows[0].name
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update template', {
        error: error.message,
        templateId
      });
      throw error;
    }
  }

  /**
   * Supprime un template
   * @param {number} templateId - ID du template
   * @returns {Promise<boolean>} True si supprimé
   */
  async deleteTemplate(templateId) {
    try {
      const query = 'DELETE FROM notification_templates WHERE id = $1';
      const result = await this.db.query(query, [templateId]);
      const deleted = result.rowCount > 0;

      if (deleted) {
        logger.info('Template deleted', { templateId });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete template', {
        error: error.message,
        templateId
      });
      throw error;
    }
  }

  /**
   * Liste les templates avec filtres
   * @param {Object} filters - Filtres
   * @returns {Promise<Object>} Templates et métadonnées
   */
  async listTemplates(filters = {}) {
    try {
      const { channel, limit = 50, offset = 0 } = filters;

      const whereConditions = [];
      const queryParams = [];
      let paramIndex = 1;

      if (channel) {
        whereConditions.push(`channel = $${paramIndex++}`);
        queryParams.push(channel);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const query = `
        SELECT id, name, channel, subject_template, body_template, variables,
               created_at, updated_at
        FROM notification_templates
        ${whereClause}
        ORDER BY name ASC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      queryParams.push(limit, offset);

      const countQuery = `
        SELECT COUNT(*) as total
        FROM notification_templates
        ${whereClause}
      `;

      const [result, countResult] = await Promise.all([
        this.db.query(query, queryParams),
        this.db.query(countQuery, queryParams.slice(0, -2))
      ]);

      const total = parseInt(countResult.rows[0].total);

      return {
        templates: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < total
        }
      };
    } catch (error) {
      logger.error('Failed to list templates', {
        error: error.message,
        filters
      });
      throw error;
    }
  }

  /**
   * Rend un template avec des données
   * @param {Object} template - Template DB
   * @param {Object} data - Données à injecter
   * @returns {Promise<Object>} Contenu rendu avec htmlContent et textContent
   */
  async renderTemplate(template, data = {}) {
    try {
      let subject = template.subject_template || '';
      let body = template.body_template || '';

      // Remplacement simple {{variable}}
      for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        subject = subject.replace(regex, value || '');
        body = body.replace(regex, value || '');
      }

      // Pour les emails: body est traité comme HTML, on génère aussi une version texte
      // Pour les SMS: body est du texte brut
      const isEmail = template.channel === 'email';
      const htmlContent = isEmail ? body : null;
      const textContent = isEmail ? this.htmlToText(body) : body;

      return {
        subject,
        body, // Maintenu pour compatibilité
        htmlContent,
        textContent,
        templateName: template.name,
        channel: template.channel
      };
    } catch (error) {
      logger.error('Failed to render template', {
        error: error.message,
        templateName: template.name
      });
      throw error;
    }
  }

  /**
   * Convertit du HTML en texte brut
   * @param {string} html - Contenu HTML
   * @returns {string} Texte brut
   */
  htmlToText(html) {
    if (!html) return '';
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Valide un template
   * @param {Object} templateData - Données du template
   * @returns {Object} Résultat de validation
   */
  validateTemplate(templateData) {
    const errors = [];

    if (!templateData.name || templateData.name.length < 3) {
      errors.push('Name must be at least 3 characters');
    }

    if (!['email', 'sms', 'push'].includes(templateData.channel)) {
      errors.push('Channel must be email, sms or push');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new NotificationTemplatesService();
