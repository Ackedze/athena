/// <reference types="@figma/plugin-typings" />

// Главный entrypoint плагина: принимает сообщения UI и запускает экспорт/сбор данных.
import type { DSExport } from './engine';
import { logDebug } from './debug';
import { createPagedExportController } from './pagedExport';
import { collectTokensFromFile } from './tokenExport';
import { collectStylesFromDocument } from './styleExport';
import { sanitizeExportPayload } from './exportSanitizer';

console.log('[CODE] plugin loaded');
logDebug('plugin-loaded');

figma.showUI(__html__, { width: 1280, height: 720 });
console.log('[CODE] UI shown');
logDebug('ui-shown', { width: 1280, height: 720 });

const pagedExport = createPagedExportController(sendExportResult);
const GITHUB_OWNER = 'ackedze';
const GITHUB_REPO = 'design-system_ab';
const REFERENCE_SOURCES_PATH = 'JSONS/referenceSourcesMVP.json';

// Роутим UI events на export/collect actions.
figma.ui.onmessage = (msg) => {
  console.log('[CODE] received message from UI:', msg);
  logDebug('ui-message', msg);

  if (msg.type === 'test') {
    console.log('[CODE] test message received, sending echo');
    figma.ui.postMessage({
      type: 'echo',
      payload: { received: msg },
    });
    return;
  }

  if (msg.type === 'export-components') {
    console.log('[CODE] starting paged export for document');
    logDebug('export-components-request');
    pagedExport.cancel();
    void pagedExport.startFromDocument();
    return;
  }

  if (msg.type === 'export-components-current-page') {
    console.log('[CODE] starting paged export from current page');
    logDebug('export-current-page-request');
    pagedExport.cancel();
    void pagedExport.startFromCurrentPage();
    return;
  }

  if (msg.type === 'export-components-continue') {
    console.log('[CODE] continuing paged export');
    logDebug('export-components-continue-request');
    pagedExport.continue();
    return;
  }

  if (msg.type === 'cancel-export') {
    console.log('[CODE] cancel paged export');
    pagedExport.cancel();
    return;
  }

  if (msg.type === 'collect-tokens') {
    console.log('[CODE] collecting tokens');
    logDebug('collect-tokens-request');
    collectTokensAndSend();
    return;
  }
  if (msg.type === 'collect-styles') {
    console.log('[CODE] collecting styles');
    logDebug('collect-styles-request');
    collectStylesAndSend();
    return;
  }

  if (msg.type === 'publish-with-token') {
    console.log('[CODE] publishing catalog with token from UI');
    const token = msg.token;
    const payload = msg.payload;
    if (!token || !payload) {
      console.error('[CODE] missing token or payload');
      return;
    }
    void publishWithToken(payload, token);
    return;
  }
};

function sendExportResult(scope: string, data: DSExport) {
  const sanitized = sanitizeExportPayload(data);
  const json = JSON.stringify(sanitized, null, 2);
  console.log(`[CODE] sending export-result (${scope}). length =`, json.length);
  logDebug('send-export', {
    scope,
    components: data.components.length,
    meta: data.meta,
  });
  figma.ui.postMessage({
    type: 'export-result',
    payload: { json, data: sanitized, mode: 'full' },
  });
}

async function collectTokensAndSend() {
  try {
    const payload = await collectTokensFromFile();
    const json = JSON.stringify(payload, null, 2);
    logDebug('collect-tokens-result', {
      collections: payload.collections.length,
    });
    figma.ui.postMessage({
      type: 'collect-tokens-result',
      payload: { json, data: payload },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Неизвестная ошибка';
    console.error('[CODE] failed to collect tokens', error);
    logDebug('collect-tokens-error', { error: message });
    figma.notify(`Не удалось собрать токены: ${message}`, { timeout: 5000 });
  }
}

async function collectStylesAndSend() {
  try {
    const payload = await collectStylesFromDocument();
    const json = JSON.stringify(payload, null, 2);
    logDebug('collect-styles-result', {
      styles: payload.styles.length,
    });
    figma.ui.postMessage({
      type: 'collect-styles-result',
      payload: { json, data: payload },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Неизвестная ошибка';
    console.error('[CODE] failed to collect styles', error);
    logDebug('collect-styles-error', { error: message });
    figma.notify(`Не удалось собрать стили: ${message}`, { timeout: 5000 });
  }
}

interface PublishPayload {
  json: string;
  catalogName: string;
  meta?: PublishMeta;
  relatedArtifacts?: PublishRelatedArtifact[];
}

type PublishArtifactKind = 'components' | 'tokens' | 'styles' | 'component-index';

interface PublishMeta extends Record<string, unknown> {
  kind?: PublishArtifactKind;
  pageName?: string;
  fileKey?: string;
  figmaLink?: string;
}

interface PublishRelatedArtifact {
  json: string;
  catalogName: string;
  meta?: PublishMeta;
}

interface ReferenceCatalogSource {
  kind?: PublishArtifactKind;
  figmaLink?: string;
  figmaLibLink?: string;
  figmaPageLink?: string;
  fileKey?: string;
  pageName?: string;
}

interface ReferenceCatalogEntry {
  fileName: string;
  path: string;
  source?: ReferenceCatalogSource;
}

interface ReferenceLibrary {
  name: string;
  source?: ReferenceCatalogSource;
  catalogs?: ReferenceCatalogEntry[];
}

interface ReferenceCatalogList {
  baseUrl?: string;
  catalogs?: ReferenceCatalogEntry[];
  libraries?: ReferenceLibrary[];
}

function stringToBase64(str: string): string {
  const bytes =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(str)
      : Uint8Array.from(
          unescape(encodeURIComponent(str))
            .split('')
            .map((char) => char.charCodeAt(0)),
        );

  try {
    if (typeof btoa !== 'undefined') {
      let binary = '';
      const chunkSize = 32768;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    }
  } catch (error) {
    void error;
    // Fall back to manual encoding below.
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;

  while (i < bytes.length) {
    const a = bytes[i++];
    const hasB = i < bytes.length;
    const b = hasB ? bytes[i++] : 0;
    const hasC = i < bytes.length;
    const c = hasC ? bytes[i++] : 0;

    const bitmap = (a << 16) | (b << 8) | c;

    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += hasB ? chars.charAt((bitmap >> 6) & 63) : '=';
    result += hasC ? chars.charAt(bitmap & 63) : '=';
  }

  return result;
}

function buildGitHubAuthError(): string {
  return 'Ошибка аутентификации. GitHub token может быть неправильным, истёкшим или с недостаточными правами. Получите новый token на https://github.com/settings/tokens с scope "repo"';
}

function buildGitHubAccessError(): string {
  return 'Доступ запрещён. Проверьте, что у вас есть доступ к репозиторию ackedze/design-system_ab';
}

function base64ToString(value: string): string {
  const normalized = value.replace(/\s+/g, '');
  let bytes: Uint8Array;

  if (typeof atob !== 'undefined') {
    const binary = atob(normalized);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } else {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const decodedBytes: number[] = [];
    let i = 0;

    while (i < normalized.length) {
      const enc1 = chars.indexOf(normalized.charAt(i++));
      const enc2 = chars.indexOf(normalized.charAt(i++));
      const enc3 = chars.indexOf(normalized.charAt(i++));
      const enc4 = chars.indexOf(normalized.charAt(i++));

      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;

      decodedBytes.push(chr1);
      if (enc3 !== 64) {
        decodedBytes.push(chr2);
      }
      if (enc4 !== 64) {
        decodedBytes.push(chr3);
      }
    }

    bytes = Uint8Array.from(decodedBytes);
  }

  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }

  let binary = '';
  const chunkSize = 32768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return decodeURIComponent(escape(binary));
}

function extractFigmaFileKey(link: string | undefined): string | undefined {
  if (!link) return undefined;
  const match = link.match(/figma\.com\/(?:design|file)\/([^/?#]+)/i);
  return match?.[1];
}

function resolveReferenceSourceFileKey(
  source: ReferenceCatalogSource | undefined,
): string | undefined {
  if (!source) return undefined;
  return (
    source.fileKey ||
    extractFigmaFileKey(source.figmaLibLink) ||
    extractFigmaFileKey(source.figmaPageLink) ||
    extractFigmaFileKey(source.figmaLink)
  );
}

function resolveCurrentFileKey(meta: PublishMeta | undefined): string | undefined {
  if (typeof meta?.fileKey === 'string' && meta.fileKey.trim()) {
    return meta.fileKey.trim();
  }

  const linkFileKey =
    typeof meta?.figmaLink === 'string'
      ? extractFigmaFileKey(meta.figmaLink)
      : undefined;
  if (linkFileKey) {
    return linkFileKey;
  }

  return figma.fileKey;
}

function normalizeMatchKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeRepoPath(value: string): string {
  return value.replace(/^\/+/, '').trim();
}

function getManifestPublishRoot(): string {
  const normalizedPath = normalizeRepoPath(REFERENCE_SOURCES_PATH);
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return normalizedPath;
  }
  return normalizedPath.slice(0, lastSlashIndex);
}

function resolvePublishRootFromBaseUrl(baseUrl: string | undefined): string {
  const manifestRoot = getManifestPublishRoot();
  if (!baseUrl) return manifestRoot;

  try {
    const url = new URL(baseUrl);
    const segments = url.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length > 0 && normalizeMatchKey(segments[0]) === GITHUB_REPO) {
      segments.shift();
    }

    const parsedRoot = normalizeRepoPath(segments.join('/'));
    return parsedRoot || manifestRoot;
  } catch (error) {
    void error;
    return manifestRoot;
  }
}

function joinRepoPath(root: string, relativePath: string): string {
  const normalizedRoot = normalizeRepoPath(root);
  const normalizedPath = normalizeRepoPath(relativePath);

  if (!normalizedRoot) {
    return normalizedPath;
  }
  if (
    normalizeMatchKey(normalizedPath) === normalizeMatchKey(normalizedRoot) ||
    normalizeMatchKey(normalizedPath).startsWith(
      normalizeMatchKey(normalizedRoot) + '/',
    )
  ) {
    return normalizedPath;
  }

  return `${normalizedRoot}/${normalizedPath}`;
}

function getPathBaseName(value: string | undefined): string {
  if (!value) return '';
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] ?? normalized;
}

function matchesReferenceEntry(
  entry: ReferenceCatalogEntry,
  target: {
    kind?: PublishArtifactKind;
    fileKey?: string;
    catalogName?: string;
    pageName?: string;
  },
): boolean {
  const source = entry.source;
  if (!source || !target.kind) return false;
  if (source.kind !== target.kind) return false;

  const entryFileKey = resolveReferenceSourceFileKey(source);
  if (
    entryFileKey &&
    target.fileKey &&
    normalizeMatchKey(entryFileKey) !== normalizeMatchKey(target.fileKey)
  ) {
    return false;
  }

  const entryBaseName = getPathBaseName(entry.path || entry.fileName);
  const entryFileName = getPathBaseName(entry.fileName);
  const nameMatches =
    normalizeMatchKey(entryBaseName) === normalizeMatchKey(target.catalogName) ||
    normalizeMatchKey(entryFileName) === normalizeMatchKey(target.catalogName);

  if (target.kind === 'components') {
    const pageMatches =
      normalizeMatchKey(source.pageName) === normalizeMatchKey(target.pageName);

    if (pageMatches || nameMatches) {
      return true;
    }
    return false;
  }

  if (nameMatches) {
    return true;
  }

  return Boolean(entryFileKey && target.fileKey);
}

function normalizeReferenceCatalogEntries(
  referenceList: ReferenceCatalogList | null,
): ReferenceCatalogEntry[] {
  if (!referenceList) {
    return [];
  }

  const flatCatalogs = Array.isArray(referenceList.catalogs)
    ? referenceList.catalogs
    : [];
  const libraryCatalogs: ReferenceCatalogEntry[] = [];

  if (Array.isArray(referenceList.libraries)) {
    referenceList.libraries.forEach((library) => {
      const catalogs = Array.isArray(library.catalogs) ? library.catalogs : [];
      catalogs.forEach((entry) => {
        libraryCatalogs.push(
          Object.assign({}, entry, {
            source: Object.assign({}, library.source || {}, entry.source || {}),
          }),
        );
      });
    });
  }

  return flatCatalogs.concat(libraryCatalogs);
}

async function fetchReferenceCatalogList(
  githubToken: string,
): Promise<ReferenceCatalogList | null> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${REFERENCE_SOURCES_PATH}`;
  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (response.status === 401) {
    throw new Error(buildGitHubAuthError());
  }
  if (response.status === 403) {
    throw new Error(buildGitHubAccessError());
  }
  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить referenceSourcesMVP.json: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as { content?: string };
  if (!payload.content) {
    return null;
  }

  return JSON.parse(base64ToString(payload.content)) as ReferenceCatalogList;
}

async function resolvePublishFilePath(
  payload: PublishPayload,
  githubToken: string,
): Promise<string> {
  const kind = payload.meta?.kind;
  const fileKey = resolveCurrentFileKey(payload.meta);
  const pageName =
    typeof payload.meta?.pageName === 'string' ? payload.meta.pageName : '';

  if (!kind) {
    throw new Error(
      'Не удалось определить тип публикуемого каталога. Для публикации нужен kind.',
    );
  }

  const referenceList = await fetchReferenceCatalogList(githubToken);
  const referenceEntries = normalizeReferenceCatalogEntries(referenceList);
  if (!referenceEntries.length) {
    throw new Error(
      'referenceSourcesMVP.json недоступен или не содержит каталогов. Публикация остановлена.',
    );
  }

  const matchedEntry = referenceEntries.find((entry) =>
    matchesReferenceEntry(entry, {
      kind,
      catalogName: payload.catalogName,
      fileKey,
      pageName,
    }),
  );

  if (!matchedEntry?.path) {
    throw new Error(
      `В referenceSourcesMVP.json не найден путь для ${payload.catalogName}. Публикация остановлена.`,
    );
  }

  const publishRoot = resolvePublishRootFromBaseUrl(referenceList?.baseUrl);
  return joinRepoPath(publishRoot, matchedEntry.path);
}

function buildComponentIndexPath(catalogPath: string): string {
  const normalizedPath = normalizeRepoPath(catalogPath);
  const manifestRoot = getManifestPublishRoot();
  const rootPrefix = normalizedPath.startsWith(`${manifestRoot}/`)
    ? `${manifestRoot}/`
    : '';
  const relativeCatalogPath = rootPrefix
    ? normalizedPath.slice(rootPrefix.length)
    : normalizedPath;
  const indexRelativePath = relativeCatalogPath.replace(/\.json$/i, '.index.json');

  return joinRepoPath(rootPrefix ? `${manifestRoot}/indexes` : 'indexes', indexRelativePath);
}

function enrichComponentIndexJson(
  rawJson: string,
  context: {
    catalogPath: string;
    indexPath: string;
  },
): string {
  const parsed = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid component index payload');
  }

  const payload = parsed as Record<string, unknown>;
  payload.catalogPath = context.catalogPath;
  payload.indexPath = context.indexPath;

  if (Array.isArray(payload.components)) {
    payload.components = payload.components.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      return Object.assign({}, entry, {
        catalogPath: context.catalogPath,
        indexPath: context.indexPath,
      });
    });
  }

  if (Array.isArray(payload.entries)) {
    payload.entries = payload.entries.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      return Object.assign({}, entry, {
        catalogPath: context.catalogPath,
        indexPath: context.indexPath,
      });
    });
  }

  return JSON.stringify(payload, null, 2);
}

async function getExistingFileSha(
  apiUrl: string,
  githubToken: string,
): Promise<string | undefined> {
  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (response.status === 404) {
    return undefined;
  }
  if (response.status === 401) {
    throw new Error(buildGitHubAuthError());
  }
  if (response.status === 403) {
    throw new Error(buildGitHubAccessError());
  }
  if (!response.ok) {
    throw new Error(
      `Не удалось проверить существующий файл в GitHub: ${response.status} ${response.statusText}`,
    );
  }

  const fileData = (await response.json()) as { sha?: string };
  return fileData.sha;
}

async function publishWithToken(payload: PublishPayload, githubToken: string) {
  try {
    if (!payload || !payload.json || !payload.catalogName) {
      throw new Error('Invalid publish payload');
    }

    if (!githubToken) {
      throw new Error('GitHub token is required');
    }

    const catalogName = payload.catalogName.replace(/\.json$/, '');
    const repo = `${GITHUB_OWNER}/${GITHUB_REPO}`;
    const owner = GITHUB_OWNER;
    const repoName = GITHUB_REPO;
    const filePath = await resolvePublishFilePath(payload, githubToken);
    const publishTargets = [
      {
        json: payload.json,
        catalogName,
        filePath,
        kind: payload.meta?.kind,
      },
    ];

    if (payload.meta?.kind === 'components' && payload.relatedArtifacts?.length) {
      for (const artifact of payload.relatedArtifacts) {
        if (artifact.meta?.kind !== 'component-index') {
          continue;
        }

        const indexFilePath = buildComponentIndexPath(filePath);
        publishTargets.push({
          json: enrichComponentIndexJson(artifact.json, {
            catalogPath: filePath,
            indexPath: indexFilePath,
          }),
          catalogName: artifact.catalogName.replace(/\.json$/, ''),
          filePath: indexFilePath,
          kind: artifact.meta.kind,
        });
      }
    }

    console.log('[CODE] publishing to GitHub:', {
      catalogName,
      filePath,
      kind: payload.meta?.kind,
      fileKey: resolveCurrentFileKey(payload.meta),
      pageName: payload.meta?.pageName,
      relatedArtifacts: publishTargets.length - 1,
    });

    const results: Array<{ catalogName: string; url: string }> = [];
    for (const target of publishTargets) {
      const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${target.filePath}`;
      const encodedContent = stringToBase64(target.json);
      const sha = await getExistingFileSha(apiUrl, githubToken);
      if (sha) {
        console.log('[CODE] existing file found, sha:', sha);
      } else {
        console.log('[CODE] file does not exist yet, creating new');
      }

      const requestBody: any = {
        message: `Publish design system catalog: ${target.catalogName}`,
        content: encodedContent,
      };
      if (sha) {
        requestBody.sha = sha;
      }

      const putResponse = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!putResponse.ok) {
        const errorData = await putResponse.json();
        let errorMessage = errorData.message || putResponse.statusText;

        if (putResponse.status === 401) {
          errorMessage = buildGitHubAuthError();
        } else if (putResponse.status === 403) {
          errorMessage = buildGitHubAccessError();
        }

        throw new Error(`GitHub API error: ${errorMessage}`);
      }

      const result = await putResponse.json();
      console.log('[CODE] catalog published successfully:', {
        catalogName: target.catalogName,
        kind: target.kind,
        url: result.html_url,
      });
      results.push({ catalogName: target.catalogName, url: result.html_url });
    }

    const primaryResult = results[0];
    logDebug('publish-catalog-success', {
      catalogName,
      url: primaryResult?.url,
      files: results.length,
    });

    figma.notify(`✓ Опубликовано файлов: ${results.length} в ${repo}`, {
      timeout: 5000,
    });

    figma.ui.postMessage({
      type: 'publish-result',
      payload: {
        success: true,
        catalogName,
        url: primaryResult?.url,
        files: results,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Неизвестная ошибка';
    console.error('[CODE] failed to publish catalog', error);
    logDebug('publish-catalog-error', { error: message });
    figma.notify(`Не удалось опубликовать каталог: ${message}`, {
      timeout: 5000,
    });
    figma.ui.postMessage({
      type: 'publish-result',
      payload: {
        success: false,
        error: message,
      },
    });
  }
}
