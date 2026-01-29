# 📧 NOTIFICATION SERVICE - DOCUMENTATION COMPLÈTE

## 📋 TABLE DES MATIÈRES

1. [Présentation du Service](#présentation-du-service)
2. [Architecture Technique](#architecture-technique)
3. [Fonctionnalités](#fonctionnalités)
4. [Configuration](#configuration)
5. [API Reference](#api-reference)
6. [Guide de Déploiement](#guide-de-déploiement)
7. [Monitoring et Logs](#monitoring-et-logs)
8. [Dépannage](#dépannage)
9. [Bonnes Pratiques](#bonnes-pratiques)

---

## 🎯 PRÉSENTATION DU SERVICE

### Qu'est-ce que le Notification Service ?

Le **Notification Service** est un microservice technique spécialisé dans l'envoi de notifications transactionnelles pour la plateforme Event Planner SaaS.

```
📧 Rôle principal : Envoyer des emails et SMS de manière fiable
🔧 Position : Service technique (backend-only)
🚀 Port : 3002
📊 Échelle : Hautement scalable avec Redis queues
```

### Cas d'usage

- ✅ **Emails transactionnels** : Confirmations, rappels, notifications
- ✅ **SMS transactionnels** : Codes OTP, alertes urgentes, confirmations
- ✅ **Notifications en lot** : Campagnes marketing, alertes de masse
- ✅ **Templates dynamiques** : Personnalisation avancée
- ✅ **Files d'attente** : Traitement asynchrone et fiable

---

## 🏗️ ARCHITECTURE TECHNIQUE

### Stack Technique

```
┌─────────────────────────────────────────────────────────────┐
│                    NOTIFICATION SERVICE                      │
├─────────────────────────────────────────────────────────────┤
│  📦 Node.js + Express.js (Framework web)                    │
│  🗄️  PostgreSQL (Base de données)                           │
│  🔴 Redis (Files d'attente & cache)                         │
│  📧 SendGrid (Service email)                                │
│  📱 Twilio/Vonage (Services SMS)                            │
│  🎨 Handlebars (Templates)                                  │
│  📊 Winston (Logs)                                          │
└─────────────────────────────────────────────────────────────┘
```

### Architecture en couches

```
┌─────────────────────────────────────────────┐
│                API Routes                    │  ← Requêtes HTTP
├─────────────────────────────────────────────┤
│              Controllers                     │  ← Logique métier
├─────────────────────────────────────────────┤
│               Services                      │  ← Traitements
│  ┌─────────────┬─────────────┬─────────────┐ │
│  │   Email     │     SMS     │    Queue    │ │
│  │   Service   │   Service   │   Service   │ │
│  └─────────────┴─────────────┴─────────────┘ │
├─────────────────────────────────────────────┤
│               Database                     │  ← Persistance
│  ┌─────────────┬─────────────┬─────────────┐ │
│  │ PostgreSQL  │    Redis    │  Templates  │ │
│  └─────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────┘
```

### Flow de traitement

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│   Queue     │───▶│  Worker     │
│ (Core Svc)  │    │   Redis     │    │   Async     │
└─────────────┘    └─────────────┘    └─────────────┘
                           │                   │
                           ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐
                   │   Provider  │    │   Database  │
                   │ (SendGrid)  │    │ PostgreSQL  │
                   └─────────────┘    └─────────────┘
```

---

## ⚡ FONCTIONNALITÉS

### 📧 Fonctionnalités Email

#### Envoi immédiat
```javascript
POST /api/notifications/email
{
  "to": "user@example.com",
  "subject": "Confirmation d'événement",
  "template": "event-confirmation",
  "data": {
    "eventName": "Tech Conference 2024",
    "date": "2024-12-31",
    "location": "Paris"
  }
}
```

#### Envoi en lot
```javascript
POST /api/notifications/email/bulk
{
  "recipients": [
    {"email": "user1@example.com", "name": "Alice"},
    {"email": "user2@example.com", "name": "Bob"}
  ],
  "template": "event-reminder",
  "data": {"eventName": "Tech Conference 2024"}
}
```

#### Templates dynamiques
```handlebars
<!-- templates/event-confirmation.hbs -->
<!DOCTYPE html>
<html>
<head>
    <title>Confirmation : {{eventName}}</title>
</head>
<body>
    <h1>Bonjour {{firstName}} {{lastName}} !</h1>
    <p>Votre inscription à <strong>{{eventName}}</strong> est confirmée.</p>
    
    <div class="event-details">
        <p>📅 Date : {{eventDate}}</p>
        <p>📍 Lieu : {{location}}</p>
        <p>🎫 Places : {{ticketCount}}</p>
    </div>
    
    {{#if hasQRCode}}
    <div class="qr-code">
        <img src="{{qrCodeUrl}}" alt="QR Code d'accès">
    </div>
    {{/if}}
    
    <p>À bientôt !</p>
</body>
</html>
```

### 📱 Fonctionnalités SMS

#### Envoi SMS
```javascript
POST /api/notifications/sms
{
  "to": "+33612345678",
  "message": "Votre code OTP est 123456",
  "template": "otp",
  "data": {"code": "123456"}
}
```

#### SMS international
```javascript
POST /api/notifications/sms
{
  "to": "+447911123456",  // UK
  "to": "+12125551234",   // US
  "to": "+33612345678",   // France
  "message": "International SMS test"
}
```

### 📦 Files d'attente

#### Types de queues
```
🔴 email-queue    : Emails transactionnels
📱 sms-queue      : SMS transactionnels  
📊 bulk-queue     : Traitements en lot
🔄 retry-queue    : Tentatives de retry
```

#### Priorités
```
🔴 HIGH   : OTP, alertes critiques
🟡 MEDIUM : Confirmations, rappels
🟢 LOW    : Marketing, newsletters
```

---

## ⚙️ CONFIGURATION

### Variables d'environnement

```bash
# .env
NODE_ENV=production
PORT=3002

# Base de données PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=event_planner_notifications
DB_USER=notification_user
DB_PASSWORD=secure_password

# Redis (files d'attente)
REDIS_URL=redis://localhost:6379/2

# SendGrid (Email)
SENDGRID_API_KEY=SG.xxxxxx
SENDGRID_FROM_EMAIL=noreply@eventplanner.com
SENDGRID_FROM_NAME=Event Planner

# Twilio (SMS)
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=xxxxxx
TWILIO_PHONE_NUMBER=+33612345678

# Vonage (SMS - backup)
VONAGE_API_KEY=xxxxxx
VONAGE_API_SECRET=xxxxxx

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
EMAIL_RATE_LIMIT=10          # par minute
SMS_RATE_LIMIT=5             # par minute

# Templates
TEMPLATES_PATH=./templates
LOG_FILE_PATH=./logs
LOG_LEVEL=info
```

### Configuration Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Installation dépendances
COPY package*.json ./
RUN npm ci --only=production

# Copie du code
COPY . .

# Création dossiers nécessaires
RUN mkdir -p logs templates

# Utilisateur non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3002

CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  notification-service:
    build: .
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_URL=redis://redis:6379/2
    depends_on:
      - postgres
      - redis
    volumes:
      - ./logs:/app/logs
      - ./templates:/app/templates
    restart: unless-stopped

  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: event_planner_notifications
      POSTGRES_USER: notification_user
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:6-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

## 📚 API REFERENCE

### Endpoints principaux

#### 📧 Email endpoints

```http
POST /api/notifications/email
Content-Type: application/json

{
  "to": "user@example.com",
  "subject": "Sujet de l'email",
  "template": "template-name",
  "data": {
    "key": "value"
  },
  "options": {
    "priority": "high",
    "fromName": "Custom Sender"
  }
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Email mis en file d'attente",
  "data": {
    "notificationId": "uuid-1234",
    "queueId": "job-5678",
    "estimatedDelivery": "2024-01-01T12:00:00Z"
  }
}
```

#### 📱 SMS endpoints

```http
POST /api/notifications/sms
Content-Type: application/json

{
  "to": "+33612345678",
  "message": "Votre message SMS",
  "template": "template-name",
  "data": {
    "code": "123456"
  }
}
```

#### 📊 Bulk endpoints

```http
POST /api/notifications/email/bulk
Content-Type: application/json

{
  "recipients": [
    {"email": "user1@example.com", "name": "Alice"},
    {"email": "user2@example.com", "name": "Bob"}
  ],
  "template": "newsletter",
  "data": {"month": "Janvier 2024"},
  "options": {
    "batchId": "campaign-123",
    "scheduledAt": "2024-01-01T10:00:00Z"
  }
}
```

#### 📋 Status endpoints

```http
GET /api/notifications/{notificationId}/status

Réponse :
{
  "success": true,
  "data": {
    "notificationId": "uuid-1234",
    "status": "sent",
    "sentAt": "2024-01-01T12:00:00Z",
    "provider": "sendgrid",
    "providerMessageId": "msg-789",
    "deliveredAt": "2024-01-01T12:01:00Z"
  }
}
```

### Health checks

```http
GET /health
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "service": "notification",
  "version": "1.0.0",
  "uptime": 3600
}

GET /health/detailed
{
  "status": "healthy",
  "dependencies": {
    "redis": true,
    "database": true
  },
  "services": {
    "email": {"healthy": true, "provider": "sendgrid"},
    "sms": {"healthy": true, "provider": "twilio"}
  }
}
```

---

## 🚀 GUIDE DE DÉPLOIEMENT

### Prérequis

```bash
# Node.js 18+
node --version  # v18.x.x

# PostgreSQL 14+
psql --version  # 14.x

# Redis 6+
redis-server --version  # 6.x

# Docker (optionnel)
docker --version
```

### Déploiement manuel

#### 1. Clonage et installation

```bash
# Cloner le repository
git clone https://github.com/your-org/event-planner-saas.git
cd event-planner-saas/notification-service

# Installation dépendances
npm install --production
```

#### 2. Configuration

```bash
# Copier fichier d'environnement
cp .env.example .env

# Éditer la configuration
nano .env
```

#### 3. Base de données

```bash
# Créer la base de données
createdb event_planner_notifications

# Lancer les migrations
npm run migrate
```

#### 4. Démarrage

```bash
# Mode développement
npm run dev

# Mode production
npm start
```

### Déploiement Docker

#### 1. Build

```bash
# Build de l'image
docker build -t notification-service .

# Ou avec docker-compose
docker-compose build
```

#### 2. Lancement

```bash
# Avec docker-compose
docker-compose up -d

# Vérification
docker-compose logs notification-service
```

### Déploiement Kubernetes

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notification-service
  template:
    metadata:
      labels:
        app: notification-service
    spec:
      containers:
      - name: notification-service
        image: notification-service:latest
        ports:
        - containerPort: 3002
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: host
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: notification-service
spec:
  selector:
    app: notification-service
  ports:
  - port: 3002
    targetPort: 3002
  type: ClusterIP
```

### Déploiement avec CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy Notification Service

on:
  push:
    branches: [main]
    paths: ['notification-service/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Run tests
      run: |
        cd notification-service
        npm ci
        npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v3
    - name: Deploy to production
      run: |
        # Script de déploiement
        ./scripts/deploy.sh
```

---

## 📊 MONITORING ET LOGS

### Logs structurés

```javascript
// Format des logs
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "service": "notification",
  "message": "Email sent successfully",
  "data": {
    "notificationId": "uuid-1234",
    "provider": "sendgrid",
    "recipient": "user@example.com",
    "template": "welcome",
    "duration": 1250
  }
}
```

### Types de logs

```bash
# Logs généraux
tail -f logs/combined.log

# Logs d'erreurs
tail -f logs/error.log

# Logs de notifications
tail -f logs/notifications.log

# Logs d'exceptions
tail -f logs/exceptions.log
```

### Métriques Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'notification-service'
    static_configs:
      - targets: ['notification-service:3002']
    metrics_path: '/metrics'
```

### Dashboard Grafana

```json
{
  "dashboard": {
    "title": "Notification Service",
    "panels": [
      {
        "title": "Emails envoyés/min",
        "type": "stat",
        "targets": [
          {
            "expr": "rate(emails_sent_total[5m])"
          }
        ]
      },
      {
        "title": "SMS envoyés/min", 
        "type": "stat",
        "targets": [
          {
            "expr": "rate(sms_sent_total[5m])"
          }
        ]
      },
      {
        "title": "Taille des queues",
        "type": "graph",
        "targets": [
          {
            "expr": "redis_queue_size{queue=\"email\"}"
          }
        ]
      }
    ]
  }
}
```

---

## 🛠️ DÉPANNAGE

### Problèmes courants

#### 1. Emails non envoyés

**Symptôme** : `Email queued but not sent`

**Causes possibles** :
```bash
# Vérifier la configuration SendGrid
curl -X GET "https://api.sendgrid.com/v3/user/profile" \
  -H "Authorization: Bearer $SENDGRID_API_KEY"

# Vérifier la queue Redis
redis-cli LRANGE email-queue 0 10

# Vérifier les logs
grep "ERROR" logs/combined.log
```

**Solutions** :
```bash
# Redémarrer le worker
npm run worker:restart

# Vider la queue corrompue
redis-cli DEL email-queue

# Mettre à jour la clé API
export SENDGRID_API_KEY=new_key
```

#### 2. SMS non reçus

**Symptôme** : `SMS sent but not delivered`

**Diagnostic** :
```bash
# Vérifier le statut Twilio
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"

# Vérifier le format du numéro
npm test -- --testNamePattern="phone validation"
```

#### 3. Performance dégradée

**Symptôme** : `Slow response times`

**Analyse** :
```bash
# Métriques de performance
npm run perf:test

# Vérifier la taille des queues
redis-cli LLEN email-queue
redis-cli LLEN sms-queue

# Monitoring des ressources
docker stats notification-service
```

### Alertes

```yaml
# alerts.yml
groups:
  - name: notification-service
    rules:
      - alert: HighErrorRate
        expr: rate(notification_errors_total[5m]) > 0.1
        for: 2m
        annotations:
          summary: "Taux d'erreur élevé dans Notification Service"
          
      - alert: QueueBacklog
        expr: redis_queue_size > 1000
        for: 5m
        annotations:
          summary: "Backlog important dans les queues"
```

---

## 🎯 BONNES PRATIQUES

### Sécurité

```javascript
// Validation des entrées
const emailSchema = Joi.object({
  to: Joi.string().email().required(),
  subject: Joi.string().max(255).required(),
  template: Joi.string().valid('welcome', 'reset', 'confirmation').required()
});

// Rate limiting
const emailLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,               // 10 emails max
  message: 'Too many emails'
});
```

### Performance

```javascript
// Batch processing
async function sendBulkEmails(recipients) {
  const batches = chunk(recipients, 100);  // 100 par batch
  
  for (const batch of batches) {
    await Promise.all(
      batch.map(recipient => sendEmail(recipient))
    );
    
    await delay(1000);  // 1s entre les batches
  }
}

// Connection pooling
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

### Fiabilité

```javascript
// Retry pattern
async function sendWithRetry(emailData, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendEmail(emailData);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = Math.pow(2, attempt) * 1000;  // Exponential backoff
      await sleep(delay);
    }
  }
}

// Circuit breaker
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}
```

### Monitoring

```javascript
// Métriques personnalisées
const promClient = require('prom-client');

const emailSentCounter = new promClient.Counter({
  name: 'emails_sent_total',
  help: 'Total number of emails sent',
  labelNames: ['template', 'status']
});

const emailDuration = new promClient.Histogram({
  name: 'email_send_duration_seconds',
  help: 'Time taken to send emails',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Utilisation
async function sendEmail(data) {
  const end = emailDuration.startTimer();
  
  try {
    await emailProvider.send(data);
    emailSentCounter.inc({ template: data.template, status: 'success' });
  } catch (error) {
    emailSentCounter.inc({ template: data.template, status: 'error' });
    throw error;
  } finally {
    end();
  }
}
```

---

## 📈 CONCLUSION

Le Notification Service est un composant critique de la plateforme Event Planner SaaS. En suivant cette documentation, vous pouvez :

✅ **Déployer** le service en production  
✅ **Configurer** les providers email et SMS  
✅ **Monitorer** les performances et les erreurs  
✅ **Dépanner** les problèmes courants  
✅ **Maintenir** la qualité et la fiabilité  

Pour toute question ou problème, n'hésitez pas à consulter :
- La documentation technique complète
- Les logs structurés
- Les métriques de monitoring
- L'équipe de développement

---

**Version** : 1.0.0  
**Dernière mise à jour** : 29 janvier 2026  
**Auteur** : Équipe Event Planner SaaS
