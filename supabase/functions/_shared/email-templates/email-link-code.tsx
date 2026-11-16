/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { BroadcastShell, Code, Lede, Title } from './broadcast.tsx'

interface EmailLinkCodeEmailProps {
  code: string
}

// Sent when a wallet-login account attaches an email address it wants to sign
// in with later. The code is the only thing that matters here — no link, so
// nothing to click and nothing to misroute into spam filters.
export const EmailLinkCodeEmail = ({ code }: EmailLinkCodeEmailProps) => (
  <BroadcastShell
    preview="Your Riftn sign-in code"
    footnote="Didn't ask for this? Ignore this email. Nothing changes on your account until the code is entered."
  >
    <Title>Link your email to Riftn</Title>
    <Lede>Enter this code to link this email to your Riftn account. After that you can sign in with a code sent here.</Lede>
    <Code value={code} hint="EXPIRES IN 10 MINUTES" />
  </BroadcastShell>
)

export default EmailLinkCodeEmail
