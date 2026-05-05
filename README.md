# 📧 Event Planner - Service de Notifications

## 📋 Description

Le service de Notifications gère toutes les communications sortantes de la plateforme Event Planner: emails transactionnels, SMS, notifications en temps réel, et campagnes marketing.

## 🏗️ Architecture Technique

```
┌─────────────────────────────────────────────────────────────┐
│               NOTIFICATION SERVICE (Port 3002)             │
├─────────────────────────────────────────────────────────────┤
│  📦 Modules Principaux:                                      │
│  ├── email/          (Emails transactionnels)               │
│  ├── sms/            (SMS Twilio/Vonage)                    │
│  ├── templates/      (Gestion templates)                    │
│  ├── queues/         (File d'attente Redis)                 │
│  └── webhooks/       (Intégrations externes)                │
│                                                             │
│  🔧 Technologies:                                            │
│  ├── Node.js + Express                                      │
│  ├── PostgreSQL (Historique, stats)                        │
│  ├── Redis (Queues, cache)                                  │
│  ├── SendGrid (Email delivery)                              │
│  ├── Twilio/Vonage (SMS delivery)                           │
│  └── Bull Queue (Background jobs)                           │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Démarrage Rapide

### Installation
```bash
cd event-planner-backend/notification-service
npm install
cp .env.example .env
npm run db:up && npm run db:migrate
npm run dev
```

### Vérification
```bash
curl http://localhost:3002/health
# Retourne: {"status": "healthy", "service": "notification-service"}
```

### Contrat Provider / Readiness
```bash
curl http://localhost:3002/health/providers
curl http://localhost:3002/health/config
curl http://localhost:3002/health/ready
```

Les endpoints de santé distinguent désormais explicitement:
- `runtimeReady`: base locale et Redis réellement joignables
- `mockAvailable`: un mode mock assumé est disponible pour le canal
- `configured`: des credentials live exploitables sont présents
- `liveProved`: un check runtime a réellement validé le provider live

`/health/ready` peut retourner `ready_with_provider_gaps` quand le service local est prêt mais que les providers live restent absents ou non prouvés. Cela évite de masquer les blocages live sans casser le runtime de dev.

## 📡 API Endpoints

### 📧 Emails
```http
POST /api/notifications/email           (Envoyer email)
POST /api/notifications/email/queue     (Mettre en queue)
POST /api/notifications/email/bulk      (Envoyer en lot)
```

### 📱 SMS
```http
POST /api/notifications/sms             (Envoyer SMS)
POST /api/notifications/sms/queue       (Mettre en queue)
POST /api/notifications/sms/bulk        (Envoyer en lot)
```

### 🎯 Templates Spécialisés
```http
POST /api/notifications/welcome/email   (Email bienvenue)
POST /api/notifications/welcome/sms     (SMS bienvenue)
POST /api/notifications/password-reset/email (Email reset)
POST /api/notifications/otp/sms          (SMS OTP)
```

### 📊 Administration
```http
GET  /api/notifications/health          (Santé service)
GET  /api/notifications/stats           (Statistiques)
GET  /api/notifications/queues/stats    (Stats queues)
```

## 🔧 Configuration Essentielle

```bash
# Base de données
DATABASE_URL=postgresql://user:pass@localhost:5432/event_planner_notifications

# Redis
REDIS_URL=redis://localhost:6379

# Authentification
SHARED_SERVICE_TOKEN=shared-service-token-abcdef12345678901234567890
AUTH_SERVICE_URL=http://localhost:3000

# Email (SendGrid)
SENDGRID_API_KEY=SG.your-api-key
EMAIL_FROM=noreply@eventplanner.com

# SMS (Twilio + Fallback Vonage)
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
VONAGE_API_KEY=your-api-key
VONAGE_API_SECRET=your-secret
MOCK_SMS_DELIVERY=true

# Serveur
PORT=3002
NODE_ENV=development
```

## 📧 Templates Email Disponibles

- `welcome` - Email de bienvenue
- `password-reset` - Réinitialisation mot de passe  
- `event-registration` - Confirmation inscription
- `event-confirmation` - Confirmation événement
- `ticket-purchase` - Achat billet

## 📱 Templates SMS Disponibles

- `welcome` - SMS de bienvenue
- `otp` - Code OTP
- `event-reminder` - Rappel événement
- `ticket-confirm` - Confirmation billet

## 🧪 Tests Rapides

```bash
# Test email
curl -X POST http://localhost:3002/api/notifications/email \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com", "template": "welcome", "data": {"firstName": "John"}}'

# Test SMS
curl -X POST http://localhost:3002/api/notifications/sms \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+33612345678", "template": "otp", "data": {"otpCode": "123456"}}'
```

## 🚨 Erreurs Communes

### 1. "Invalid email address"
- Vérifier format email
- Confirmer domaine SendGrid autorisé

### 2. "SMS delivery failed"
- Vérifier format numéro (+33...)
- Confirmer solde compte Twilio/Vonage
- Vérifier `/health/providers` pour savoir si le canal est en `mock_only`, `configured_not_live_proved` ou `live_ready`

### 3. "Template not found"
- Vérifier nom template exact
- Confirmer template créé dans SendGrid

## 📈 Monitoring

```bash
# Logs envois emails
grep "email.*sent" logs/notification.log

# Erreurs SMS
grep "sms.*error" logs/notification.log

# Statistiques queues
curl http://localhost:3002/api/notifications/queues/stats
```

---

**📧 Ce service assure que tous vos messages importants arrivent à destination !**
