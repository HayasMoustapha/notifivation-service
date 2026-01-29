/**
 * Consommateur Redis pour le service de notification
 */

const { Worker, createQueue } = require('../../shared/config/redis-config');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const NOTIFICATION_QUEUE = 'notification_queue';

const emailConfig = {
  service: process.env.EMAIL_SERVICE || 'gmail',
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
};

const smsConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  fromNumber: process.env.TWILIO_FROM_NUMBER
};

function startNotificationConsumer() {
  const queue = createQueue(NOTIFICATION_QUEUE);
  
  const worker = new Worker(NOTIFICATION_QUEUE, async (job) => {
    const { data } = job;
    
    try {
      console.log(`[NOTIFICATION_CONSUMER] Traitement job ${job.id}: ${data.notification_type}`);
      
      await job.updateProgress(10);
      
      let result;
      
      switch (data.notification_type) {
        case 'ticket_generation_complete':
          result = await handleTicketNotification(data, job);
          break;
        default:
          result = await handleCustomNotification(data, job);
          break;
      }
      
      await job.updateProgress(100);
      
      return result;
      
    } catch (error) {
      console.error(`[NOTIFICATION_CONSUMER] Erreur traitement job ${job.id}:`, error.message);
      
      await emitNotificationResult(data.job_id, {
        success: false,
        error: error.message,
        completed_at: new Date().toISOString()
      });
      
      throw error;
    }
  }, {
    concurrency: parseInt(process.env.NOTIFICATION_CONCURRENCY) || 5
  });
  
  worker.on('completed', (job) => {
    console.log(`[NOTIFICATION_CONSUMER] Job ${job.id} complété`);
  });
  
  worker.on('failed', (job, err) => {
    console.error(`[NOTIFICATION_CONSUMER] Job ${job.id} échoué:`, err.message);
  });
  
  console.log('[NOTIFICATION_CONSUMER] Consommateur démarré');
  return worker;
}

async function handleTicketNotification(data, job) {
  const { tickets, notification_preferences, template_data } = data;
  
  let sentCount = 0;
  let failedCount = 0;
  const errors = [];
  
  await job.updateProgress(20);
  
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    
    try {
      await job.updateProgress(20 + (i * 60 / tickets.length));
      
      if (notification_preferences.email && ticket.guest_email) {
        await sendTicketEmail(ticket, template_data);
        sentCount++;
      }
      
      if (notification_preferences.sms && ticket.guest_phone) {
        await sendTicketSMS(ticket, template_data);
        sentCount++;
      }
      
    } catch (error) {
      console.error(`[NOTIFICATION_CONSUMER] Erreur envoi ticket ${ticket.ticket_id}:`, error.message);
      failedCount++;
      errors.push({
        ticket_id: ticket.ticket_id,
        error: error.message
      });
    }
  }
  
  await job.updateProgress(90);
  
  const result = {
    success: failedCount === 0,
    sent_count: sentCount,
    failed_count: failedCount,
    total_count: tickets.length,
    errors: errors,
    completed_at: new Date().toISOString()
  };
  
  await emitNotificationResult(data.job_id, result);
  
  return result;
}

async function handleCustomNotification(data, job) {
  const { recipients, notification_preferences, template_data } = data;
  
  let sentCount = 0;
  let failedCount = 0;
  const errors = [];
  
  await job.updateProgress(30);
  
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    
    try {
      await job.updateProgress(30 + (i * 60 / recipients.length));
      
      if (notification_preferences.email && recipient.email) {
        await sendCustomEmail(recipient, template_data);
        sentCount++;
      }
      
      if (notification_preferences.sms && recipient.phone) {
        await sendCustomSMS(recipient, template_data);
        sentCount++;
      }
      
    } catch (error) {
      console.error(`[NOTIFICATION_CONSUMER] Erreur envoi personnalisé à ${recipient.email || recipient.phone}:`, error.message);
      failedCount++;
      errors.push({
        recipient: recipient.email || recipient.phone,
        error: error.message
      });
    }
  }
  
  await job.updateProgress(90);
  
  const result = {
    success: failedCount === 0,
    sent_count: sentCount,
    failed_count: failedCount,
    total_count: recipients.length,
    errors: errors,
    completed_at: new Date().toISOString()
  };
  
  await emitNotificationResult(data.job_id, result);
  
  return result;
}

async function sendTicketEmail(ticket, templateData) {
  try {
    const transporter = nodemailer.createTransporter(emailConfig);
    
    const htmlContent = generateTicketEmailTemplate(ticket, templateData);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@eventplanner.com',
      to: ticket.guest_email,
      subject: `Vos billets pour ${templateData.event_title}`,
      html: htmlContent,
      attachments: ticket.ticket_file_url ? [{
        filename: `ticket_${ticket.ticket_code}.pdf`,
        path: ticket.ticket_file_url
      }] : []
    };
    
    await transporter.sendMail(mailOptions);
    
    console.log(`[NOTIFICATION_CONSUMER] Email ticket envoyé à ${ticket.guest_email}`);
    
  } catch (error) {
    console.error('[NOTIFICATION_CONSUMER] Erreur envoi email ticket:', error.message);
    throw new Error(`Impossible d'envoyer l'email: ${error.message}`);
  }
}

async function sendTicketSMS(ticket, templateData) {
  try {
    const client = twilio(smsConfig.accountSid, smsConfig.authToken);
    
    const message = generateTicketSMSTemplate(ticket, templateData);
    
    await client.messages.create({
      body: message,
      from: smsConfig.fromNumber,
      to: ticket.guest_phone
    });
    
    console.log(`[NOTIFICATION_CONSUMER] SMS ticket envoyé à ${ticket.guest_phone}`);
    
  } catch (error) {
    console.error('[NOTIFICATION_CONSUMER] Erreur envoi SMS ticket:', error.message);
    throw new Error(`Impossible d'envoyer le SMS: ${error.message}`);
  }
}

function generateTicketEmailTemplate(ticket, templateData) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Vos billets - ${templateData.event_title}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .ticket-info { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .ticket-code { font-size: 24px; font-weight: bold; color: #007bff; text-align: center; padding: 15px; background-color: #e9ecef; border-radius: 5px; }
            .footer { text-align: center; color: #666; margin-top: 30px; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎫 Vos billets sont prêts !</h1>
                <p>Merci pour votre réservation à ${templateData.event_title}</p>
            </div>
            
            <div class="ticket-info">
                <h3>Informations de l'événement</h3>
                <p><strong>Événement:</strong> ${templateData.event_title}</p>
                <p><strong>Date:</strong> ${new Date(templateData.event_date).toLocaleDateString('fr-FR')}</p>
                <p><strong>Lieu:</strong> ${templateData.event_location}</p>
                <p><strong>Organisateur:</strong> ${templateData.organizer_name}</p>
            </div>
            
            <div class="ticket-info">
                <h3>Informations du billet</h3>
                <p><strong>Nom:</strong> ${ticket.guest_name}</p>
                <p><strong>Email:</strong> ${ticket.guest_email}</p>
                <div class="ticket-code">
                    Code du billet: ${ticket.ticket_code}
                </div>
            </div>
            
            <div class="footer">
                <p>Cet email a été généré automatiquement par Event Planner.</p>
                <p>Présentez ce code à l'entrée de l'événement.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

function generateTicketSMSTemplate(ticket, templateData) {
  return `
🎫 Event Planner
Billet pour: ${templateData.event_title}
Date: ${new Date(templateData.event_date).toLocaleDateString('fr-FR')}
Lieu: ${templateData.event_location}
Code: ${ticket.ticket_code}
Nom: ${ticket.guest_name}
Présentez ce code à l'entrée.
  `.trim();
}

async function emitNotificationResult(jobId, result) {
  try {
    const queue = createQueue('notification_result_queue');
    
    await queue.add(
      'notification_result',
      {
        job_id: jobId,
        result: result,
        timestamp: new Date().toISOString()
      },
      {
        priority: 1,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );
    
    console.log(`[NOTIFICATION_CONSUMER] Résultat émis pour job ${jobId}`);
    
  } catch (error) {
    console.error('[NOTIFICATION_CONSUMER] Erreur émission résultat:', error.message);
  }
}

async function sendCustomEmail(recipient, templateData) {
  console.log(`[NOTIFICATION_CONSUMER] Email personnalisé pour ${recipient.email}`);
}

async function sendCustomSMS(recipient, templateData) {
  console.log(`[NOTIFICATION_CONSUMER] SMS personnalisé pour ${recipient.phone}`);
}

module.exports = {
  startNotificationConsumer,
  NOTIFICATION_QUEUE
};
