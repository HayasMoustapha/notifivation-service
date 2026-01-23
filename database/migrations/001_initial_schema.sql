-- Notification Service Database Schema
-- Based on notification-diagram.md

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS event_planner_notifications;
\c event_planner_notifications;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create notification_types enum
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'in_app');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'retry');
CREATE TYPE notification_type AS ENUM ('welcome', 'password_reset', 'event_confirmation', 'event_reminder', 'ticket_purchased', 'payment_confirmation', 'payment_failed', 'custom');

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    type notification_type NOT NULL,
    channel notification_channel NOT NULL,
    subject VARCHAR(255),
    content TEXT NOT NULL,
    status notification_status DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification templates table
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    type notification_type NOT NULL,
    channel notification_channel NOT NULL,
    subject_template VARCHAR(500),
    body_template TEXT NOT NULL,
    variables JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences table
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    channel notification_channel NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, channel)
);

-- Notification logs table
CREATE TABLE notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL,
    response JSONB,
    error_message TEXT,
    status_code INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Queue jobs table (for Bull queue persistence)
CREATE TABLE queue_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    opts JSONB DEFAULT '{}',
    progress INTEGER DEFAULT 0,
    delay INTEGER DEFAULT 0,
    timestamp INTEGER DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP),
    attempts INTEGER DEFAULT 0,
    finished_on INTEGER,
    processed_on INTEGER,
    failed_reason TEXT,
    stacktrace TEXT,
    returnvalue JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_channel ON notifications(channel);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_scheduled_at ON notifications(scheduled_at) WHERE scheduled_at IS NOT NULL;

CREATE INDEX idx_notification_templates_type ON notification_templates(type);
CREATE INDEX idx_notification_templates_channel ON notification_templates(channel);
CREATE INDEX idx_notification_templates_active ON notification_templates(is_active);

CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_channel ON notification_preferences(channel);

CREATE INDEX idx_notification_logs_notification_id ON notification_logs(notification_id);
CREATE INDEX idx_notification_logs_provider ON notification_logs(provider);
CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at);

CREATE INDEX idx_queue_jobs_name ON queue_jobs(name);
CREATE INDEX idx_queue_jobs_timestamp ON queue_jobs(timestamp);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification templates
INSERT INTO notification_templates (name, type, channel, subject_template, body_template, variables) VALUES
('welcome_email', 'welcome', 'email', 'Welcome to Event Planner!', 'Hello {{firstName}},\n\nWelcome to Event Planner! We''re excited to have you join our platform.\n\nBest regards,\nThe Event Planner Team', '{"firstName": "string", "lastName": "string", "email": "string"}'),
('welcome_sms', 'welcome', 'sms', null, 'Welcome to Event Planner, {{firstName}}! Get started with your first event today.', '{"firstName": "string"}'),
('password_reset_email', 'password_reset', 'email', 'Reset Your Password', 'Hello {{firstName}},\n\nYou requested to reset your password. Click the link below to reset it:\n{{resetUrl}}\n\nThis link will expire in 1 hour.\n\nIf you didn''t request this, please ignore this email.\n\nBest regards,\nThe Event Planner Team', '{"firstName": "string", "resetUrl": "string"}'),
('password_reset_sms', 'password_reset', 'sms', null, 'Event Planner: Reset your password at {{resetUrl}}. Expires in 1 hour.', '{"resetUrl": "string"}'),
('event_confirmation_email', 'event_confirmation', 'email', 'Event Registration Confirmed', 'Hello {{firstName}},\n\nYou have successfully registered for {{eventTitle}}!\n\nEvent Details:\n- Date: {{eventDate}}\n- Location: {{eventLocation}}\n- Ticket Type: {{ticketType}}\n\nWe look forward to seeing you there!\n\nBest regards,\nThe Event Planner Team', '{"firstName": "string", "eventTitle": "string", "eventDate": "string", "eventLocation": "string", "ticketType": "string"}'),
('event_confirmation_sms', 'event_confirmation', 'sms', null, 'Event Planner: You are registered for {{eventTitle}} on {{eventDate}}. See you at {{eventLocation}}!', '{"eventTitle": "string", "eventDate": "string", "eventLocation": "string"}'),
('event_reminder_email', 'event_reminder', 'email', 'Event Reminder: {{eventTitle}}', 'Hello {{firstName}},\n\nThis is a reminder that you have an event coming up:\n\nEvent: {{eventTitle}}\nDate: {{eventDate}}\nLocation: {{eventLocation}}\nTime: {{eventTime}}\n\nDon''t forget to bring your ticket!\n\nBest regards,\nThe Event Planner Team', '{"firstName": "string", "eventTitle": "string", "eventDate": "string", "eventLocation": "string", "eventTime": "string"}'),
('event_reminder_sms', 'event_reminder', 'sms', null, 'Event Planner Reminder: {{eventTitle}} is tomorrow at {{eventTime}}. Location: {{eventLocation}}', '{"eventTitle": "string", "eventTime": "string", "eventLocation": "string"}'),
('ticket_purchased_email', 'ticket_purchased', 'email', 'Ticket Purchase Confirmed', 'Hello {{firstName}},\n\nYour ticket purchase has been confirmed!\n\nOrder Details:\n- Order ID: {{orderId}}\n- Event: {{eventTitle}}\n- Tickets: {{ticketCount}}\n- Amount: {{amount}} {{currency}}\n\nYour tickets will be sent to your email shortly.\n\nBest regards,\nThe Event Planner Team', '{"firstName": "string", "orderId": "string", "eventTitle": "string", "ticketCount": "number", "amount": "string", "currency": "string"}'),
('ticket_purchased_sms', 'ticket_purchased', 'sms', null, 'Event Planner: Purchase confirmed! {{ticketCount}} tickets for {{eventTitle}}. Order ID: {{orderId}}', '{"ticketCount": "number", "eventTitle": "string", "orderId": "string"}'),
('payment_confirmation_email', 'payment_confirmation', 'email', 'Payment Confirmation', 'Hello {{firstName}},\n\nYour payment has been successfully processed!\n\nPayment Details:\n- Transaction ID: {{transactionId}}\n- Amount: {{amount}} {{currency}}\n- Date: {{paymentDate}}\n\nThank you for your purchase!\n\nBest regards,\nThe Event Planner Team', '{"firstName": "string", "transactionId": "string", "amount": "string", "currency": "string", "paymentDate": "string"}'),
('payment_confirmation_sms', 'payment_confirmation', 'sms', null, 'Event Planner: Payment of {{amount}} {{currency}} confirmed. Transaction ID: {{transactionId}}', '{"amount": "string", "currency": "string", "transactionId": "string"}'),
('payment_failed_email', 'payment_failed', 'email', 'Payment Failed', 'Hello {{firstName}},\n\nWe were unable to process your payment.\n\nPayment Details:\n- Amount: {{amount}} {{currency}}\n- Error: {{errorMessage}}\n\nPlease try again or contact support.\n\nBest regards,\nThe Event Planner Team', '{"firstName": "string", "amount": "string", "currency": "string", "errorMessage": "string"}'),
('payment_failed_sms', 'payment_failed', 'sms', null, 'Event Planner: Payment failed for {{amount}} {{currency}}. Please try again or contact support.', '{"amount": "string", "currency": "string"}');

-- Create default notification preferences (all channels enabled by default)
-- This will be populated when users are created through the auth service

-- Create view for notification statistics
CREATE VIEW notification_stats AS
SELECT 
    channel,
    status,
    COUNT(*) as count,
    DATE_TRUNC('day', created_at) as date
FROM notifications 
GROUP BY channel, status, DATE_TRUNC('day', created_at)
ORDER BY date DESC, channel, status;

-- Create view for template usage statistics
CREATE VIEW template_usage_stats AS
SELECT 
    nt.name as template_name,
    nt.type,
    nt.channel,
    COUNT(n.id) as usage_count,
    COUNT(CASE WHEN n.status = 'sent' THEN 1 END) as success_count,
    COUNT(CASE WHEN n.status = 'failed' THEN 1 END) as failure_count
FROM notification_templates nt
LEFT JOIN notifications n ON nt.type = n.type AND nt.channel = n.channel
GROUP BY nt.id, nt.name, nt.type, nt.channel
ORDER BY usage_count DESC;
