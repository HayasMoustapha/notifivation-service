const queueService = require('../core/queues/queue.service');

const DEFAULT_REDIS_HEALTH_TIMEOUT_MS = parseInt(process.env.REDIS_HEALTH_TIMEOUT_MS, 10) || 800;

const PROVIDER_DEFINITIONS = {
  email: {
    smtp: {
      type: 'real',
      requiredConfig: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
      healthStrategy: 'runtime_check',
    },
    sendgrid: {
      type: 'real',
      requiredConfig: ['SENDGRID_API_KEY'],
      healthStrategy: 'configuration_only',
    },
    mock: {
      type: 'mock',
      requiredFlag: 'MOCK_EMAIL_DELIVERY',
      healthStrategy: 'mock_flag',
    },
  },
  sms: {
    twilio: {
      type: 'real',
      requiredConfig: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
      healthStrategy: 'runtime_check',
    },
    vonage: {
      type: 'real',
      requiredConfig: ['VONAGE_API_KEY', 'VONAGE_API_SECRET'],
      healthStrategy: 'runtime_check',
    },
    textbelt: {
      type: 'real',
      requiredConfig: ['TEXTBELT_API_KEY'],
      fallbackFlag: 'TEXTBELT_USE_FREE_KEY',
      healthStrategy: 'configuration_only',
    },
    mock: {
      type: 'mock',
      requiredFlag: 'MOCK_SMS_DELIVERY',
      healthStrategy: 'mock_flag',
    },
  },
};

function normalizeConfigValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBooleanEnv(value) {
  return normalizeConfigValue(value).toLowerCase() === 'true';
}

function isPlaceholderConfigValue(value) {
  const normalized = normalizeConfigValue(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  const placeholderPatterns = [
    'your_',
    'your-',
    'change_me',
    'changeme',
    'replace_me',
    'placeholder',
    'dummy',
    'sample',
    'example.com',
    'example.org',
    'example.net',
    'test-key',
    'test_key',
    'your_email@',
    'your-email@',
    'your_app_password',
    'sg.your_',
    'sk_test_your_',
    'pk_test_your_',
    'acxxxxxxxx',
    '+1234567890',
    'your_twilio_',
    'your_vonage_',
    'your_textbelt_',
    'your_redis_',
    'eventplanner',
  ];

  return placeholderPatterns.some((pattern) => normalized.includes(pattern));
}

function inspectConfigKeys(keys = []) {
  const presentConfig = [];
  const missingConfig = [];
  const placeholderConfig = [];

  for (const key of keys) {
    const normalized = normalizeConfigValue(process.env[key]);

    if (!normalized) {
      missingConfig.push(key);
      continue;
    }

    if (isPlaceholderConfigValue(normalized)) {
      placeholderConfig.push(key);
      continue;
    }

    presentConfig.push(key);
  }

  return { presentConfig, missingConfig, placeholderConfig };
}

function resolveHealthFlag(providerHealth) {
  return providerHealth === 'healthy' || providerHealth === 'available';
}

function resolveProviderRecord(channel, providerCode, stats = {}, health = {}) {
  const definition = PROVIDER_DEFINITIONS[channel]?.[providerCode];
  if (!definition) {
    return null;
  }

  if (definition.type === 'mock') {
    const enabled = normalizeBooleanEnv(process.env[definition.requiredFlag]);
    return {
      provider: providerCode,
      channel,
      type: definition.type,
      configured: enabled,
      healthy: enabled,
      liveProved: false,
      productionLike: false,
      healthSource: 'mock_flag',
      mode: enabled ? 'mock' : 'disabled',
      requiredConfig: [],
      presentConfig: [],
      missingConfig: enabled ? [] : [definition.requiredFlag],
      placeholderConfig: [],
    };
  }

  const inspectedConfig = inspectConfigKeys(definition.requiredConfig);
  const fallbackFlagEnabled = definition.fallbackFlag
    ? normalizeBooleanEnv(process.env[definition.fallbackFlag])
    : false;
  const configured =
    definition.fallbackFlag && fallbackFlagEnabled
      ? true
      : inspectedConfig.missingConfig.length === 0 && inspectedConfig.placeholderConfig.length === 0;
  const healthy = resolveHealthFlag(health?.status) && configured;
  const liveProved = definition.healthStrategy === 'runtime_check' ? healthy : false;
  const productionLike = providerCode !== 'textbelt' || !fallbackFlagEnabled;

  const missingConfig = [...inspectedConfig.missingConfig];
  if (!configured && definition.fallbackFlag && !fallbackFlagEnabled && missingConfig.length === 0) {
    missingConfig.push(...definition.requiredConfig.filter((key) => !inspectedConfig.presentConfig.includes(key)));
  }

  return {
    provider: providerCode,
    channel,
    type: definition.type,
    configured,
    healthy,
    liveProved,
    productionLike,
    healthSource: healthy
      ? (definition.healthStrategy === 'runtime_check' ? 'runtime_check' : 'configuration_only')
      : 'configuration',
    mode: definition.fallbackFlag && fallbackFlagEnabled ? 'shared_test_key' : null,
    requiredConfig: definition.requiredConfig,
    presentConfig: inspectedConfig.presentConfig,
    missingConfig,
    placeholderConfig: inspectedConfig.placeholderConfig,
    status: health?.status || (configured ? 'configured' : 'not_configured'),
    error: health?.error || null,
  };
}

function summarizeChannel(channel, stats = {}, health = {}) {
  const providerMap = {};
  const providerCodes = Object.keys(PROVIDER_DEFINITIONS[channel] || {});

  for (const providerCode of providerCodes) {
    const providerStats = stats.providers?.[providerCode] || {};
    const providerHealth = health.providers?.[providerCode] || {};
    const record = resolveProviderRecord(channel, providerCode, providerStats, providerHealth);
    if (record) {
      providerMap[providerCode] = record;
    }
  }

  const realProviders = Object.values(providerMap).filter((provider) => provider.type === 'real');
  const mockProviders = Object.values(providerMap).filter((provider) => provider.type === 'mock');
  const anyRealProviderConfigured = realProviders.some((provider) => provider.configured);
  const anyRealProviderHealthy = realProviders.some((provider) => provider.healthy);
  const anyRealProviderLiveProved = realProviders.some((provider) => provider.liveProved);
  const mockAvailable = mockProviders.some((provider) => provider.healthy);
  const localDeliveryAvailable = anyRealProviderHealthy || mockAvailable;

  let status = 'missing_live_provider_credentials';
  if (anyRealProviderLiveProved) {
    status = 'live_ready';
  } else if (anyRealProviderHealthy) {
    status = 'configured_not_live_proved';
  } else if (mockAvailable) {
    status = 'mock_only';
  } else if (anyRealProviderConfigured) {
    status = 'configured_but_unhealthy';
  }

  return {
    channel,
    status,
    configured: anyRealProviderConfigured,
    healthy: anyRealProviderHealthy,
    liveProved: anyRealProviderLiveProved,
    mockAvailable,
    localDeliveryAvailable,
    blockedByMissingLiveProviders: !anyRealProviderConfigured,
    providers: providerMap,
  };
}

function buildDeliveryMatrix({
  emailStats = {},
  emailHealth = {},
  smsStats = {},
  smsHealth = {},
} = {}) {
  const email = summarizeChannel('email', emailStats, emailHealth);
  const sms = summarizeChannel('sms', smsStats, smsHealth);

  return {
    email,
    sms,
    overall: {
      anyRealProviderConfigured: email.configured || sms.configured,
      anyRealProviderHealthy: email.healthy || sms.healthy,
      anyRealProviderLiveProved: email.liveProved || sms.liveProved,
      anyMockProviderAvailable: email.mockAvailable || sms.mockAvailable,
      localDeliveryAvailable: email.localDeliveryAvailable || sms.localDeliveryAvailable,
      blockedByMissingLiveProviders: !(email.configured || sms.configured),
    },
  };
}

async function checkRedisConnection({ timeoutMs = DEFAULT_REDIS_HEALTH_TIMEOUT_MS } = {}) {
  const queue = queueService.queues?.get('email') || queueService.queues?.values?.().next?.().value;

  if (!queue) {
    return {
      success: false,
      healthy: false,
      connected: false,
      status: 'not_initialized',
      error: 'No Bull queue initialized',
    };
  }

  try {
    const pingResult = await Promise.race([
      (async () => {
        await queue.isReady();
        const client = await queue.client;
        const pong = await client.ping();
        return pong;
      })(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis health timeout')), timeoutMs);
      }),
    ]);

    return {
      success: true,
      healthy: String(pingResult).toUpperCase() === 'PONG',
      connected: String(pingResult).toUpperCase() === 'PONG',
      status: String(pingResult).toUpperCase() === 'PONG' ? 'healthy' : 'unexpected_response',
      response: pingResult,
    };
  } catch (error) {
    return {
      success: false,
      healthy: false,
      connected: false,
      status: 'unreachable',
      error: error.message,
    };
  }
}

function buildReadinessSnapshot({ databaseStatus, redisStatus, deliveryMatrix }) {
  const runtimeReady = Boolean(databaseStatus?.healthy) && Boolean(redisStatus?.healthy);
  const blockedByMissingLiveProviders = deliveryMatrix?.overall?.blockedByMissingLiveProviders ?? true;
  const localDeliveryAvailable = deliveryMatrix?.overall?.localDeliveryAvailable ?? false;

  return {
    ready: runtimeReady,
    status: runtimeReady
      ? (blockedByMissingLiveProviders ? 'ready_with_provider_gaps' : 'ready')
      : 'not_ready',
    runtimeReady,
    localDeliveryAvailable,
    blockedByMissingLiveProviders,
    checks: {
      database: databaseStatus?.healthy ? 'healthy' : 'unhealthy',
      redis: redisStatus?.healthy ? 'healthy' : 'unhealthy',
      delivery: localDeliveryAvailable ? 'available' : 'blocked',
    },
  };
}

module.exports = {
  buildDeliveryMatrix,
  buildReadinessSnapshot,
  checkRedisConnection,
  inspectConfigKeys,
  isPlaceholderConfigValue,
  normalizeBooleanEnv,
};
