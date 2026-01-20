import { DSEffect } from "../../types";

export function extractEffects(node: SceneNode): DSEffect[] | undefined {
  if (!("effects" in node)) return undefined;
  const effects = node.effects;
  if (!effects || effects === figma.mixed || effects.length === 0) return undefined;

  const result: DSEffect[] = [];

  for (const e of effects) {
    if (
      e.type === "DROP_SHADOW" ||
      e.type === "INNER_SHADOW" ||
      e.type === "LAYER_BLUR" ||
      e.type === "BACKGROUND_BLUR"
    ) {
      const eff: DSEffect = {
        type: e.type,
        radius: e.radius,
      };

      if ("color" in e && e.color) {
        eff.color = `rgba(${Math.round(e.color.r * 255)}, ${Math.round(
          e.color.g * 255
        )}, ${Math.round(e.color.b * 255)}, ${e.color.a.toFixed(2)})`;
      }

      if ("offset" in e && e.offset) {
        eff.offset = { x: e.offset.x, y: e.offset.y };
      }

      result.push(eff);
    }
  }

  return result.length ? result : undefined;
}
