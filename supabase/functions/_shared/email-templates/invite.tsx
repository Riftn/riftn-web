/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Link } from 'npm:@react-email/components@0.0.22'
import { Action, BroadcastShell, Lede, Title, accentLink } from './broadcast.tsx'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <BroadcastShell
    preview={`You've been invited to join ${siteName}`}
    footnote="Weren't expecting this? You can ignore this email."
  >
    <Title>You've been invited</Title>
    <Lede>
      You've been invited to join{' '}
      <Link href={siteUrl} style={accentLink}>
        {siteName}
      </Link>
      . Tap below to accept and create your account.
    </Lede>
    <Action href={confirmationUrl}>Accept invite</Action>
  </BroadcastShell>
)

export default InviteEmail
