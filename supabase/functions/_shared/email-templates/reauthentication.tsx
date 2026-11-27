/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { BroadcastShell, Code, Lede, Title } from './broadcast.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <BroadcastShell
    preview="Your Riftn verification code"
    footnote="Didn't ask for this? Ignore this email."
  >
    <Title>Confirm it's you</Title>
    <Lede>Enter this code to confirm your identity.</Lede>
    <Code value={token} hint="EXPIRES SHORTLY" />
  </BroadcastShell>
)

export default ReauthenticationEmail
