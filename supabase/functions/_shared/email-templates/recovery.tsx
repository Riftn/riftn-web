/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Action, BroadcastShell, Lede, Title } from './broadcast.tsx'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <BroadcastShell
    preview={`Reset your password for ${siteName}`}
    footnote="Didn't ask for a reset? Ignore this email. Your password stays the same."
  >
    <Title>Reset your password</Title>
    <Lede>We got a request to reset your {siteName} password. Tap below to choose a new one.</Lede>
    <Action href={confirmationUrl}>Choose a new password</Action>
  </BroadcastShell>
)

export default RecoveryEmail
