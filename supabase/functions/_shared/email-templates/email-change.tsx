/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Action, BroadcastShell, Lede, Title } from './broadcast.tsx'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

const strong = { color: '#f2f2f0' }

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <BroadcastShell
    preview={`Confirm your email change for ${siteName}`}
    footnote="Didn't ask for this change? Secure your account right away."
  >
    <Title>Confirm your new email</Title>
    <Lede>
      You asked to change your {siteName} email from <span style={strong}>{oldEmail}</span> to{' '}
      <span style={strong}>{newEmail}</span>.
    </Lede>
    <Action href={confirmationUrl}>Confirm email change</Action>
  </BroadcastShell>
)

export default EmailChangeEmail
