/// <reference types="@figma/plugin-typings" />

import {
  extractComponentsFromDocument,
  extractComponentsFromCurrentPage,
  collectComponentsFromPage,
  collectComponentsFromPageChunked,
} from './engine';
import type {
  DSComponent,
  DSExport,
  DSStructureNode,
  DSStructureNodePatch,
  DSVariantStructurePatch,
} from './engine';
import { logDebug } from './debug';

type SerializedVariableValue =
  | boolean
  | string
  | number
  | RGB
  | RGBA
  | VariableAlias;

interface TokenExportMeta {
  generatedAt: string;
  fileName: string;
  library: string;
}

interface TokenVariableExport {
  id: string;
  name: string;
  description: string;
  hiddenFromPublishing: boolean;
  remote: boolean;
  key: string;
  resolvedType: VariableResolvedDataType;
  variableCollectionId: string;
  scopes: VariableScope[];
  codeSyntax: Record<CodeSyntaxPlatform, string | undefined>;
  valuesByMode: Record<string, SerializedVariableValue | undefined>;
  hexByMode: Record<string, string | undefined>;
  collectionName: string;
  groupName: string;
  tokenName: string;
}

interface TokenCollectionExport {
  id: string;
  name: string;
  key: string;
  defaultModeId: string;
  hiddenFromPublishing: boolean;
  remote: boolean;
  modes: Array<{ modeId: string; name: string }>;
  variables: TokenVariableExport[];
}

interface TokenExportPayload {
  meta: TokenExportMeta;
  collections: TokenCollectionExport[];
}

interface StyleEntry {
  key: string;
  name: string;
  group: string;
  type: string;
  value: StyleValue;
}

type StyleValue =
  | { kind: 'effect'; data: Effect }
  | {
      kind: 'text';
      data: {
        fontName: string | null;
        fontSize: number | null;
        lineHeight: string | null;
        letterSpacing: string | null;
      };
    }
  | {
      kind: 'paint';
      data: {
        paints: Array<{
          type: string;
          color?: string;
          opacity?: number;
        }>;
      };
    };

interface StyleExportPayload {
  meta: TokenExportMeta;
  styles: StyleEntry[];
}

const blueTintTokensUrl =
  'https://ackedze.github.io/nemesis/JSONS/BlueTint Base Colors -- BlueTint Base Colors.json';
let blueTintVariableMap: Map<string, TokenVariableExport> | null = null;
let blueTintLoadPromise: Promise<void> | null = null;

console.log('[CODE] plugin loaded');
logDebug('plugin-loaded');

figma.showUI(__html__, { width: 1280, height: 720 });
console.log('[CODE] UI shown');
logDebug('ui-shown', { width: 1280, height: 720 });

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
    cancelPagedExport();
    startPagedExportFromDocument();
    return;
  }

  if (msg.type === 'export-components-current-page') {
    console.log('[CODE] starting paged export from current page');
    logDebug('export-current-page-request');
    cancelPagedExport();
    startPagedExportFromCurrentPage();
    return;
  }

  if (msg.type === 'export-components-continue') {
    console.log('[CODE] continuing paged export');
    logDebug('export-components-continue-request');
    continuePagedExport();
    return;
  }

  if (msg.type === 'cancel-export') {
    console.log('[CODE] cancel paged export');
    cancelPagedExport();
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

interface ExportSession {
  id: number;
  totalPages: number;
  pendingPages: PageNode[];
  processedPages: number;
  components: DSComponent[];
  errors: string[];
  autoContinue: boolean;
  scope: 'current-page' | 'document';
}

let pagedSession: ExportSession | null = null;
let sessionCounter = 0;
let exportCancelToken: { aborted: boolean } | null = null;
function startPagedExportFromCurrentPage() {
  const pages = getPagesStartingFromCurrentPage();
  if (pages.length === 0) {
    const data = extractComponentsFromCurrentPage();
    sendExportResult('CURRENT PAGE', data);
    return;
  }

  startPagedExport(pages, false, 'current-page');
}

function startPagedExportFromDocument() {
  const pages = getAllPages();
  if (pages.length === 0) {
    const data = extractComponentsFromDocument();
    sendExportResult('ALL', data);
    return;
  }

  startPagedExport(pages, true, 'document');
}

function startPagedExport(
  pages: PageNode[],
  autoContinue: boolean,
  scope: 'current-page' | 'document',
) {
  sessionCounter += 1;
  pagedSession = {
    id: sessionCounter,
    totalPages: pages.length,
    pendingPages: [...pages],
    processedPages: 0,
    components: [],
    errors: [],
    autoContinue,
    scope,
  };
  exportCancelToken = { aborted: false };

  logDebug('paged-export-start', {
    sessionId: sessionCounter,
    totalPages: pages.length,
    autoContinue,
    scope,
  });

  void processNextPage();
}

function getPagesStartingFromCurrentPage(): PageNode[] {
  const pages: PageNode[] = [];
  for (const child of figma.root.children) {
    if (child.type === 'PAGE') {
      pages.push(child as PageNode);
    }
  }
  if (pages.length === 0) return [];
  const current = figma.currentPage;
  const index = pages.findIndex((page) => page.id === current.id);
  if (index <= 0) return pages;
  return pages.slice(index).concat(pages.slice(0, index));
}

function getAllPages(): PageNode[] {
  const pages: PageNode[] = [];
  for (const child of figma.root.children) {
    if (child.type === 'PAGE') {
      pages.push(child as PageNode);
    }
  }
  return pages;
}

function cancelPagedExport() {
  if (exportCancelToken) {
    exportCancelToken.aborted = true;
    exportCancelToken = null;
  }
  pagedSession = null;
  figma.ui.postMessage({ type: 'export-cancelled' });
}

function continuePagedExport() {
  if (!pagedSession) return;
  void processNextPage();
}

async function processNextPage() {
  if (!pagedSession) return;
  const session = pagedSession;
  if (session.pendingPages.length === 0) {
    finalizePagedExport();
    return;
  }

  const page = session.pendingPages.shift()!;
  console.log(
    '[CODE] processing page',
    page.name,
    'processed',
    session.processedPages,
  );
  logDebug('paged-page-start', {
    page: page.name,
    remaining: session.pendingPages.length,
    processed: session.processedPages,
  });
  const { components, errors, pageHasComponents, aborted } =
    await collectComponentsFromPageChunked(
      page,
      exportCancelToken,
      (processedNodes) => {
        figma.ui.postMessage({
          type: 'export-progress',
          payload: {
            sessionId: session.id,
            pageName: normalizePageName(page.name),
            processedNodes,
            completedPages: session.processedPages,
            totalPages: session.totalPages,
          },
        });
      },
    );
  if (aborted) {
    console.log('[CODE] paged export aborted');
    finalizePagedExport();
    return;
  }
  logDebug('paged-page-result', {
    page: page.name,
    components: components.length,
    errors: errors.length,
  });
  session.components.push(...components);
  session.errors.push(...errors);

  session.processedPages += 1;

  const normalizedPageName = normalizePageName(page.name);
  const pageExport = buildPageExport(page, components, pageHasComponents);
  const hasMore = session.pendingPages.length > 0;
  sendPagedProgress(pageExport, hasMore, normalizedPageName);

  if (!hasMore) {
    finalizePagedExport();
    return;
  }

  if (session.autoContinue) {
    setTimeout(() => {
      void processNextPage();
    }, 0);
  }
}

function buildPageExport(
  page: PageNode,
  components: DSComponent[],
  pageHasComponents: boolean,
): DSExport {
  const normalizedPageName = normalizePageName(page.name);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      version: '0.1.0',
      files: pageHasComponents ? [normalizedPageName] : [],
      scope: 'current-page',
      fileName: figma.root.name,
      library: figma.root.name,
    },
    components,
    tokens: [],
    typography: [],
    spacing: [],
    radius: [],
  };
}

function sendPagedProgress(
  pageExport: DSExport,
  hasMore: boolean,
  currentPage: string,
) {
  if (!pagedSession) return;
  const session = pagedSession;
  const sanitized = sanitizeExportPayload(pageExport);
  const json = JSON.stringify(sanitized, null, 2);
  figma.ui.postMessage({
    type: 'export-result',
    payload: {
      json,
      data: sanitized,
      mode: 'paged',
      pageName: normalizePageName(currentPage),
      progress: {
        completed: session.processedPages,
        total: session.totalPages,
        hasMore,
        autoContinue: session.autoContinue,
        currentPage,
      },
    },
  });
}

function finalizePagedExport() {
  if (!pagedSession) return;
  notifyPagedErrors(pagedSession.errors);
  logDebug('paged-export-finished', {
    processedPages: pagedSession.processedPages,
    errors: pagedSession.errors.length,
  });
  pagedSession = null;
}

function notifyPagedErrors(errors: string[]) {
  if (errors.length === 0) return;
  console.warn('[Athena] component parsing errors:', errors);
  figma.notify(
    `Некоторые компоненты не выгружены (${errors.length}). См. консоль.`,
    { timeout: 5000 },
  );
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

function collectStylesAndSend() {
  try {
    const payload = collectStylesFromDocument();
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

async function collectTokensFromFile(): Promise<TokenExportPayload> {
  if (!figma.variables) {
    throw new Error('Variables API not доступен в этом файле');
  }

  const [collections, variables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);

  const variableById = new Map<string, Variable>();
  variables.forEach((variable) => {
    variableById.set(variable.id, variable);
  });

  await ensureBlueTintVariablesLoaded();

  const collectionExports: TokenCollectionExport[] = collections.map(
    (collection) => {
      const collectionVariables = collection.variableIds
        .map((id) => variableById.get(id))
        .filter((variable): variable is Variable => Boolean(variable));

      const modes = Array.isArray(collection.modes) ? collection.modes : [];

      return {
        id: collection.id,
        name: collection.name,
        key: collection.key,
        defaultModeId: collection.defaultModeId,
        hiddenFromPublishing: collection.hiddenFromPublishing,
        remote: collection.remote,
        modes: modes.map((mode) => ({
          modeId: mode.modeId,
          name: mode.name,
        })),
        variables: collectionVariables.map((variable) =>
          serializeVariable(variable, collection.name || collection.key),
        ),
      };
    },
  );

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      fileName: figma.root.name,
      library: figma.root.name,
    },
    collections: collectionExports,
  };
}

function collectStylesFromDocument(): StyleExportPayload {
  const effectStyles = figma.getLocalEffectStyles();
  const textStyles = figma.getLocalTextStyles();
  const paintStyles = figma.getLocalPaintStyles();
  const entries: StyleEntry[] = [];
  for (const style of effectStyles) {
    const nameParts = splitVariableName(style.name);
    const group = nameParts.groupName;
    const baseName = nameParts.tokenName || style.name;
    const effects = Array.isArray(style.effects) ? style.effects : [];
    for (const effect of effects) {
      entries.push({
        key: style.key,
        name: baseName,
        group,
        type: formatEffectType(effect.type),
        value: { kind: 'effect', data: effect },
      });
    }
  }

  for (const style of textStyles) {
    const nameParts = splitVariableName(style.name);
    const group = nameParts.groupName;
    const baseName = nameParts.tokenName || style.name;
    entries.push({
      key: style.key,
      name: baseName,
      group,
      type: 'text',
      value: { kind: 'text', data: describeTextStyle(style) },
    });
  }

  for (const style of paintStyles) {
    const nameParts = splitVariableName(style.name);
    const group = nameParts.groupName;
    const baseName = nameParts.tokenName || style.name;
    entries.push({
      key: style.key,
      name: baseName,
      group,
      type: 'paint',
      value: { kind: 'paint', data: describePaintStyle(style) },
    });
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      fileName: figma.root.name,
      library: figma.root.name,
    },
    styles: entries,
  };
}

function formatEffectType(type: Effect['type']): string {
  return type.toLowerCase().replace('_', ' ');
}

function describeEffectValue(effect: Effect): string {
  const parts: string[] = [];
  if (effect.offset) {
    parts.push(
      'offset: ' +
        formatNumber(effect.offset.x) +
        ', ' +
        formatNumber(effect.offset.y),
    );
  }
  if (typeof effect.radius === 'number') {
    parts.push('radius: ' + formatNumber(effect.radius));
  }
  if (typeof effect.spread === 'number') {
    parts.push('spread: ' + formatNumber(effect.spread));
  }
  if (effect.color) {
    parts.push('color: ' + colorToString(effect.color));
  }
  return parts.length ? parts.join(' • ') : '—';
}

function describeTextStyle(style: TextStyle): {
  fontName: string | null;
  fontSize: number | null;
  lineHeight: string | null;
  letterSpacing: string | null;
} {
  const fontName = style.fontName;
  const fontLabel =
    fontName && fontName !== figma.mixed
      ? `${fontName.family} ${fontName.style}`.trim()
      : '—';
  const fontSize =
    style.fontSize !== figma.mixed && typeof style.fontSize === 'number'
      ? style.fontSize
      : null;
  const lineHeight =
    style.lineHeight !== figma.mixed && style.lineHeight
      ? formatLineHeight(style.lineHeight)
      : null;
  const letterSpacing =
    style.letterSpacing !== figma.mixed && style.letterSpacing
      ? formatLetterSpacing(style.letterSpacing)
      : null;
  return {
    fontName: fontLabel === '—' ? null : fontLabel,
    fontSize,
    lineHeight,
    letterSpacing,
  };
}

function describePaintStyle(style: PaintStyle): {
  paints: Array<{ type: string; color?: string; opacity?: number }>;
} {
  const paints = Array.isArray(style.paints) ? style.paints : [];
  return {
    paints: paints.map(serializePaintValue).filter(Boolean),
  };
}

function serializePaintValue(
  paint: Paint,
): { type: string; color?: string; opacity?: number } | null {
  if (!paint) return null;
  if (paint.type === 'SOLID') {
    const color = colorToString(paint.color);
    const opacity =
      typeof paint.opacity === 'number' ? paint.opacity : undefined;
    return {
      type: 'solid',
      color,
      opacity,
    };
  }
  return {
    type: paint.type.toLowerCase().replace('_', ' '),
  };
}

function formatLineHeight(lineHeight: LineHeight): string {
  if (lineHeight.unit === 'AUTO') return 'auto';
  if (lineHeight.unit === 'PIXELS') return formatNumber(lineHeight.value);
  if (lineHeight.unit === 'PERCENT') return formatNumber(lineHeight.value) + '%';
  return String(lineHeight.value);
}

function formatLetterSpacing(letterSpacing: LetterSpacing): string {
  if (letterSpacing.unit === 'PIXELS') return formatNumber(letterSpacing.value);
  if (letterSpacing.unit === 'PERCENT') return formatNumber(letterSpacing.value) + '%';
  return String(letterSpacing.value);
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function colorToString(color: RGB | RGBA): string {
  const r = clampColorComponent(color.r);
  const g = clampColorComponent(color.g);
  const b = clampColorComponent(color.b);
  const alpha =
    typeof color.a === 'number' ? color.a : typeof color.alpha === 'number'
      ? color.alpha
      : 1;
  const rgba = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
  return '#' + toHex(r) + toHex(g) + toHex(b) + ' / ' + rgba;
}

function splitVariableName(rawName?: string | null) {
  if (!rawName) {
    return { groupName: 'Без группы', tokenName: 'Без названия' };
  }
  const trimmed = rawName.trim();
  if (!trimmed) {
    return { groupName: 'Без группы', tokenName: 'Без названия' };
  }
  const parts = trimmed.split('/');
  if (parts.length <= 1) {
    return { groupName: 'Без группы', tokenName: trimmed };
  }
  return {
    groupName: parts[0] || 'Без группы',
    tokenName: parts.slice(1).join('/') || 'Без названия',
  };
}

function serializeVariable(
  variable: Variable,
  collectionName?: string | null,
): TokenVariableExport {
  const rawName = variable.name || variable.key;
  const nameParts = splitVariableName(rawName);
  const originalValues = copyValuesByMode(variable.valuesByMode);
  const resolvedValues = resolveAliasValues(originalValues);
  return {
    id: variable.id,
    name: variable.name,
    description: variable.description,
    hiddenFromPublishing: variable.hiddenFromPublishing,
    remote: variable.remote,
    key: variable.key,
    resolvedType: variable.resolvedType,
    variableCollectionId: variable.variableCollectionId,
    scopes: Array.isArray(variable.scopes) ? variable.scopes.slice() : [],
    codeSyntax: copyCodeSyntax(variable.codeSyntax),
    valuesByMode: resolvedValues,
    hexByMode: buildHexMap(resolvedValues),
    collectionName: collectionName || 'Без коллекции',
    groupName: nameParts.groupName,
    tokenName: nameParts.tokenName,
  };
}

function copyCodeSyntax(
  codeSyntax?: Record<CodeSyntaxPlatform, string | undefined>,
): Record<CodeSyntaxPlatform, string | undefined> {
  const platforms: CodeSyntaxPlatform[] = ['WEB', 'ANDROID', 'iOS'];
  const result: Record<CodeSyntaxPlatform, string | undefined> = {
    WEB: undefined,
    ANDROID: undefined,
    iOS: undefined,
  };
  platforms.forEach((platform) => {
    if (codeSyntax && codeSyntax[platform]) {
      result[platform] = codeSyntax[platform];
    }
  });
  return result;
}

function copyValuesByMode(
  values: Record<string, SerializedVariableValue> | undefined,
): Record<string, SerializedVariableValue | undefined> {
  const result: Record<string, SerializedVariableValue | undefined> = {};
  if (!values) return result;
  for (const key in values) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      result[key] = values[key];
    }
  }
  return result;
}

function buildHexMap(
  values: Record<string, SerializedVariableValue> | undefined,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  if (!values) return result;
  for (const modeId in values) {
    if (!Object.prototype.hasOwnProperty.call(values, modeId)) continue;
    const hex = convertValueToHex(values[modeId]);
    result[modeId] = hex;
  }
  return result;
}

function convertValueToHex(value: SerializedVariableValue | undefined): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const color = value as RGB | RGBA;
  const hasRgb =
    typeof (color as RGB).r === 'number' &&
    typeof (color as RGB).g === 'number' &&
    typeof (color as RGB).b === 'number';
  if (!hasRgb) return undefined;
  const r = clampColorComponent(color.r);
  const g = clampColorComponent(color.g);
  const b = clampColorComponent(color.b);
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function clampColorComponent(value: number | undefined): number {
  const normalized = typeof value === 'number' ? value : 0;
  const scaled = Math.round(normalized * 255);
  return Math.max(0, Math.min(255, scaled));
}

function toHex(component: number): string {
  const hex = component.toString(16).toUpperCase();
  return hex.length === 1 ? '0' + hex : hex;
}

function resolveAliasValues(
  values: Record<string, SerializedVariableValue | undefined>,
): Record<string, SerializedVariableValue | undefined> {
  const result: Record<string, SerializedVariableValue | undefined> = {};
  if (!values) return result;
  for (const modeId in values) {
    if (!Object.prototype.hasOwnProperty.call(values, modeId)) continue;
    result[modeId] = resolveAliasValue(values[modeId]);
  }
  return result;
}

function resolveAliasValue(
  value: SerializedVariableValue | undefined,
): SerializedVariableValue | undefined {
  if (!isVariableAlias(value)) {
    return value;
  }
  const aliasKey = extractAliasKey(value.id);
  if (!aliasKey || !blueTintVariableMap) {
    return value;
  }
  const target = blueTintVariableMap.get(aliasKey);
  if (!target) {
    return value;
  }
  for (const resolved of Object.values(target.valuesByMode)) {
    if (resolved !== undefined) {
      return resolved;
    }
  }
  return value;
}

function isVariableAlias(
  value: SerializedVariableValue | undefined,
): value is VariableAlias {
  if (!value || typeof value !== 'object') return false;
  return (value as VariableAlias).type === 'VARIABLE_ALIAS';
}

function extractAliasKey(aliasId?: string): string | null {
  if (!aliasId) return null;
  const withoutPrefix = aliasId.replace(/^VariableID:/, '');
  const [key] = withoutPrefix.split('/');
  return key || null;
}

async function ensureBlueTintVariablesLoaded(): Promise<void> {
  if (blueTintVariableMap) return;
  if (blueTintLoadPromise) {
    return blueTintLoadPromise;
  }
  blueTintLoadPromise = (async () => {
    try {
      const response = await requestRemoteSource(blueTintTokensUrl);
      const payload = JSON.parse(response) as TokenExportPayload;
      blueTintVariableMap = buildBlueTintVariableMap(payload);
    } catch (error) {
      console.warn('[Athena] failed to load BlueTint tokens', error);
      blueTintVariableMap = new Map();
    } finally {
      blueTintLoadPromise = null;
    }
  })();
  return blueTintLoadPromise;
}

function buildBlueTintVariableMap(payload: TokenExportPayload): Map<string, TokenVariableExport> {
  const result = new Map<string, TokenVariableExport>();
  if (!payload || !Array.isArray(payload.collections)) return result;
  for (const collection of payload.collections) {
    for (const variable of collection.variables ?? []) {
      if (variable.key) {
        result.set(variable.key, variable);
      }
    }
  }
  return result;
}

async function requestRemoteSource(url: string): Promise<string> {
  const requestHTTPsAsync = (figma as any)?.requestHTTPsAsync;
  if (typeof requestHTTPsAsync === 'function') {
    return requestHTTPsAsync(url);
  }
  if (typeof fetch === 'function') {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
  throw new Error('Нет доступного API для загрузки данных (fetch/requestHTTPsAsync)');
}

function normalizePageName(name: string): string {
  if (!name) return '';
  return name.replace(/^[^A-Za-z0-9А-Яа-яЁё]+/, '').trim();
}

function sanitizeExportPayload(data: DSExport): DSExport {
  const sanitizedComponents = data.components.map((component) => {
    const sanitizedComponent: DSComponent = Object.assign({}, component, {
      structure: component.structure.map(trimStructureNode),
      variantStructures: component.variantStructures
        ? sanitizeVariantStructures(component.variantStructures)
        : undefined,
    });
    delete sanitizedComponent.parentComponent;
    delete sanitizedComponent.parentComponents;
    return sanitizedComponent;
  });
  return Object.assign({}, data, { components: sanitizedComponents });
}

function sanitizeVariantStructures(
  variants: Record<string, DSVariantStructurePatch[]>,
): Record<string, DSVariantStructurePatch[]> {
  const result: Record<string, DSVariantStructurePatch[]> = {};
  for (const key in variants) {
    const patches = variants[key];
    result[key] = patches.map(trimVariantPatch);
  }
  return result;
}

function trimVariantPatch(patch: DSVariantStructurePatch): DSVariantStructurePatch {
  if (patch.op === 'update') {
    return Object.assign({}, patch, {
      value: trimPatchValue(patch.value),
    });
  }
  if (patch.op === 'add') {
    return Object.assign({}, patch, {
      node: trimStructureNode(patch.node),
    });
  }
  return patch;
}

function trimPatchValue(value: DSStructureNodePatch): DSStructureNodePatch {
  const trimmed: DSStructureNodePatch = {};
  if ('id' in value) trimmed.id = value.id;
  if ('path' in value) trimmed.path = value.path;
  if ('type' in value) trimmed.type = value.type;
  if ('name' in value) trimmed.name = value.name;
  if ('visible' in value) trimmed.visible = value.visible;
  if ('styles' in value) trimmed.styles = value.styles;
  if ('layout' in value) trimmed.layout = value.layout;
  if ('opacity' in value) trimmed.opacity = value.opacity;
  if ('opacityToken' in value) trimmed.opacityToken = value.opacityToken;
  if ('radius' in value) trimmed.radius = value.radius;
  if ('radiusToken' in value) trimmed.radiusToken = value.radiusToken;
  if ('effects' in value) trimmed.effects = value.effects;
  if ('componentInstance' in value) {
    trimmed.componentInstance = value.componentInstance;
  }
  if ('text' in value) trimmed.text = value.text;
  if ('fills' in value) trimmed.fills = value.fills;
  if ('fillToken' in value) trimmed.fillToken = value.fillToken;
  if ('strokes' in value) trimmed.strokes = value.strokes;
  if ('strokeToken' in value) trimmed.strokeToken = value.strokeToken;
  if ('strokeWeight' in value) trimmed.strokeWeight = value.strokeWeight;
  if ('strokeAlign' in value) trimmed.strokeAlign = value.strokeAlign;
  if ('typography' in value) trimmed.typography = value.typography;
  if ('typographyToken' in value) trimmed.typographyToken = value.typographyToken;
  return trimmed;
}

function trimStructureNode(node: DSStructureNode): DSStructureNode {
  return {
    id: node.id,
    parentId: node.parentId,
    path: node.path,
    type: node.type,
    name: node.name,
    visible: node.visible,
    styles: node.styles,
    layout: node.layout,
    opacity: node.opacity,
    opacityToken: node.opacityToken,
    radius: node.radius,
    radiusToken: node.radiusToken,
    effects: node.effects,
    text: node.text,
    fills: node.fills,
    fillToken: node.fillToken,
    strokes: node.strokes,
    strokeToken: node.strokeToken,
    strokeWeight: node.strokeWeight,
    strokeAlign: node.strokeAlign,
    typography: node.typography,
    typographyToken: node.typographyToken,
    componentInstance: node.componentInstance,
  };
}
