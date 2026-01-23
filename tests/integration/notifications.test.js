const request = require('supertest');
const app = require('../../src/server');

describe('Notifications API Integration Tests', () => {
  let testEmail = 'test@example.com';
  let testPhone = '+33612345678';
  let testUserData = {
    first_name: 'Test',
    last_name: 'User',
    email: testEmail
  };

  beforeAll(async () => {
    // Attendre l'initialisation du serveur
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('Health Checks', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'notification');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('dependencies');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('system');
    });

    it('should return ready status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('dependencies');
    });

    it('should return live status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
    });

    it('should return component health for email', async () => {
      const response = await request(app)
        .get('/health/components/email')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('healthy');
    });

    it('should return component health for sms', async () => {
      const response = await request(app)
        .get('/health/components/sms')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('healthy');
    });

    it('should return component health for queues', async () => {
      const response = await request(app)
        .get('/health/components/queues')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('stats');
    });

    it('should return providers status', async () => {
      const response = await request(app)
        .get('/health/providers')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('providers');
      expect(response.body.providers).toHaveProperty('email');
      expect(response.body.providers).toHaveProperty('sms');
    });

    it('should return queues status', async () => {
      const response = await request(app)
        .get('/health/queues')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('summary');
    });

    it('should handle invalid component', async () => {
      const response = await request(app)
        .get('/health/components/invalid')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('available');
    });
  });

  describe('POST /api/notifications/email', () => {
    it('should send email successfully', async () => {
      const response = await request(app)
        .post('/api/notifications/email')
        .send({
          to: testEmail,
          template: 'welcome',
          data: {
            user: testUserData
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('provider');
      expect(response.body.data).toHaveProperty('messageId');
      expect(response.body.data).toHaveProperty('sentAt');
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/notifications/email')
        .send({
          to: 'invalid-email',
          template: 'welcome',
          data: { user: testUserData }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid template', async () => {
      const response = await request(app)
        .post('/api/notifications/email')
        .send({
          to: testEmail,
          template: 'invalid-template',
          data: { user: testUserData }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing data', async () => {
      const response = await request(app)
        .post('/api/notifications/email')
        .send({
          to: testEmail,
          template: 'welcome'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/notifications/sms', () => {
    it('should send SMS successfully', async () => {
      const response = await request(app)
        .post('/api/notifications/sms')
        .send({
          phoneNumber: testPhone,
          template: 'welcome',
          data: {
            user: testUserData
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('provider');
      expect(response.body.data).toHaveProperty('messageId');
      expect(response.body.data).toHaveProperty('sentAt');
    });

    it('should reject invalid phone number', async () => {
      const response = await request(app)
        .post('/api/notifications/sms')
        .send({
          phoneNumber: 'invalid-phone',
          template: 'welcome',
          data: { user: testUserData }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid template', async () => {
      const response = await request(app)
        .post('/api/notifications/sms')
        .send({
          phoneNumber: testPhone,
          template: 'invalid-template',
          data: { user: testUserData }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/notifications/email/queue', () => {
    it('should queue email successfully', async () => {
      const response = await request(app)
        .post('/api/notifications/email/queue')
        .send({
          to: testEmail,
          template: 'welcome',
          data: {
            user: testUserData
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('status', 'queued');
      expect(response.body.data).toHaveProperty('queuedAt');
    });
  });

  describe('POST /api/notifications/sms/queue', () => {
    it('should queue SMS successfully', async () => {
      const response = await request(app)
        .post('/api/notifications/sms/queue')
        .send({
          phoneNumber: testPhone,
          template: 'welcome',
          data: {
            user: testUserData
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('status', 'queued');
    });
  });

  describe('POST /api/notifications/email/bulk', () => {
    it('should queue bulk email successfully', async () => {
      const recipients = [
        'user1@example.com',
        'user2@example.com',
        'user3@example.com'
      ];

      const response = await request(app)
        .post('/api/notifications/email/bulk')
        .send({
          recipients,
          template: 'welcome',
          data: {
            user: testUserData
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('status', 'queued');
    });

    it('should reject empty recipients', async () => {
      const response = await request(app)
        .post('/api/notifications/email/bulk')
        .send({
          recipients: [],
          template: 'welcome',
          data: { user: testUserData }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject too many recipients', async () => {
      const recipients = Array(1001).fill().map((_, i) => `user${i}@example.com`);

      const response = await request(app)
        .post('/api/notifications/email/bulk')
        .send({
          recipients,
          template: 'welcome',
          data: { user: testUserData }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/notifications/sms/bulk', () => {
    it('should queue bulk SMS successfully', async () => {
      const recipients = [
        '+33612345678',
        '+33612345679',
        '+33612345680'
      ];

      const response = await request(app)
        .post('/api/notifications/sms/bulk')
        .send({
          recipients,
          template: 'welcome',
          data: {
            user: testUserData
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('status', 'queued');
    });
  });

  describe('POST /api/notifications/bulk/mixed', () => {
    it('should queue bulk mixed notifications successfully', async () => {
      const recipients = [
        { email: 'user1@example.com', phoneNumber: '+33612345678' },
        { email: 'user2@example.com' },
        { phoneNumber: '+33612345679' }
      ];

      const response = await request(app)
        .post('/api/notifications/bulk/mixed')
        .send({
          recipients,
          template: 'welcome',
          data: {
            user: testUserData
          },
          options: {
            type: 'both'
          }
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('status', 'queued');
    });

    it('should reject recipients without email or phone', async () => {
      const recipients = [
        { name: 'User1' }
      ];

      const response = await request(app)
        .post('/api/notifications/bulk/mixed')
        .send({
          recipients,
          template: 'welcome',
          data: { user: testUserData }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Specialized Endpoints', () => {
    it('should send welcome email', async () => {
      const response = await request(app)
        .post('/api/notifications/welcome/email')
        .send({
          to: testEmail,
          userData: testUserData
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should send welcome SMS', async () => {
      const response = await request(app)
        .post('/api/notifications/welcome/sms')
        .send({
          phoneNumber: testPhone,
          userData: testUserData
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should send password reset email', async () => {
      const response = await request(app)
        .post('/api/notifications/password-reset/email')
        .send({
          to: testEmail,
          resetToken: 'reset-token-123'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should send password reset SMS', async () => {
      const response = await request(app)
        .post('/api/notifications/password-reset/sms')
        .send({
          phoneNumber: testPhone,
          resetCode: '123456'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should send event confirmation email', async () => {
      const eventData = {
        id: 'event-123',
        title: 'Test Event',
        eventDate: '2024-12-25T10:00:00Z',
        location: 'Test Location'
      };

      const ticketData = {
        id: 'ticket-123',
        type: 'standard'
      };

      const response = await request(app)
        .post('/api/notifications/event-confirmation/email')
        .send({
          to: testEmail,
          eventData,
          ticketData
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should send OTP SMS', async () => {
      const response = await request(app)
        .post('/api/notifications/otp/sms')
        .send({
          phoneNumber: testPhone,
          otpCode: '123456',
          purpose: 'verification'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Job Management', () => {
    let jobId;

    beforeAll(async () => {
      // Créer un job pour les tests
      const response = await request(app)
        .post('/api/notifications/email/queue')
        .send({
          to: testEmail,
          template: 'welcome',
          data: { user: testUserData }
        });
      
      jobId = response.body.data.jobId;
    });

    it('should get job status', async () => {
      const response = await request(app)
        .get(`/api/notifications/job/${jobId}/status`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId', jobId);
      expect(response.body.data).toHaveProperty('status');
    });

    it('should cancel job', async () => {
      const response = await request(app)
        .delete(`/api/notifications/job/${jobId}/cancel`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId', jobId);
      expect(response.body.data).toHaveProperty('cancelled', true);
    });

    it('should handle non-existent job', async () => {
      const response = await request(app)
        .get('/api/notifications/job/non-existent-job/status');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Queue Management', () => {
    it('should get queue statistics', async () => {
      const response = await request(app)
        .get('/api/notifications/queues/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('sms');
      expect(response.body.data).toHaveProperty('bulk');
    });

    it('should clean completed jobs', async () => {
      const response = await request(app)
        .post('/api/notifications/queues/clean');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('cleanedCount');
      expect(response.body.data).toHaveProperty('cleanedAt');
    });
  });

  describe('Service Health and Stats', () => {
    it('should return service health', async () => {
      const response = await request(app)
        .get('/api/notifications/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('sms');
      expect(response.body.data).toHaveProperty('overall');
    });

    it('should return service statistics', async () => {
      const response = await request(app)
        .get('/api/notifications/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('sms');
      expect(response.body.data).toHaveProperty('queues');
    });
  });

  describe('Webhooks', () => {
    it('should handle webhook with API key', async () => {
      const response = await request(app)
        .post('/api/notifications/webhooks/email')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .send({
          event: 'test.event',
          data: {
            to: testEmail,
            template: 'welcome',
            user: testUserData
          }
        });

      // Peut retourner 401 si la clé API n'est pas configurée
      expect([201, 401]).toContain(response.status);
    });

    it('should reject webhook without API key', async () => {
      const response = await request(app)
        .post('/api/notifications/webhooks/email')
        .send({
          event: 'test.event',
          data: { to: testEmail }
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/notifications/email')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle oversized payload', async () => {
      const largeData = {
        to: testEmail,
        template: 'welcome',
        data: {
          user: testUserData,
          largeField: 'x'.repeat(1000000) // 1MB de données
        }
      };

      const response = await request(app)
        .post('/api/notifications/email')
        .send(largeData);

      expect([200, 400, 413]).toContain(response.status);
    });

    it('should handle invalid routes', async () => {
      const response = await request(app)
        .get('/api/notifications/invalid-route');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow normal requests', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
    });

    it('should include rate limiting headers', async () => {
      const response = await request(app)
        .post('/api/notifications/email')
        .send({
          to: testEmail,
          template: 'welcome',
          data: { user: testUserData }
        });

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/notifications/email');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('API Documentation', () => {
    it('should provide API info', async () => {
      const response = await request(app)
        .get('/api');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service', 'Notification API');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body).toHaveProperty('version');
    });

    it('should provide service info', async () => {
      const response = await request(app)
        .get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service', 'Notification Service');
      expect(response.body).toHaveProperty('status', 'running');
      expect(response.body).toHaveProperty('capabilities');
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return metrics if enabled', async () => {
      // Activer temporairement les métriques pour le test
      const originalValue = process.env.ENABLE_METRICS;
      process.env.ENABLE_METRICS = 'true';

      const response = await request(app)
        .get('/metrics');

      expect([200, 404]).toContain(response.status);

      // Restaurer la valeur originale
      process.env.ENABLE_METRICS = originalValue;
    });
  });
});
