/**
 * Riftn Cloud: host a whole app (website, backend code and a database) at
 * https://<slug>.dhb.gg. The API lives on the dhb.gg Worker
 * (workers/builder-apps/cloud.js); this is the browser client for it.
 */
import { ensureFreshToken } from '@/lib/api/dehub/core';

export const CLOUD_API = 'https://cloud.dhb.gg/v1';

export interface CloudAppSummary {
  slug: string;
  name: string;
  version: number;
  suspended: number;
  url: string;
  created_at: number;
  updated_at: number;
}

export interface CloudAppDetail extends CloudAppSummary {
  deployedAt: number | null;
  main: string | null;
  bytes: number;
  files: string[];
  secrets: string[];
  errors: { at: number; message: string }[];
  dbBytes: number;
}

export interface CloudLimits {
  apps: number;
  cpuMs: number;
  appBytes: number;
  fileBytes: number;
  dbBytes: number;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await ensureFreshToken();
  const res = await fetch(`${CLOUD_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export const listCloudApps = () => call<{ apps: CloudAppSummary[]; limits: CloudLimits }>('/apps');
export const getCloudApp = (slug: string) => call<CloudAppDetail>(`/apps/${slug}`);
export const createCloudApp = (slug: string, name: string) =>
  call<{ slug: string; url: string }>('/apps', { method: 'POST', body: JSON.stringify({ slug, name }) });
export const deleteCloudApp = (slug: string) => call<{ ok: true }>(`/apps/${slug}`, { method: 'DELETE' });
export const setCloudSecrets = (slug: string, set: Record<string, string>, remove: string[] = []) =>
  call<{ secrets: string[] }>(`/apps/${slug}/secrets`, { method: 'PUT', body: JSON.stringify({ set, remove }) });
export const createDeployKey = (slug: string) => call<{ key: string }>(`/apps/${slug}/keys`, { method: 'POST' });
export const runCloudSql = (slug: string, sql: string) =>
  call<{ rows: Record<string, unknown>[]; rowsRead: number; rowsWritten: number }>(`/apps/${slug}/sql`, {
    method: 'POST',
    body: JSON.stringify({ sql }),
  });

/** Turns an address typed by a person into the form the API accepts. */
export function toCloudSlug(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

const SKIP = /(^|\/)(node_modules|\.git|\.wrangler|\.next|\.DS_Store)(\/|$)/;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Uploads picked files (a folder or single files) as a new version. A picked
 * folder's own name is dropped, so "my-app/index.js" lands as "index.js".
 */
export async function uploadCloudFiles(slug: string, picked: File[]) {
  const named = picked
    .map((file) => ({ file, path: (file.webkitRelativePath || file.name).replace(/\\/g, '/') }))
    .filter(({ path }) => !SKIP.test(path));
  const roots = new Set(named.map(({ path }) => path.split('/')[0]));
  const strip = named.every(({ path }) => path.includes('/')) && roots.size === 1;
  const files = await Promise.all(
    named.map(async ({ file, path }) => ({
      path: strip ? path.slice(path.indexOf('/') + 1) : path,
      data: toBase64(new Uint8Array(await file.arrayBuffer())),
    })),
  );
  return call<{ version: number; url: string; main: string | null; files: number }>(`/apps/${slug}/files`, {
    method: 'PUT',
    body: JSON.stringify({ files }),
  });
}
