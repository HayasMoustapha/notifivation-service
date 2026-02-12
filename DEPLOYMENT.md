# Déploiement — Notification Service

**Service**: `notification-service`  
**Port**: `3002`

---

## 1. Prérequis

1. PostgreSQL (DB: `event_planner_notification`)
2. Redis (queues)
3. Node.js LTS + npm

---

## 2. Variables d’Environnement

1. Copier `.env.example` → `.env`
2. Renseigner:
   - DB + Redis
   - SMTP/SendGrid
   - SMS provider (Twilio/Vonage)
   - `JWT_SECRET`
3. Tester l’envoi email/SMS en sandbox

---

## 3. Installation

```
npm install
```

---

## 4. Démarrage

```
npm run start
```

---

## 5. Healthcheck

```
GET http://localhost:3002/api/health
```
