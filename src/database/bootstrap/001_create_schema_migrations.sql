-- Création de la table schema_migrations
-- 
-- RÔLE : Table de suivi des migrations de base de données
-- UTILISATION : Contrôle de version du schéma de données
-- 
-- Cette table permet de suivre quelles migrations ont été appliquées
-- sur la base de données du service de notification.

-- Création de la table schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    checksum VARCHAR(64) NOT NULL,
    file_size INTEGER NOT NULL,
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les recherches de migrations
CREATE INDEX IF NOT EXISTS idx_schema_migrations_name ON schema_migrations(migration_name);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at ON schema_migrations(executed_at);

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_schema_migrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_schema_migrations_updated_at
    BEFORE UPDATE ON schema_migrations
    FOR EACH ROW
    EXECUTE FUNCTION update_schema_migrations_updated_at();

-- Commentaires sur la table
COMMENT ON TABLE schema_migrations IS 'Table de suivi des migrations de base de données pour le service de notification';
COMMENT ON COLUMN schema_migrations.migration_name IS 'Nom du fichier de migration';
COMMENT ON COLUMN schema_migrations.checksum IS 'Checksum SHA256 du fichier de migration';
COMMENT ON COLUMN schema_migrations.file_size IS 'Taille du fichier de migration en octets';
COMMENT ON COLUMN schema_migrations.execution_time_ms IS 'Temps d''exécution de la migration en millisecondes';
COMMENT ON COLUMN schema_migrations.executed_at IS 'Date et heure d''exécution de la migration';
