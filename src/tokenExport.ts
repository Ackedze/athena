// Экспорт Variables API с resolve aliases и расчетом hex значений для цветов.
import { splitVariableName } from './nameUtils';

type SerializedVariableValue =
  | boolean
  | string
  | number
  | RGB
  | RGBA
  | VariableAlias;

export interface TokenExportMeta {
  generatedAt: string;
  fileName: string;
  library: string;
}

export interface TokenVariableExport {
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

export interface TokenCollectionExport {
  id: string;
  name: string;
  key: string;
  defaultModeId: string;
  hiddenFromPublishing: boolean;
  remote: boolean;
  modes: Array<{ modeId: string; name: string }>;
  variables: TokenVariableExport[];
}

export interface TokenExportPayload {
  meta: TokenExportMeta;
  collections: TokenCollectionExport[];
}

const blueTintTokensUrl =
  'https://ackedze.github.io/nemesis/JSONS/BlueTint Base Colors -- BlueTint Base Colors.json';
// Удаленная token library для resolve VARIABLE_ALIAS значений в реальные цвета.
let blueTintVariableMap: Map<string, TokenVariableExport> | null = null;
let blueTintLoadPromise: Promise<void> | null = null;

export async function collectTokensFromFile(): Promise<TokenExportPayload> {
  // Вызов требует Variables API в текущем файле.
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

function convertValueToHex(
  value: SerializedVariableValue | undefined,
): string | undefined {
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
  // Подтягиваем удаленную token library один раз для alias resolution.
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

function buildBlueTintVariableMap(
  payload: TokenExportPayload,
): Map<string, TokenVariableExport> {
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
