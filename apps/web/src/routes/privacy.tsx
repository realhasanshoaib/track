import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  component: Privacy,
})

const sections = [
  {
    title: 'Information We Collect',
    body: [
      'Google account profile data used for sign-in, including name, email address, and Google account identifier.',
      'Email/password account data used for sign-in. Passwords are handled by the authentication system and are not stored by Track in plain text.',
      'Optional two-factor authentication data, including authenticator app setup state and encrypted backup codes.',
      'Profile details you add to Track, such as display name, avatar, designation, bio, timezone, project membership, and notification settings.',
      'Project content created in Track, including messages, mentions, attachments, audit events.',
      'Operational data needed to keep Track reliable, including device, browser, app version, push notification tokens, request metadata, and diagnostic logs.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'To authenticate users with Google or email/password, protect sensitive actions with two-factor step-up, and control access to projects and channels.',
      'To provide channel conversation, search, audit history, and notifications.',
      'To improve reliability, investigate abuse or errors, and maintain security.',
      'To comply with legal, contractual, and audit obligations connected to the projects managed in Track.',
    ],
  },
  {
    title: 'Sharing',
    body: [
      'We do not sell personal information.',
      'Project content is visible to users who have access to the relevant project or channel.',
      'We use service providers for hosting, authentication, storage, notifications, observability, and app distribution. They process information only as needed to provide those services.',
      'We may disclose information if required by law, to protect rights and security, or to enforce project agreements.',
    ],
  },
  {
    title: 'Retention',
    body: [
      'Shared project content and audit history may be retained for the life of the project or longer when required for business, legal, or dispute-resolution reasons.',
      'Operational logs are kept only as long as needed for security, reliability, and debugging.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You can request access, correction, or deletion of personal profile data by contacting us.',
      'Deletion of shared project content or audit events may be limited when they must be preserved for contract, legal, or security reasons.',
      'You can control push notification preferences globally and per channel inside Track.',
    ],
  },
]

function Privacy() {
  return (
    <main className="bg-[var(--paper)] px-4 py-10">
      <article className="mx-auto max-w-3xl">
        <p className="mono-label m-0 mb-2">Q9 Track</p>
        <h1 className="m-0 text-3xl font-semibold">Privacy Policy</h1>
        <p className="m-0 mt-2 text-sm text-[var(--ink-3)]">
          Effective date: July 11, 2026
        </p>

        <div className="track-surface mt-6 rounded-md p-4">
          <p className="m-0 text-sm leading-6 text-[var(--ink-2)]">
            Track is a project communication and audit tool operated by Q9 Labs. It
            helps project teams keep messages and attachments together.
          </p>
        </div>

        <div className="mt-8 space-y-7">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="m-0 text-lg font-semibold">{section.title}</h2>
              <ul className="m-0 mt-3 space-y-2 ps-5 text-sm leading-6 text-[var(--ink-3)]">
                {section.body.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}

          <section>
            <h2 className="m-0 text-lg font-semibold">Security</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              We use access controls, secure authentication, optional two-factor authentication, encrypted transport,
              managed hosting, and operational monitoring to protect Track data.
              No internet service can be guaranteed to be perfectly secure.
            </p>
          </section>

          <section>
            <h2 className="m-0 text-lg font-semibold">Children</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              Track is intended for business use and is not directed to children.
            </p>
          </section>

          <section>
            <h2 className="m-0 text-lg font-semibold">Contact</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              For privacy requests, contact{' '}
              <a className="font-semibold text-[var(--ink)]" href="mailto:q9labs.ai@gmail.com">
                q9labs.ai@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
