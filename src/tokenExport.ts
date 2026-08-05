// Экспорт Variables API с resolve aliases и расчетом hex значений для цветов.
import { splitVariableName } from './nameUtils';

type SerializedVariableValue =
  | boolean
  | string
  | number
  | RGB
  | RGBA
  | VariableAlias;

type SerializedConcreteVariableValue = Exclude<
  SerializedVariableValue,
  VariableAlias
>;

type TokenModeResolutionStatus = 'resolved' | 'partial' | 'unresolved';

export interface TokenModeResolutionExport {
  status: TokenModeResolutionStatus;
  aliasIds: string[];
  unresolvedAliasIds: string[];
}

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
  actualValuesByMode: Record<string, SerializedConcreteVariableValue[]>;
  actualHexByMode: Record<string, string[]>;
  resolutionByMode: Record<string, TokenModeResolutionExport>;
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

  const resolver = createVariableValueResolver(variableById);

  const collectionExports: TokenCollectionExport[] = await Promise.all(
    collections.map(async (collection) => {
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
        variables: await Promise.all(
          collectionVariables.map((variable) =>
            serializeVariable(
              variable,
              resolver,
              collection.name || collection.key,
            ),
          ),
        ),
      };
    }),
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

async function serializeVariable(
  variable: Variable,
  resolver: VariableValueResolver,
  collectionName?: string | null,
): Promise<TokenVariableExport> {
  const rawName = variable.name || variable.key;
  const nameParts = splitVariableName(rawName);
  const originalValues = copyValuesByMode(variable.valuesByMode);
  const resolutions = await resolveValuesByMode(originalValues, resolver);
  const actualValuesByMode: Record<
    string,
    SerializedConcreteVariableValue[]
  > = {};
  const actualHexByMode: Record<string, string[]> = {};
  const resolutionByMode: Record<string, TokenModeResolutionExport> = {};
  for (const modeId of Object.keys(resolutions)) {
    const resolution = resolutions[modeId];
    actualValuesByMode[modeId] = resolution.values;
    actualHexByMode[modeId] = uniqueStrings(
      resolution.values
        .map((value) => convertValueToHex(value))
        .filter((value): value is string => Boolean(value)),
    );
    resolutionByMode[modeId] = {
      status: resolution.status,
      aliasIds: resolution.aliasIds,
      unresolvedAliasIds: resolution.unresolvedAliasIds,
    };
  }
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
    valuesByMode: originalValues,
    hexByMode: buildUniqueHexMap(actualHexByMode),
    actualValuesByMode,
    actualHexByMode,
    resolutionByMode,
    collectionName: collectionName || 'Без коллекции',
    groupName: nameParts.groupName,
    tokenName: nameParts.tokenName,
  };
}

type VariableValueResolution = {
  status: TokenModeResolutionStatus;
  values: SerializedConcreteVariableValue[];
  aliasIds: string[];
  unresolvedAliasIds: string[];
};

type VariableValueResolver = (
  value: SerializedVariableValue | undefined,
  preferredModeId: string,
  visitedAliasIds?: Set<string>,
) => Promise<VariableValueResolution>;

function createVariableValueResolver(
  localVariables: Map<string, Variable>,
): VariableValueResolver {
  const variablePromises = new Map<string, Promise<Variable | null>>();

  const loadVariable = (aliasId: string): Promise<Variable | null> => {
    const existing = localVariables.get(aliasId);
    if (existing) return Promise.resolve(existing);
    const cached = variablePromises.get(aliasId);
    if (cached) return cached;

    const promise = (async () => {
      const byId = await figma.variables.getVariableByIdAsync(aliasId);
      if (byId) return byId;
      const key = extractAliasKey(aliasId);
      if (!key) return null;
      try {
        return await figma.variables.importVariableByKeyAsync(key);
      } catch (_error) {
        return null;
      }
    })();
    variablePromises.set(aliasId, promise);
    return promise;
  };

  const resolve: VariableValueResolver = async (
    value,
    preferredModeId,
    visitedAliasIds = new Set<string>(),
  ) => {
    if (!isVariableAlias(value)) {
      return {
        status: value === undefined ? 'unresolved' : 'resolved',
        values:
          value === undefined
            ? []
            : [value as SerializedConcreteVariableValue],
        aliasIds: [],
        unresolvedAliasIds: [],
      };
    }

    if (visitedAliasIds.has(value.id)) {
      return unresolvedResolution(value.id);
    }
    const nextVisited = new Set(visitedAliasIds);
    nextVisited.add(value.id);
    const target = await loadVariable(value.id);
    if (!target) {
      return unresolvedResolution(value.id);
    }

    const targetValues = copyValuesByMode(target.valuesByMode);
    const targetModeIds = Object.prototype.hasOwnProperty.call(
      targetValues,
      preferredModeId,
    )
      ? [preferredModeId]
      : Object.keys(targetValues);
    if (!targetModeIds.length) {
      return unresolvedResolution(value.id);
    }

    const nested = await Promise.all(
      targetModeIds.map((modeId) =>
        resolve(targetValues[modeId], modeId, nextVisited),
      ),
    );
    return mergeResolutions(value.id, nested);
  };

  return resolve;
}

async function resolveValuesByMode(
  values: Record<string, SerializedVariableValue | undefined>,
  resolver: VariableValueResolver,
): Promise<Record<string, VariableValueResolution>> {
  const entries = await Promise.all(
    Object.keys(values).map(async (modeId) => [
      modeId,
      await resolver(values[modeId], modeId),
    ] as const),
  );
  const result: Record<string, VariableValueResolution> = {};
  for (const [modeId, resolution] of entries) {
    result[modeId] = resolution;
  }
  return result;
}

function mergeResolutions(
  aliasId: string,
  nested: VariableValueResolution[],
): VariableValueResolution {
  const values = uniqueConcreteValues(
    nested.flatMap((resolution) => resolution.values),
  );
  const unresolvedAliasIds = uniqueStrings(
    nested.flatMap((resolution) => resolution.unresolvedAliasIds),
  );
  const hasUnresolved = nested.some(
    (resolution) => resolution.status !== 'resolved',
  );
  return {
    status: values.length
      ? hasUnresolved
        ? 'partial'
        : 'resolved'
      : 'unresolved',
    values,
    aliasIds: uniqueStrings([
      aliasId,
      ...nested.flatMap((resolution) => resolution.aliasIds),
    ]),
    unresolvedAliasIds,
  };
}

function unresolvedResolution(aliasId: string): VariableValueResolution {
  return {
    status: 'unresolved',
    values: [],
    aliasIds: [aliasId],
    unresolvedAliasIds: [aliasId],
  };
}

function uniqueConcreteValues(
  values: SerializedConcreteVariableValue[],
): SerializedConcreteVariableValue[] {
  const result: SerializedConcreteVariableValue[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
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

function buildUniqueHexMap(
  values: Record<string, string[]>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const modeId in values) {
    if (!Object.prototype.hasOwnProperty.call(values, modeId)) continue;
    result[modeId] = values[modeId].length === 1 ? values[modeId][0] : undefined;
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
  const alpha = 'a' in color ? clampColorComponent(color.a) : 255;
  return (
    '#' +
    toHex(r) +
    toHex(g) +
    toHex(b) +
    (alpha < 255 ? toHex(alpha) : '')
  );
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
