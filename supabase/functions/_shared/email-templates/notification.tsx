/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Action, BroadcastShell, Lede, Title } from './broadcast.tsx'

interface NotificationEmailProps {
  /** Short line at the top, e.g. "You received a tip". */
  heading: string
  /** The same sentence the in-app row carries, verbatim. */
  body: string
  /** Absolute riftn.com URL the row would open. */
  actionUrl: string
}

// One template for every notification type we mail. The backend already writes
// the sentence for the notification centre and the push, so the email says the
// same thing rather than inventing a third wording that then drifts — the copy
// arrives as `body` and this file only frames it.
export const NotificationEmail = ({ heading, body, actionUrl }: NotificationEmailProps) => (
  <BroadcastShell
    preview={body}
    footnote="You get this because email notifications are on for your Riftn account. Turn them off any time in Settings, then Notifications."
  >
    <Title>{heading}</Title>
    <Lede>{body}</Lede>
    <Action href={actionUrl}>Open on Riftn</Action>
  </BroadcastShell>
)

export default NotificationEmail
