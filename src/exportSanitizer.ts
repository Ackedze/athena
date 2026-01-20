// Санитизация export payload: убираем тяжелые поля перед отправкой в UI.
import type {
  DSComponent,
  DSExport,
  DSStructureNode,
  DSStructureNodePatch,
  DSVariantStructurePatch,
} from './engine';

export function sanitizeExportPayload(data: DSExport): DSExport {
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
