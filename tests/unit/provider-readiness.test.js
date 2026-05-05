jest.mock('../../src/core/queues/queue.service', () => ({
  queues: new Map(),
}));

describe('notification provider readiness contract', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function loadModule() {
    return require('../../src/health/provider-readiness');
  }

  test('reports mock-only email delivery when live providers are placeholders', () => {
    process.env.MOCK_EMAIL_DELIVERY = 'true';
    process.env.SENDGRID_API_KEY = 'SG.your_sendgrid_api_key';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'your_email@gmail.com';
    process.env.SMTP_PASS = 'your_app_password';
    process.env.TWILIO_ACCOUNT_SID = 'your_twilio_account_sid';
    process.env.TWILIO_AUTH_TOKEN = 'your_twilio_auth_token';
    process.env.TWILIO_PHONE_NUMBER = '+1234567890';
    process.env.VONAGE_API_KEY = 'your_vonage_api_key';
    process.env.VONAGE_API_SECRET = 'your_vonage_api_secret';

    const { buildDeliveryMatrix } = loadModule();

    const matrix = buildDeliveryMatrix({
      emailStats: {
        mockDeliveryEnabled: true,
        providers: {
          smtp: { configured: false },
          sendgrid: { configured: false },
        },
      },
      emailHealth: {
        providers: {
          smtp: { status: 'unknown' },
          sendgrid: { status: 'unknown' },
        },
      },
      smsStats: {
        mockDeliveryEnabled: false,
        providers: {
          twilio: { configured: false },
          vonage: { configured: false },
          textbelt: { configured: false },
        },
      },
      smsHealth: {
        providers: {
          twilio: { status: 'unknown' },
          vonage: { status: 'unknown' },
          textbelt: { status: 'unknown' },
        },
      },
    });

    expect(matrix.email.status).toBe('mock_only');
    expect(matrix.email.mockAvailable).toBe(true);
    expect(matrix.email.configured).toBe(false);
    expect(matrix.email.providers.sendgrid.placeholderConfig).toContain('SENDGRID_API_KEY');
    expect(matrix.sms.status).toBe('missing_live_provider_credentials');
    expect(matrix.overall.anyRealProviderConfigured).toBe(false);
    expect(matrix.overall.anyMockProviderAvailable).toBe(true);
  });

  test('reports live-ready providers only when runtime health checks succeed', () => {
    process.env.TWILIO_ACCOUNT_SID = 'twilio-account-sid-example';
    process.env.TWILIO_AUTH_TOKEN = 'realish-auth-token';
    process.env.TWILIO_PHONE_NUMBER = '+33612345678';
    process.env.TEXTBELT_USE_FREE_KEY = 'false';

    const { buildDeliveryMatrix } = loadModule();

    const matrix = buildDeliveryMatrix({
      emailStats: {
        mockDeliveryEnabled: false,
        providers: {
          smtp: { configured: false },
          sendgrid: { configured: false },
        },
      },
      emailHealth: {
        providers: {
          smtp: { status: 'unknown' },
          sendgrid: { status: 'unknown' },
        },
      },
      smsStats: {
        mockDeliveryEnabled: false,
        providers: {
          twilio: { configured: true },
          vonage: { configured: false },
          textbelt: { configured: false },
        },
      },
      smsHealth: {
        providers: {
          twilio: { status: 'healthy' },
          vonage: { status: 'unknown' },
          textbelt: { status: 'unknown' },
        },
      },
    });

    expect(matrix.sms.status).toBe('live_ready');
    expect(matrix.sms.configured).toBe(true);
    expect(matrix.sms.healthy).toBe(true);
    expect(matrix.sms.liveProved).toBe(true);
    expect(matrix.sms.providers.twilio.liveProved).toBe(true);
    expect(matrix.overall.anyRealProviderLiveProved).toBe(true);
  });

  test('keeps runtime ready when infrastructure is healthy but live credentials are still missing', () => {
    const { buildReadinessSnapshot } = loadModule();

    const readiness = buildReadinessSnapshot({
      databaseStatus: { healthy: true },
      redisStatus: { healthy: true },
      deliveryMatrix: {
        overall: {
          blockedByMissingLiveProviders: true,
          localDeliveryAvailable: true,
        },
      },
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.runtimeReady).toBe(true);
    expect(readiness.status).toBe('ready_with_provider_gaps');
    expect(readiness.blockedByMissingLiveProviders).toBe(true);
    expect(readiness.localDeliveryAvailable).toBe(true);
  });
});
