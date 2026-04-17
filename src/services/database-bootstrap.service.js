const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const MigrationCreator = require('../shared/migration-creator');

// Créer une connexion à la base de données (lazy - après qu'elle ait été créée)
const createConnection = () => {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'event_planner_notifications',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
};

// Connexion lazy - créée uniquement après ensureDatabaseExists()
let connection = null;
const getConnection = () => {
  if (!connection) {
    connection = createConnection();
  }
  return connection;
};

/**
 * Service de Bootstrap de Base de Données simplifié
 */
class DatabaseBootstrap {
  constructor() {
    this.migrationsPath = path.join(__dirname, '../../src/database/migrations');
    this.bootstrapPath = path.join(__dirname, '../../src/database/bootstrap');
    this.lockId = 12345;
    this.requiredTables = [
      'schema_migrations',
      'notification_templates',
      'notifications',
      'notification_preferences',
      'notification_logs'
    ];
  }

  /**
   * Initialise la base de données (méthode OBLIGATOIRE)
   */
  async initialize() {
    let lockAcquired = false;
    
    try {
      // S'assurer que la base existe avant tout (évite les erreurs de connexion)
      await this.ensureDatabaseExists();

      const autoBootstrapEnabled = process.env.DB_AUTO_BOOTSTRAP === 'true';
      const initialSchemaStatus = await this.getSchemaStatus();

      if (!autoBootstrapEnabled && initialSchemaStatus.ready) {
        console.log('ℹ️  Bootstrap automatique désactivé, schéma déjà prêt');
        return {
          success: true,
          message: 'Bootstrap désactivé, schéma déjà prêt',
          actions: [],
          schemaReady: true
        };
      }

      if (!autoBootstrapEnabled && !initialSchemaStatus.ready) {
        const missingTablesLabel = initialSchemaStatus.missingTables.join(', ');

        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            `Schéma notifications incomplet (${missingTablesLabel}) avec DB_AUTO_BOOTSTRAP=false`
          );
        }

        console.log(
          `⚠️  Schéma incomplet détecté (${missingTablesLabel}). Bootstrap forcé en ${process.env.NODE_ENV || 'development'}.`
        );
      }

      console.log('🚀 Démarrage du bootstrap de la base de données...');
      const startTime = Date.now();
      const actions = [];

      // Acquérir le verrou
      await this.acquireLock();
      lockAcquired = true;

      // Créer la table schema_migrations
      await this.createSchemaMigrationsTable();
      actions.push('schema_migrations');

      // Appliquer les migrations
      const appliedMigrations = await this.applyMigrations();
      actions.push(...appliedMigrations);

      const finalSchemaStatus = await this.getSchemaStatus();
      if (!finalSchemaStatus.ready) {
        throw new Error(
          `Bootstrap terminé avec un schéma incomplet (${finalSchemaStatus.missingTables.join(', ')})`
        );
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Bootstrap terminé en ${duration}ms`);

      return {
        success: true,
        message: 'Bootstrap réussi',
        duration,
        actions,
        migrationsApplied: appliedMigrations.length,
        schemaReady: true
      };

    } catch (error) {
      console.error('❌ Erreur lors du bootstrap:', error.message);
      throw error;
    } finally {
      if (lockAcquired) {
        await this.releaseLock();
      }
    }
  }

  /**
   * Crée la base de données si elle n'existe pas
   */
  async ensureDatabaseExists() {
    const { Pool } = require('pg');
    
    const tempConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: 'postgres'
    };
    
    const tempPool = new Pool(tempConfig);
    const tempClient = await tempPool.connect();
    
    try {
      const databaseName = process.env.DB_NAME || 'event_planner_notifications';
      
      const checkQuery = `
        SELECT 1 FROM pg_database 
        WHERE datname = '${databaseName}'
      `;
      const result = await tempClient.query(checkQuery);
      
      if (result.rows.length === 0) {
        const createQuery = `CREATE DATABASE "${databaseName}"`;
        await tempClient.query(createQuery);
        console.log(`✅ Base de données ${databaseName} créée avec succès`);
      } else {
        console.log(`ℹ️  La base de données ${databaseName} existe déjà`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la création de la base de données:', error.message);
      throw error;
    } finally {
      tempClient.release();
      await tempPool.end();
    }
  }

  /**
   * Crée la base de données et la table de contrôle schema_migrations
   */
  async createSchemaMigrationsTable() {
    await this.ensureDatabaseExists();
    
    // Ne pas utiliser MigrationCreator pour éviter les conflits
    // La migration 001_initial_schema.sql existe déjà
    
    const client = await getConnection().connect();
    try {
      const bootstrapSql = await fs.readFile(
        path.join(this.bootstrapPath, '001_create_schema_migrations.sql'),
        'utf8'
      );
      await client.query(bootstrapSql);
      console.log('✅ Table schema_migrations vérifiée/créée');
    } finally {
      client.release();
    }
  }

  /**
   * Vérifie si le schéma minimum requis est présent
   * @returns {Promise<{ready: boolean, existingTables: string[], missingTables: string[]}>}
   */
  async getSchemaStatus() {
    const client = await getConnection().connect();
    try {
      const result = await client.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
        `,
        [this.requiredTables]
      );

      const existingTables = result.rows.map(row => row.table_name);
      const existingTablesSet = new Set(existingTables);
      const missingTables = this.requiredTables.filter(
        tableName => !existingTablesSet.has(tableName)
      );

      return {
        ready: missingTables.length === 0,
        existingTables,
        missingTables
      };
    } finally {
      client.release();
    }
  }

  /**
   * Applique les migrations en attente
   */
  async applyMigrations() {
    const appliedMigrations = [];
    
    const migrationFiles = await this.getMigrationFiles();
    
    for (const file of migrationFiles) {
      const migrationName = path.basename(file);
      
      if (await this.isMigrationApplied(migrationName)) {
        console.log(`⏭️  Migration déjà appliquée: ${migrationName}`);
        continue;
      }
      
      await this.applyMigration(file, migrationName);
      appliedMigrations.push(migrationName);
    }
    
    return appliedMigrations;
  }

  /**
   * Récupère les fichiers de migration dans l'ordre
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort()
        .map(file => path.join(this.migrationsPath, file));
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 Dossier migrations vide ou inexistant');
        return [];
      }
      throw error;
    }
  }

  /**
   * Vérifie si une migration a déjà été appliquée
   */
  async isMigrationApplied(migrationName) {
    const client = await getConnection().connect();
    try {
      const result = await client.query(
        'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
        [migrationName]
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Applique une migration spécifique
   */
  async applyMigration(filePath, migrationName) {
    const client = await getConnection().connect();
    try {
      await client.query('BEGIN');
      
      const migrationSQL = await fs.readFile(filePath, 'utf8');
      await client.query(migrationSQL);
      
      const fileStats = await fs.stat(filePath);
      const checksum = crypto.createHash('sha256').update(migrationSQL).digest('hex');
      
      await client.query(`
        INSERT INTO schema_migrations (migration_name, checksum, file_size, execution_time_ms)
        VALUES ($1, $2, $3, $4)
      `, [migrationName, checksum, fileStats.size, 0]);
      
      await client.query('COMMIT');
      console.log(`✅ Migration appliquée: ${migrationName}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Erreur migration ${migrationName}:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Acquiert un verrou PostgreSQL
   */
  async acquireLock() {
    const client = await getConnection().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT pg_advisory_lock($1)', [this.lockId]);
      console.log('🔒 Verrou de bootstrap acquis');
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Libère le verrou PostgreSQL
   */
  async releaseLock() {
    const client = await getConnection().connect();
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [this.lockId]);
      console.log('🔓 Verrou de bootstrap libéré');
    } finally {
      client.release();
    }
  }
}

module.exports = new DatabaseBootstrap();
