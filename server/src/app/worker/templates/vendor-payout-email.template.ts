type TVendorPayoutEmailArgs = {
  name: string;
  amount: number;
  previousBalance: number;
  remainingBalance: number;
  paidAt: string;
  note?: string | null;
  paidBy?: string | null;
};

export const getVendorPayoutEmailTemplate = ({
  name,
  amount,
  previousBalance,
  remainingBalance,
  paidAt,
  note,
  paidBy,
}: TVendorPayoutEmailArgs): string => `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0; padding:0; background:#f4f4f5; font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #e5e5e5; border-radius:8px; overflow:hidden;">
          <tr>
            <td style="background:#1a1a2e; padding:26px 32px;">
              <p style="margin:0; color:#ff5a00; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase;">Hoodz Payout</p>
              <h1 style="margin:8px 0 0; color:#ffffff; font-size:22px;">Vendor payout completed</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="font-size:15px; color:#333;">Hi <strong>${name}</strong>,</p>
              <p style="font-size:15px; color:#555; line-height:1.6;">
                Admin has completed a payout to your shop. Your Hoodz shop balance has been updated.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0; background:#f8f8fa; border-radius:8px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 10px; font-size:14px; color:#555;">Paid amount: <strong style="color:#111;">${Number(amount).toFixed(2)}</strong></p>
                    <p style="margin:0 0 10px; font-size:14px; color:#555;">Previous balance: <strong style="color:#111;">${Number(previousBalance).toFixed(2)}</strong></p>
                    <p style="margin:0 0 10px; font-size:14px; color:#555;">Remaining balance: <strong style="color:#111;">${Number(remainingBalance).toFixed(2)}</strong></p>
                    <p style="margin:0 0 10px; font-size:14px; color:#555;">Paid at: <strong style="color:#111;">${paidAt}</strong></p>
                    ${
                      paidBy
                        ? `<p style="margin:0 0 10px; font-size:14px; color:#555;">Processed by: <strong style="color:#111;">${paidBy}</strong></p>`
                        : ''
                    }
                    ${
                      note
                        ? `<p style="margin:0; font-size:14px; color:#555;">Note: <strong style="color:#111;">${note}</strong></p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
              <p style="font-size:14px; color:#777; line-height:1.6;">
                If you have any questions about this payout, please contact Hoodz support.
              </p>
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
