# Notification Service API Routes Documentation

## Overview

This document provides a comprehensive overview of all available API routes in the Notification Service. The service runs on port **3002** and provides complete notification functionality with email and SMS sending, queue management, specialized notifications, webhooks, and third-party integrations.

## Base URL

```
http://localhost:3002/api
```

## Authentication

Most routes require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

Webhook routes use API key authentication instead of JWT.

## Modules

### 1. Email Notifications Module

#### Email Operations
- `POST /api/notifications/email` - Send email notification
- `POST /api/notifications/email/queue` - Queue email for later delivery
- `POST /api/notifications/email/bulk` - Send bulk email notifications

#### Request Body (Send Email)
```json
{
  "to": "user@example.com",
  "subject": "Welcome to Event Planner",
  "template": "welcome",
  "data": {
    "userName": "John",
    "eventName": "Tech Conference 2026"
  },
  "priority": "normal"
}
```

#### Request Body (Queue Email)
```json
{
  "to": "user@example.com",
  "subject": "Queued Email",
  "template": "event_reminder",
  "data": {
    "eventName": "Tech Conference 2026",
    "eventDate": "2026-06-15"
  },
  "priority": "high",
  "scheduledAt": "2026-01-27T10:00:00Z"
}
```

#### Request Body (Bulk Email)
```json
{
  "recipients": [
    "user1@example.com",
    "user2@example.com",
    "user3@example.com"
  ],
  "subject": "Event Reminder",
  "template": "event_reminder",
  "data": {
    "eventName": "Tech Conference 2026",
    "eventDate": "2026-06-15"
  },
  "priority": "high"
}
```

---

### 2. SMS Notifications Module

#### SMS Operations
- `POST /api/notifications/sms` - Send SMS notification
- `POST /api/notifications/sms/queue` - Queue SMS for later delivery
- `POST /api/notifications/sms/bulk` - Send bulk SMS notifications

#### Request Body (Send SMS)
```json
{
  "to": "+1234567890",
  "message": "Your event ticket is confirmed!",
  "template": "event_confirmation",
  "data": {
    "eventName": "Tech Conference 2026",
    "ticketCode": "TKT123456"
  },
  "priority": "normal"
}
```

#### Request Body (Queue SMS)
```json
{
  "to": "+1234567890",
  "message": "Queued SMS",
  "template": "event_reminder",
  "data": {
    "eventName": "Tech Conference 2026",
    "eventDate": "2026-06-15"
  },
  "priority": "high",
  "scheduledAt": "2026-01-27T10:00:00Z"
}
```

#### Request Body (Bulk SMS)
```json
{
  "recipients": [
    "+1234567890",
    "+1234567891",
    "+1234567892"
  ],
  "message": "Event reminder: Tech Conference 2026",
  "template": "event_reminder",
  "data": {
    "eventName": "Tech Conference 2026"
  },
  "priority": "high"
}
```

---

### 3. Bulk Notifications Module

#### Bulk Operations
- `POST /api/notifications/bulk/mixed` - Send mixed bulk notifications

#### Request Body (Mixed Bulk)
```json
{
  "notifications": [
    {
      "type": "email",
      "to": "user1@example.com",
      "subject": "Event Update",
      "template": "event_update"
    },
    {
      "type": "sms",
      "to": "+1234567890",
      "message": "Event update notification",
      "template": "event_update"
    }
  ],
  "data": {
    "eventName": "Tech Conference 2026",
    "updateType": "venue_change"
  }
}
```

---

### 4. Job Management Module

#### Job Operations
- `GET /api/notifications/job/:jobId/status` - Get notification job status
- `DELETE /api/notifications/job/:jobId/cancel` - Cancel a notification job

#### Job Status Response
```json
{
  "success": true,
  "data": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000",
    "status": "processing",
    "progress": 45,
    "total": 100,
    "completed": 45,
    "failed": 2,
    "createdAt": "2026-01-27T09:00:00Z",
    "estimatedCompletion": "2026-01-27T09:05:00Z"
  }
}
```

#### Job Status Values
- `pending` - Job queued but not started
- `processing` - Job currently running
- `completed` - Job finished successfully
- `failed` - Job failed with errors
- `cancelled` - Job was cancelled

---

### 5. Specialized Notifications Module

#### Specialized Operations
- `POST /api/notifications/welcome/email` - Send welcome email
- `POST /api/notifications/welcome/sms` - Send welcome SMS
- `POST /api/notifications/password-reset/email` - Send password reset email
- `POST /api/notifications/password-reset/sms` - Send password reset SMS
- `POST /api/notifications/event-confirmation/email` - Send event confirmation email
- `POST /api/notifications/event-confirmation/sms` - Send event confirmation SMS
- `POST /api/notifications/otp/sms` - Send OTP SMS

#### Request Body (Welcome Email)
```json
{
  "to": "user@example.com",
  "data": {
    "userName": "John",
    "activationLink": "https://eventplanner.com/activate/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### Request Body (Password Reset Email)
```json
{
  "to": "user@example.com",
  "data": {
    "userName": "John",
    "resetLink": "https://eventplanner.com/reset/550e8400-e29b-41d4-a716-446655440000",
    "resetCode": "ABC123"
  }
}
```

#### Request Body (Event Confirmation Email)
```json
{
  "to": "user@example.com",
  "data": {
    "userName": "John",
    "eventName": "Tech Conference 2026",
    "eventDate": "2026-06-15",
    "eventLocation": "Paris, France",
    "ticketCode": "TKT123456"
  }
}
```

#### Request Body (OTP SMS)
```json
{
  "to": "+1234567890",
  "data": {
    "userName": "John",
    "otpCode": "123456",
    "purpose": "login_verification",
    "expiresIn": 300
  }
}
```

---

### 6. Statistics & Monitoring Module

#### Statistics Operations
- `GET /api/notifications/queues/stats` - Get queue processing statistics
- `POST /api/notifications/queues/clean` - Clean old completed jobs
- `GET /api/notifications/stats` - Get service statistics

#### Request Body (Clean Queues)
```json
{
  "older_than_hours": 24
}
```

#### Queue Statistics Response
```json
{
  "success": true,
  "data": {
    "emailQueue": {
      "pending": 15,
      "processing": 3,
      "completed": 250,
      "failed": 2
    },
    "smsQueue": {
      "pending": 8,
      "processing": 2,
      "completed": 180,
      "failed": 1
    },
    "totalJobs": 461
  }
}
```

---

### 7. Webhooks Module

#### Webhook Operations (API Key Authentication)
- `POST /api/notifications/webhooks/email` - Email webhook
- `POST /api/notifications/webhooks/sms` - SMS webhook
- `POST /api/notifications/webhooks/bulk` - Bulk webhook

#### Headers Required
```
x-api-key: webhook-api-key-1234567890
Content-Type: application/json
```

#### Request Body (Email Webhook)
```json
{
  "event": "email.delivered",
  "data": {
    "messageId": "msg_123456",
    "to": "user@example.com",
    "status": "delivered",
    "timestamp": "2026-01-27T10:30:00Z"
  }
}
```

#### Request Body (Bulk Webhook)
```json
{
  "event": "bulk.completed",
  "data": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000",
    "total": 100,
    "sent": 95,
    "failed": 5,
    "timestamp": "2026-01-27T10:30:00Z"
  }
}
```

---

### 8. Third-party Integrations Module

#### Integration Operations (Webhook Signature Authentication)
- `POST /api/notifications/integrations/stripe` - Stripe webhook
- `POST /api/notifications/integrations/github` - GitHub webhook

#### Headers Required (Stripe)
```
stripe-signature: sha256=5d41402abc4b2a76b9719d911017c59209f5d5a8
Content-Type: application/json
```

#### Headers Required (GitHub)
```
x-hub-signature-256: sha256=5d41402abc4b2a76b9719d911017c59209f5d5a8
Content-Type: application/json
```

#### Request Body (Stripe Webhook)
```json
{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_123456",
      "amount": 9999,
      "currency": "eur",
      "customer": "cus_123456"
    }
  }
}
```

#### Request Body (GitHub Webhook)
```json
{
  "action": "created",
  "repository": {
    "name": "event-planner",
    "full_name": "company/event-planner"
  },
  "sender": {
    "login": "developer"
  }
}
```

---

### 9. Health & Monitoring Module

#### Health Operations
- `GET /api/notifications/health` - Basic health check (no authentication required)
- `GET /api/notifications` - Get API information (no authentication required)

---

## Notification Templates

### Available Templates
- `welcome` - Welcome message for new users
- `event_reminder` - Event reminder notification
- `event_confirmation` - Event booking confirmation
- `event_update` - Event update notification
- `password_reset` - Password reset notification
- `otp` - One-time password notification

### Template Data Variables
- `userName` - User's first name
- `eventName` - Event name
- `eventDate` - Event date
- `eventLocation` - Event location
- `ticketCode` - Ticket code
- `activationLink` - Account activation link
- `resetLink` - Password reset link
- `resetCode` - Password reset code
- `otpCode` - One-time password code

## Priority Levels

- `low` - Low priority (bulk notifications)
- `normal` - Normal priority (standard notifications)
- `high` - High priority (urgent notifications)
- `urgent` - Urgent priority (critical notifications)

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  }
}
```

## Success Responses

Most endpoints return consistent success responses:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

## Rate Limiting

API endpoints may be rate limited. Check response headers for rate limit information.

## Permissions

All endpoints require specific permissions. Permission format: `module.action` (e.g., `notifications.email.send`, `notifications.stats.read`).

## Queue Processing

The service uses Redis-based queues for:
- Email sending queue
- SMS sending queue
- Bulk notification processing
- Scheduled notifications

## Webhook Security

- API key authentication for custom webhooks
- HMAC signature verification for third-party integrations
- Request validation and sanitization

## Postman Collection

A complete Postman collection with all 30 routes is available in:
- `postman/notification-service.postman_collection.json`

## Environment Variables

Required environment variables are defined in:
- `postman/Notification-Service.postman_environment.json`

---

**Last Updated:** January 27, 2026  
**Version:** 3.0.0  
**Total Routes:** 30
