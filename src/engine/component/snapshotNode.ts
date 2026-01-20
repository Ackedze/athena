import { DSStructureNode, DSPaint, DSTypography } from "../types";
import { makePath } from "./utils/makePath";
import { extractStyles } from "./extract/extractStyles";
import { extractLayout } from "./extract/extractLayout";
import { extractText } from "./extract/extractText";
import { extractInstance } from "./extract/extractInstance";
import { extractRadius } from "./extract/extractRadius";
import { extractEffects } from "./extract/extractEffects";

interface SnapshotOptions {
  preserveHiddenFills?: boolean;
}

export function snapshotNode(
  node: SceneNode,
  parentPath: string,
  parentId: number | null,
  id: number,
  options?: SnapshotOptions,
): DSStructureNode {
  // Делаем snapshot structural и visual properties для export.
  const path = makePath(parentPath, node.name);

  const snap: DSStructureNode = {
    id,
    parentId,
    path,
    type: node.type,
    name: node.name,
    visible: node.visible,
  };

  const styles = extractStyles(node);
  if (styles) {
    snap.styles = styles;
  }

  const layout = extractLayout(node);
  if (layout) {
    snap.layout = layout;
  }

  if ("opacity" in node && typeof node.opacity === "number") {
    snap.opacity = node.opacity;
  }
  const bound = (node as any).boundVariables;
  const opacityToken = getBoundVariableId(bound, "opacity");
  if (opacityToken) {
    snap.opacityToken = opacityToken;
  }

  const snapshotOptions = {
    preserveHiddenFills: options?.preserveHiddenFills ?? true,
  };

  // Resolve paint tokens через bound variables или styles, затем attach paint data.
  const rawFills = "fills" in node ? node.fills : undefined;
  const fillToken =
    extractPaintVariableId(rawFills) ||
    getBoundVariableId(bound, "fills") ||
    getBoundVariableId(bound, "fill") ||
    extractPaintVariableIdFromStyle(node, "fillStyleId") ||
    null;
  const textStyleFillToken =
    !fillToken && node.type === "TEXT"
      ? extractPaintVariableIdFromTextStyle(node as TextNode)
      : null;
  const resolvedFillToken = fillToken || textStyleFillToken;
  const shouldCaptureFills = snapshotOptions.preserveHiddenFills || node.visible;
  const fills = shouldCaptureFills
    ? extractPaints(rawFills, { tokenKey: resolvedFillToken })
    : null;
  if (fills) {
    snap.fills = fills;
  }
  if (resolvedFillToken) {
    snap.fillToken = resolvedFillToken;
  }

  const rawStrokes = "strokes" in node ? node.strokes : undefined;
  const strokeToken =
    extractPaintVariableId(rawStrokes) ||
    getBoundVariableId(bound, "strokes") ||
    getBoundVariableId(bound, "stroke") ||
    extractPaintVariableIdFromStyle(node, "strokeStyleId") ||
    null;
  const strokes = extractPaints(rawStrokes, { tokenKey: strokeToken });
  const strokeWeight =
    "strokeWeight" in node && typeof node.strokeWeight === "number"
      ? node.strokeWeight
      : null;

  if (strokes && strokes.length > 0) {
    snap.strokes = strokes;
    if (typeof strokeWeight === "number") {
      snap.strokeWeight = strokeWeight;
    }
    if (node.strokeAlign) {
      snap.strokeAlign = node.strokeAlign;
    }
  }
  if (strokeToken) {
    snap.strokeToken = strokeToken;
  }

  const inst = extractInstance(node);
  if (inst) snap.componentInstance = inst;

  const text = extractText(node);
  if (text) snap.text = text;

  const typography = extractTypography(node);
  if (typography) snap.typography = typography;
  if (node.type === "TEXT") {
    const typographyToken =
      getBoundVariableId(bound, "fontSize") ||
      getBoundVariableId(bound, "lineHeight") ||
      getBoundVariableId(bound, "letterSpacing");
    if (typographyToken) {
      snap.typographyToken = typographyToken;
    }
  }

  const radius = extractRadius(node);
  if (typeof radius !== "undefined") {
    snap.radius = radius;
  }
  const radiusToken = getBoundVariableId(bound, "cornerRadius");
  if (radiusToken) {
    snap.radiusToken = radiusToken;
  }

  const effects = extractEffects(node);
  if (effects && effects.length > 0) {
    snap.effects = effects;
  }

  return snap;
}

function extractPaints(
  paints: readonly Paint[] | PluginAPI["mixed"] | undefined,
  options?: { tokenKey?: string | null },
): DSPaint[] | null {
  if (!paints || paints === figma.mixed || !Array.isArray(paints)) {
    return null;
  }
  const solids = paints.filter((paint) => paint.type === "SOLID");
  if (!solids.length) {
    return null;
  }
  return solids.map((paint) => {
    const color = paint.color;
    const opacity = paint.opacity === undefined ? 1 : paint.opacity;
    return {
      type: "SOLID",
      color: {
        r: Math.round(color.r * 255),
        g: Math.round(color.g * 255),
        b: Math.round(color.b * 255),
        a: Math.round(opacity * 100) / 100,
      },
      visible: paint.visible,
      opacity,
      tokenKey: options?.tokenKey ?? null,
      colorHex: paintColorToHex(color),
    };
  });
}

function extractTypography(node: SceneNode): DSTypography | null {
  if (node.type !== "TEXT") return null;
  const textNode = node as TextNode;
  if (textNode.fontName === figma.mixed) {
    return null;
  }
  const fontName = textNode.fontName;
  const typography: DSTypography = {
    fontName: `${fontName.family} ${fontName.style}`.trim(),
  };
  if (textNode.fontSize !== figma.mixed && typeof textNode.fontSize === "number") {
    typography.fontSize = textNode.fontSize;
  }
  return Object.keys(typography).length ? typography : null;
}

function extractPaintVariableId(
  paints: readonly Paint[] | PluginAPI["mixed"] | undefined,
): string | null {
  if (!paints || paints === figma.mixed || !Array.isArray(paints)) {
    return null;
  }
  for (const paint of paints) {
    if (!paint || paint.type !== "SOLID") continue;
    const bound = (paint as any).boundVariables;
    const direct =
      resolveBindingId(bound?.color) ||
      resolveBindingId(bound?.fill) ||
      resolveBindingId(bound?.fills);
    if (direct) return direct;
    if (bound && typeof bound === "object") {
      for (const value of Object.values(bound)) {
        const candidate = resolveBindingId(value);
        if (candidate) return candidate;
      }
    }
  }
  return null;
}

function extractPaintVariableIdFromStyle(
  node: SceneNode,
  styleKey: "fillStyleId" | "strokeStyleId",
): string | null {
  const styleId = (node as any)[styleKey];
  if (!styleId || styleId === figma.mixed || typeof styleId !== "string") {
    return null;
  }
  const style = figma.getStyleById(styleId) as PaintStyle | null;
  if (!style) return null;
  const boundToken = extractVariableIdFromStyleBoundVariables(style);
  if (boundToken) return boundToken;
  if (!("paints" in style)) return null;
  return extractPaintVariableId((style as PaintStyle).paints);
}

function extractPaintVariableIdFromTextStyle(node: TextNode): string | null {
  const styleId = node.textStyleId;
  if (!styleId || styleId === figma.mixed || typeof styleId !== "string") {
    return null;
  }
  const style = figma.getStyleById(styleId) as TextStyle | null;
  if (!style) return null;
  const boundToken = extractVariableIdFromStyleBoundVariables(style);
  if (boundToken) return boundToken;
  if (!("fills" in style)) return null;
  return extractPaintVariableId((style as TextStyle).fills);
}

function extractVariableIdFromStyleBoundVariables(style: any): string | null {
  const bound = style?.boundVariables;
  const direct =
    getBoundVariableId(bound, "color") ||
    getBoundVariableId(bound, "fills") ||
    getBoundVariableId(bound, "fill") ||
    getBoundVariableId(bound, "strokes") ||
    getBoundVariableId(bound, "stroke");
  if (direct) return direct;
  if (!bound || typeof bound !== "object") return null;
  for (const value of Object.values(bound)) {
    const candidate = resolveBindingId(value);
    if (candidate) return candidate;
  }
  return null;
}

function getBoundVariableId(boundVariables: any, key: string): string | null {
  if (!boundVariables) return null;
  const binding = boundVariables[key];
  if (!binding) return null;
  if (Array.isArray(binding)) {
    for (const item of binding) {
      const candidate = resolveBindingId(item);
      if (candidate) return candidate;
    }
    return null;
  }
  return resolveBindingId(binding);
}

function resolveBindingId(binding: any): string | null {
  if (!binding) return null;
  if (typeof binding === "string") return binding;
  const candidate =
    binding.id ||
    binding.variableId ||
    binding.variable?.id ||
    binding.variable?.key;
  if (candidate) return String(candidate);
  const nested =
    binding.value ||
    binding.values ||
    binding.alias ||
    binding.variableAlias;
  if (nested) return resolveBindingId(nested);
  const nestedVars =
    binding.boundVariables?.color ||
    binding.boundVariables?.fills ||
    binding.boundVariables?.fill ||
    binding.boundVariables?.strokes ||
    binding.boundVariables?.stroke;
  if (nestedVars) return resolveBindingId(nestedVars);
  return null;
}

function paintColorToHex(color: RGB): string {
  const r = clampColorComponent(color.r);
  const g = clampColorComponent(color.g);
  const b = clampColorComponent(color.b);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampColorComponent(value: number | undefined): number {
  const normalized = typeof value === "number" ? value : 0;
  const scaled = Math.round(normalized * 255);
  if (scaled <= 0) {
    return 0;
  }
  if (scaled >= 255) {
    return 255;
  }
  return scaled;
}

function toHex(component: number): string {
  const hex = component.toString(16).toUpperCase();
  return hex.length === 1 ? "0" + hex : hex;
}
