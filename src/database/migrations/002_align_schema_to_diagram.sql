-- ========================================
-- ALIGNEMENT SCHEMA NOTIFICATIONS (DIAGRAMME)
-- ========================================
-- Objectif:
-- 1) Conserver uniquement les 4 tables du diagramme
-- 2) Aligner les colonnes/contraintes sans casser la communication inter-services
-- 3) Nettoyer les structures legacy si elles existent

-- Supprimer les tables legacy non prévues par le diagramme
DROP TABLE IF EXISTS notification_stats;

-- ============================
-- notifications
-- ============================
ALTER TABLE IF EXISTS notifications
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS template_id BIGINT,
  ADD COLUMN IF NOT EXISTS channel VARCHAR(10),
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

-- Nettoyage des colonnes legacy (si présentes)
ALTER TABLE IF EXISTS notifications
  DROP COLUMN IF EXISTS recipient,
  DROP COLUMN IF EXISTS template_name,
  DROP COLUMN IF EXISTS template_data,
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS provider_message_id;

-- Contraintes diagramme (ajoutées si absentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_channel_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_channel_check
      CHECK (channel IN ('email', 'sms', 'push', 'in_app'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_status_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_status_check
      CHECK (status IN ('pending', 'sent', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_template_id_fkey'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES notification_templates(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ============================
-- notification_templates
-- ============================
-- Renommage des colonnes legacy si besoin
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'channel'
  ) THEN
    ALTER TABLE notification_templates RENAME COLUMN type TO channel;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'content_template'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'body_template'
  ) THEN
    ALTER TABLE notification_templates RENAME COLUMN content_template TO body_template;
  END IF;
END$$;

ALTER TABLE IF EXISTS notification_templates
  ADD COLUMN IF NOT EXISTS channel VARCHAR(10),
  ADD COLUMN IF NOT EXISTS subject_template VARCHAR(255),
  ADD COLUMN IF NOT EXISTS body_template TEXT,
  ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '{}'::jsonb;

-- Nettoyage des colonnes legacy (si présentes)
ALTER TABLE IF EXISTS notification_templates
  DROP COLUMN IF EXISTS locale,
  DROP COLUMN IF EXISTS is_active;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_templates_channel_check'
  ) THEN
    ALTER TABLE notification_templates
      ADD CONSTRAINT notification_templates_channel_check
      CHECK (channel IN ('email', 'sms', 'push'));
  END IF;
END$$;

-- ============================
-- notification_preferences
-- ============================
ALTER TABLE IF EXISTS notification_preferences
  ADD COLUMN IF NOT EXISTS channel VARCHAR(10),
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_preferences_channel_check'
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_channel_check
      CHECK (channel IN ('email', 'sms', 'push', 'in_app'));
  END IF;
END$$;

-- ============================
-- notification_logs
-- ============================
ALTER TABLE IF EXISTS notification_logs
  ADD COLUMN IF NOT EXISTS notification_id BIGINT,
  ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS response JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Nettoyage des colonnes legacy (si présentes)
ALTER TABLE IF EXISTS notification_logs
  DROP COLUMN IF EXISTS level,
  DROP COLUMN IF EXISTS message,
  DROP COLUMN IF EXISTS details;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_logs_notification_id_fkey'
  ) THEN
    ALTER TABLE notification_logs
      ADD CONSTRAINT notification_logs_notification_id_fkey
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
  END IF;
END$$;

