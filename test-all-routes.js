/**
 * SCRIPT DE TEST COMPLET - NOTIFICATION SERVICE
 * 
 * OBJECTIF : Tester toutes les routes du service de notification
 * Ce script vérifie que toutes les fonctionnalités fonctionnent correctement
 * 
 * UTILISATION :
 * node test-all-routes.js
 * 
 * PRÉREQUIS :
 * - Notification Service démarré (port 3002)
 * - Services externes configurés (SendGrid, Twilio, etc.)
 */

// Importation des modules nécessaires
const axios = require('axios');
require('dotenv').config();

// Configuration des tests
const NOTIFICATION_BASE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3002';

// Variables globales pour les résultats
const results = {
  email: { total: 0, passed: 0, failed: 0, details: {} },
  sms: { total: 0, passed: 0, failed: 0, details: {} },
  queue: { total: 0, passed: 0, failed: 0, details: {} },
  bulk: { total: 0, passed: 0, failed: 0, details: {} },
  specialized: { total: 0, passed: 0, failed: 0, details: {} },
  webhooks: { total: 0, passed: 0, failed: 0, details: {} },
  health: { total: 0, passed: 0, failed: 0, details: {} }
};

// Données fictives pour les tests - Signature unifiée template + data
const testData = {
  email: {
    to: 'test@example.com',
    template: 'welcome',
    data: {
      userName: 'John Doe',
      activationLink: 'https://example.com/activate/123456'
    },
    options: {
      priority: 'normal'
    }
  },
  sms: {
    phoneNumber: '+33612345678',
    template: 'otp',
    data: {
      otpCode: '123456',
      purpose: 'login'
    },
    options: {
      priority: 'high'
    }
  },
  bulk: {
    recipients: [
      { email: 'user1@example.com' },
      { email: 'user2@example.com' },
      { phoneNumber: '+33612345678' },
      { phoneNumber: '+33687654321' }
    ],
    template: 'event_reminder',
    data: {
      eventName: 'Tech Conference 2024',
      eventDate: '2024-12-25',
      eventLocation: 'Paris'
    },
    options: {
      priority: 'normal'
    }
  },
  bulkEmail: {
    recipients: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
    template: 'welcome',
    data: {
      user: {
        firstName: 'John',
        lastName: 'Doe'
      }
    },
    options: {
      priority: 'normal'
    }
  },
  bulkSMS: {
    recipients: ['+33612345678', '+33687654321', '+33698765432'],
    template: 'otp',
    data: {
      otpCode: '123456',
      expiresIn: '5 minutes'
    },
    options: {
      priority: 'normal'
    }
  },
  welcome: {
    to: 'test@example.com',
    template: 'welcome',
    data: {
      user: {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com'
      },
      loginUrl: 'https://app.eventplanner.com/login'
    },
    options: {
      priority: 'normal'
    }
  },
  welcomeSMS: {
    phoneNumber: '+33612345678',
    template: 'welcome',
    data: {
      user: {
        firstName: 'Jane',
        lastName: 'Smith'
      }
    },
    options: {
      priority: 'normal'
    }
  },
  passwordReset: {
    to: 'test@example.com',
    template: 'password-reset',
    data: {
      resetToken: 'reset_token_123456',
      resetUrl: 'https://app.eventplanner.com/reset-password?token=reset_token_123456'
    },
    options: {
      priority: 'high'
    }
  },
  passwordResetSMS: {
    phoneNumber: '+33612345678',
    template: 'password-reset',
    data: {
      resetCode: '654321',
      expiresIn: '10 minutes'
    },
    options: {
      priority: 'high'
    }
  },
  eventConfirmation: {
    to: 'test@example.com',
    template: 'event-confirmation',
    data: {
      event: {
        id: 'evt_123456',
        name: 'Annual Tech Summit',
        date: '2024-12-25T18:00:00Z',
        location: 'Paris Convention Center'
      },
      ticket: {
        id: 'tk_789012',
        type: 'VIP',
        price: 299.99,
        seatNumber: 'A15'
      }
    },
    options: {
      priority: 'normal'
    }
  },
  eventConfirmationSMS: {
    phoneNumber: '+33612345678',
    template: 'event-confirmation',
    data: {
      event: {
        id: 'evt_123456',
        name: 'Annual Tech Summit',
        date: '2024-12-25T18:00:00Z',
        location: 'Paris Convention Center'
      },
      ticket: {
        id: 'tk_789012',
        type: 'VIP',
        price: 299.99,
        seatNumber: 'A15'
      }
    },
    options: {
      priority: 'normal'
    }
  },
  otp: {
    phoneNumber: '+33612345678',
    template: 'otp',
    data: {
      otpCode: '123456',
      expiresIn: '5 minutes'
    },
    options: {
      priority: 'high'
    }
  },
  webhookSMS: {
    phoneNumber: '+33612345678',
    template: 'otp',
    data: {
      otpCode: '123456',
      expiresIn: '5 minutes'
    },
    options: {
      priority: 'normal'
    }
  }
};

/**
 * Fonction utilitaire pour afficher des messages colorés
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

/**
 * Fonction utilitaire pour exécuter un test
 */
async function runTest(category, testName, testFunction) {
  results[category].total++;
  results[category].details[testName] = { status: 'pending', error: null };
  
  try {
    log(`\n🧪 Test: ${testName}`, 'cyan');
    const result = await testFunction();
    
    if (result.success) {
      results[category].passed++;
      results[category].details[testName].status = 'passed';
      logSuccess(`${testName} - ${result.message || 'Succès'}`);
    } else {
      results[category].failed++;
      results[category].details[testName].status = 'failed';
      results[category].details[testName].error = result.error;
      logError(`${testName} - ${result.error || 'Échec'}`);
    }
  } catch (error) {
    results[category].failed++;
    results[category].details[testName].status = 'error';
    results[category].details[testName].error = error.message;
    logError(`${testName} - Erreur: ${error.message}`);
  }
}

/**
 * Tests de santé du service
 */
async function testHealthCheck() {
  return await runTest('health', 'Health Check', async () => {
    const response = await axios.get(`${NOTIFICATION_BASE_URL}/health`);
    return {
      success: response.status === 200,
      message: 'Service en bonne santé',
      data: response.data
    };
  });
}

async function testServiceStats() {
  return await runTest('health', 'Service Stats', async () => {
    const response = await axios.get(`${NOTIFICATION_BASE_URL}/api/notifications/stats`);
    return {
      success: response.status === 200,
      message: 'Statistiques récupérées',
      data: response.data
    };
  });
}

/**
 * Tests des emails
 */
async function testSendEmail() {
  return await runTest('email', 'Send Email', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/email`, testData.email);
    return {
      success: response.status === 201,
      message: 'Email envoyé avec succès',
      data: response.data
    };
  });
}

async function testQueueEmail() {
  return await runTest('email', 'Queue Email', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/email/queue`, testData.email);
    return {
      success: response.status === 202,
      message: 'Email mis en file d\'attente',
      data: response.data
    };
  });
}

/**
 * Tests des SMS
 */
async function testSendSMS() {
  return await runTest('sms', 'Send SMS', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/sms`, testData.sms);
    return {
      success: response.status === 201,
      message: 'SMS envoyé avec succès',
      data: response.data
    };
  });
}

async function testQueueSMS() {
  return await runTest('sms', 'Queue SMS', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/sms/queue`, testData.sms);
    return {
      success: response.status === 202,
      message: 'SMS mis en file d\'attente',
      data: response.data
    };
  });
}

/**
 * Tests des envois en lot
 */
async function testSendBulkEmail() {
  return await runTest('bulk', 'Send Bulk Email', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/email/bulk`, testData.bulkEmail);
    return {
      success: response.status === 202,
      message: 'Emails en lot mis en file d\'attente',
      data: response.data
    };
  });
}

async function testSendBulkSMS() {
  return await runTest('bulk', 'Send Bulk SMS', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/sms/bulk`, testData.bulkSMS);
    return {
      success: response.status === 202,
      message: 'SMS en lot mis en file d\'attente',
      data: response.data
    };
  });
}

async function testSendBulkMixed() {
  return await runTest('bulk', 'Send Bulk Mixed', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/bulk/mixed`, testData.bulk);
    return {
      success: response.status === 202,
      message: 'Notifications mixtes en lot mises en file d\'attente',
      data: response.data
    };
  });
}

/**
 * Tests des routes spécialisées
 */
async function testSendWelcomeEmail() {
  return await runTest('specialized', 'Send Welcome Email', async () => {
    const data = {
      to: testData.email.to,
      userData: testData.userData,
      options: testData.email.options
    };
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/welcome/email`, data);
    return {
      success: response.status === 201,
      message: 'Email de bienvenue envoyé',
      data: response.data
    };
  });
}

async function testSendWelcomeSMS() {
  return await runTest('specialized', 'Send Welcome SMS', async () => {
    const data = {
      phoneNumber: testData.sms.phoneNumber,
      userData: testData.userData,
      options: testData.sms.options
    };
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/welcome/sms`, data);
    return {
      success: response.status === 201,
      message: 'SMS de bienvenue envoyé',
      data: response.data
    };
  });
}

async function testSendPasswordResetEmail() {
  return await runTest('specialized', 'Send Password Reset Email', async () => {
    const data = {
      to: testData.email.to,
      resetToken: 'reset_token_123456',
      options: testData.email.options
    };
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/password-reset/email`, data);
    return {
      success: response.status === 201,
      message: 'Email de réinitialisation envoyé',
      data: response.data
    };
  });
}

async function testSendPasswordResetSMS() {
  return await runTest('specialized', 'Send Password Reset SMS', async () => {
    const data = {
      phoneNumber: testData.sms.phoneNumber,
      resetCode: '654321',
      options: testData.sms.options
    };
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/password-reset/sms`, data);
    return {
      success: response.status === 201,
      message: 'SMS de réinitialisation envoyé',
      data: response.data
    };
  });
}

async function testSendEventConfirmationEmail() {
  return await runTest('specialized', 'Send Event Confirmation Email', async () => {
    const data = {
      to: testData.email.to,
      eventData: testData.eventData,
      ticketData: testData.ticketData,
      options: testData.email.options
    };
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/event-confirmation/email`, data);
    return {
      success: response.status === 201,
      message: 'Email de confirmation d\'événement envoyé',
      data: response.data
    };
  });
}

async function testSendEventConfirmationSMS() {
  return await runTest('specialized', 'Send Event Confirmation SMS', async () => {
    const data = {
      phoneNumber: testData.sms.phoneNumber,
      eventData: testData.eventData,
      ticketData: testData.ticketData,
      options: testData.sms.options
    };
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/event-confirmation/sms`, data);
    return {
      success: response.status === 201,
      message: 'SMS de confirmation d\'événement envoyé',
      data: response.data
    };
  });
}

async function testSendOTPSMS() {
  return await runTest('specialized', 'Send OTP SMS', async () => {
    const data = {
      phoneNumber: testData.sms.phoneNumber,
      otpCode: '123456',
      purpose: 'login',
      options: testData.sms.options
    };
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/otp/sms`, data);
    return {
      success: response.status === 201,
      message: 'SMS OTP envoyé',
      data: response.data
    };
  });
}

/**
 * Tests des webhooks
 */
async function testWebhookEmail() {
  return await runTest('webhooks', 'Webhook Email', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/webhooks/email`, testData.email);
    return {
      success: response.status === 201,
      message: 'Webhook email traité',
      data: response.data
    };
  });
}

async function testWebhookSMS() {
  return await runTest('webhooks', 'Webhook SMS', async () => {
    const data = {
      to: testData.sms.phoneNumber,
      message: 'Test webhook SMS message',
      options: testData.sms.options
    };
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/webhooks/sms`, data);
    return {
      success: response.status === 201,
      message: 'Webhook SMS traité',
      data: response.data
    };
  });
}

async function testWebhookBulk() {
  return await runTest('webhooks', 'Webhook Bulk', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/webhooks/bulk`, testData.bulk);
    return {
      success: response.status === 202,
      message: 'Webhook bulk traité',
      data: response.data
    };
  });
}

/**
 * Tests des queues
 */
async function testGetQueueStats() {
  return await runTest('queue', 'Get Queue Stats', async () => {
    const response = await axios.get(`${NOTIFICATION_BASE_URL}/api/notifications/queues/stats`);
    return {
      success: response.status === 200,
      message: 'Statistiques des queues récupérées',
      data: response.data
    };
  });
}

async function testCleanCompletedJobs() {
  return await runTest('queue', 'Clean Completed Jobs', async () => {
    const response = await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/queues/clean`, {
      older_than_hours: 24,
      status: 'completed'
    });
    return {
      success: response.status === 200,
      message: 'Jobs terminés nettoyés',
      data: response.data
    };
  });
}

/**
 * Tests de validation
 */
async function testEmailValidation() {
  return await runTest('email', 'Email Validation', async () => {
    try {
      await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/email`, {
        to: 'invalid-email',
        template: 'test',
        data: {}
      });
      return { success: false, error: 'La validation aurait dû échouer' };
    } catch (error) {
      if (error.response && error.response.status === 400) {
        return { success: true, message: 'Validation d\'email fonctionnelle' };
      }
      throw error;
    }
  });
}

async function testSMSValidation() {
  return await runTest('sms', 'SMS Validation', async () => {
    try {
      await axios.post(`${NOTIFICATION_BASE_URL}/api/notifications/sms`, {
        phoneNumber: 'invalid-phone',
        template: 'test',
        data: {}
      });
      return { success: false, error: 'La validation aurait dû échouer' };
    } catch (error) {
      if (error.response && error.response.status === 400) {
        return { success: true, message: 'Validation de téléphone fonctionnelle' };
      }
      throw error;
    }
  });
}

/**
 * Vérification de la connectivité du service
 */
async function checkServiceAvailability() {
  try {
    const response = await axios.get(`${NOTIFICATION_BASE_URL}/`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Affichage des résultats
 */
function displayResults() {
  log('\n' + '='.repeat(80), 'bright');
  log('📊 RÉSULTATS DES TESTS - NOTIFICATION SERVICE', 'bright');
  log('='.repeat(80), 'bright');

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  Object.keys(results).forEach(category => {
    const categoryResult = results[category];
    totalTests += categoryResult.total;
    totalPassed += categoryResult.passed;
    totalFailed += categoryResult.failed;

    if (categoryResult.total > 0) {
      log(`\n📂 ${category.toUpperCase()} (${categoryResult.passed}/${categoryResult.total})`, 'cyan');
      
      Object.keys(categoryResult.details).forEach(testName => {
        const test = categoryResult.details[testName];
        const icon = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⚠️';
        log(`   ${icon} ${testName}`, test.status === 'passed' ? 'green' : 'red');
        
        if (test.error && test.status !== 'passed') {
          log(`      Erreur: ${test.error}`, 'yellow');
        }
      });
    }
  });

  log('\n' + '='.repeat(80), 'bright');
  log('📈 RÉSUMÉ GLOBAL', 'bright');
  log('='.repeat(80), 'bright');
  
  log(`Total des tests: ${totalTests}`, 'bright');
  logSuccess(`Tests réussis: ${totalPassed}`);
  logError(`Tests échoués: ${totalFailed}`);
  
  const successRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(2) : 0;
  const rateColor = successRate >= 80 ? 'green' : successRate >= 60 ? 'yellow' : 'red';
  log(`Taux de réussite: ${successRate}%`, rateColor);

  if (totalFailed === 0) {
    log('\n🎉 Tous les tests sont passés avec succès !', 'green');
  } else {
    log(`\n⚠️  ${totalFailed} test(s) ont échoué. Vérifiez la configuration du service.`, 'yellow');
  }
}

/**
 * Fonction principale
 */
async function main() {
  log('\n🚀 DÉMARRAGE DES TESTS - NOTIFICATION SERVICE', 'bright');
  log(`📍 URL du service: ${NOTIFICATION_BASE_URL}`, 'blue');
  
  // Vérification de la disponibilité du service
  log('\n🔍 Vérification de la disponibilité du service...', 'blue');
  const isAvailable = await checkServiceAvailability();
  
  if (!isAvailable) {
    logError('❌ Service non disponible. Assurez-vous que le service de notification est démarré.');
    process.exit(1);
  }
  
  logSuccess('✅ Service disponible');
  
  // Exécution des tests
  log('\n🧪 DÉBUT DES TESTS...', 'cyan');
  
  // Tests de santé
  await testHealthCheck();
  await testServiceStats();
  
  // Tests des emails
  await testSendEmail();
  await testQueueEmail();
  await testEmailValidation();
  
  // Tests des SMS
  await testSendSMS();
  await testQueueSMS();
  await testSMSValidation();
  
  // Tests des envois en lot
  await testSendBulkEmail();
  await testSendBulkSMS();
  await testSendBulkMixed();
  
  // Tests des routes spécialisées
  await testSendWelcomeEmail();
  await testSendWelcomeSMS();
  await testSendPasswordResetEmail();
  await testSendPasswordResetSMS();
  await testSendEventConfirmationEmail();
  await testSendEventConfirmationSMS();
  await testSendOTPSMS();
  
  // Tests des webhooks
  await testWebhookEmail();
  await testWebhookSMS();
  await testWebhookBulk();
  
  // Tests des queues
  await testGetQueueStats();
  await testCleanCompletedJobs();
  
  // Affichage des résultats
  displayResults();
  
  log('\n🏁 FIN DES TESTS', 'bright');
}

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  logError(`Rejet non capturé: ${reason}`);
});

process.on('uncaughtException', (error) => {
  logError(`Exception non capturée: ${error.message}`);
  process.exit(1);
});

// Démarrage du script
if (require.main === module) {
  main().catch(error => {
    logError(`Erreur lors de l'exécution des tests: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  main,
  results,
  testData
};
