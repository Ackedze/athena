import { DSRadii } from "../../types";

export function extractRadius(node: SceneNode): DSRadii | undefined {
  if ("cornerRadius" in node) {
    if (node.cornerRadius !== figma.mixed && typeof node.cornerRadius === "number") {
      return node.cornerRadius;
    }

    if (
      "topLeftRadius" in node &&
      typeof node.topLeftRadius === "number" &&
      typeof node.topRightRadius === "number" &&
      typeof node.bottomRightRadius === "number" &&
      typeof node.bottomLeftRadius === "number"
    ) {
      return {
        topLeft: node.topLeftRadius,
        topRight: node.topRightRadius,
        bottomRight: node.bottomRightRadius,
        bottomLeft: node.bottomLeftRadius,
      };
    }
  }

  return undefined;
}
