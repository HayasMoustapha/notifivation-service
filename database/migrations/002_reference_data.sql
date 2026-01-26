-- ========================================
-- MIGRATION 002: DONNÉES RÉFÉRENCE & VALIDATION
-- ========================================
-- Gère les références externes et données système
-- Version IDEMPOTENTE - Généré le 2026-01-26

-- ========================================
-- Vue pour valider les références externes (IDEMPOTENT)
-- ========================================
CREATE OR REPLACE VIEW external_references_validation AS
SELECT 
    'notifications' as table_name,
    'user_id' as column_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as with_reference,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) as null_reference
FROM notifications WHERE deleted_at IS NULL

UNION ALL

SELECT 
    'notification_preferences' as table_name,
    'user_id' as column_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as with_reference,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) as null_reference
FROM notification_preferences WHERE deleted_at IS NULL

UNION ALL

SELECT 
    'notification_templates' as table_name,
    'created_by' as column_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN created_by IS NOT NULL THEN 1 END) as with_reference,
    COUNT(CASE WHEN created_by IS NULL THEN 1 END) as null_reference
FROM notification_templates WHERE deleted_at IS NULL;

-- ========================================
-- Fonction pour valider l'intégrité des références (IDEMPOTENT)
-- ========================================
CREATE OR REPLACE FUNCTION validate_external_references()
RETURNS TABLE(
    table_name TEXT,
    column_name TEXT,
    total_records BIGINT,
    with_reference BIGINT,
    null_reference BIGINT,
    integrity_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        erv.table_name,
        erv.column_name,
        erv.total_records,
        erv.with_reference,
        erv.null_reference,
        CASE 
            WHEN erv.total_records = 0 THEN 'EMPTY_TABLE'
            WHEN erv.null_reference = 0 THEN 'ALL_REFERENCED'
            WHEN erv.with_reference > 0 THEN 'PARTIAL_REFERENCES'
            ELSE 'NO_REFERENCES'
        END as integrity_status
    FROM external_references_validation erv;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Configuration système par défaut (IDEMPOTENT)
-- ========================================
-- Insérer les configurations par défaut
INSERT INTO service_config (key, value, description, created_at, updated_at)
SELECT 
    'email_config',
    '{"provider": "sendgrid", "from_email": "noreply@eventplanner.com", "from_name": "Event Planner"}',
    'Configuration email par défaut',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM service_config WHERE key = 'email_config' AND deleted_at IS NULL
);

INSERT INTO service_config (key, value, description, created_at, updated_at)
SELECT 
    'sms_config',
    '{"provider": "twilio", "from_number": "+33612345678", "country_code": "FR"}',
    'Configuration SMS par défaut',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM service_config WHERE key = 'sms_config' AND deleted_at IS NULL
);

INSERT INTO service_config (key, value, description, created_at, updated_at)
SELECT 
    'rate_limiting',
    '{"emails_per_hour": 1000, "sms_per_hour": 500, "push_per_hour": 2000}',
    'Limites de taux par défaut',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM service_config WHERE key = 'rate_limiting' AND deleted_at IS NULL
);

-- ========================================
-- Templates de notification par défaut (IDEMPOTENT)
-- ========================================
INSERT INTO notification_templates (name, channel, subject_template, body_template, variables, created_at, updated_at)
SELECT 
    'welcome_email',
    'email',
    'Bienvenue sur Event Planner !',
    'Bonjour {{user_name}}, bienvenue sur Event Planner !',
    '{"user_name": "string"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM notification_templates WHERE name = 'welcome_email' AND deleted_at IS NULL
);

INSERT INTO notification_templates (name, channel, subject_template, body_template, variables, created_at, updated_at)
SELECT 
    'event_confirmation',
    'email',
    'Confirmation d''événement',
    'Votre événement "{{event_title}}" a été confirmé.',
    '{"event_title": "string", "event_date": "date"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM notification_templates WHERE name = 'event_confirmation' AND deleted_at IS NULL
);

INSERT INTO notification_templates (name, channel, subject_template, body_template, variables, created_at, updated_at)
SELECT 
    'ticket_purchased',
    'email',
    'Achat de ticket',
    'Vous avez acheté {{ticket_count}} ticket(s) pour "{{event_title}}".',
    '{"ticket_count": "number", "event_title": "string"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM notification_templates WHERE name = 'ticket_purchased' AND deleted_at IS NULL
);

INSERT INTO notification_templates (name, channel, subject_template, body_template, variables, created_at, updated_at)
SELECT 
    'payment_confirmation',
    'email',
    'Confirmation de paiement',
    'Votre paiement de {{amount}}€ a été confirmé.',
    '{"amount": "number", "currency": "string"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM notification_templates WHERE name = 'payment_confirmation' AND deleted_at IS NULL
);

INSERT INTO notification_templates (name, channel, subject_template, body_template, variables, created_at, updated_at)
SELECT 
    'event_reminder',
    'sms',
    'Rappel: {{event_title}} demain',
    'Rappel: Votre événement "{{event_title}}" aura lieu demain à {{event_time}}.',
    '{"event_title": "string", "event_time": "time"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM notification_templates WHERE name = 'event_reminder' AND deleted_at IS NULL
);

-- ========================================
-- Préférences de notification par défaut (IDEMPOTENT)
-- ========================================
-- Note: Ces préférences seront créées lors de l'inscription des utilisateurs
-- via l'API pour garantir la cohérence avec le service auth

-- ========================================
-- Rapport d'intégrité (IDEMPOTENT)
-- ========================================
DO $$
DECLARE
    validation_record RECORD;
    total_issues INTEGER := 0;
    config_count INTEGER;
    template_count INTEGER;
BEGIN
    -- Compter les configurations et templates
    SELECT COUNT(*) INTO config_count FROM service_config WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO template_count FROM notification_templates WHERE deleted_at IS NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VALIDATION RÉFÉRENCES EXTERNES - notification-service';
    RAISE NOTICE '══════════════════════════════════════════════════';
    RAISE NOTICE '📊 Analyse des références externes...';
    
    FOR validation_record IN SELECT * FROM validate_external_references() LOOP
        RAISE NOTICE '';
        RAISE NOTICE '📋 Table: %.%', validation_record.table_name, validation_record.column_name;
        RAISE NOTICE '   Total enregistrements: %', validation_record.total_records;
        RAISE NOTICE '   Avec référence: %', validation_record.with_reference;
        RAISE NOTICE '   Sans référence: %', validation_record.null_reference;
        RAISE NOTICE '   Statut intégrité: %', validation_record.integrity_status;
        
        IF validation_record.integrity_status IN ('PARTIAL_REFERENCES', 'NO_REFERENCES') 
           AND validation_record.total_records > 0 THEN
            total_issues := total_issues + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '⚙️  Configurations système: %', config_count;
    RAISE NOTICE '📧 Templates de notification: %', template_count;
    RAISE NOTICE '';
    RAISE NOTICE '🎯 RÉSUMÉ VALIDATION';
    RAISE NOTICE '══════════════════════════════════════════════════';
    
    IF total_issues = 0 AND config_count >= 3 AND template_count >= 5 THEN
        RAISE NOTICE '✅ SUCCÈS : Service prêt à fonctionner';
        RAISE NOTICE '🔗 Références externes valides';
        RAISE NOTICE '⚙️  Configurations système initialisées';
        RAISE NOTICE '📧 Templates de notification configurés';
    ELSE
        RAISE NOTICE '⚠️  ATTENTION : % problème(s) détecté(s)', total_issues;
        RAISE NOTICE '💡 Solution: Assurez-vous que les entités référencées existent';
        RAISE NOTICE '🔧 Les enregistrements avec références NULL seront ignorés';
    END IF;
    
    RAISE NOTICE '══════════════════════════════════════════════════';
END $$;
