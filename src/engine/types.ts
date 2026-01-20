/// <reference types="@figma/plugin-typings" />

/**
 * Общие типы, которые используют парсер компонентов и вспомогательные модули.
 */

export type DSNodeType =
  | 'COMPONENT'
  | 'INSTANCE'
  | 'FRAME'
  | 'GROUP'
  | 'VECTOR'
  | 'TEXT'
  | 'BOOLEAN_OPERATION';

export type DSLayoutDirection = 'H' | 'V' | null;

export interface DSPadding {
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
}

export interface DSNodeLayout {
  padding?: DSPadding | null;
  itemSpacing?: number | null;
  paddingTokens?: {
    top?: string | null;
    right?: string | null;
    bottom?: string | null;
    left?: string | null;
  } | null;
  itemSpacingToken?: string | null;
}

export interface DSTokenReference {
  styleKey: string;
}

export interface DSNodeStyles {
  fill?: DSTokenReference | null;
  stroke?: DSTokenReference | null;
  text?: DSTokenReference | null;
  effects?: DSTokenReference[] | null;
}

export interface DSPaint {
  type: 'SOLID';
  color: { r: number; g: number; b: number; a: number };
  visible?: boolean;
  opacity?: number;
  tokenKey?: string | null;
  colorHex?: string | null;
}

export interface DSTypography {
  fontName?: string;
  fontSize?: number;
}

export interface DSInstanceInfo {
  componentKey: string;
  variantProperties?: Record<string, string>;
}

export interface DSRadiiValues {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export type DSRadii = number | DSRadiiValues;

export interface DSTextContent {
  characters?: string;
  fontName?: string;
  fontSize?: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  paragraphSpacing?: number;
  case?: TextCase;
}

export type DSEffectType =
  | 'DROP_SHADOW'
  | 'INNER_SHADOW'
  | 'LAYER_BLUR'
  | 'BACKGROUND_BLUR';

export interface DSEffect {
  type: DSEffectType;
  radius: number | null;
  color?: string | null;
  offset?: { x: number; y: number } | null;
}

export interface DSStructureNode {
  id: number;
  parentId: number | null;
  path: string;
  type: DSNodeType;
  name: string;
  visible: boolean;
  styles?: DSNodeStyles;
  layout?: DSNodeLayout;
  opacity?: number | null;
  opacityToken?: string | null;
  radius?: DSRadii;
  radiusToken?: string | null;
  effects?: DSEffect[] | null;
  componentInstance?: DSInstanceInfo | null;
  text?: DSTextContent;
  fillToken?: string | null;
  strokeToken?: string | null;
  fills?: DSPaint[] | null;
  strokes?: DSPaint[] | null;
  strokeWeight?: number | null;
  strokeAlign?: StrokeAlign | null;
  typography?: DSTypography | null;
  typographyToken?: string | null;
}

export type DSStructureNodePatch = Partial<
  Pick<
    DSStructureNode,
    | 'path'
    | 'type'
    | 'name'
    | 'visible'
    | 'styles'
    | 'layout'
    | 'opacity'
    | 'opacityToken'
    | 'radius'
    | 'radiusToken'
    | 'effects'
    | 'componentInstance'
    | 'text'
    | 'fills'
    | 'fillToken'
    | 'strokes'
    | 'strokeToken'
    | 'strokeWeight'
    | 'strokeAlign'
    | 'typography'
    | 'typographyToken'
  >
>;

export type DSVariantStructurePatch =
  | { op: 'update'; id: number; value: DSStructureNodePatch }
  | { op: 'add'; node: DSStructureNode }
  | { op: 'remove'; id: number };

export type DSVariantStructureMap = Record<string, DSVariantStructurePatch[]>;

export interface DSVariant {
  id: string;
  key: string;
  name: string;
}

export type ComponentRole = 'main' | 'part' | 'helper';
export type ComponentStatus = 'active' | 'deprecated' | 'scheduled';
export type ComponentPlatform = 'desktop' | 'mobile-web' | 'universal';

export interface DSComponentHost {
  key: string | null;
  name: string | null;
  role?: ComponentRole;
  status?: ComponentStatus;
}

export interface DSComponent {
  key: string;
  name: string;
  page: string;
  category: string;
  description: string;
  variants: DSVariant[];
  defaultVariant: string | null | undefined;
  structure: DSStructureNode[];
  variantStructures?: DSVariantStructureMap;
  parentComponent?: DSComponentHost | null;
  parentComponents?: DSComponentHost[];
  depth?: number;
  depthInside?: number[];
  depthActual?: number;
  role: ComponentRole;
  status: ComponentStatus;
  platform: ComponentPlatform;
}

export type DSScope = 'document' | 'current-page';

export interface DSMeta {
  generatedAt: string;
  version: string;
  files: string[];
  scope: DSScope;
  fileName: string;
  library: string;
}

export interface DSExport {
  meta: DSMeta;
  components: DSComponent[];
  tokens: any[];
  typography: any[];
  spacing: any[];
  radius: any[];
}
