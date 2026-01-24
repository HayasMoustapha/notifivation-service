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

-- Table des notifications
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL,
    type VARCHAR(100) NOT NULL,
    channel notification_channel NOT NULL,
    subject VARCHAR(255),
    content TEXT,
    status notification_status DEFAULT 'pending',
    sent_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des templates de notification
CREATE TABLE IF NOT EXISTS notification_templates (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    channel notification_channel NOT NULL,
    subject_template VARCHAR(255),
    body_template TEXT,
    variables JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des préférences de notification
CREATE TABLE IF NOT EXISTS notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL,
    channel notification_channel NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, channel)
);

-- Table des logs de notification
CREATE TABLE IF NOT EXISTS notification_logs (
    id BIGSERIAL PRIMARY KEY,
    uid UUID NOT NULL DEFAULT gen_random_uuid(),
    notification_id BIGINT REFERENCES notifications(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL,
    response JSONB,
    error_message TEXT,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_templates_name ON notification_templates(name);
CREATE INDEX IF NOT EXISTS idx_notification_templates_channel ON notification_templates(channel);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_notification_id ON notification_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at);

-- Commentaires pour documentation
COMMENT ON TABLE notifications IS 'Table principale des notifications';
COMMENT ON TABLE notification_templates IS 'Templates pour les notifications';
COMMENT ON TABLE notification_preferences IS 'Préférences utilisateur pour les notifications';
COMMENT ON TABLE notification_logs IS 'Logs des envois de notifications';

-- Insertion de templates de base
INSERT INTO notification_templates (name, channel, subject_template, body_template, variables) VALUES 
('welcome_email', 'email', 'Bienvenue sur Event Planner !', 'Bonjour {{user_name}}, bienvenue sur Event Planner !', '{"user_name": "string"}'),
('event_confirmation', 'email', 'Confirmation d''événement', 'Votre événement "{{event_title}}" a été confirmé.', '{"event_title": "string", "event_date": "date"}'),
('ticket_purchased', 'email', 'Achat de ticket', 'Vous avez acheté {{ticket_count}} ticket(s) pour "{{event_title}}".', '{"ticket_count": "number", "event_title": "string"}'),
('payment_confirmation', 'email', 'Confirmation de paiement', 'Votre paiement de {{amount}}€ a été confirmé.', '{"amount": "number", "currency": "string"}')
ON CONFLICT (name) DO NOTHING;
