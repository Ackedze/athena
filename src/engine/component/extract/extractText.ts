import { DSTextContent } from "../../types";

export function extractText(node: SceneNode): DSTextContent | undefined {
  if (node.type !== "TEXT") return undefined;

  const t = node as TextNode;
  const result: DSTextContent = {};
  let hasData = false;

  if (typeof t.characters === "string" && t.characters.length) {
    result.characters = t.characters;
    hasData = true;
  }

  if (t.fontName !== figma.mixed) {
    const fontName = t.fontName;
    result.fontName = `${fontName.family} ${fontName.style}`.trim();
    hasData = true;
  }

  if (t.fontSize !== figma.mixed && typeof t.fontSize === "number") {
    result.fontSize = t.fontSize;
    hasData = true;
  }

  if (t.lineHeight !== figma.mixed && t.lineHeight) {
    if (t.lineHeight.unit === "PIXELS") {
      result.lineHeight = t.lineHeight.value;
    } else {
      result.lineHeight = t.lineHeight.unit + "(" + t.lineHeight.value + ")";
    }
    hasData = true;
  }

  if (t.letterSpacing !== figma.mixed && t.letterSpacing) {
    result.letterSpacing = t.letterSpacing.value;
    hasData = true;
  }

  if (typeof t.paragraphSpacing === "number") {
    result.paragraphSpacing = t.paragraphSpacing;
    hasData = true;
  }

  if (t.textCase && t.textCase !== "ORIGINAL") {
    result.case = t.textCase;
    hasData = true;
  }

  return hasData ? result : undefined;
}
