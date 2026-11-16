/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Action, BroadcastShell, Code, Fine, Lede, Title } from './broadcast.tsx'

interface MagicLinkEmailProps {
  siteName?: string
  siteUrl?: string
  confirmationUrl: string
  token?: string
}

export const MagicLinkEmail = ({ confirmationUrl, token }: MagicLinkEmailProps) => (
  <BroadcastShell
    preview={`Your Riftn login code${token ? ` — ${token}` : ''}`}
    footnote="Didn't ask for this? Ignore this email. Your account stays secure."
  >
    <Title>Log in to Riftn</Title>
    <Lede>Enter this code in the app to finish logging in.</Lede>
    {token ? <Code value={token} hint="TAP AND HOLD TO COPY · EXPIRES SHORTLY" /> : null}
    <Action href={confirmationUrl}>Log in with one tap</Action>
    <Fine>The link works once, in this device's browser.</Fine>
  </BroadcastShell>
)

export default MagicLinkEmail
