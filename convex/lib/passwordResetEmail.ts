type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function sendPasswordResetEmail({
  apiKey,
  email,
  fetcher = fetch,
  from,
  url,
}: {
  apiKey: string;
  email: string;
  fetcher?: FetchLike;
  from: string;
  url: string;
}) {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Reset your Track password',
      text: `Use this secure link to reset your Track password:\n\n${url}\n\nIf you did not request a password reset, you can ignore this email.`,
      html: `<p>Use this secure link to reset your Track password:</p><p><a href="${escapeHtml(url)}">Reset your password</a></p><p>If you did not request a password reset, you can ignore this email.</p>`,
    }),
  });

  if (!response.ok) throw new Error('password_reset_email_delivery_failed');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}
