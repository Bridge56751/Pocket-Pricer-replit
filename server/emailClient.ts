// SendGrid email client - uses Replit SendGrid connector
import sgMail from '@sendgrid/mail';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email};
}

// Get a fresh SendGrid client each time (credentials may expire)
export async function getUncachableSendGridClient() {
  const {apiKey, email} = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

export async function sendVerificationEmail(to: string, verificationCode: string) {
  console.log("Attempting to send verification email to:", to);
  
  const { client, fromEmail } = await getUncachableSendGridClient();
  console.log("Using from email:", fromEmail);
  
  const msg = {
    to: to,
    from: fromEmail,
    subject: 'Verify your Pocket Pricer account',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background-color: #10B981; padding: 32px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Pocket Pricer</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1a1a1a; margin: 0 0 16px 0; font-size: 20px;">Verify Your Email</h2>
            <p style="color: #666666; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
              Thank you for signing up for Pocket Pricer! Please verify your email address by entering the code below in the app:
            </p>
            <div style="background-color: #f0fdf4; border: 2px solid #10B981; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
              <span style="font-size: 32px; font-weight: 700; color: #10B981; letter-spacing: 8px;">${verificationCode}</span>
            </div>
            <p style="color: #666666; font-size: 14px; line-height: 1.5; margin: 0;">
              This code expires in 24 hours. If you didn't create an account with Pocket Pricer, you can safely ignore this email.
            </p>
          </div>
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              Integrated Sales Solutions LLC
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await client.send(msg);
    console.log("Verification email sent successfully to:", to);
  } catch (error: any) {
    console.error("SendGrid error:", error?.response?.body || error);
    throw new Error(`SendGrid error: ${error?.message || 'Failed to send email'}`);
  }
}

export async function sendSubscriptionThankYouEmail(to: string) {
  const { client, fromEmail } = await getUncachableSendGridClient();
  
  const msg = {
    to: to,
    from: fromEmail,
    subject: 'Welcome to Pocket Pricer Pro!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="background-color: #10B981; padding: 32px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Pocket Pricer</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1a1a1a; margin: 0 0 16px 0; font-size: 20px;">Thank You for Subscribing!</h2>
            <p style="color: #666666; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
              Welcome to Pocket Pricer Pro! Your subscription is now active and you have unlimited access to all features.
            </p>
            <div style="background-color: #f0fdf4; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h3 style="color: #10B981; margin: 0 0 12px 0; font-size: 16px;">What's included:</h3>
              <ul style="color: #666666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>Unlimited product scans</li>
                <li>AI-powered product identification</li>
                <li>Real-time eBay pricing data</li>
                <li>Profit calculator with fee estimates</li>
                <li>Search history and favorites</li>
              </ul>
            </div>
            <p style="color: #666666; font-size: 14px; line-height: 1.5; margin: 0;">
              If you have any questions, feel free to reach out to our support team. Happy selling!
            </p>
          </div>
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              Integrated Sales Solutions LLC
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await client.send(msg);
    console.log("Subscription thank you email sent successfully to:", to);
  } catch (error: any) {
    console.error("SendGrid error:", error?.response?.body || error);
    throw new Error(`SendGrid error: ${error?.message || 'Failed to send email'}`);
  }
}
