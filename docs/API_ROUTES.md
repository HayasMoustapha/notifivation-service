# Notification Service - API Routes Documentation

## Overview

Le Notification Service gère l'envoi d'emails, SMS, et les notifications transactionnelles pour Event Planner.

## Base URL
```
http://localhost:3002/api/notifications
```

## Authentication

Toutes les routes (sauf health checks et webhooks) nécessitent une authentification JWT:
```
Authorization: Bearer <token>
```

## Permissions

Les permissions requises pour chaque route sont spécifiées ci-dessous.

---

## 🏠 **Health Routes**

### Health Check
```
GET /api/notifications/health
```
- **Description**: Vérification de santé du service
- **Authentification**: Non requise
- **Permissions**: Aucune
- **Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-25T15:30:00.000Z",
  "service": "notification-service",
  "version": "1.0.0",
  "components": {
    "email": "healthy",
    "sms": "healthy",
    "queue": "healthy"
  }
}
```

### Service Stats
```
GET /api/notifications/stats
```
- **Description**: Statistiques générales du service
- **Authentification**: Requise
- **Permissions**: `notifications.stats.read`
- **Response**:
```json
{
  "success": true,
  "message": "Service statistics retrieved successfully",
  "data": {
    "totalEmails": 15000,
    "totalSMS": 8500,
    "activeJobs": 12,
    "queueSize": 25,
    "deliveryRate": {
      "email": 98.5,
      "sms": 97.2
    }
  }
}
```

### Service Info
```
GET /api/notifications/
```
- **Description**: Informations sur le service et endpoints disponibles
- **Authentification**: Requise
- **Permissions**: Aucune
- **Response**:
```json
{
  "service": "Notification API",
  "version": "1.0.0",
  "status": "running",
  "endpoints": {
    "email": "POST /api/notifications/email",
    "sms": "POST /api/notifications/sms",
    "emailQueue": "POST /api/notifications/email/queue",
    "smsQueue": "POST /api/notifications/sms/queue",
    "emailBulk": "POST /api/notifications/email/bulk",
    "smsBulk": "POST /api/notifications/sms/bulk",
    "mixedBulk": "POST /api/notifications/bulk/mixed",
    "jobStatus": "GET /api/notifications/job/:jobId/status",
    "cancelJob": "DELETE /api/notifications/job/:jobId/cancel",
    "queueStats": "GET /api/notifications/queues/stats",
    "queueClean": "POST /api/notifications/queues/clean",
    "welcomeEmail": "POST /api/notifications/welcome/email",
    "welcomeSMS": "POST /api/notifications/welcome/sms",
    "passwordResetEmail": "POST /api/notifications/password-reset/email",
    "passwordResetSMS": "POST /api/notifications/password-reset/sms",
    "eventConfirmationEmail": "POST /api/notifications/event-confirmation/email",
    "eventConfirmationSMS": "POST /api/notifications/event-confirmation/sms",
    "otpSMS": "POST /api/notifications/otp/sms",
    "health": "GET /api/notifications/health",
    "stats": "GET /api/notifications/stats",
    "webhookEmail": "POST /api/notifications/webhooks/email",
    "webhookSMS": "POST /api/notifications/webhooks/sms",
    "webhookBulk": "POST /api/notifications/webhooks/bulk",
    "integrationStripe": "POST /api/notifications/integrations/stripe",
    "integrationGithub": "POST /api/notifications/integrations/github"
  },
  "timestamp": "2024-01-25T15:30:00.000Z"
}
```

---

## 📧 **Email Routes**

### Send Email
```
POST /api/notifications/email
```
- **Description**: Envoyer un email transactionnel
- **Authentification**: Requise
- **Permissions**: `notifications.email.send`
- **Request Body**:
```json
{
  "to": "user@example.com",
  "cc": ["admin@example.com"],
  "subject": "Confirmation de votre inscription",
  "template": "welcome",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "eventName": "Annual Tech Conference"
  },
  "priority": "normal",
  "trackOpens": true,
  "trackClicks": true
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Email sent successfully",
  "data": {
    "messageId": "msg_123456789",
    "status": "sent",
    "to": "user@example.com",
    "subject": "Confirmation de votre inscription",
    "sentAt": "2024-01-25T15:30:00.000Z"
  }
}
```

### Queue Email
```
POST /api/notifications/email/queue
```
- **Description**: Mettre en file d'attente un email
- **Authentification**: Requise
- **Permissions**: `notifications.email.queue`
- **Request Body**:
```json
{
  "to": "user@example.com",
  "subject": "Confirmation de votre inscription",
  "template": "welcome",
  "data": {
    "firstName": "John",
    "eventName": "Annual Tech Conference"
  },
  "priority": "normal",
  "scheduledFor": "2024-01-25T16:00:00.000Z"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Email queued successfully",
  "data": {
    "jobId": "job_123456789",
    "status": "queued",
    "scheduledFor": "2024-01-25T16:00:00.000Z",
    "queuedAt": "2024-01-25T15:30:00.000Z"
  }
}
```

### Send Bulk Email
```
POST /api/notifications/email/bulk
```
- **Description**: Envoyer des emails en lot
- **Authentification**: Requise
- **Permissions**: `notifications.email.bulk`
- **Request Body**:
```json
{
  "recipients": [
    {
      "to": "user1@example.com",
      "data": { "firstName": "John" }
    },
    {
      "to": "user2@example.com",
      "data": { "firstName": "Jane" }
    }
  ],
  "subject": "Information importante sur votre événement",
  "template": "event-update",
  "priority": "high"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Bulk email job created successfully",
  "data": {
    "jobId": "job_123456789",
    "totalRecipients": 2,
    "status": "processing",
    "estimatedTime": "2 minutes"
  }
}
```

---

## 📱 **SMS Routes**

### Send SMS
```
POST /api/notifications/sms
```
- **Description**: Envoyer un SMS transactionnel
- **Authentification**: Requise
- **Permissions**: `notifications.sms.send`
- **Request Body**:
```json
{
  "to": "+33612345678",
  "message": "Votre code de confirmation est 123456",
  "template": "otp",
  "data": {
    "code": "123456",
    "validUntil": "2024-01-25T16:30:00.000Z"
  },
  "priority": "high"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "SMS sent successfully",
  "data": {
    "messageId": "sms_123456789",
    "status": "sent",
    "to": "+33612345678",
    "sentAt": "2024-01-25T15:30:00.000Z"
  }
}
```

### Queue SMS
```
POST /api/notifications/sms/queue
```
- **Description**: Mettre en file d'attente un SMS
- **Authentification**: Requise
- **Permissions**: `notifications.sms.queue`
- **Request Body**:
```json
{
  "to": "+33612345678",
  "message": "Votre code de confirmation est 123456",
  "template": "otp",
  "data": {
    "code": "123456"
  },
  "priority": "high",
  "scheduledFor": "2024-01-25T16:00:00.000Z"
}
```

### Send Bulk SMS
```
POST /api/notifications/sms/bulk
```
- **Description**: Envoyer des SMS en lot
- **Authentification**: Requise
- **Permissions**: `notifications.sms.bulk`
- **Request Body**:
```json
{
  "recipients": [
    {
      "to": "+33612345678",
      "data": { "code": "123456" }
    },
    {
      "to": "+33612345679",
      "data": { "code": "654321" }
    }
  ],
  "message": "Votre code de confirmation est {{code}}",
  "template": "otp"
}
```

---

## 🔄 **Bulk Notification Routes**

### Send Mixed Bulk
```
POST /api/notifications/bulk/mixed
```
- **Description**: Envoyer des notifications mixtes en lot
- **Authentification**: Requise
- **Permissions**: `notifications.bulk.mixed`
- **Request Body**:
```json
{
  "notifications": [
    {
      "type": "email",
      "to": "user@example.com",
      "subject": "Confirmation d'inscription",
      "template": "welcome"
    },
    {
      "type": "sms",
      "to": "+33612345678",
      "message": "Bienvenue sur Event Planner!",
      "template": "welcome"
    }
  ],
  "priority": "normal"
}
```

---

## 📋 **Job Management Routes**

### Get Job Status
```
GET /api/notifications/job/:jobId/status
```
- **Description**: Récupérer le statut d'un job
- **Authentification**: Requise
- **Permissions**: `notifications.jobs.read`
- **Response**:
```json
{
  "success": true,
  "message": "Job status retrieved successfully",
  "data": {
    "jobId": "job_123456789",
    "type": "bulk_email",
    "status": "completed",
    "progress": {
      "total": 100,
      "completed": 100,
      "failed": 2,
      "percentage": 100
    },
    "startedAt": "2024-01-25T15:25:00.000Z",
    "completedAt": "2024-01-25T15:30:00.000Z",
    "results": {
      "sent": 98,
      "failed": 2,
      "deliveryRate": 98.0
    }
  }
}
```

### Cancel Job
```
DELETE /api/notifications/job/:jobId/cancel
```
- **Description**: Annuler un job
- **Authentification**: Requise
- **Permissions**: `notifications.jobs.cancel`
- **Response**:
```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "data": {
    "jobId": "job_123456789",
    "status": "cancelled",
    "cancelledAt": "2024-01-25T15:30:00.000Z",
    "cancelledBy": "user-123"
  }
}
```

---

## 📊 **Queue Management Routes**

### Get Queue Stats
```
GET /api/notifications/queues/stats
```
- **Description**: Récupérer les statistiques des queues
- **Authentification**: Requise
- **Permissions**: `notifications.stats.read`
- **Response**:
```json
{
  "success": true,
  "message": "Queue statistics retrieved successfully",
  "data": {
    "emailQueue": {
      "pending": 5,
      "processing": 2,
      "completed": 150,
      "failed": 3
    },
    "smsQueue": {
      "pending": 8,
      "processing": 1,
      "completed": 85,
      "failed": 2
    },
    "totalPending": 13,
    "totalProcessing": 3,
    "averageWaitTime": "2.5 minutes"
  }
}
```

### Clean Completed Jobs
```
POST /api/notifications/queues/clean
```
- **Description**: Nettoyer les jobs terminés
- **Authentification**: Requise
- **Permissions**: `notifications.admin`
- **Query Parameters**:
- `olderThan`: Âge des jobs à nettoyer (défaut: 7d)
- `status`: Statuts des jobs à nettoyer (défaut: completed,failed)
- **Request Body**:
```json
{
  "olderThan": "7d",
  "status": ["completed", "failed"]
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Jobs cleaned successfully",
  "data": {
    "cleanedCount": 25,
    "cleanedAt": "2024-01-25T15:30:00.000Z"
  }
}
```

---

## 👋 **Specialized Notification Routes**

### Welcome Email
```
POST /api/notifications/welcome/email
```
- **Description**: Envoyer un email de bienvenue
- **Authentification**: Requise
- **Permissions**: `notifications.welcome.send`
- **Request Body**:
```json
{
  "to": "user@example.com",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "eventName": "Annual Tech Conference"
  }
}
```

### Welcome SMS
```
POST /api/notifications/welcome/sms
```
- **Description**: Envoyer un SMS de bienvenue
- **Authentification**: Requise
- **Permissions**: `notifications.welcome.send`

### Password Reset Email
```
POST /api/notifications/password-reset/email
```
- **Description**: Envoyer un email de réinitialisation de mot de passe
- **Authentification**: Requise
- **Permissions**: `notifications.password-reset.send`
- **Request Body**:
```json
{
  "to": "user@example.com",
  "data": {
    "resetToken": "abc123def456",
    "expiresAt": "2024-01-26T15:30:00.000Z"
  }
}
```

### Password Reset SMS
```
POST /api/notifications/password-reset/sms
```
- **Description**: Envoyer un SMS de réinitialisation de mot de passe
- **Authentification**: Requise
- **Permissions**: `notifications.password-reset.send`

### Event Confirmation Email
```
POST /api/notifications/event-confirmation/email
```
- **Description**: Envoyer un email de confirmation d'événement
- **Authentification**: Requise
- **Permissions**: `notifications.event-confirmation.send`
- **Request Body**:
```json
{
  "to": "user@example.com",
  "data": {
    "eventName": "Annual Tech Conference",
    "eventDate": "2024-06-15T09:00:00.000Z",
    "location": "Paris Convention Center",
    "ticketCount": 2
  }
}
```

### Event Confirmation SMS
```
POST /api/notifications/event-confirmation/sms
```
- **Description**: Envoyer un SMS de confirmation d'événement
- **Authentification**: Requise
- **Permissions**: `notifications.event-confirmation.send`

### OTP SMS
```
POST /api/notifications/otp/sms
```
- **Description**: Envoyer un SMS OTP
- **Authentification**: Requise
- **Permissions**: `notifications.otp.send`
- **Request Body**:
```json
{
  "to": "+33612345678",
  "template": "otp",
  "data": {
    "code": "123456",
    "purpose": "email_verification",
    "validUntil": "2024-01-25T16:30:00.000Z"
  }
}
```

---

## 🪝 **Webhook Routes**

### Email Webhook
```
POST /api/notifications/webhooks/email
```
- **Description**: Webhook pour les emails externes
- **Authentification**: API Key (requireAPIKey)
- **Permissions**: Aucune
- **Request Body**:
```json
{
  "to": "user@example.com",
  "subject": "External notification",
  "message": "This is an external notification",
  "webhookId": "webhook-123"
}
```

### SMS Webhook
```
POST /api/notifications/webhooks/sms
```
- **Description**: Webhook pour les SMS externes
- **Authentification**: API Key (requireAPIKey)
- **Permissions**: Aucune

### Bulk Webhook
```
POST /api/notifications/webhooks/bulk
```
- **Description**: Webhook pour les notifications en lot
- **Authentification**: API Key (requireAPIKey)
- **Permissions**: Aucune

---

## 🔗 **Integration Routes**

### Stripe Integration
```
POST /api/notifications/integrations/stripe
```
- **Description**: Webhook Stripe pour les notifications de paiement
- **Authentification**: Webhook Secret (requireWebhookSecret)
- **Permissions**: Aucune
- **Request Body**:
```json
{
  "event": "payment_intent.succeeded",
  "data": {
    "customer_email": "user@example.com",
    "description": "Payment for event tickets",
    "amount": 2999
  }
}
```

### GitHub Integration
```
POST /api/notifications/integrations/github
```
- **Description**: Webhook GitHub pour les notifications de déploiement
- **Authentification**: Webhook Secret (requireWebhookSecret)
- **Permissions**: Aucune
- **Request Body**:
```json
{
  "event": "push",
  "data": {
    "ref": "refs/heads/main",
    "pusher": {
      "name": "John Doe"
    }
  }
}
```

---

## 📊 **Error Responses**

Toutes les erreurs suivent ce format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Description de l'erreur",
    "details": [
      {
        "field": "to",
        "message": "Email address is required"
      }
    ]
  }
}
```

### Codes d'erreur communs:
- `VALIDATION_ERROR`: Erreur de validation des données
- `EMAIL_NOT_SENT`: Échec d'envoi d'email
- `SMS_NOT_SENT`: Échec d'envoi de SMS
- `JOB_NOT_FOUND`: Job non trouvé
- `INSUFFICIENT_PERMISSIONS`: Permissions insuffisantes
- `RATE_LIMIT_EXCEEDED`: Limite de taux dépassée
- `TEMPLATE_NOT_FOUND`: Template non trouvé
- `QUEUE_FULL`: Queue pleine
- `WEBHOOK_INVALID`: Webhook invalide

---

## 🚀 **Rate Limiting**

- **Limite générale**: 200 requêtes par 15 minutes par IP
- **Limite emails**: 50 emails par minute par IP
- **Limite SMS**: 30 SMS par minute par IP
- **Limite bulk**: 10 bulk jobs par heure par IP

---

## 📝 **Notes**

- Tous les timestamps sont en format ISO 8601
- Les IDs sont sensibles à la casse
- Les emails supportent les templates Handlebars
- Les SMS supportent les templates avec variables
- Les jobs sont conservés 30 jours par défaut
- Les webhooks utilisent la signature HMAC pour la sécurité

---

## 🔗 **Liens Utiles**

- [Documentation Email Service](../core/email/)
- [Documentation SMS Service](../core/sms/)
- [Documentation Queue Service](../core/queue/)
- [Postman Collection](../postman/Notification-Service.postman_collection.json)
