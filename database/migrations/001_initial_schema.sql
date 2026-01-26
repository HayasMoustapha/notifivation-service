-- Migration initiale pour Notification Service
-- Basé sur notification-diagram.md

-- Extension UUID pour gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Types énumérés pour les notifications
DO $$ BEGIN
    CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'in_app');
    CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Table des notifications (avec champs audit complets)
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id BIGINT, -- Référence externe au service auth
    type VARCHAR(100) NOT NULL,
    channel notification_channel NOT NULL,
    subject VARCHAR(255),
    content TEXT,
    status notification_status DEFAULT 'pending',
    sent_at TIMESTAMP,
    read_at TIMESTAMP,
    -- Champs d'audit complets
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by BIGINT
);

-- Table des templates de notification (avec champs audit complets)
CREATE TABLE IF NOT EXISTS notification_templates (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    channel notification_channel NOT NULL,
    subject_template VARCHAR(255),
    body_template TEXT,
    variables JSONB,
    is_active BOOLEAN DEFAULT true,
    -- Champs d'audit complets
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by BIGINT
);

-- Table des préférences de notification (avec champs audit complets)
CREATE TABLE IF NOT EXISTS notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id BIGINT, -- Référence externe au service auth
    channel notification_channel NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    -- Champs d'audit complets
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by BIGINT,
    -- Contrainte unique
    UNIQUE(user_id, channel)
);

-- Table des logs de notification (avec champs audit complets)
CREATE TABLE IF NOT EXISTS notification_logs (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    notification_id BIGINT REFERENCES notifications(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL,
    response JSONB,
    error_message TEXT,
    status VARCHAR(50) NOT NULL,
    -- Champs d'audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT
);

-- Table de configuration du service (avec champs audit complets)
CREATE TABLE IF NOT EXISTS service_config (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by BIGINT
);

-- Index pour optimiser les performances (avec filtre deleted_at)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_templates_name ON notification_templates(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_templates_channel ON notification_templates(channel) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_logs_notification_id ON notification_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_service_config_key ON service_config(key) WHERE deleted_at IS NULL;

-- Commentaires pour documentation
COMMENT ON TABLE notifications IS 'Table principale des notifications avec champs audit complets';
COMMENT ON TABLE notification_templates IS 'Templates pour les notifications avec champs audit complets';
COMMENT ON TABLE notification_preferences IS 'Préférences utilisateur pour les notifications avec champs audit complets';
COMMENT ON TABLE notification_logs IS 'Logs des envois de notifications';
COMMENT ON TABLE service_config IS 'Configuration du service avec champs audit complets';
