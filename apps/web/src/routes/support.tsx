import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/support')({
  component: Support,
})

const supportItems = [
  {
    title: 'Account and Access',
    body: 'For sign-in, password, two-factor authentication, or account access help, email the support contact below from the address associated with your Track account.',
  },
  {
    title: 'Project Support',
    body: 'For project membership, conversation, notifications, or workspace questions, include your project name, affected channel, and a brief description of what happened.',
  },
  {
    title: 'Privacy and Deletion',
    body: 'Privacy requests and account deletion questions can be sent to the same support contact. Account deletion instructions are also available on the deletion page.',
  },
]

function Support() {
  return (
    <main className="bg-[var(--paper)] px-4 py-10">
      <article className="mx-auto max-w-3xl">
        <p className="mono-label m-0 mb-2">Q9 Track</p>
        <h1 className="m-0 text-3xl font-semibold">Support</h1>
        <p className="m-0 mt-2 text-sm text-[var(--ink-3)]">
          Effective date: July 11, 2026
        </p>

        <div className="track-surface mt-6 rounded-md p-4">
          <p className="m-0 text-sm leading-6 text-[var(--ink-2)]">
            Track support is available by email for mobile and web users who need
            help with account access, project workspaces, conversation, privacy
            requests, or account deletion.
          </p>
        </div>

        <div className="mt-8 space-y-7">
          {supportItems.map((item) => (
            <section key={item.title}>
              <h2 className="m-0 text-lg font-semibold">{item.title}</h2>
              <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
                {item.body}
              </p>
            </section>
          ))}

          <section>
            <h2 className="m-0 text-lg font-semibold">Contact</h2>
            <p className="m-0 mt-3 text-sm leading-6 text-[var(--ink-3)]">
              Email{' '}
              <a className="font-semibold text-[var(--ink)]" href="mailto:q9labs.ai@gmail.com">
                q9labs.ai@gmail.com
              </a>
              . We normally respond to support requests by email.
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
