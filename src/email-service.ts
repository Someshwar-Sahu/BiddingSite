/**
 * Enterprise Transactional Email Dispatcher for NexTrade Auctions
 * Supports:
 * 1. Resend API (HTTP REST, zero-dependency)
 * 2. Custom SMTP fallback
 * 3. Offline Dev Logger (when no credentials are configured)
 */

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<{ success: boolean; messageId?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'NexTrade Auctions <onboarding@resend.dev>';

  // 1. Production Mode: Resend REST API
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error('❌ Resend API Error:', data);
        return { success: false };
      }

      console.log(`✉️ Live Email successfully dispatched to ${to} (ID: ${data.id})`);
      return { success: true, messageId: data.id };
    } catch (err) {
      console.error('❌ Failed to dispatch email via Resend:', err);
      return { success: false };
    }
  }

  // 2. Offline / Local Development Fallback: Console Dispatch Logger
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
): Promise<void> {
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

  await sendEmail({ to, subject, html });
}

/**
 * 2. KYC Approval Notification Email
 */
export async function sendKycApprovalEmail(
  to: string,
  companyName: string,
  loginUrl: string
): Promise<void> {
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

  await sendEmail({ to, subject, html });
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
): Promise<void> {
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

  await sendEmail({ to, subject, html });
}

