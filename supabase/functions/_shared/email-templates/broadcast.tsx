/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

// The "Broadcast" look shared by every Riftn email: black card, wordmark top
// left, the ASCII Riftn mark on a TV screen with rolling scanlines (a small
// looping GIF, so it plays in Gmail, Apple Mail and Outlook apps; old desktop
// Outlook shows the first frame, which is a finished still), a tagline ticker,
// then the message. The card is dark on purpose and declares itself dark-only
// so mail apps in dark mode leave its colours alone.

const ASSET_ROOT = 'https://riftn.com'
const WORDMARK = `${ASSET_ROOT}/brand/riftn-wordmark-white.png`
const TV = `${ASSET_ROOT}/email/broadcast-tv.gif`

const DISPLAY = '"Exo", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const BODY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
const MONO = '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Courier New", monospace'

interface ShellProps {
  preview: string
  children: React.ReactNode
  /** Small footer line under the card. */
  footnote?: React.ReactNode
}

export const BroadcastShell = ({ preview, children, footnote }: ShellProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <meta name="color-scheme" content="dark" />
      <meta name="supported-color-schemes" content="dark" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Exo:wght@700;800&family=JetBrains+Mono:wght@600;800&display=swap"
      />
    </Head>
    <Preview>{preview}</Preview>
    <Body style={page}>
      <Container style={container}>
        <Section style={card}>
          <Section style={head}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td align="left" valign="middle">
                    <Link href="https://riftn.com">
                      <Img src={WORDMARK} width="68" height="20" alt="RIFTN" style={wordmark} />
                    </Link>
                  </td>
                  <td align="right" valign="middle" style={onAir}>
                    <span style={dot}>●</span>&nbsp;ON AIR
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Img src={TV} width="520" alt="" style={tv} />
          <Text style={ticker}>YOU WILL OWN EVERYTHING AND BE HAPPY</Text>
          <Section style={inner}>{children}</Section>
          <Section style={foot}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td align="left" style={footCell}>
                    <Link href="https://riftn.com" style={footLink}>RIFTN.COM</Link>
                  </td>
                  <td align="right" style={footCell}>CH 01</td>
                </tr>
              </tbody>
            </table>
          </Section>
        </Section>
        {footnote ? <Text style={note}>{footnote}</Text> : null}
      </Container>
    </Body>
  </Html>
)

export const Title = ({ children }: { children: React.ReactNode }) => (
  <Text style={title}>{children}</Text>
)

export const Lede = ({ children }: { children: React.ReactNode }) => (
  <Text style={lede}>{children}</Text>
)

/** The one-time code, big and spaced, between two thin rules. */
export const Code = ({ value, hint }: { value: string; hint?: string }) => (
  <Section style={codeWrap}>
    <Text style={code}>{value}</Text>
    {hint ? <Text style={codeHint}>{hint}</Text> : null}
  </Section>
)

export const Action = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Section style={actionWrap}>
    <Button href={href} style={button}>
      {children}
    </Button>
  </Section>
)

export const Fine = ({ children }: { children: React.ReactNode }) => (
  <Text style={fine}>{children}</Text>
)

export const accentLink = { color: '#ffffff', textDecoration: 'underline' }

const page = { backgroundColor: '#000000', margin: 0, padding: '32px 12px', fontFamily: BODY }
const container = { maxWidth: '560px', margin: '0 auto' }
const card = {
  backgroundColor: '#000000',
  border: '1px solid #222222',
  borderRadius: '20px',
  overflow: 'hidden' as const,
}
const head = { padding: '20px 22px 14px' }
const wordmark = { display: 'block', border: 0, height: '20px', width: '68px' }
const onAir = {
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.2em',
  color: '#8a8984',
}
const dot = { color: '#f2f2f0' }
const tv = { display: 'block', width: '100%', height: 'auto', border: 0 }
const ticker = {
  fontFamily: MONO,
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '0.14em',
  color: '#6d6c68',
  textAlign: 'center' as const,
  margin: 0,
  padding: '9px 8px',
  borderTop: '1px solid #1a1a1c',
  borderBottom: '1px solid #1a1a1c',
}
const inner = { padding: '26px 24px 6px', textAlign: 'center' as const }
const title = {
  fontFamily: DISPLAY,
  fontSize: '24px',
  lineHeight: '1.2',
  fontWeight: 800,
  color: '#f2f2f0',
  margin: '0 0 10px',
}
const lede = {
  fontFamily: BODY,
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#9b9a95',
  margin: '0 0 20px',
}
const codeWrap = {
  borderTop: '1px solid #2a2a2c',
  borderBottom: '1px solid #2a2a2c',
  margin: '0 0 20px',
  padding: '16px 0 12px',
}
const code = {
  fontFamily: MONO,
  fontSize: '34px',
  lineHeight: '1',
  fontWeight: 800,
  letterSpacing: '0.3em',
  textIndent: '0.3em',
  color: '#ffffff',
  margin: '0 0 10px',
}
const codeHint = {
  fontFamily: MONO,
  fontSize: '10px',
  letterSpacing: '0.12em',
  color: '#6d6c68',
  margin: 0,
}
const actionWrap = { margin: '0 0 18px' }
const button = {
  backgroundColor: '#f2f2f0',
  color: '#000000',
  fontFamily: DISPLAY,
  fontSize: '15px',
  fontWeight: 700,
  borderRadius: '999px',
  padding: '15px 24px',
  textDecoration: 'none',
  display: 'block',
  textAlign: 'center' as const,
}
const fine = {
  fontFamily: BODY,
  fontSize: '12px',
  lineHeight: '1.6',
  color: '#76756f',
  margin: '0 0 18px',
}
const foot = { padding: '6px 22px 18px' }
const footCell = {
  fontFamily: MONO,
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  color: '#6d6c68',
}
const footLink = { color: '#6d6c68', textDecoration: 'none' }
const note = {
  fontFamily: BODY,
  fontSize: '11px',
  lineHeight: '1.6',
  color: '#5f5e59',
  textAlign: 'center' as const,
  margin: '16px 12px 0',
}
