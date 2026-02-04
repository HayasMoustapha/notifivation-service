#!/usr/bin/env node

/**
 * TEST COMPLET DE TOUS LES TEMPLATES EMAIL
 * Vérifie que tous les templates fonctionnent correctement
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3002';
const TEST_EMAIL = 'moustaphabelkassimhassidd@gmail.com';

// Templates de test avec données minimales
const templates = [
  {
    name: 'welcome',
    data: {
      firstName: 'Jean',
      lastName: 'Dupont',
      username: 'jdupont',
      email: 'jean@example.com',
      frontendUrl: 'https://eventplanner.com'
    }
  },
  {
    name: 'account-activated',
    data: {
      firstName: 'Marie',
      lastName: 'Martin',
      username: 'mmartin',
      email: 'marie@example.com',
      activationDate: '03/02/2026',
      frontendUrl: 'https://eventplanner.com'
    }
  },
  {
    name: 'account-suspended',
    data: {
      firstName: 'Pierre',
      lastName: 'Durand',
      suspensionReason: 'Activité suspecte',
      suspensionDate: '03/02/2026',
      suspensionDuration: '7 jours',
      suspensionId: 'SUS-001',
      supportEmail: 'support@eventplanner.com',
      supportPhone: '+33 1 23 45 67 89'
    }
  },
  {
    name: 'email-verification',
    data: {
      firstName: 'Sophie',
      lastName: 'Bernard',
      verificationLink: 'https://eventplanner.com/verify?token=abc123',
      verificationCode: '123456',
      expiryHours: '24',
      supportEmail: 'support@eventplanner.com'
    }
  },
  {
    name: 'password-reset',
    data: {
      firstName: 'Test',
      resetToken: 'abc123',
      validUntil: '24h',
      frontendUrl: 'https://eventplanner.com'
    }
  },
  {
    name: 'password-changed',
    data: {
      firstName: 'Test',
      lastName: 'User',
      changeDate: '03/02/2026',
      changeTime: '22:30',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      wasPasswordReset: true,
      loginUrl: 'https://eventplanner.com/login'
    }
  },
  {
    name: 'event-confirmation',
    data: {
      firstName: 'Test',
      eventName: 'Test Event',
      eventDate: '10/02/2026',
      eventTime: '18:00',
      eventLocation: 'Test Location'
    }
  },
  {
    name: 'event-notification',
    data: {
      firstName: 'Test',
      eventName: 'Test Event',
      notificationTitle: 'Important Update',
      eventDate: '10/02/2026'
    }
  },
  {
    name: 'event-cancelled',
    data: {
      firstName: 'Test',
      lastName: 'User',
      eventName: 'Cancelled Event',
      cancellationReason: 'Force majeure',
      refundInfo: 'Full refund processed'
    }
  },
  {
    name: 'event-reminder',
    data: {
      firstName: 'Test',
      eventName: 'Reminder Event',
      eventDate: '10/02/2026',
      eventTime: '18:00',
      eventLocation: 'Test Location'
    }
  },
  {
    name: 'event-invitation',
    data: {
      firstName: 'Test',
      eventName: 'Invitation Event',
      senderName: 'John Doe',
      eventDate: '10/02/2026',
      eventTime: '18:00'
    }
  },
  {
    name: 'event_invitation',
    data: {
      invitationCode: 'INV-123456',
      guestName: 'Test User',
      eventTitle: 'Invitation Event',
      eventDescription: 'Un événement de démonstration',
      eventDate: '10/02/2026',
      location: 'Paris',
      acceptUrl: 'https://eventplanner.com/invitations/INV-123456/accept',
      declineUrl: 'https://eventplanner.com/invitations/INV-123456/decline'
    }
  },
  {
    name: 'payment-confirmation',
    data: {
      firstName: 'Test',
      amount: '100.00',
      currency: 'EUR',
      transactionId: 'TX-123',
      eventName: 'Test Event'
    }
  },
  {
    name: 'payment-failed',
    data: {
      firstName: 'Test',
      eventName: 'Test Event',
      errorCode: 'CARD_DECLINED',
      errorMessage: 'Card declined',
      failedDate: '03/02/2026'
    }
  },
  {
    name: 'payment-failed-simple',
    data: {
      firstName: 'Test',
      eventName: 'Test Event',
      errorCode: 'CARD_DECLINED',
      errorMessage: 'Card declined',
      failedDate: '03/02/2026'
    }
  },
  {
    name: 'ticket-generated',
    data: {
      firstName: 'Test',
      eventName: 'Test Event',
      ticketNumber: 'TKT-001',
      eventDate: '10/02/2026',
      eventLocation: 'Test Location'
    }
  },
  {
    name: 'ticket_confirmation',
    data: {
      eventTitle: 'Test Event',
      eventDate: '10/02/2026',
      ticketCode: 'TKT-001',
      pdfUrl: 'https://eventplanner.com/tickets/TKT-001.pdf'
    }
  },
  {
    name: 'ticket-purchased',
    data: {
      firstName: 'Test',
      lastName: 'User',
      eventName: 'Test Event',
      orderId: 'ORD-001',
      purchaseDate: '03/02/2026',
      totalAmount: '150.00',
      currency: 'EUR',
      paymentMethod: 'Credit Card',
      eventDate: '10/02/2026',
      eventTime: '18:00',
      eventLocation: 'Test Location',
      tickets: [
        {
          ticketNumber: 'TKT-001',
          ticketType: 'Standard',
          price: '50.00',
          participantName: 'Test User',
          participantEmail: 'test@example.com'
        }
      ]
    }
  },
  {
    name: 'ticket-reminder',
    data: {
      firstName: 'Test',
      eventName: 'Reminder Event',
      eventDate: '10/02/2026',
      eventTime: '18:00',
      eventLocation: 'Test Location'
    }
  },
  {
    name: 'ticket-generation-error',
    data: {
      eventName: 'Test Event',
      jobId: 'JOB-001',
      error: 'Erreur lors du rendu PDF',
      supportEmail: 'support@eventplanner.com',
      retryUrl: 'https://eventplanner.com/tickets/retry/JOB-001'
    }
  },
  {
    name: 'batch-generation-complete',
    data: {
      eventName: 'Test Event',
      totalTickets: 120,
      successfulTickets: 118,
      failedTickets: 2,
      jobId: 'JOB-002',
      downloadUrl: 'https://eventplanner.com/tickets/batch/JOB-002/download'
    }
  },
  {
    name: 'security-alert',
    data: {
      firstName: 'Test',
      alertType: 'suspicious_login',
      description: 'Suspicious login detected',
      timestamp: '03/02/2026 22:30',
      ipAddress: '192.168.1.100'
    }
  },
  {
    name: 'refund-processed',
    data: {
      firstName: 'Test',
      amount: '50.00',
      currency: 'EUR',
      refundId: 'REF-001',
      originalTransactionId: 'TX-001'
    }
  },
  {
    name: 'refund-processed-simple',
    data: {
      firstName: 'Test',
      amount: '50.00',
      currency: 'EUR',
      refundId: 'REF-001',
      originalTransactionId: 'TX-001',
      processedDate: '03/02/2026',
      status: 'Completed'
    }
  },
  {
    name: 'fraud-detected',
    data: {
      firstName: 'Test',
      fraudType: 'Multiple ticket purchases',
      riskLevel: 'high',
      detectionTime: '03/02/2026 22:30'
    }
  },
  {
    name: 'fraud-detected-simple',
    data: {
      firstName: 'Test',
      fraudType: 'Suspicious activity',
      riskLevel: 'medium',
      detectionTime: '03/02/2026 22:30'
    }
  },
  {
    name: 'daily-scan-report',
    data: {
      firstName: 'Admin',
      reportDate: '03/02/2026',
      totalScans: 150,
      uniqueTickets: 120,
      eventsScanned: 5
    }
  },
  {
    name: 'appointment-reminder',
    data: {
      firstName: 'Test',
      appointmentType: 'Technical Meeting',
      appointmentDate: '05/02/2026',
      appointmentTime: '10:00',
      location: 'Office A',
      confirmationUrl: 'https://eventplanner.com/confirm'
    }
  },
  {
    name: 'test-simple',
    data: {
      firstName: 'Test',
      email: 'test@example.com'
    }
  }
];

async function testTemplate(template) {
  try {
    console.log(`\n🧪 Testing template: ${template.name}`);
    
    const response = await axios.post(`${BASE_URL}/api/notifications/email`, {
      to: TEST_EMAIL,
      template: template.name,
      data: template.data
    }, {
      timeout: 10000
    });

    if (response.data.success) {
      console.log(`✅ ${template.name}: SUCCESS`);
      console.log(`   Message ID: ${response.data.data?.messageId}`);
      console.log(`   Provider: ${response.data.data?.provider}`);
      console.log(`   Response Time: ${response.data.data?.responseTime}ms`);
      return { name: template.name, status: 'success', error: null };
    } else {
      console.log(`❌ ${template.name}: FAILED`);
      console.log(`   Error: ${response.data.message}`);
      return { name: template.name, status: 'failed', error: response.data.message };
    }
  } catch (error) {
    console.log(`❌ ${template.name}: ERROR`);
    console.log(`   Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Details: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return { name: template.name, status: 'error', error: error.message };
  }
}

async function testAllTemplates() {
  console.log('🚀 Starting comprehensive template testing...\n');
  
  const results = [];
  
  for (const template of templates) {
    const result = await testTemplate(template);
    results.push(result);
    
    // Pause entre les tests pour éviter le rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Résumé
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(50));
  
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const errors = results.filter(r => r.status === 'error').length;
  
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`💥 Errors: ${errors}`);
  console.log(`📈 Total: ${results.length}`);
  
  // Détails des échecs
  const failedResults = results.filter(r => r.status !== 'success');
  if (failedResults.length > 0) {
    console.log('\n❌ FAILED TEMPLATES:');
    failedResults.forEach(result => {
      console.log(`   - ${result.name}: ${result.error}`);
    });
  }
  
  console.log('\n🎉 Testing completed!');
}

// Exécuter les tests
if (require.main === module) {
  testAllTemplates().catch(console.error);
}

module.exports = { testAllTemplates, templates };
