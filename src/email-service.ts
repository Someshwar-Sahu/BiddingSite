import tls from 'tls';

/**
 * Enterprise Transactional Email Dispatcher for NexTrade Auctions
 * Supports:
 * 1. Official Gmail / Standard SMTP (Direct TLS, 0% Spam)
 * 2. Resend API (HTTP REST Fallback)
 * 3. Offline Dev Logger (when no credentials are configured)
 */

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/**
 * Zero-dependency native TLS SMTP Client (Port 465 SMTPS)
 * Authenticates directly with Google Mail servers without external packages.
 */
function sendViaNativeSmtp(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string
): Promise<EmailResult> {
  return new Promise((resolve) => {
    const cleanPass = config.pass.replace(/\s+/g, '');
    const cleanUser = config.user.trim();
    const fromMatch = config.from.match(/<([^>]+)>/);
    const rawFrom = fromMatch ? fromMatch[1].trim() : config.from.trim();
    const rawTo = to.trim();

    console.log(`📤 Dispatching email via Gmail SMTP (TLS ${config.port}) to [${rawTo}] from [${config.from}]...`);

    const socket = tls.connect(
      {
        host: config.host,
        port: config.port,
        servername: config.host,
        timeout: 20000,
      },
      () => {
        // TLS Handshake complete
      }
    );

    let stage = 0;
    let buffer = '';
    let finished = false;

    const cleanupAndResolve = (result: EmailResult) => {
      if (finished) return;
      finished = true;
      try {
        socket.destroy();
      } catch (_) {}
      resolve(result);
    };

    socket.setEncoding('utf8');

    const sendCmd = (cmd: string) => {
      socket.write(cmd + '\r\n');
    };

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (!buffer.endsWith('\r\n')) return;

      const lines = buffer.trimEnd().split('\r\n');
      const lastLine = lines[lines.length - 1];

      // In SMTP, intermediate multi-line responses start with 'XYZ-', final line has 'XYZ '
      const match = lastLine.match(/^(\d{3})(?: (.+))?$/);
      if (!match) return;

      const code = parseInt(match[1], 10);
      buffer = ''; // Reset buffer for next stage

      if (code >= 400) {
        console.error(`❌ SMTP Error at stage ${stage}: ${lastLine}`);
        return cleanupAndResolve({ success: false, error: `SMTP server error: ${lastLine}` });
      }

      if (stage === 0 && code === 220) {
        // Initial 220 Service Ready
        stage = 1;
        sendCmd('EHLO localhost');
      } else if (stage === 1 && code === 250) {
        // EHLO completed
        stage = 2;
        sendCmd('AUTH LOGIN');
      } else if (stage === 2 && code === 334) {
        // Server asks for username
        stage = 3;
        sendCmd(Buffer.from(cleanUser).toString('base64'));
      } else if (stage === 3 && code === 334) {
        // Server asks for password
        stage = 4;
        sendCmd(Buffer.from(cleanPass).toString('base64'));
      } else if (stage === 4 && code === 235) {
        // Authentication successful
        stage = 5;
        sendCmd(`MAIL FROM:<${rawFrom}>`);
      } else if (stage === 5 && code === 250) {
        stage = 6;
        sendCmd(`RCPT TO:<${rawTo}>`);
      } else if (stage === 6 && code === 250) {
        stage = 7;
        sendCmd('DATA');
      } else if (stage === 7 && code === 354) {
        stage = 8;
        const msgId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@gmail.com>`;
        const dateStr = new Date().toUTCString();

        // Convert HTML to clean plain-text fallback (Crucial for spam filter score)
        const plainText = html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
          .replace(/<br\s*[\/]?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&bull;/g, '•')
          .replace(/&amp;/g, '&')
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();

        const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        const base64Plain = Buffer.from(plainText).toString('base64');
        const formattedPlain = base64Plain.match(/.{1,76}/g)?.join('\r\n') || base64Plain;
        const base64Html = Buffer.from(html).toString('base64');
        const formattedHtml = base64Html.match(/.{1,76}/g)?.join('\r\n') || base64Html;

        const mimeMessage = [
          `From: ${config.from}`,
          `To: ${rawTo}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
          `Date: ${dateStr}`,
          `Message-ID: ${msgId}`,
          `MIME-Version: 1.0`,
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          '',
          `--${boundary}`,
          `Content-Type: text/plain; charset=UTF-8`,
          `Content-Transfer-Encoding: base64`,
          '',
          formattedPlain,
          '',
          `--${boundary}`,
          `Content-Type: text/html; charset=UTF-8`,
          `Content-Transfer-Encoding: base64`,
          '',
          formattedHtml,
          '',
          `--${boundary}--`,
          '.',
        ].join('\r\n');

        sendCmd(mimeMessage);
      } else if (stage === 8 && code === 250) {
        stage = 9;
        sendCmd('QUIT');
        console.log(`✉️ Live Email successfully dispatched via Gmail SMTP to ${rawTo}`);
        cleanupAndResolve({ success: true, messageId: `gmail_smtp_${Date.now()}` });
      }
    });

    socket.on('error', (err) => {
      console.error('❌ SMTP Socket Error:', err.message);
      cleanupAndResolve({ success: false, error: err.message });
    });

    socket.on('timeout', () => {
      console.error('❌ SMTP Socket Timeout');
      cleanupAndResolve({ success: false, error: 'SMTP connection timed out' });
    });
  });
}

/**
 * Optional Nodemailer transport (used if nodemailer is installed in project)
 */
async function trySendWithNodemailer(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string
): Promise<EmailResult | null> {
  try {
    const nmModule: any = await import('nodemailer' as any);
    const nodemailer = nmModule.default || nmModule;
    if (nodemailer && typeof nodemailer.createTransport === 'function') {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: {
          user: config.user.trim(),
          pass: config.pass.replace(/\s+/g, ''),
        },
      });
      const plainText = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
        .replace(/<br\s*[\/]?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();

      const info = await transporter.sendMail({
        from: config.from,
        to: to.trim(),
        subject,
        text: plainText,
        html,
      });
      console.log(`✉️ Live Email successfully dispatched via Nodemailer SMTP to ${to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    }
  } catch (_) {
    // Nodemailer not installed, use native TLS SMTP
  }
  return null;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<EmailResult> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const rawFrom = process.env.EMAIL_FROM || (smtpUser ? `NexTrade Auctions <${smtpUser.trim()}>` : 'NexTrade Auctions <onboarding@resend.dev>');
  const fromEmail = rawFrom.replace(/^["']|["']$/g, '').trim();

  // 1. Primary: Official Gmail SMTP (Direct from Google, 0% Spam)
  if (smtpUser && smtpPass) {
    const smtpConfig: SmtpConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      user: smtpUser,
      pass: smtpPass,
      from: fromEmail,
    };

    const nmResult = await trySendWithNodemailer(smtpConfig, to, subject, html);
    if (nmResult) return nmResult;

    return await sendViaNativeSmtp(smtpConfig, to, subject, html);
  }

  // 2. Secondary: Resend REST API (Fallback)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      console.log(`📤 Dispatching email via Resend to [${to}] from [${fromEmail}]...`);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to.trim()],
          subject,
          html,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.message || (data.name ? `${data.name}: ${data.message}` : JSON.stringify(data));
        console.error('❌ Resend API Error:', errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log(`✉️ Live Email successfully dispatched to ${to} (Resend ID: ${data.id})`);
      return { success: true, messageId: data.id };
    } catch (err: any) {
      console.error('❌ Failed to dispatch email via Resend:', err.message || err);
      return { success: false, error: err.message || 'Network fetch failure' };
    }
  }

  // 3. Offline / Local Development Fallback: Console Dispatch Logger
  console.log('\n============================================================');
  console.log('📧 [OFFLINE EMAIL DISPATCH SIMULATOR]');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log('------------------------------------------------------------');
  // Extract primary link from HTML if present
  const match = html.match(/href="([^"]+)"/);
  if (match) {
    console.log(`🔗 Action Link: ${match[1]}`);
  }
  console.log('============================================================\n');

  return { success: true, messageId: `offline_${Date.now()}` };
}

/**
 * 1. Supplier Onboarding & PIN Setup Invitation Email
 */
export async function sendSupplierOnboardingInviteEmail(
  to: string,
  companyName: string,
  inviteUrl: string,
  onboardingType: 'full' | 'pin_only'
): Promise<EmailResult> {
  const isPinOnly = onboardingType === 'pin_only';
  const subject = isPinOnly
    ? `Action Required: Activate Your NexTrade Supplier Account — ${companyName}`
    : `Invitation to Register & Bid — NexTrade Reverse E-Procurement Network`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        
        <div style="margin-bottom: 24px; text-align: center;">
          <span style="background-color: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-size: 11px; font-weight: 700; padding: 4px 12px; rounded-full: 9999px; text-transform: uppercase; letter-spacing: 1px;">
            NexTrade Supplier Network
          </span>
          <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin-top: 12px; margin-bottom: 4px;">
            ${isPinOnly ? 'Activate Your Supplier Account' : 'Supplier Onboarding Invitation'}
          </h1>
          <p style="color: #94a3b8; font-size: 13px; margin: 0;">
            ${companyName}
          </p>
        </div>

        <div style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 28px;">
          ${
            isPinOnly
              ? `Your organization's profile and tax compliance master data have been pre-verified by NexTrade Operations. To access the live reverse e-auctions, please set your confidential 6-digit access PIN.`
              : `You have been officially invited to join the NexTrade Reverse E-Procurement platform. Please complete your legal business details and tax verification (GSTIN & PAN) to participate in corporate reverse tenders.`
          }
        </div>

        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${inviteUrl}" style="background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
            ${isPinOnly ? '🔐 Set Access PIN & Enter Hub' : '📋 Complete Supplier Registration'}
          </a>
        </div>

        <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 14px; font-size: 11px; color: #64748b; word-break: break-all;">
          <strong>Direct link:</strong><br/>
          <a href="${inviteUrl}" style="color: #38bdf8;">${inviteUrl}</a>
        </div>

        <div style="margin-top: 28px; border-top: 1px solid #334155; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center;">
          NexTrade Auctions • Digital Reverse E-Procurement Engine<br/>
          This is an automated invitation. Do not share this unique access link.
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to, subject, html });
}

/**
 * 2. KYC Approval Notification Email
 */
export async function sendKycApprovalEmail(
  to: string,
  companyName: string,
  loginUrl: string
): Promise<EmailResult> {
  const subject = `KYC Approved: Your NexTrade Supplier Account is Now Active — ${companyName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px;">
        
        <div style="margin-bottom: 24px; text-align: center;">
          <span style="background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; font-size: 11px; font-weight: 700; padding: 4px 12px; rounded-full: 9999px;">
            ✓ KYC Verified & Approved
          </span>
          <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin-top: 12px; margin-bottom: 4px;">
            Supplier Account Authorized
          </h1>
          <p style="color: #94a3b8; font-size: 13px; margin: 0;">
            ${companyName}
          </p>
        </div>

        <div style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 28px;">
          Congratulations! Your tax compliance credentials (GSTIN & PAN) have been successfully reviewed and approved by the <strong>NexTrade Operations Desk</strong>.
          <br/><br/>
          You can now log in to the <strong>Supplier Procurement Hub</strong> to access scheduled tenders, enter live reverse bidding rooms, and download official outcome certificates.
        </div>

        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${loginUrl}" style="background-color: #10b981; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px; display: inline-block;">
            🏢 Access Supplier Hub
          </a>
        </div>

        <div style="margin-top: 28px; border-top: 1px solid #334155; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center;">
          NexTrade Auctions • Digital Reverse E-Procurement Engine
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to, subject, html });
}

/**
 * 3. Tender / Live Auction Invitation Email
 */
export async function sendAuctionInvitationEmail(
  to: string,
  companyName: string,
  auctionId: string,
  auctionTitle: string,
  scheduledStart: string,
  roomUrl: string
): Promise<EmailResult> {
  const subject = `Tender Invitation: ${auctionId} — ${auctionTitle}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px;">
        
        <div style="margin-bottom: 24px; text-align: center;">
          <span style="background-color: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-size: 11px; font-weight: 700; padding: 4px 12px; rounded-full: 9999px;">
            Live Reverse Auction Invitation
          </span>
          <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin-top: 12px; margin-bottom: 4px;">
            ${auctionTitle}
          </h1>
          <p style="color: #38bdf8; font-size: 12px; font-family: monospace; margin: 0;">
            Event ID: ${auctionId}
          </p>
        </div>

        <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-size: 13px; line-height: 1.8;">
          <div style="color: #94a3b8;">Invited Supplier: <strong style="color: #ffffff;">${companyName}</strong></div>
          <div style="color: #94a3b8;">Scheduled Start: <strong style="color: #f59e0b;">${new Date(scheduledStart).toLocaleString('en-IN')}</strong></div>
          <div style="color: #94a3b8;">Format: <strong style="color: #10b981;">Reverse E-Auction (Decremental Bidding)</strong></div>
        </div>

        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${roomUrl}" style="background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px; display: inline-block;">
            ⚡ Enter Bidding Room
          </a>
        </div>

        <div style="margin-top: 28px; border-top: 1px solid #334155; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center;">
          NexTrade Auctions • Official Procurement Gateway
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to, subject, html });
}

/**
 * 4. Tender Schedule / Parameter Update Notification Email (For Auction Edits)
 */
export async function sendAuctionUpdateNotificationEmail(
  to: string,
  companyName: string,
  auctionId: string,
  auctionTitle: string,
  newScheduledStart: string,
  durationMinutes: number,
  roomUrl: string
): Promise<EmailResult> {
  const subject = `Notice: Tender ${auctionId} Specifications Updated — ${auctionTitle}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px;">
        
        <div style="margin-bottom: 24px; text-align: center;">
          <span style="background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); color: #f59e0b; font-size: 11px; font-weight: 700; padding: 4px 12px; rounded-full: 9999px;">
            ⚠️ Tender Parameters Revised
          </span>
          <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin-top: 12px; margin-bottom: 4px;">
            ${auctionTitle}
          </h1>
          <p style="color: #38bdf8; font-size: 12px; font-family: monospace; margin: 0;">
            Event ID: ${auctionId}
          </p>
        </div>

        <div style="color: #cbd5e1; font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
          Dear <strong>${companyName}</strong>,<br/><br/>
          The NexTrade Operations Desk has updated the schedule and specifications for tender <strong>${auctionId}</strong>. Please review the updated start time below.
        </div>

        <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-size: 13px; line-height: 1.8;">
          <div style="color: #94a3b8;">Revised Start Time: <strong style="color: #f59e0b;">${new Date(newScheduledStart).toLocaleString('en-IN')}</strong></div>
          <div style="color: #94a3b8;">Duration: <strong style="color: #ffffff;">${durationMinutes} Minutes</strong></div>
          <div style="color: #94a3b8;">Status: <strong style="color: #10b981;">Active Schedule</strong></div>
        </div>

        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${roomUrl}" style="background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px; display: inline-block;">
            ⚡ Inspect Updated Bidding Room
          </a>
        </div>

        <div style="margin-top: 28px; border-top: 1px solid #334155; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center;">
          NexTrade Auctions • Official Procurement Gateway
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to, subject, html });
}

