-- ========================================
-- 📧 NOTIFICATION SERVICE - MIGRATION INITIALE
-- ========================================
-- 
-- RÔLE : Création des tables principales pour le service de notification
-- UTILISATION : Stockage des emails, SMS, templates et files d'attente
-- 
-- Cette migration crée toutes les tables nécessaires pour le fonctionnement
-- du service de notification : emails, SMS, templates, et suivi.

-- ========================================
-- 📧 TABLE DES EMAILS
-- ========================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'sms', 'push')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'sent', 'failed', 'cancelled')),
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    
    -- Contenu
    subject VARCHAR(255),
    content TEXT,
    html_content TEXT,
    template_name VARCHAR(100),
    template_data JSONB,
    
    -- Destinataires
    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(20),
    recipient_name VARCHAR(255),
    
    -- Métadonnées
    sender_id UUID,
    event_id UUID,
    batch_id UUID,
    external_id VARCHAR(100),
    
    -- Provider et configuration
    provider VARCHAR(50) DEFAULT 'sendgrid',
    provider_response JSONB,
    provider_message_id VARCHAR(255),
    
    -- Timestamps
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Erreurs
    error_message TEXT,
    error_code VARCHAR(100),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3
);

-- ========================================
-- 📱 TABLE DES SMS
-- ========================================
CREATE TABLE IF NOT EXISTS sms_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    
    -- Contenu SMS spécifique
    message TEXT NOT NULL,
    country_code VARCHAR(5) DEFAULT '+33',
    
    -- Métadonnées SMS
    from_number VARCHAR(20),
    cost DECIMAL(10, 4),
    segments INTEGER DEFAULT 1,
    
    -- Provider SMS
    sms_provider VARCHAR(50) DEFAULT 'twilio',
    twilio_sid VARCHAR(100),
    twilio_status VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 📋 TABLE DES TEMPLATES
-- ========================================
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'sms')),
    subject VARCHAR(255),
    html_content TEXT,
    text_content TEXT,
    
    -- Variables du template
    variables JSONB,
    default_data JSONB,
    
    -- Métadonnées
    description TEXT,
    category VARCHAR(50),
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 📊 TABLE DES STATISTIQUES
-- ========================================
CREATE TABLE IF NOT EXISTS notification_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    type VARCHAR(20) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    
    -- Compteurs
    total_sent INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_pending INTEGER DEFAULT 0,
    
    -- Métriques
    avg_delivery_time_ms INTEGER,
    total_cost DECIMAL(10, 4),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date, type, provider)
);

-- ========================================
-- 📦 TABLE DES BATCHS
-- ========================================
CREATE TABLE IF NOT EXISTS notification_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
    
    -- Métadonnées du batch
    total_count INTEGER NOT NULL,
    processed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    
    -- Configuration
    provider VARCHAR(50),
    template_name VARCHAR(100),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    
    -- Fichiers (pour les imports)
    input_file_path VARCHAR(500),
    output_file_path VARCHAR(500),
    
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- INDEXES
-- ========================================

-- Index pour la table notifications
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_email ON notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_phone ON notifications(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at ON notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_batch_id ON notifications(batch_id);
CREATE INDEX IF NOT EXISTS idx_notifications_event_id ON notifications(event_id);

-- Index pour la table sms_notifications
CREATE INDEX IF NOT EXISTS idx_sms_notifications_notification_id ON sms_notifications(notification_id);
CREATE INDEX IF NOT EXISTS idx_sms_notifications_twilio_sid ON sms_notifications(twilio_sid);

-- Index pour la table notification_templates
CREATE INDEX IF NOT EXISTS idx_notification_templates_name ON notification_templates(name);
CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON notification_templates(is_active);

-- Index pour la table notification_stats
CREATE INDEX IF NOT EXISTS idx_notification_stats_date ON notification_stats(date);
CREATE INDEX IF NOT EXISTS idx_notification_stats_type ON notification_stats(type);

-- Index pour la table notification_batches
CREATE INDEX IF NOT EXISTS idx_notification_batches_status ON notification_batches(status);
CREATE INDEX IF NOT EXISTS idx_notification_batches_created_at ON notification_batches(created_at);

-- ========================================
-- TRIGGERS
-- ========================================

-- Trigger pour mettre à jour updated_at sur notifications
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

-- Trigger pour mettre à jour updated_at sur sms_notifications
CREATE OR REPLACE FUNCTION update_sms_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sms_notifications_updated_at
    BEFORE UPDATE ON sms_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_notifications_updated_at();

-- Trigger pour mettre à jour updated_at sur notification_templates
CREATE OR REPLACE FUNCTION update_notification_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_templates_updated_at();

-- Trigger pour mettre à jour updated_at sur notification_stats
CREATE OR REPLACE FUNCTION update_notification_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notification_stats_updated_at
    BEFORE UPDATE ON notification_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_stats_updated_at();

-- Trigger pour mettre à jour updated_at sur notification_batches
CREATE OR REPLACE FUNCTION update_notification_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notification_batches_updated_at
    BEFORE UPDATE ON notification_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_batches_updated_at();

-- ========================================
-- COMMENTAIRES
-- ========================================

COMMENT ON TABLE notifications IS 'Table principale des notifications (emails, SMS, push)';
COMMENT ON TABLE sms_notifications IS 'Table spécifique aux SMS avec détails techniques';
COMMENT ON TABLE notification_templates IS 'Table des templates de notification';
COMMENT ON TABLE notification_stats IS 'Table des statistiques quotidiennes de notifications';
COMMENT ON TABLE notification_batches IS 'Table des traitements par lots de notifications';

-- Activation de l'extension UUID-OSSP si nécessaire
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
