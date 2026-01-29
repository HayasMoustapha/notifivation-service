# 📁 ARBORESCENCE COMPLÈTE - NOTIFICATION SERVICE

## 🎯 Vue d'ensemble

Le **Notification Service** est le service spécialisé dans la gestion des communications transactionnelles de la plateforme Event Planner SaaS. Il gère les emails, SMS, et autres notifications.

```
📁 notification-service/
├── 📁 src/                    # Code source principal
├── 📁 database/               # Gestion base de données
├── 📁 tests/                  # Tests automatisés
├── 📁 docs/                   # Documentation
├── 📁 postman/                # Collections API
├── 📁 logs/                   # Logs applicatifs
└── 📄 Configuration files     # Fichiers de config
```

---

## 📁 DÉTAIL DE L'ARBORESCENCE

### 📁 src/ - Code source principal

```
📁 src/
├── 📁 api/                    # API REST
│   ├── 📁 routes/             # Routes API
│   │   ├── 📄 notifications.routes.js
│   │   ├── 📄 emails.routes.js
│   │   ├── 📄 sms.routes.js
│   │   ├── 📄 templates.routes.js
│   │   ├── 📄 queues.routes.js
│   │   └── 📄 statistics.routes.js
│   │
│   └── 📁 controllers/        # Contrôleurs API
│       ├── 📄 notifications.controller.js
│       ├── 📄 emails.controller.js
│       ├── 📄 sms.controller.js
│       ├── 📄 templates.controller.js
│       ├── 📄 queues.controller.js
│       └── 📄 statistics.controller.js
│
├── 📁 core/                   # Cœur métier
│   ├── 📁 services/           # Services métier
│   │   ├── 📄 email.service.js
│   │   ├── 📄 sms.service.js
│   │   ├── 📄 template.service.js
│   │   ├── 📄 queue.service.js
│   │   ├── 📄 statistics.service.js
│   │   └── 📄 notification.service.js
│   │
│   ├── 📁 providers/          # Fournisseurs externes
│   │   ├── 📄 sendgrid.provider.js
│   │   ├── 📄 twilio.provider.js
│   │   ├── 📄 vonage.provider.js
│   │   ├── 📄 smtp.provider.js
│   │   └── 📄 webhook.provider.js
│   │
│   └── 📁 processors/         # Processeurs
│       ├── 📄 email.processor.js
│       ├── 📄 sms.processor.js
│       ├── 📄 template.processor.js
│       └── 📄 batch.processor.js
│
├── 📁 services/              # Services partagés
│   ├── 📄 database.service.js
│   ├── 📄 redis.service.js
│   ├── 📄 queue.service.js
│   ├── 📄 template.service.js
│   └── 📄 metrics.service.js
│
├── 📁 database/              # Base de données
│   ├── 📁 bootstrap/          # Scripts bootstrap
│   │   ├── 📄 001_create_schema_migrations.sql
│   │   └── 📄 002_create_database.sql
│   │
│   ├── 📁 migrations/         # Migrations SQL
│   │   ├── 📄 001_initial_schema.sql
│   │   ├── 📄 002_add_indexes.sql
│   │   └── 📄 003_add_templates.sql
│   │
│   └── 📄 connection.js       # Connexion BDD
│
├── 📁 queues/                # Files d'attente
│   ├── 📄 email-queue.js
│   ├── 📄 sms-queue.js
│   ├── 📄 bulk-queue.js
│   └── 📄 retry-queue.js
│
├── 📁 middleware/            # Middlewares
│   ├── 📄 validation.middleware.js
│   ├── 📄 rate-limit.middleware.js
│   ├── 📄 auth.middleware.js
│   └── 📄 error.middleware.js
│
├── 📁 config/                # Configuration
│   ├── 📄 database.js
│   ├── 📄 redis.js
│   ├── 📄 email.js
│   ├── 📄 sms.js
│   ├── 📄 templates.js
│   └── 📄 providers.js
│
├── 📁 utils/                 # Utilitaires
│   ├── 📄 logger.js
│   ├── 📄 helpers.js
│   ├── 📄 validators.js
│   └── 📄 constants.js
│
├── 📁 error/                 # Gestion erreurs
│   ├── 📄 error-handler.js
│   ├── 📄 custom-errors.js
│   └── 📄 error-types.js
│
├── 📁 health/                # Health checks
│   ├── 📄 health.controller.js
│   ├── 📄 health.routes.js
│   └── 📄 health.service.js
│
├── 📁 shared/                # Partagé
│   └── 📄 shared-utils.js
│
├── 📄 server.js              # Serveur principal
├── 📄 bootstrap.js           # Initialisation
└── 📄 index.js               # Export principal
```

### 📁 database/ - Gestion base de données

```
📁 database/
├── 📁 bootstrap/              # Scripts bootstrap
│   ├── 📄 001_create_schema_migrations.sql
│   ├── 📄 002_create_database.sql
│   └── 📄 003_create_extensions.sql
│
├── 📁 migrations/             # Migrations SQL
│   ├── 📄 001_initial_schema.sql
│   ├── 📄 002_add_indexes.sql
│   ├── 📄 003_add_templates.sql
│   ├── 📄 004_add_statistics.sql
│   └── 📄 005_add_audit_tables.sql
│
├── 📁 schema/                 # Documentation schéma
│   ├── 📄 notifications.sql
│   ├── 📄 email_notifications.sql
│   ├── 📄 sms_notifications.sql
│   ├── 📄 notification_templates.sql
│   ├── 📄 notification_stats.sql
│   └── 📄 notification_batches.sql
│
├── 📁 seeds/                  # Données initiales
│   ├── 📄 001_default_templates.sql
│   ├── 📄 002_sample_notifications.sql
│   └── 📄 003_test_data.sql
│
├── 📄 DATABASE_BOOTSTRAP.md   # Documentation BDD
├── 📄 README.md               # README database
└── 📄 connection.js           # Configuration connexion
```

### 📁 tests/ - Tests automatisés

```
📁 tests/
├── 📁 unit/                   # Tests unitaires
│   ├── 📁 services/
│   │   ├── 📄 email.service.test.js
│   │   ├── 📄 sms.service.test.js
│   │   ├── 📄 template.service.test.js
│   │   └── 📄 queue.service.test.js
│   ├── 📁 providers/
│   │   ├── 📄 sendgrid.test.js
│   │   ├── 📄 twilio.test.js
│   │   └── 📄 vonage.test.js
│   └── 📁 utils/
│       ├── 📄 logger.test.js
│       └── 📄 helpers.test.js
│
├── 📁 integration/            # Tests d'intégration
│   ├── 📄 email.integration.test.js
│   ├── 📄 sms.integration.test.js
│   ├── 📄 template.integration.test.js
│   └── 📄 queue.integration.test.js
│
├── 📁 e2e/                    # Tests end-to-end
│   ├── 📄 email-delivery.e2e.test.js
│   ├── 📄 sms-delivery.e2e.test.js
│   ├── 📄 batch-processing.e2e.test.js
│   └── 📄 template-rendering.e2e.test.js
│
├── 📁 fixtures/               # Données de test
│   ├── 📄 emails.json
│   ├── 📄 sms.json
│   ├── 📄 templates.json
│   └── 📄 notifications.json
│
├── 📁 helpers/                # Helpers de test
│   ├── 📄 database.helper.js
│   ├── 📄 queue.helper.js
│   └── 📄 mock.helper.js
│
├── 📄 setup.js                # Configuration tests
├── 📄 teardown.js             # Nettoyage tests
└── 📄 test.config.js          # Config tests
```

### 📁 docs/ - Documentation

```
📁 docs/
├── 📄 README.md               # Documentation principale
├── 📄 API_ROUTES.md           # Routes API
├── 📄 PROVIDERS.md            # Fournisseurs externes
├── 📄 TEMPLATES.md            # Gestion templates
├── 📄 QUEUES.md               # Files d'attente
├── 📄 DEPLOYMENT.md           # Guide déploiement
└── 📄 TROUBLESHOOTING.md      # Dépannage
```

### 📁 postman/ - Collections API

```
📁 postman/
├── 📄 Notification-Service.postman_collection.json
├── 📄 Notification-Service.postman_environment.json
├── 📄 Notification-Service.postman_globals.json
└── 📁 examples/
    ├── 📄 send-email.json
    ├── 📄 send-sms.json
    └── 📄 create-template.json
```

---

## 📄 Fichiers de configuration

### 📄 Fichiers principaux

```
📄 package.json              # Dépendances et scripts
📄 package-lock.json          # Lock versions
📄 .env.example              # Variables environnement
📄 .env.development          # Env développement
📄 .env.local                # Env local
📄 .env                      # Env production
📄 .env.docker.example       # Env Docker
📄 .gitignore                # Fichiers ignorés Git
📄 .dockerignore             # Fichiers ignorés Docker
📄 Dockerfile                # Configuration Docker
└── 📄 docker-compose.yml        # Docker Compose
```

---

## 🎯 Rôle de chaque dossier

### 📁 src/ - Code métier
Contient toute la logique applicative organisée en couches pour une meilleure maintenabilité.

### 📁 database/ - Persistance
Gère tout ce qui concerne la base de données : schéma, migrations, seeds et connexions.

### 📁 tests/ - Qualité
Assure la qualité du code avec des tests unitaires, d'intégration et end-to-end.

### 📁 docs/ - Documentation
Centralise toute la documentation technique et utilisateur.

### 📁 postman/ - API Testing
Facilite les tests manuels et l'exploration des API avec des collections Postman.

### 📁 logs/ - Logging
Centralise tous les logs applicatifs pour le debugging et le monitoring.

---

## 🚀 Points d'entrée principaux

### 📄 server.js
Point d'entrée principal du serveur Express. Configure et démarre l'application.

### 📄 bootstrap.js
Script d'initialisation : connexion BDD, migrations, démarrage services.

### 📄 index.js
Export principal pour les tests et l'utilisation comme module.

---

## 🔧 Configuration

### Variables d'environnement clés
- `NODE_ENV` : Environnement (development/production)
- `PORT` : Port d'écoute (3002)
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` : BDD
- `REDIS_URL` : Redis
- `SENDGRID_API_KEY` : Clé API SendGrid
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` : Twilio
- `VONAGE_API_KEY`, `VONAGE_API_SECRET` : Vonage
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` : SMTP

### Scripts npm principaux
- `npm start` : Démarrage production
- `npm run dev` : Développement avec nodemon
- `npm test` : Tests unitaires
- `npm run test:integration` : Tests intégration
- `npm run test:e2e` : Tests E2E
- `npm run build` : Build production
- `npm run migrate` : Migrations BDD
- `npm run seed` : Seeding BDD

---

## 🔄 Fournisseurs externes

Le Notification Service supporte plusieurs fournisseurs :

### 📧 Email Providers
- **SendGrid** : Service email cloud
- **SMTP** : Serveur SMTP personnalisé
- **Mailgun** : Alternative à SendGrid

### 📱 SMS Providers
- **Twilio** : Service SMS/Voix
- **Vonage** : Alternative à Twilio
- **AWS SNS** : Service SMS AWS

### 🔄 Queue Management
- **Redis Bull** : Files d'attente Redis
- **RabbitMQ** : Alternative à Redis
- **AWS SQS** : Service de files AWS

---

## 📊 Templates

Le service gère des templates pour :
- **Emails** : Templates HTML/Texte avec Handlebars
- **SMS** : Templates texte simples
- **Notifications** : Templates multi-canaux

### Structure des templates
```
📁 templates/
├── 📁 emails/
│   ├── 📄 welcome.html
│   ├── 📄 event-confirmation.html
│   └── 📄 password-reset.html
├── 📁 sms/
│   ├── 📄 verification.txt
│   ├── 📄 event-reminder.txt
│   └── 📄 ticket-confirmation.txt
└── 📁 shared/
    ├── 📄 header.html
    ├── 📄 footer.html
    └── 📄 styles.css
```

---

**Version** : 1.0.0  
**Dernière mise à jour** : 29 janvier 2026
