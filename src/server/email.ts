import nodemailer from 'nodemailer'

function getMailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env

  if (!SMTP_HOST) {
    throw new Error('SMTP_HOST must be configured to send email.')
  }

  const port = Number(SMTP_PORT ?? 587)

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    // Local relays like mailpit accept mail without authenticating; sending an
    // AUTH command to a server that doesn't advertise it fails the connection.
    auth: SMTP_USER && SMTP_PASSWORD ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  })
}

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string
  subject: string
  text: string
}) {
  try {
    await getMailTransport().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    })
    if (process.env.NODE_ENV !== 'production') console.info('[email] message accepted', { subject })
  } catch (error) {
    console.error('[email] delivery failed', { subject, error })
    throw error
  }
}
