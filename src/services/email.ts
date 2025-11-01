type Email = { to: string; subject: string; text: string };

export async function sendEmail(msg: Email) {
  const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();
  switch (provider) {
    case 'console':
      // eslint-disable-next-line no-console
      console.log(`[email] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
      return;
    default:
      // TODO: implement SES/SendGrid/SMTP
      // eslint-disable-next-line no-console
      console.log(`[email:${provider}] to=${msg.to} subject=${msg.subject}`);
      return;
  }
}

