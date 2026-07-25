type TVendorInviteEmailArgs = {
  name: string;
  email: string;
  password: string;
  dashboardUrl: string;
};

export const getVendorInviteEmailTemplate = ({
  name,
  email,
  password,
  dashboardUrl,
}: TVendorInviteEmailArgs): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #e0e0e0;">
          <tr>
            <td style="background:#1a1a2e; padding:28px 32px;">
              <p style="margin:0; color:#ff5a00; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Hoodz Backend Vendor Portal</p>
              <h1 style="margin:6px 0 0; color:#ffffff; font-size:22px; font-weight:700;">Your vendor account is ready</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px; font-size:15px; color:#333; line-height:1.6;">Hi <strong>${name}</strong>,</p>
              <p style="margin:0 0 20px; font-size:15px; color:#555; line-height:1.6;">An administrator has invited you to manage vendor operations in the Hoodz Backend dashboard.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; border:1px solid #eeeeee; border-radius:8px; margin-bottom:22px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px; font-size:14px; color:#333;"><strong>Email:</strong> ${email}</p>
                    <p style="margin:0; font-size:14px; color:#333;"><strong>Temporary password:</strong> ${password}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 18px; font-size:14px; color:#555; line-height:1.6;">Sign in from the dashboard link below, update your password after first login, then complete your vendor profile before starting work.</p>
              <p style="margin:0 0 24px;">
                <a href="${dashboardUrl}" style="display:inline-block; background:#ff5a00; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:6px; font-size:14px; font-weight:700;">Open Vendor Dashboard</a>
              </p>
              <p style="margin:0; font-size:15px; color:#555; line-height:1.6;">Best regards,</p>
              <p style="margin:4px 0 0; font-size:15px; color:#1a1a1a; font-weight:600;">Hoodz Backend Team</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9; border-top:1px solid #eeeeee; padding:16px 32px; text-align:center;">
              <p style="margin:0; font-size:12px; color:#999999;">This email was sent automatically. Please do not reply to this email.</p>
              <p style="margin:6px 0 0; font-size:12px; color:#cccccc;">&copy; ${new Date().getFullYear()} Hoodz Backend App. All rights reserved.</p>
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

