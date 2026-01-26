// Resend email client - uses RESEND_API_KEY and RESEND_FROM_EMAIL secrets
import { Resend } from 'resend';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }
  
  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL not configured');
  }
  
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendVerificationEmail(to: string, verificationCode: string) {
  console.log("Attempting to send verification email to:", to);
  
  const { client, fromEmail } = getResendClient();
  console.log("Using from email:", fromEmail);
  
  const verificationUrl = `${process.env.EXPO_PUBLIC_DOMAIN || 'https://pocket-pricer.replit.app'}/api/verify-email?code=${verificationCode}&email=${encodeURIComponent(to)}`;
  
  const result = await client.emails.send({
    from: fromEmail,
    to: [to],
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
  });
  
  console.log("Email send result:", JSON.stringify(result, null, 2));
  
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  
  console.log("Verification email sent successfully to:", to);
}

export async function sendSubscriptionThankYouEmail(to: string) {
  const { client, fromEmail } = getResendClient();
  
  await client.emails.send({
    from: fromEmail,
    to: [to],
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
  });
}
