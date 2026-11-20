/**
 * Stage share card: the 1200x630 picture a /stages/<n> link unfurls with when
 * the host set no cover. It is the same "Chrome Mic" banner the app and site
 * draw (src/lib/stage-cover.ts), as an SVG the worker renders to PNG with resvg.
 *
 * resvg has Manrope 500/700 and the brand mono ("Consolas") loaded; the backdrop,
 * mic and wordmark come in as data URIs (stage-share-image.js fetches them).
 * The worker runs in UTC, so the time says UTC.
 */
import { buildStageCover } from '../src/lib/stage-cover.ts';
import { wrapPostText, wrapBold, textLines, ctaPill, monolithFrame, M } from './post-share-card.js';

export const STAGE_CARD_VERSION = 'v7';
const ORIGIN = 'https://riftn.com';

export function stageShareImageUrl(id) {
  return `${ORIGIN}/_og/stage/${STAGE_CARD_VERSION}/${encodeURIComponent(id)}.png`;
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

const W = 1200;
const H = 630;
const MIC_RATIO = 720 / 590;

/** English copy for the card's words (the share card is not localised). */
const COPY = { 'stageCover.live': 'live', 'stageCover.upcoming': 'upcoming', 'stageCover.replay': 'replay', 'stageCover.stage': 'stage', 'stageCover.minutes': '{{minutes}} min' };
const t = (key, values = {}) => (COPY[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ''));

/** The brand-kit files the card draws, relative to the site root. */
export function stageCardAssetPaths(stage) {
  const m = buildStageCover(stageCardSource(stage), t, 'en-US');
  return {
    background: `/brand-kit/bg/${m.background}.jpg`,
    mic: '/brand-kit/icons/mic.png',
    wordmark: '/brand-kit/brand/riftn-logo-white.png',
  };
}

/** The fields the card reads, from an audio_spaces row. */
export function stageCardSource(stage) {
  return {
    id: stage.id,
    title: stage.title,
    host_username: stage.host_username,
    host_wallet_address: stage.host_wallet_address,
    scheduled_at: stage.scheduled_at,
    started_at: stage.started_at,
    created_at: stage.created_at,
    ended_at: stage.ended_at,
    status: stage.status,
  };
}

/**
 * `images` holds data URIs for the paths from stageCardAssetPaths; any that is
 * missing is left out, so the card still renders on the plain black base.
 * Monolith layout, the same grid as post cards: the stage's chrome backdrop
 * and mic fill the card, the title sits on the column foot, one footer row.
 */
export function renderStageCardSvg(stage, images = {}) {
  const m = buildStageCover(stageCardSource(stage), t, 'en-US');
  const n = (v) => Number(v.toFixed(1));
  const title = m.title || 'Riftn stage';
  const size = title.length > 48 ? 60 : title.length > 22 ? 72 : 92;
  const lines = wrapBold(title, size, 700, 3);
  const step = Math.ceil(size * 1.02);
  const when = m.status === 'upcoming' && m.when ? `${m.when} UTC` : m.status === 'replay' && m.detail ? m.detail.replace('length = ', '') : '';
  const sub = [m.host && `Hosted by ${m.host}`, when].filter(Boolean).join(' · ');
  const subY = M.bottom;
  const titleBottom = sub ? subY - 46 : M.bottom;
  const titleY = titleBottom - (lines.length - 1) * step;
  const micH = 560;
  const micW = micH / MIC_RATIO;
  const micX = W - 40 - micW;
  const micY = 50;
  const micCx = micX + micW / 2;
  const micCy = micY + micH / 2;
  const micTransform = `rotate(${m.tilt} ${n(micCx)} ${n(micCy)})${m.flip ? ` translate(${n(2 * micCx)} 0) scale(-1 1)` : ''}`;
  const tag = m.status === 'live' ? 'LIVE' : m.status === 'replay' ? 'STAGE · REPLAY' : 'STAGE · UPCOMING';
  const cta = m.status === 'live' ? 'Join the stage' : m.status === 'replay' ? 'Listen back' : 'Get a reminder';
  const back = `${images.background ? `<image xlink:href="${images.background}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity=".8"/>` : ''}
  ${images.mic ? `<image xlink:href="${images.mic}" x="${n(micX)}" y="${n(micY)}" width="${n(micW)}" height="${n(micH)}" transform="${micTransform}"/>` : ''}`;
  return `${monolithFrame({ backdrop: back, logo: images.wordmark, tag, live: m.status === 'live' })}
  <g font-family="Manrope" font-weight="500" data-stage="${escape(m.status)}">
    ${textLines(lines, M.x, titleY, size, step, '#f6f6f8', 700, ' letter-spacing="-2"')}
    ${sub ? `<text x="${M.x}" y="${subY}" font-size="26" fill="#c9cad1">${escape(wrapPostText(sub, 26, 720, 1)[0] || '')}</text>` : ''}
    <text x="${M.x}" y="${M.footY + 7}" font-family="Consolas" font-size="18" fill="#c9cad1">riftn.com/stages</text>
    ${ctaPill(cta, M.footY)}
  </g>
</svg>`;
}
