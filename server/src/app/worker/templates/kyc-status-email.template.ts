type TKycStatusEmailArgs = {
  name: string;
  status: string;
  rejectedReason?: string | null;
};

export const getKycStatusEmailTemplate = ({
  name,
  status,
  rejectedReason,
}: TKycStatusEmailArgs): string => {
  const isApproved = status === 'approved';
  const title = isApproved ? 'Your KYC has been approved' : 'Your KYC has been rejected';
  const body = isApproved
    ? 'Your rider account is now active. You can start using rider features.'
    : `Your KYC request was rejected.${rejectedReason ? ` Reason: ${rejectedReason}` : ''}`;

  return `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0; padding:0; background:#f4f4f5; font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #e5e5e5; border-radius:8px; overflow:hidden;">
          <tr>
            <td style="background:#1a1a2e; padding:26px 32px;">
              <p style="margin:0; color:#ff5a00; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Hoodz Backend KYC</p>
              <h1 style="margin:8px 0 0; color:#ffffff; font-size:22px;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-size:15px; color:#333;">Hi <strong>${name}</strong>,</p>
              <p style="font-size:15px; color:#555; line-height:1.6;">${body}</p>
              <p style="font-size:15px; color:#1a1a1a; font-weight:600;">Hoodz Backend Team</p>
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

