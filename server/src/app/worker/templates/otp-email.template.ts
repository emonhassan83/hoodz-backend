export const getOtpEmailTemplate = (name: string, otp: string, expiresAt: string): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family: Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; border: 1px solid #e0e0e0;">

          <!-- Header -->
          <tr>
            <td style="background: #1a1a2e; padding: 28px 32px;">
              <p style="margin:0; color:#e07b39; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Verification System</p>
              <h1 style="margin:6px 0 0; color:#ffffff; font-size:22px; font-weight:700;">Verification Code</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin:0 0 16px; font-size:15px; color:#333; line-height:1.6;">Dear <strong>${name}</strong>,</p>
              <p style="margin:0 0 24px; font-size:15px; color:#555; line-height:1.6;">Your one-time verification OTP code is:</p>

              <!-- OTP Code Container -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; padding:24px;">
                    <div style="font-size:36px; font-weight:700; color:#1a1a2e; letter-spacing:6px;">${otp}</div>
                  </td>
                </tr>
              </table>

              <!-- Notice Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0; border:1px solid #ffe0b2; border-radius:8px; margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0; font-size:13px; color:#e65100; line-height:1.5;">
                      ⏰ This code will expire in <strong>4 minutes</strong>. Please do not share this OTP with anyone for security reasons.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0; font-size:15px; color:#555; line-height:1.6;">Best regards,</p>
              <p style="margin:4px 0 0; font-size:15px; color:#1a1a1a; font-weight:600;">Hoodz Backend Team</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9; border-top:1px solid #eeeeee; padding:16px 32px; text-align:center;">
              <p style="margin:0; font-size:12px; color:#999999;">
                This email was sent automatically. Please do not reply to this email.
              </p>
              <p style="margin:6px 0 0; font-size:12px; color:#cccccc;">
                © ${new Date().getFullYear()} Hoodz Backend App. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;
};

