/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Action, BroadcastShell, Code, Fine, Lede, Title } from './broadcast.tsx'

interface SignupEmailProps {
  siteName?: string
  siteUrl?: string
  recipient?: string
  confirmationUrl: string
  token?: string
}

export const SignupEmail = ({ recipient, confirmationUrl, token }: SignupEmailProps) => (
  <BroadcastShell
    preview={`Your Riftn sign-up code${token ? ` — ${token}` : ''}`}
    footnote="Didn't ask for this? Ignore this email and no account is made."
  >
    <Title>Welcome to Riftn</Title>
    <Lede>
      Enter this code in the app to finish creating your account
      {recipient ? ` for ${recipient}` : ''}.
    </Lede>
    {token ? <Code value={token} hint="TAP AND HOLD TO COPY · EXPIRES SHORTLY" /> : null}
    <Action href={confirmationUrl}>Sign up with one tap</Action>
    <Fine>The link works once, in this device's browser.</Fine>
  </BroadcastShell>
)

export default SignupEmail
