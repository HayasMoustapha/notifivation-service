# 📋 Analyse Complète des Routes dans les Templates Email

## 🎯 Objectif
Identifier tous les liens et boutons dans les templates emails et définir les routes correspondantes pour une maintenance optimale.

## 📊 Statistiques
- **Total de liens identifiés** : 52 liens uniques
- **Templates analysés** : 27 templates
- **Services cibles identifiés** : Frontend, Core Service, Services externes

---

## 🌐 **ROUTES FRONTEND** (nécessitent FRONTEND_URL)

### 🔐 **Sécurité & Authentification**
```
{{frontendUrl}}/dashboard
- Utilisé dans: account-activated, welcome, event-notification
- Description: Tableau de bord principal utilisateur
- Service: Frontend (port 3000/3001)

{{frontendUrl}}/reset-password?token={{resetToken}}
- Utilisé dans: password-reset
- Description: Page de réinitialisation du mot de passe
- Service: Frontend/Auth Service

{{frontendUrl}}/security/change-password
- Utilisé dans: security-alert, fraud-detected
- Description: Page de changement de mot de passe
- Service: Frontend/Auth Service

{{frontendUrl}}/security/review-login
- Utilisé dans: security-alert
- Description: Révision des connexions suspectes
- Service: Frontend/Auth Service

{{frontendUrl}}/security/confirm-change
- Utilisé dans: security-alert
- Description: Confirmation de changement de sécurité
- Service: Frontend/Auth Service

{{frontendUrl}}/security/revert-change
- Utilisé dans: security-alert
- Description: Annulation de changement non autorisé
- Service: Frontend/Auth Service

{{frontendUrl}}/security/unlock-account
- Utilisé dans: security-alert
- Description: Déblocage de compte
- Service: Frontend/Auth Service

{{frontendUrl}}/security/dashboard
- Utilisé dans: security-alert
- Description: Tableau de bord sécurité
- Service: Frontend/Auth Service

{{frontendUrl}}/security/activity-log
- Utilisé dans: fraud-detected
- Description: Journal d'activité de sécurité
- Service: Frontend/Auth Service
```

### 🎫 **Gestion des Tickets & Événements**
```
{{frontendUrl}}/my-tickets
- Utilisé dans: payment-confirmation, event-reminder, ticket-reminder
- Description: Liste des tickets de l'utilisateur
- Service: Frontend/Core Service

{{frontendUrl}}/events/{{eventId}}
- Utilisé dans: payment-failed, event-reminder, ticket-reminder, event-confirmation
- Description: Page de détail d'un événement
- Service: Frontend/Core Service

{{frontendUrl}}/calendar/add/{{eventId}}
- Utilisé dans: event-confirmation (via calendarUrl)
- Description: Ajout d'événement au calendrier
- Service: Frontend/Core Service
```

### 💳 **Paiements & Facturation**
```
{{frontendUrl}}/payment-methods
- Utilisé dans: payment-failed
- Description: Page des méthodes de paiement
- Service: Frontend/Payment Service

{{frontendUrl}}/my-refunds
- Utilisé dans: refund-processed-simple
- Description: Historique des remboursements
- Service: Frontend/Payment Service
```

### 📊 **Analytics & Rapports**
```
{{frontendUrl}}/analytics/scanning
- Utilisé dans: daily-scan-report
- Description: Analytics de scanning
- Service: Frontend/Scan Validation Service

{{frontendUrl}}/reports/export/{{reportId}}
- Utilisé dans: daily-scan-report
- Description: Export de rapports
- Service: Frontend/Core Service
```

### 🛟 **Support & Aide**
```
{{frontendUrl}}/support
- Utilisé dans: security-alert (via supportUrl)
- Description: Page de support général
- Service: Frontend

{{frontendUrl}}/support/fraud
- Utilisé dans: fraud-detected
- Description: Support spécialisé fraude
- Service: Frontend
```

---

## 🔗 **ROUTES DYNAMIQUES** (variables spécifiques)

### 📧 **Email & Vérification**
```
{{verificationLink}}
- Utilisé dans: email-verification
- Description: Lien direct de vérification d'email
- Service: Auth Service
- Route attendue: /auth/verify-email?token={{token}}

{{loginUrl}}
- Utilisé dans: password-changed
- Description: Page de connexion
- Service: Auth Service
- Route attendue: /auth/login
```

### 🎫 **Tickets & Paiements**
```
{{ticketsUrl}}
- Utilisé dans: ticket-purchased
- Description: Page des tickets achetés
- Service: Core Service
- Route attendue: /tickets/my-tickets

{{eventUrl}}
- Utilisé dans: event-notification, ticket-purchased
- Description: Page de l'événement
- Service: Core Service
- Route attendue: /events/{{eventId}}

{{invoiceUrl}}
- Utilisé dans: payment-confirmation
- Description: Téléchargement facture
- Service: Payment Service
- Route attendue: /payments/invoices/{{invoiceId}}

{{retryUrl}}
- Utilisé dans: payment-failed
- Description: Retry de paiement
- Service: Payment Service
- Route attendue: /payments/retry/{{transactionId}}
```

### 📅 **Calendrier & Événements**
```
{{calendarUrl}}
- Utilisé dans: event-confirmation
- Description: Ajout au calendrier
- Service: Core Service
- Route attendue: /events/{{eventId}}/calendar

{{responseUrl}}
- Utilisé dans: event-notification
- Description: Réponse à invitation
- Service: Core Service
- Route attendue: /events/{{eventId}}/respond
```

### 🔄 **Actions Utilisateur**
```
{{acceptUrl}}
- Utilisé dans: event-invitation
- Description: Accepter invitation
- Service: Core Service
- Route attendue: /events/{{eventId}}/accept

{{declineUrl}}
- Utilisé dans: event-invitation
- Description: Refuser invitation
- Service: Core Service
- Route attendue: /events/{{eventId}}/decline

{{maybeUrl}}
- Utilisé dans: event-invitation
- Description: Peut-être (réponse)
- Service: Core Service
- Route attendue: /events/{{eventId}}/maybe

{{downloadUrl}}
- Utilisé dans: ticket-generated
- Description: Télécharger ticket
- Service: Ticket Generator Service
- Route attendue: /tickets/{{ticketId}}/download
```

---

## 🌍 **SERVICES EXTERNES**

### 🗺️ **Cartes & Localisation**
```
https://maps.google.com/?q={{eventLocation}}
- Utilisé dans: event-reminder, ticket-reminder
- Description: Localisation sur Google Maps
- Service: Externe (Google Maps)
```

### 📱 **QR Codes & Téléchargement**
```
{{qrCode}}
- Utilisé dans: ticket-generated
- Description: Code QR du ticket
- Service: Ticket Generator Service
- Route attendue: /tickets/{{ticketId}}/qr
```

---

## 🚨 **PROBLÈMES IDENTIFIÉS**

### ❌ **Variables Manquantes dans .env**
```
FRONTEND_URL - NON DÉFINIE dans .env.example et .env
- Impact: Tous les liens {{frontendUrl}} seront cassés
- Solution: Ajouter FRONTEND_URL=http://localhost:3000
```

### ⚠️ **Routes à Implémenter**
```
Routes Core Service manquantes:
- /events/{{eventId}}/calendar
- /events/{{eventId}}/respond
- /events/{{eventId}}/accept
- /events/{{eventId}}/decline
- /events/{{eventId}}/maybe

Routes Payment Service manquantes:
- /payments/invoices/{{invoiceId}}
- /payments/retry/{{transactionId}}

Routes Ticket Generator manquantes:
- /tickets/{{ticketId}}/download
- /tickets/{{ticketId}}/qr
```

---

## 📝 **RECOMMANDATIONS**

### 1. **Ajouter les variables manquantes dans .env.example**
```env
# Frontend Configuration
FRONTEND_URL=http://localhost:3000
# URL du frontend pour les liens dans les emails
```

### 2. **Standardiser les routes**
- Utiliser des routes RESTful cohérentes
- Documenter toutes les routes dans l'API Swagger

### 3. **Valider les liens**
- Ajouter une validation pour s'assurer que toutes les variables requises sont fournies
- Tester les liens après chaque déploiement

### 4. **Monitoring**
- Surveiller les clics sur les liens
- Détecter les liens cassés automatiquement
