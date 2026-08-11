import { DSNodeLayout } from "../../types";

export function extractLayout(node: SceneNode): DSNodeLayout | undefined {
  const layout: DSNodeLayout = {};

  captureFiniteDimension(layout, "width", node.width);
  captureFiniteDimension(layout, "height", node.height);
  if ("minWidth" in node) {
    captureFiniteDimension(layout, "minWidth", node.minWidth);
    captureFiniteDimension(layout, "maxWidth", node.maxWidth);
    captureFiniteDimension(layout, "minHeight", node.minHeight);
    captureFiniteDimension(layout, "maxHeight", node.maxHeight);
  }

  if ("layoutMode" in node && node.layoutMode && node.layoutMode !== "NONE") {
    const padding = {
      top: node.paddingTop || 0,
      right: node.paddingRight || 0,
      bottom: node.paddingBottom || 0,
      left: node.paddingLeft || 0,
    };
    layout.padding = padding;
    if (typeof node.itemSpacing === "number") {
      layout.itemSpacing = node.itemSpacing;
    }
    const bound = (node as any).boundVariables;
    const paddingTokens = {
      top: getBoundVariableId(bound, "paddingTop"),
      right: getBoundVariableId(bound, "paddingRight"),
      bottom: getBoundVariableId(bound, "paddingBottom"),
      left: getBoundVariableId(bound, "paddingLeft"),
    };
    if (
      paddingTokens.top ||
      paddingTokens.right ||
      paddingTokens.bottom ||
      paddingTokens.left
    ) {
      layout.paddingTokens = paddingTokens;
    }
    const itemSpacingToken = getBoundVariableId(bound, "itemSpacing");
    if (itemSpacingToken) {
      layout.itemSpacingToken = itemSpacingToken;
    }
  }

  return Object.keys(layout).length ? layout : undefined;
}

function captureFiniteDimension(
  layout: DSNodeLayout,
  property:
    | "width"
    | "height"
    | "minWidth"
    | "maxWidth"
    | "minHeight"
    | "maxHeight",
  value: number | null,
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    layout[property] = value;
  }
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
    binding.boundVariables?.color ||
    binding.boundVariables?.fills ||
    binding.boundVariables?.fill ||
    binding.boundVariables?.strokes ||
    binding.boundVariables?.stroke;
  if (nested) return resolveBindingId(nested);
  return null;
}
