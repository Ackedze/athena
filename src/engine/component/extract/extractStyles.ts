import { DSNodeStyles, DSTokenReference } from "../../types";

export function extractStyles(node: SceneNode): DSNodeStyles | undefined {
  const styles: DSNodeStyles = {};

  if ("fillStyleId" in node) {
    const ref = makeRef(node.fillStyleId as any);
    if (ref) {
      styles.fill = ref;
    }
  }
  if ("strokeStyleId" in node) {
    const ref = makeRef(node.strokeStyleId as any);
    if (ref) {
      styles.stroke = ref;
    }
  }

  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    const ref = makeRef(textNode.textStyleId as any);
    if (ref) {
      styles.text = ref;
    }
  }

  if ("effectStyleId" in node) {
    const ref = makeRef((node as any).effectStyleId);
    if (ref) styles.effects = [ref];
  }

  return Object.keys(styles).length ? styles : undefined;
}

function makeRef(styleId: string | typeof figma.mixed): DSTokenReference | null {
  if (!styleId || styleId === figma.mixed) return null;
  return { styleKey: String(styleId) };
}
