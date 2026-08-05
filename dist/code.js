"use strict";
(() => {
  // src/debug.ts
  var DEBUG_MODE = false;
  function logDebug(topic, detail) {
    if (!DEBUG_MODE) return;
    const entry = {
      topic,
      detail,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      console.log("[Athena::debug]", entry);
    } catch (error) {
      console.log("[Athena::debug]", topic, detail);
    }
    try {
      figma.ui.postMessage({ type: "debug-log", payload: entry });
    } catch (error) {
      console.warn("[Athena::debug] failed to forward log to UI", error);
    }
  }

  // src/engine/component/utils/inferCategory.ts
  function inferCategoryFromName(name) {
    const cleaned = name.replace(/^[^\wА-Яа-я]+/, "").trim();
    const parts = cleaned.split("/").map((p) => p.trim());
    return parts[0] || "Uncategorized";
  }

  // src/engine/component/utils/makePath.ts
  function makePath(parent, name) {
    return parent ? parent + " / " + name : name;
  }

  // src/engine/component/extract/extractStyles.ts
  function extractStyles(node) {
    const styles = {};
    if ("fillStyleId" in node) {
      const ref = makeRef(node.fillStyleId);
      if (ref) {
        styles.fill = ref;
      }
    }
    if ("strokeStyleId" in node) {
      const ref = makeRef(node.strokeStyleId);
      if (ref) {
        styles.stroke = ref;
      }
    }
    if (node.type === "TEXT") {
      const textNode = node;
      const ref = makeRef(textNode.textStyleId);
      if (ref) {
        styles.text = ref;
      }
    }
    if ("effectStyleId" in node) {
      const ref = makeRef(node.effectStyleId);
      if (ref) styles.effects = [ref];
    }
    return Object.keys(styles).length ? styles : void 0;
  }
  function makeRef(styleId) {
    if (!styleId || styleId === figma.mixed) return null;
    return { styleKey: String(styleId) };
  }

  // src/engine/component/extract/extractLayout.ts
  function extractLayout(node) {
    const layout = {};
    if ("layoutMode" in node && node.layoutMode && node.layoutMode !== "NONE") {
      const padding = {
        top: node.paddingTop || 0,
        right: node.paddingRight || 0,
        bottom: node.paddingBottom || 0,
        left: node.paddingLeft || 0
      };
      layout.padding = padding;
      if (typeof node.itemSpacing === "number") {
        layout.itemSpacing = node.itemSpacing;
      }
      const bound = node.boundVariables;
      const paddingTokens = {
        top: getBoundVariableId(bound, "paddingTop"),
        right: getBoundVariableId(bound, "paddingRight"),
        bottom: getBoundVariableId(bound, "paddingBottom"),
        left: getBoundVariableId(bound, "paddingLeft")
      };
      if (paddingTokens.top || paddingTokens.right || paddingTokens.bottom || paddingTokens.left) {
        layout.paddingTokens = paddingTokens;
      }
      const itemSpacingToken = getBoundVariableId(bound, "itemSpacing");
      if (itemSpacingToken) {
        layout.itemSpacingToken = itemSpacingToken;
      }
    }
    return Object.keys(layout).length ? layout : void 0;
  }
  function getBoundVariableId(boundVariables, key) {
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
  function resolveBindingId(binding) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!binding) return null;
    if (typeof binding === "string") return binding;
    const candidate = binding.id || binding.variableId || ((_a = binding.variable) == null ? void 0 : _a.id) || ((_b = binding.variable) == null ? void 0 : _b.key);
    if (candidate) return String(candidate);
    const nested = ((_c = binding.boundVariables) == null ? void 0 : _c.color) || ((_d = binding.boundVariables) == null ? void 0 : _d.fills) || ((_e = binding.boundVariables) == null ? void 0 : _e.fill) || ((_f = binding.boundVariables) == null ? void 0 : _f.strokes) || ((_g = binding.boundVariables) == null ? void 0 : _g.stroke);
    if (nested) return resolveBindingId(nested);
    return null;
  }

  // src/engine/component/extract/extractText.ts
  function extractText(node) {
    if (node.type !== "TEXT") return void 0;
    const t = node;
    const result = {};
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
    return hasData ? result : void 0;
  }

  // src/engine/component/extract/extractInstance.ts
  function extractInstance(node) {
    if (node.type !== "INSTANCE") return void 0;
    const inst = node;
    const info = {};
    try {
      const main = inst.mainComponent;
      if (main) {
        info.componentKey = main.key;
      }
    } catch (error) {
    }
    const vp = inst.variantProperties;
    if (vp && typeof vp === "object") {
      info.variantProperties = vp;
    }
    return Object.keys(info).length > 0 ? info : void 0;
  }

  // src/engine/component/extract/extractRadius.ts
  function extractRadius(node) {
    if ("cornerRadius" in node) {
      if (node.cornerRadius !== figma.mixed && typeof node.cornerRadius === "number") {
        return node.cornerRadius;
      }
      if ("topLeftRadius" in node && typeof node.topLeftRadius === "number" && typeof node.topRightRadius === "number" && typeof node.bottomRightRadius === "number" && typeof node.bottomLeftRadius === "number") {
        return {
          topLeft: node.topLeftRadius,
          topRight: node.topRightRadius,
          bottomRight: node.bottomRightRadius,
          bottomLeft: node.bottomLeftRadius
        };
      }
    }
    return void 0;
  }

  // src/engine/component/extract/extractEffects.ts
  function extractEffects(node) {
    if (!("effects" in node)) return void 0;
    const effects = node.effects;
    if (!effects || effects === figma.mixed || effects.length === 0) return void 0;
    const result = [];
    for (const e of effects) {
      if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW" || e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
        const eff = {
          type: e.type,
          radius: e.radius
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
    return result.length ? result : void 0;
  }

  // src/engine/component/snapshotNode.ts
  function snapshotNode(node, parentPath, parentId, id, options) {
    return snapshotNodeAsync(node, parentPath, parentId, id, options);
  }
  async function snapshotNodeAsync(node, parentPath, parentId, id, options) {
    var _a;
    const path = makePath(parentPath, node.name);
    const snap = {
      id,
      parentId,
      path,
      type: node.type,
      name: node.name,
      visible: node.visible
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
    const bound = node.boundVariables;
    const opacityToken = getBoundVariableId2(bound, "opacity");
    if (opacityToken) {
      snap.opacityToken = opacityToken;
    }
    const snapshotOptions = {
      preserveHiddenFills: (_a = options == null ? void 0 : options.preserveHiddenFills) != null ? _a : true
    };
    const rawFills = "fills" in node ? node.fills : void 0;
    const fillToken = extractPaintVariableId(rawFills) || getBoundVariableId2(bound, "fills") || getBoundVariableId2(bound, "fill") || await extractPaintVariableIdFromStyle(node, "fillStyleId") || null;
    const textStyleFillToken = !fillToken && node.type === "TEXT" ? await extractPaintVariableIdFromTextStyle(node) : null;
    const resolvedFillToken = fillToken || textStyleFillToken;
    const shouldCaptureFills = snapshotOptions.preserveHiddenFills || node.visible;
    const fills = shouldCaptureFills ? extractPaints(rawFills, { tokenKey: resolvedFillToken }) : null;
    if (fills) {
      snap.fills = fills;
    }
    if (resolvedFillToken) {
      snap.fillToken = resolvedFillToken;
    }
    const rawStrokes = "strokes" in node ? node.strokes : void 0;
    const strokeToken = extractPaintVariableId(rawStrokes) || getBoundVariableId2(bound, "strokes") || getBoundVariableId2(bound, "stroke") || await extractPaintVariableIdFromStyle(node, "strokeStyleId") || null;
    const strokes = extractPaints(rawStrokes, { tokenKey: strokeToken });
    const strokeWeight = "strokeWeight" in node && typeof node.strokeWeight === "number" ? node.strokeWeight : null;
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
      const typographyToken = getBoundVariableId2(bound, "fontSize") || getBoundVariableId2(bound, "lineHeight") || getBoundVariableId2(bound, "letterSpacing");
      if (typographyToken) {
        snap.typographyToken = typographyToken;
      }
    }
    const radius = extractRadius(node);
    if (typeof radius !== "undefined") {
      snap.radius = radius;
    }
    const radiusToken = getBoundVariableId2(bound, "cornerRadius");
    if (radiusToken) {
      snap.radiusToken = radiusToken;
    }
    const effects = extractEffects(node);
    if (effects && effects.length > 0) {
      snap.effects = effects;
    }
    return snap;
  }
  function extractPaints(paints, options) {
    if (!paints || paints === figma.mixed || !Array.isArray(paints)) {
      return null;
    }
    const solids = paints.filter((paint) => paint.type === "SOLID");
    if (!solids.length) {
      return null;
    }
    return solids.map((paint) => {
      var _a;
      const color = paint.color;
      const opacity = paint.opacity === void 0 ? 1 : paint.opacity;
      return {
        type: "SOLID",
        color: {
          r: Math.round(color.r * 255),
          g: Math.round(color.g * 255),
          b: Math.round(color.b * 255),
          a: Math.round(opacity * 100) / 100
        },
        visible: paint.visible,
        opacity,
        tokenKey: (_a = options == null ? void 0 : options.tokenKey) != null ? _a : null,
        colorHex: paintColorToHex(color)
      };
    });
  }
  function extractTypography(node) {
    if (node.type !== "TEXT") return null;
    const textNode = node;
    if (textNode.fontName === figma.mixed) {
      return null;
    }
    const fontName = textNode.fontName;
    const typography = {
      fontName: `${fontName.family} ${fontName.style}`.trim()
    };
    if (textNode.fontSize !== figma.mixed && typeof textNode.fontSize === "number") {
      typography.fontSize = textNode.fontSize;
    }
    return Object.keys(typography).length ? typography : null;
  }
  function extractPaintVariableId(paints) {
    if (!paints || paints === figma.mixed || !Array.isArray(paints)) {
      return null;
    }
    for (const paint of paints) {
      if (!paint || paint.type !== "SOLID") continue;
      const bound = paint.boundVariables;
      const direct = resolveBindingId2(bound == null ? void 0 : bound.color) || resolveBindingId2(bound == null ? void 0 : bound.fill) || resolveBindingId2(bound == null ? void 0 : bound.fills);
      if (direct) return direct;
      if (bound && typeof bound === "object") {
        for (const value of Object.values(bound)) {
          const candidate = resolveBindingId2(value);
          if (candidate) return candidate;
        }
      }
    }
    return null;
  }
  async function extractPaintVariableIdFromStyle(node, styleKey) {
    const styleId = node[styleKey];
    if (!styleId || styleId === figma.mixed || typeof styleId !== "string") {
      return null;
    }
    const style = await figma.getStyleByIdAsync(styleId);
    if (!style) return null;
    const boundToken = extractVariableIdFromStyleBoundVariables(style);
    if (boundToken) return boundToken;
    if (!("paints" in style)) return null;
    return extractPaintVariableId(style.paints);
  }
  async function extractPaintVariableIdFromTextStyle(node) {
    const styleId = node.textStyleId;
    if (!styleId || styleId === figma.mixed || typeof styleId !== "string") {
      return null;
    }
    const style = await figma.getStyleByIdAsync(styleId);
    if (!style) return null;
    const boundToken = extractVariableIdFromStyleBoundVariables(style);
    if (boundToken) return boundToken;
    if (!("fills" in style)) return null;
    return extractPaintVariableId(style.fills);
  }
  function extractVariableIdFromStyleBoundVariables(style) {
    const bound = style == null ? void 0 : style.boundVariables;
    const direct = getBoundVariableId2(bound, "color") || getBoundVariableId2(bound, "fills") || getBoundVariableId2(bound, "fill") || getBoundVariableId2(bound, "strokes") || getBoundVariableId2(bound, "stroke");
    if (direct) return direct;
    if (!bound || typeof bound !== "object") return null;
    for (const value of Object.values(bound)) {
      const candidate = resolveBindingId2(value);
      if (candidate) return candidate;
    }
    return null;
  }
  function getBoundVariableId2(boundVariables, key) {
    if (!boundVariables) return null;
    const binding = boundVariables[key];
    if (!binding) return null;
    if (Array.isArray(binding)) {
      for (const item of binding) {
        const candidate = resolveBindingId2(item);
        if (candidate) return candidate;
      }
      return null;
    }
    return resolveBindingId2(binding);
  }
  function resolveBindingId2(binding) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!binding) return null;
    if (typeof binding === "string") return binding;
    const candidate = binding.id || binding.variableId || ((_a = binding.variable) == null ? void 0 : _a.id) || ((_b = binding.variable) == null ? void 0 : _b.key);
    if (candidate) return String(candidate);
    const nested = binding.value || binding.values || binding.alias || binding.variableAlias;
    if (nested) return resolveBindingId2(nested);
    const nestedVars = ((_c = binding.boundVariables) == null ? void 0 : _c.color) || ((_d = binding.boundVariables) == null ? void 0 : _d.fills) || ((_e = binding.boundVariables) == null ? void 0 : _e.fill) || ((_f = binding.boundVariables) == null ? void 0 : _f.strokes) || ((_g = binding.boundVariables) == null ? void 0 : _g.stroke);
    if (nestedVars) return resolveBindingId2(nestedVars);
    return null;
  }
  function paintColorToHex(color) {
    const r = clampColorComponent(color.r);
    const g = clampColorComponent(color.g);
    const b = clampColorComponent(color.b);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  function clampColorComponent(value) {
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
  function toHex(component) {
    const hex = component.toString(16).toUpperCase();
    return hex.length === 1 ? "0" + hex : hex;
  }

  // src/engine/component/collectStructure.ts
  var structureCache = /* @__PURE__ */ new Map();
  function resetStructureCache() {
    structureCache.clear();
  }
  async function collectComponentStructure(root, options) {
    var _a;
    const resolvedOptions = {
      preserveHiddenFills: (_a = options == null ? void 0 : options.preserveHiddenFills) != null ? _a : true
    };
    const cacheKey = `${root.id}:${resolvedOptions.preserveHiddenFills ? "1" : "0"}`;
    const cached = structureCache.get(cacheKey);
    if (cached) {
      return await cached;
    }
    const structurePromise = (async () => {
      const list = [];
      let nextId = 1;
      async function walk(node, parentPath, parentId) {
        const id = nextId++;
        const snap = await snapshotNode(node, parentPath, parentId, id, resolvedOptions);
        list.push(snap);
        if ("children" in node) {
          for (const child of node.children) {
            await walk(child, snap.path, id);
          }
        }
      }
      await walk(root, "", null);
      return list;
    })();
    structureCache.set(cacheKey, structurePromise);
    return await structurePromise;
  }

  // src/engine/component/variantParser.ts
  function extractVariantList(set) {
    const result = [];
    for (const child of set.children) {
      if (child.type !== "COMPONENT") continue;
      result.push({
        id: child.id,
        key: child.key,
        name: child.name
      });
    }
    return result;
  }

  // src/lib/componentMetaClassifier.ts
  function classifyComponentMeta(ctx) {
    const { componentName, pageName, sectionName, libraryName } = ctx;
    const sources = [componentName != null ? componentName : "", pageName != null ? pageName : "", sectionName != null ? sectionName : ""];
    const statusSources = [...sources, libraryName != null ? libraryName : ""];
    const normalized = sources.join(" | ").toLowerCase();
    const status = detectStatus(statusSources);
    const role = detectRole(sources, normalized);
    const platform = detectPlatform(sources);
    return { role, status, platform };
  }
  function detectStatus(sources) {
    if (sources.some((value) => value.includes("\u274C"))) {
      return "deprecated";
    }
    if (sources.some((value) => value.includes("\u{1F504}"))) {
      return "scheduled";
    }
    return "active";
  }
  function detectRole(sources, normalizedFullName) {
    if (sources.some((value) => value.includes("\u{1F529}"))) {
      return "part";
    }
    return "main";
  }
  function detectPlatform(sources) {
    const normalized = sources.join(" ").toLowerCase();
    if (normalized.includes("[d]")) {
      return "desktop";
    }
    if (normalized.includes("[m]")) {
      return "mobile-web";
    }
    return "universal";
  }

  // src/engine/component/utils/getSectionName.ts
  function getSectionName(node) {
    let current = node.parent;
    let topSectionName = null;
    while (current) {
      if (current.type === "SECTION") {
        topSectionName = current.name;
      }
      if (current.type === "PAGE" || current.type === "DOCUMENT") {
        break;
      }
      current = current.parent;
    }
    return topSectionName;
  }

  // src/engine/component/describeComponentSet.ts
  async function describeComponentSet(set, pageName, libraryName) {
    const normalizedPageName = normalizePageName(pageName);
    const variants = extractVariantList(set);
    const defaultVariant = variants.length > 0 ? variants[0].key : void 0;
    const sectionName = getSectionName(set);
    const classification = classifyComponentMeta({
      componentName: set.name,
      pageName,
      sectionName,
      libraryName
    });
    const collectStructureOptions = { preserveHiddenFills: true };
    let structure = [];
    const variantStructures = {};
    const componentVariants = set.children.filter(
      (child) => child.type === "COMPONENT"
    );
    const defaultVariantNode = defaultVariant && componentVariants.length > 0 ? componentVariants.find((child) => child.key === defaultVariant) : void 0;
    let baseVariant = defaultVariantNode != null ? defaultVariantNode : componentVariants[0];
    if (baseVariant) {
      let baseStructure = await collectComponentStructure(
        baseVariant,
        collectStructureOptions
      );
      if (!baseStructure.length) {
        for (const candidate of componentVariants) {
          if (candidate.id === baseVariant.id) continue;
          const candidateStructure = await collectComponentStructure(
            candidate,
            collectStructureOptions
          );
          if (candidateStructure.length) {
            baseVariant = candidate;
            baseStructure = candidateStructure;
            break;
          }
        }
      }
      structure = baseStructure;
      variantStructures[baseVariant.key] = [];
      if (baseStructure.length) {
        console.log("[Athena] defaultVariant base structure ready", {
          name: set.name,
          key: set.key,
          defaultVariant,
          baseKey: baseVariant.key,
          baseLength: baseStructure.length,
          page: normalizedPageName
        });
      }
    }
    for (const child of set.children) {
      if (child.type !== "COMPONENT") continue;
      if (baseVariant && child.id === baseVariant.id) continue;
      const variantStructure = await collectComponentStructure(
        child,
        collectStructureOptions
      );
      variantStructures[child.key] = buildVariantOverrides(structure, variantStructure);
    }
    return {
      key: set.key,
      name: set.name,
      page: normalizedPageName,
      category: inferCategoryFromName(set.name),
      description: set.description || "",
      variants,
      defaultVariant,
      structure,
      variantStructures,
      parentComponent: null,
      parentComponents: [],
      role: classification.role,
      status: classification.status,
      platform: classification.platform
    };
  }
  function normalizePageName(name) {
    if (!name) return "";
    return name.replace(/^[^A-Za-z0-9А-Яа-яЁё]+/, "").trim();
  }
  function buildVariantOverrides(base, variant) {
    if (base.length === 0) {
      return variant.map((node) => ({ op: "add", node: cloneNode(node) }));
    }
    const overrides = [];
    const baseMap = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
    for (const node of base) {
      baseMap.set(canonicalPath(node.path), node);
    }
    for (const node of variant) {
      const key = canonicalPath(node.path);
      const baseNode = baseMap.get(key);
      if (!baseNode) {
        overrides.push({ op: "add", node: cloneNode(node) });
        continue;
      }
      seen.add(key);
      const diff = diffNodes(baseNode, node);
      if (diff) {
        overrides.push({ op: "update", id: baseNode.id, value: diff });
      }
    }
    for (const [key, node] of baseMap.entries()) {
      if (!seen.has(key)) {
        overrides.push({ op: "remove", id: node.id });
      }
    }
    return overrides;
  }
  function diffNodes(baseNode, nextNode) {
    const patch = {};
    if (baseNode.type !== nextNode.type) patch.type = nextNode.type;
    if (baseNode.name !== nextNode.name) patch.name = nextNode.name;
    if (baseNode.visible !== nextNode.visible) patch.visible = nextNode.visible;
    if (!isEqual(baseNode.styles, nextNode.styles)) patch.styles = nextNode.styles;
    if (!isEqual(baseNode.layout, nextNode.layout)) patch.layout = nextNode.layout;
    if (!isEqual(baseNode.opacity, nextNode.opacity)) patch.opacity = nextNode.opacity;
    if (!isEqual(baseNode.opacityToken, nextNode.opacityToken)) {
      patch.opacityToken = nextNode.opacityToken;
    }
    if (!isEqual(baseNode.radius, nextNode.radius)) patch.radius = nextNode.radius;
    if (!isEqual(baseNode.radiusToken, nextNode.radiusToken)) {
      patch.radiusToken = nextNode.radiusToken;
    }
    if (!isEqual(baseNode.effects, nextNode.effects)) patch.effects = nextNode.effects;
    if (!isEqual(baseNode.fills, nextNode.fills)) patch.fills = nextNode.fills;
    if (!isEqual(baseNode.fillToken, nextNode.fillToken)) {
      patch.fillToken = nextNode.fillToken;
    }
    if (!isEqual(baseNode.strokes, nextNode.strokes)) patch.strokes = nextNode.strokes;
    if (!isEqual(baseNode.strokeToken, nextNode.strokeToken)) {
      patch.strokeToken = nextNode.strokeToken;
    }
    if (!isEqual(baseNode.strokeWeight, nextNode.strokeWeight)) {
      patch.strokeWeight = nextNode.strokeWeight;
    }
    if (!isEqual(baseNode.strokeAlign, nextNode.strokeAlign)) {
      patch.strokeAlign = nextNode.strokeAlign;
    }
    if (!isEqual(baseNode.typography, nextNode.typography)) {
      patch.typography = nextNode.typography;
    }
    if (!isEqual(baseNode.typographyToken, nextNode.typographyToken)) {
      patch.typographyToken = nextNode.typographyToken;
    }
    if (!isEqual(baseNode.componentInstance, nextNode.componentInstance)) {
      patch.componentInstance = nextNode.componentInstance;
    }
    if (!isEqual(baseNode.text, nextNode.text)) patch.text = nextNode.text;
    return Object.keys(patch).length ? patch : null;
  }
  function isEqual(a, b) {
    if (a === b) return true;
    if (a === null || a === void 0 || b === null || b === void 0) {
      return a === b;
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function cloneNode(node) {
    return JSON.parse(JSON.stringify(node));
  }
  function canonicalPath(path) {
    if (!path) return "";
    const segments = path.split(" / ");
    if (segments.length === 0) return "";
    segments[0] = "@root";
    return segments.join(" / ");
  }

  // src/engine/component/describeSingleComponent.ts
  async function describeSingleComponent(comp, pageName, libraryName) {
    const normalizedPageName = normalizePageName2(pageName);
    const sectionName = getSectionName(comp);
    const classification = classifyComponentMeta({
      componentName: comp.name,
      pageName,
      sectionName,
      libraryName
    });
    const structure = await collectComponentStructure(comp, {
      preserveHiddenFills: true
    });
    return {
      key: comp.key,
      name: comp.name,
      page: normalizedPageName,
      category: inferCategoryFromName(comp.name),
      description: comp.description || "",
      variants: [
        {
          id: comp.id,
          key: comp.key,
          name: comp.name
        }
      ],
      defaultVariant: comp.key,
      structure,
      variantStructures: { [comp.key]: [] },
      parentComponent: null,
      parentComponents: [],
      role: classification.role,
      status: classification.status,
      platform: classification.platform
    };
  }
  function normalizePageName2(name) {
    if (!name) return "";
    return name.replace(/^[^A-Za-z0-9А-Яа-яЁё]+/, "").trim();
  }

  // src/engine/component/componentParser.ts
  async function extractComponentsFromDocument() {
    await figma.loadAllPagesAsync();
    const pages = [];
    for (const child of figma.root.children) {
      if (child.type === "PAGE") {
        pages.push(child);
      }
    }
    const { components, pagesWithComponents, errors } = await collectComponentsFromPages(pages);
    notifyOnErrors(errors);
    const meta = {
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: "0.1.0",
      files: pagesWithComponents,
      scope: "document",
      fileName: figma.root.name,
      library: figma.root.name
    };
    return {
      meta,
      components,
      tokens: [],
      typography: [],
      spacing: [],
      radius: []
    };
  }
  async function extractComponentsFromCurrentPage() {
    const current = figma.currentPage;
    await current.loadAsync();
    const { components, errors, pageHasComponents } = await collectComponentsFromPage(current);
    notifyOnErrors(errors);
    const meta = {
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: "0.1.0",
      files: pageHasComponents ? [normalizePageName3(current.name)] : [],
      scope: "current-page",
      fileName: figma.root.name,
      library: figma.root.name
    };
    return {
      meta,
      components,
      tokens: [],
      typography: [],
      spacing: [],
      radius: []
    };
  }
  function buildErrorMessage(pageName, nodeName, error) {
    const reason = error instanceof Error ? error.message : "unknown component error";
    return `[Athena] \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u0430 "${nodeName}" (\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 "${pageName}"): ${reason}`;
  }
  function notifyOnErrors(errors) {
    if (errors.length === 0) return;
    const first = errors[0];
    console.warn("[Athena] component parsing errors:", errors);
    figma.notify(
      `\u041D\u0435\u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u044B \u043D\u0435 \u0432\u044B\u0433\u0440\u0443\u0436\u0435\u043D\u044B (${errors.length}). \u0421\u043C. \u043A\u043E\u043D\u0441\u043E\u043B\u044C.`,
      { timeout: 5e3 }
    );
  }
  async function collectComponentsFromPage(page) {
    resetStructureCache();
    logDebug("collect-page-start", { page: page.name });
    await page.loadAsync();
    const result = await collectComponentsFromPageInternal(page);
    assignDepthMetrics(result.components);
    logDebug("collect-page-finish", {
      page: page.name,
      components: result.components.length,
      errors: result.errors.length
    });
    return result;
  }
  async function collectComponentsFromPages(pages) {
    resetStructureCache();
    logDebug("collect-pages-start", {
      pageNames: pages.map((p) => p.name)
    });
    const components = [];
    const pagesWithComponents = /* @__PURE__ */ new Set();
    const errors = [];
    for (const page of pages) {
      await page.loadAsync();
      const pageResult = await collectComponentsFromPageInternal(page);
      components.push(...pageResult.components);
      errors.push(...pageResult.errors);
      if (pageResult.pageHasComponents) {
        pagesWithComponents.add(normalizePageName3(page.name));
      }
    }
    logDebug("collect-pages-finish", {
      totalComponents: components.length,
      totalPagesWithComponents: pagesWithComponents.size
    });
    assignDepthMetrics(components);
    return {
      components,
      pagesWithComponents: Array.from(pagesWithComponents),
      errors
    };
  }
  function assignDepthMetrics(components) {
    var _a;
    const componentsByKey = /* @__PURE__ */ new Map();
    for (const component of components) {
      if (component.key) {
        componentsByKey.set(component.key, component);
      }
      for (const variant of (_a = component.variants) != null ? _a : []) {
        if (variant.key) {
          componentsByKey.set(variant.key, component);
        }
      }
    }
    for (const component of components) {
      const structures = buildStructureSets(component);
      for (const nodes of structures) {
        processDepthNodes(nodes, component, componentsByKey);
      }
    }
  }
  function buildStructureSets(host) {
    var _a;
    const structures = [];
    if (host.structure && host.structure.length > 0) {
      structures.push(host.structure);
    }
    if (host.variantStructures) {
      for (const patches of Object.values(host.variantStructures)) {
        const variantNodes = buildStructureFromPatches((_a = host.structure) != null ? _a : [], patches);
        if (variantNodes.length > 0) {
          structures.push(variantNodes);
        }
      }
    }
    return structures;
  }
  function processDepthNodes(nodes, host, componentsByKey) {
    var _a, _b;
    if (!nodes.length) return;
    const childrenMap = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      const parentId = (_a = node.parentId) != null ? _a : null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId).push(node);
    }
    const traverse = (node, depth) => {
      var _a2, _b2, _c, _d, _e;
      const childKey = (_a2 = node.componentInstance) == null ? void 0 : _a2.componentKey;
      if (childKey) {
        const target = componentsByKey.get(childKey);
        if (target && target.role === "part") {
          (_b2 = target.depthInside) != null ? _b2 : target.depthInside = [];
          if (!target.depthInside.includes(depth)) {
            target.depthInside.push(depth);
          }
          if (typeof target.depthActual !== "number") {
            target.depthActual = depth;
          } else {
            target.depthActual = Math.min(target.depthActual, depth);
          }
          if (host.role === "main") {
            (_c = host.depthInside) != null ? _c : host.depthInside = [];
            if (!host.depthInside.includes(depth)) {
              host.depthInside.push(depth);
            }
            if (host.depth === void 0 || depth > host.depth) {
              host.depth = depth;
            }
          }
        }
      }
      const children = (_e = childrenMap.get((_d = node.id) != null ? _d : null)) != null ? _e : [];
      for (const child of children) {
        traverse(child, depth + 1);
      }
    };
    const rootNodes = (_b = childrenMap.get(null)) != null ? _b : [];
    for (const root of rootNodes) {
      traverse(root, 0);
    }
  }
  async function collectComponentsFromPageInternal(page) {
    var _a;
    const components = [];
    const errors = [];
    let pageHasComponents = false;
    const stack = [...page.children];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node.type === "COMPONENT_SET") {
        logDebug("component-set-detected", {
          page: page.name,
          name: node.name,
          id: node.id
        });
        try {
          components.push(
            await describeComponentSet(node, normalizePageName3(page.name), figma.root.name)
          );
        } catch (error) {
          const message = buildErrorMessage(page.name, node.name, error);
          console.error(message, error);
          errors.push(message);
        }
        pageHasComponents = true;
        continue;
      }
      if (node.type === "COMPONENT") {
        logDebug("component-detected", {
          page: page.name,
          name: node.name,
          id: node.id
        });
        if (!node.parent || node.parent.type !== "COMPONENT_SET") {
          try {
            components.push(
              await describeSingleComponent(node, normalizePageName3(page.name), figma.root.name)
            );
          } catch (error) {
            const message = buildErrorMessage(page.name, node.name, error);
            console.error(message, error);
            errors.push(message);
          }
          pageHasComponents = true;
        }
        continue;
      }
      if (node.type === "INSTANCE") {
        logDebug("instance-skipped", {
          page: page.name,
          name: node.name,
          id: node.id
        });
        continue;
      }
      if ("children" in node) {
        stack.push(...(_a = node.children) != null ? _a : []);
      }
    }
    logDebug("collect-page-internal-finish", {
      page: page.name,
      components: components.length,
      errors: errors.length
    });
    return { components, errors, pageHasComponents };
  }
  async function collectComponentsFromPageChunked(page, token, onProgress) {
    var _a;
    const components = [];
    const errors = [];
    let pageHasComponents = false;
    const stack = [...page.children];
    let processedNodes = 0;
    const chunkSize = 250;
    while (stack.length > 0) {
      if (token == null ? void 0 : token.aborted) {
        return { components, errors, pageHasComponents, aborted: true };
      }
      const node = stack.pop();
      if (node.type === "COMPONENT_SET") {
        logDebug("component-set-detected", {
          page: page.name,
          name: node.name,
          id: node.id
        });
        try {
          components.push(
            await describeComponentSet(node, normalizePageName3(page.name), figma.root.name)
          );
        } catch (error) {
          const message = buildErrorMessage(page.name, node.name, error);
          console.error(message, error);
          errors.push(message);
        }
        pageHasComponents = true;
        continue;
      }
      if (node.type === "COMPONENT") {
        logDebug("component-detected", {
          page: page.name,
          name: node.name,
          id: node.id
        });
        if (!node.parent || node.parent.type !== "COMPONENT_SET") {
          try {
            components.push(
              await describeSingleComponent(node, normalizePageName3(page.name), figma.root.name)
            );
          } catch (error) {
            const message = buildErrorMessage(page.name, node.name, error);
            console.error(message, error);
            errors.push(message);
          }
          pageHasComponents = true;
        }
        continue;
      }
      if (node.type === "INSTANCE") {
        logDebug("instance-skipped", {
          page: page.name,
          name: node.name,
          id: node.id
        });
        continue;
      }
      if ("children" in node) {
        stack.push(...(_a = node.children) != null ? _a : []);
      }
      processedNodes += 1;
      if (processedNodes % chunkSize === 0) {
        onProgress == null ? void 0 : onProgress(processedNodes);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    onProgress == null ? void 0 : onProgress(processedNodes);
    logDebug("collect-page-internal-finish", {
      page: page.name,
      components: components.length,
      errors: errors.length
    });
    return {
      components,
      errors,
      pageHasComponents,
      aborted: Boolean(token == null ? void 0 : token.aborted)
    };
  }
  function normalizePageName3(name) {
    if (!name) return "";
    return name.replace(/^[^A-Za-z0-9А-Яа-яЁё]+/, "").trim();
  }
  function buildStructureFromPatches(base, patches) {
    const nodes = base.map(cloneNode2);
    const nodeMap = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }
    if (!patches || patches.length === 0) {
      return nodes;
    }
    for (const patch of patches) {
      switch (patch.op) {
        case "update": {
          const target = nodeMap.get(patch.id);
          if (target) {
            Object.assign(target, patch.value);
          }
          break;
        }
        case "remove": {
          nodeMap.delete(patch.id);
          const index = nodes.findIndex((node) => node.id === patch.id);
          if (index !== -1) {
            nodes.splice(index, 1);
          }
          break;
        }
        case "add": {
          const copy = cloneNode2(patch.node);
          nodes.push(copy);
          nodeMap.set(copy.id, copy);
          break;
        }
      }
    }
    return nodes;
  }
  function cloneNode2(node) {
    return JSON.parse(JSON.stringify(node));
  }

  // src/exportSanitizer.ts
  function sanitizeExportPayload(data) {
    const sanitizedComponents = data.components.map((component) => {
      const sanitizedComponent = Object.assign({}, component, {
        structure: component.structure.map(trimStructureNode),
        variantStructures: component.variantStructures ? sanitizeVariantStructures(component.variantStructures) : void 0
      });
      delete sanitizedComponent.parentComponent;
      delete sanitizedComponent.parentComponents;
      return sanitizedComponent;
    });
    return Object.assign({}, data, { components: sanitizedComponents });
  }
  function sanitizeVariantStructures(variants) {
    const result = {};
    for (const key in variants) {
      const patches = variants[key];
      result[key] = patches.map(trimVariantPatch);
    }
    return result;
  }
  function trimVariantPatch(patch) {
    if (patch.op === "update") {
      return Object.assign({}, patch, {
        value: trimPatchValue(patch.value)
      });
    }
    if (patch.op === "add") {
      return Object.assign({}, patch, {
        node: trimStructureNode(patch.node)
      });
    }
    return patch;
  }
  function trimPatchValue(value) {
    const trimmed = {};
    if ("id" in value) trimmed.id = value.id;
    if ("path" in value) trimmed.path = value.path;
    if ("type" in value) trimmed.type = value.type;
    if ("name" in value) trimmed.name = value.name;
    if ("visible" in value) trimmed.visible = value.visible;
    if ("styles" in value) trimmed.styles = value.styles;
    if ("layout" in value) trimmed.layout = value.layout;
    if ("opacity" in value) trimmed.opacity = value.opacity;
    if ("opacityToken" in value) trimmed.opacityToken = value.opacityToken;
    if ("radius" in value) trimmed.radius = value.radius;
    if ("radiusToken" in value) trimmed.radiusToken = value.radiusToken;
    if ("effects" in value) trimmed.effects = value.effects;
    if ("componentInstance" in value) {
      trimmed.componentInstance = value.componentInstance;
    }
    if ("text" in value) trimmed.text = value.text;
    if ("fills" in value) trimmed.fills = value.fills;
    if ("fillToken" in value) trimmed.fillToken = value.fillToken;
    if ("strokes" in value) trimmed.strokes = value.strokes;
    if ("strokeToken" in value) trimmed.strokeToken = value.strokeToken;
    if ("strokeWeight" in value) trimmed.strokeWeight = value.strokeWeight;
    if ("strokeAlign" in value) trimmed.strokeAlign = value.strokeAlign;
    if ("typography" in value) trimmed.typography = value.typography;
    if ("typographyToken" in value) trimmed.typographyToken = value.typographyToken;
    return trimmed;
  }
  function trimStructureNode(node) {
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
      componentInstance: node.componentInstance
    };
  }

  // src/pagedExport.ts
  function createPagedExportController(sendExportResult2) {
    let pagedSession = null;
    let sessionCounter = 0;
    let exportCancelToken = null;
    async function startFromCurrentPage() {
      const pages = getPagesStartingFromCurrentPage();
      if (pages.length === 0) {
        const data = await extractComponentsFromCurrentPage();
        await sendExportResult2("CURRENT PAGE", data);
        return;
      }
      startPagedExport(pages, false, "current-page");
    }
    async function startFromDocument() {
      const pages = getAllPages();
      if (pages.length === 0) {
        const data = await extractComponentsFromDocument();
        await sendExportResult2("ALL", data);
        return;
      }
      startPagedExport(pages, true, "document");
    }
    function startPagedExport(pages, autoContinue, scope) {
      sessionCounter += 1;
      pagedSession = {
        id: sessionCounter,
        totalPages: pages.length,
        pendingPages: [...pages],
        processedPages: 0,
        errors: [],
        autoContinue
      };
      exportCancelToken = { aborted: false };
      logDebug("paged-export-start", {
        sessionId: sessionCounter,
        totalPages: pages.length,
        autoContinue,
        scope
      });
      void processNextPage();
    }
    function getPagesStartingFromCurrentPage() {
      const pages = [];
      for (const child of figma.root.children) {
        if (child.type === "PAGE") {
          pages.push(child);
        }
      }
      if (pages.length === 0) return [];
      const current = figma.currentPage;
      const index = pages.findIndex((page) => page.id === current.id);
      if (index <= 0) return pages;
      return pages.slice(index).concat(pages.slice(0, index));
    }
    function getAllPages() {
      const pages = [];
      for (const child of figma.root.children) {
        if (child.type === "PAGE") {
          pages.push(child);
        }
      }
      return pages;
    }
    function cancel() {
      if (exportCancelToken) {
        exportCancelToken.aborted = true;
        exportCancelToken = null;
      }
      pagedSession = null;
      figma.ui.postMessage({ type: "export-cancelled" });
    }
    function continueExport() {
      if (!pagedSession) return;
      void processNextPage();
    }
    async function processNextPage() {
      if (!pagedSession) return;
      const session = pagedSession;
      if (session.pendingPages.length === 0) {
        finalizePagedExport();
        return;
      }
      const page = session.pendingPages.shift();
      await page.loadAsync();
      console.log(
        "[CODE] processing page",
        page.name,
        "processed",
        session.processedPages
      );
      logDebug("paged-page-start", {
        page: page.name,
        remaining: session.pendingPages.length,
        processed: session.processedPages
      });
      const { components, errors, pageHasComponents, aborted } = await collectComponentsFromPageChunked(
        page,
        exportCancelToken,
        (processedNodes) => {
          figma.ui.postMessage({
            type: "export-progress",
            payload: {
              sessionId: session.id,
              pageName: normalizePageName4(page.name),
              processedNodes,
              completedPages: session.processedPages,
              totalPages: session.totalPages
            }
          });
        }
      );
      if (aborted) {
        console.log("[CODE] paged export aborted");
        finalizePagedExport();
        return;
      }
      logDebug("paged-page-result", {
        page: page.name,
        components: components.length,
        errors: errors.length
      });
      session.errors.push(...errors);
      session.processedPages += 1;
      const normalizedPageName = normalizePageName4(page.name);
      const pageExport = buildPageExport(page, components, pageHasComponents);
      const hasMore = session.pendingPages.length > 0;
      sendPagedProgress(pageExport, hasMore, normalizedPageName);
      if (!hasMore) {
        finalizePagedExport();
        return;
      }
      if (session.autoContinue) {
        setTimeout(() => {
          void processNextPage();
        }, 0);
      }
    }
    function buildPageExport(page, components, pageHasComponents) {
      const normalizedPageName = normalizePageName4(page.name);
      return {
        meta: {
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          version: "0.1.0",
          files: pageHasComponents ? [normalizedPageName] : [],
          scope: "current-page",
          fileName: figma.root.name,
          library: figma.root.name
        },
        components,
        tokens: [],
        typography: [],
        spacing: [],
        radius: []
      };
    }
    function sendPagedProgress(pageExport, hasMore, currentPage) {
      if (!pagedSession) return;
      const session = pagedSession;
      const sanitized = sanitizeExportPayload(pageExport);
      const json = JSON.stringify(sanitized, null, 2);
      figma.ui.postMessage({
        type: "export-result",
        payload: {
          json,
          data: sanitized,
          mode: "paged",
          pageName: normalizePageName4(currentPage),
          progress: {
            completed: session.processedPages,
            total: session.totalPages,
            hasMore,
            autoContinue: session.autoContinue,
            currentPage
          }
        }
      });
    }
    function finalizePagedExport() {
      if (!pagedSession) return;
      const session = pagedSession;
      notifyPagedErrors(session.errors);
      logDebug("paged-export-finished", {
        processedPages: session.processedPages,
        errors: session.errors.length
      });
      pagedSession = null;
    }
    function notifyPagedErrors(errors) {
      if (errors.length === 0) return;
      console.warn("[Athena] component parsing errors:", errors);
      figma.notify(
        `\u041D\u0435\u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u044B \u043D\u0435 \u0432\u044B\u0433\u0440\u0443\u0436\u0435\u043D\u044B (${errors.length}). \u0421\u043C. \u043A\u043E\u043D\u0441\u043E\u043B\u044C.`,
        { timeout: 5e3 }
      );
    }
    function normalizePageName4(name) {
      if (!name) return "";
      return name.replace(/^[^A-Za-z0-9А-Яа-яЁё]+/, "").trim();
    }
    return {
      startFromCurrentPage,
      startFromDocument,
      continue: continueExport,
      cancel
    };
  }

  // src/nameUtils.ts
  function splitVariableName(rawName) {
    if (!rawName) {
      return { groupName: "\u0411\u0435\u0437 \u0433\u0440\u0443\u043F\u043F\u044B", tokenName: "\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F" };
    }
    const trimmed = rawName.trim();
    if (!trimmed) {
      return { groupName: "\u0411\u0435\u0437 \u0433\u0440\u0443\u043F\u043F\u044B", tokenName: "\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F" };
    }
    const parts = trimmed.split("/");
    if (parts.length <= 1) {
      return { groupName: "\u0411\u0435\u0437 \u0433\u0440\u0443\u043F\u043F\u044B", tokenName: trimmed };
    }
    return {
      groupName: parts[0] || "\u0411\u0435\u0437 \u0433\u0440\u0443\u043F\u043F\u044B",
      tokenName: parts.slice(1).join("/") || "\u0411\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F"
    };
  }

  // src/tokenExport.ts
  async function collectTokensFromFile() {
    if (!figma.variables) {
      throw new Error("Variables API not \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0432 \u044D\u0442\u043E\u043C \u0444\u0430\u0439\u043B\u0435");
    }
    const [collections, variables] = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync()
    ]);
    const variableById = /* @__PURE__ */ new Map();
    variables.forEach((variable) => {
      variableById.set(variable.id, variable);
    });
    const resolver = createVariableValueResolver(variableById);
    const collectionExports = await Promise.all(
      collections.map(async (collection) => {
        const collectionVariables = collection.variableIds.map((id) => variableById.get(id)).filter((variable) => Boolean(variable));
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
            name: mode.name
          })),
          variables: await Promise.all(
            collectionVariables.map(
              (variable) => serializeVariable(
                variable,
                resolver,
                collection.name || collection.key
              )
            )
          )
        };
      })
    );
    return {
      meta: {
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        fileName: figma.root.name,
        library: figma.root.name
      },
      collections: collectionExports
    };
  }
  async function serializeVariable(variable, resolver, collectionName) {
    const rawName = variable.name || variable.key;
    const nameParts = splitVariableName(rawName);
    const originalValues = copyValuesByMode(variable.valuesByMode);
    const resolutions = await resolveValuesByMode(originalValues, resolver);
    const actualValuesByMode = {};
    const actualHexByMode = {};
    const resolutionByMode = {};
    for (const modeId of Object.keys(resolutions)) {
      const resolution = resolutions[modeId];
      actualValuesByMode[modeId] = resolution.values;
      actualHexByMode[modeId] = uniqueStrings(
        resolution.values.map((value) => convertValueToHex(value)).filter((value) => Boolean(value))
      );
      resolutionByMode[modeId] = {
        status: resolution.status,
        aliasIds: resolution.aliasIds,
        unresolvedAliasIds: resolution.unresolvedAliasIds
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
      collectionName: collectionName || "\u0411\u0435\u0437 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438",
      groupName: nameParts.groupName,
      tokenName: nameParts.tokenName
    };
  }
  function createVariableValueResolver(localVariables) {
    const variablePromises = /* @__PURE__ */ new Map();
    const loadVariable = (aliasId) => {
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
    const resolve = async (value, preferredModeId, visitedAliasIds = /* @__PURE__ */ new Set()) => {
      if (!isVariableAlias(value)) {
        return {
          status: value === void 0 ? "unresolved" : "resolved",
          values: value === void 0 ? [] : [value],
          aliasIds: [],
          unresolvedAliasIds: []
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
        preferredModeId
      ) ? [preferredModeId] : Object.keys(targetValues);
      if (!targetModeIds.length) {
        return unresolvedResolution(value.id);
      }
      const nested = await Promise.all(
        targetModeIds.map(
          (modeId) => resolve(targetValues[modeId], modeId, nextVisited)
        )
      );
      return mergeResolutions(value.id, nested);
    };
    return resolve;
  }
  async function resolveValuesByMode(values, resolver) {
    const entries = await Promise.all(
      Object.keys(values).map(async (modeId) => [
        modeId,
        await resolver(values[modeId], modeId)
      ])
    );
    const result = {};
    for (const [modeId, resolution] of entries) {
      result[modeId] = resolution;
    }
    return result;
  }
  function mergeResolutions(aliasId, nested) {
    const values = uniqueConcreteValues(
      nested.flatMap((resolution) => resolution.values)
    );
    const unresolvedAliasIds = uniqueStrings(
      nested.flatMap((resolution) => resolution.unresolvedAliasIds)
    );
    const hasUnresolved = nested.some(
      (resolution) => resolution.status !== "resolved"
    );
    return {
      status: values.length ? hasUnresolved ? "partial" : "resolved" : "unresolved",
      values,
      aliasIds: uniqueStrings([
        aliasId,
        ...nested.flatMap((resolution) => resolution.aliasIds)
      ]),
      unresolvedAliasIds
    };
  }
  function unresolvedResolution(aliasId) {
    return {
      status: "unresolved",
      values: [],
      aliasIds: [aliasId],
      unresolvedAliasIds: [aliasId]
    };
  }
  function uniqueConcreteValues(values) {
    const result = [];
    const seen = /* @__PURE__ */ new Set();
    for (const value of values) {
      const key = JSON.stringify(value);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  }
  function uniqueStrings(values) {
    return Array.from(new Set(values));
  }
  function copyCodeSyntax(codeSyntax) {
    const platforms = ["WEB", "ANDROID", "iOS"];
    const result = {
      WEB: void 0,
      ANDROID: void 0,
      iOS: void 0
    };
    platforms.forEach((platform) => {
      if (codeSyntax && codeSyntax[platform]) {
        result[platform] = codeSyntax[platform];
      }
    });
    return result;
  }
  function copyValuesByMode(values) {
    const result = {};
    if (!values) return result;
    for (const key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        result[key] = values[key];
      }
    }
    return result;
  }
  function buildUniqueHexMap(values) {
    const result = {};
    for (const modeId in values) {
      if (!Object.prototype.hasOwnProperty.call(values, modeId)) continue;
      result[modeId] = values[modeId].length === 1 ? values[modeId][0] : void 0;
    }
    return result;
  }
  function convertValueToHex(value) {
    if (!value || typeof value !== "object") return void 0;
    const color = value;
    const hasRgb = typeof color.r === "number" && typeof color.g === "number" && typeof color.b === "number";
    if (!hasRgb) return void 0;
    const r = clampColorComponent2(color.r);
    const g = clampColorComponent2(color.g);
    const b = clampColorComponent2(color.b);
    const alpha = "a" in color ? clampColorComponent2(color.a) : 255;
    return "#" + toHex2(r) + toHex2(g) + toHex2(b) + (alpha < 255 ? toHex2(alpha) : "");
  }
  function clampColorComponent2(value) {
    const normalized = typeof value === "number" ? value : 0;
    const scaled = Math.round(normalized * 255);
    return Math.max(0, Math.min(255, scaled));
  }
  function toHex2(component) {
    const hex = component.toString(16).toUpperCase();
    return hex.length === 1 ? "0" + hex : hex;
  }
  function isVariableAlias(value) {
    if (!value || typeof value !== "object") return false;
    return value.type === "VARIABLE_ALIAS";
  }
  function extractAliasKey(aliasId) {
    if (!aliasId) return null;
    const withoutPrefix = aliasId.replace(/^VariableID:/, "");
    const [key] = withoutPrefix.split("/");
    return key || null;
  }

  // src/styleExport.ts
  async function collectStylesFromDocument() {
    const [effectStyles, textStyles, paintStyles] = await Promise.all([
      figma.getLocalEffectStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalPaintStylesAsync()
    ]);
    const entries = [];
    for (const style of effectStyles) {
      const nameParts = splitVariableName(style.name);
      const group = nameParts.groupName;
      const baseName = nameParts.tokenName || style.name;
      const effects = Array.isArray(style.effects) ? style.effects : [];
      for (const effect of effects) {
        entries.push({
          key: style.key,
          name: baseName,
          group,
          type: formatEffectType(effect.type),
          value: { kind: "effect", data: effect }
        });
      }
    }
    for (const style of textStyles) {
      const nameParts = splitVariableName(style.name);
      const group = nameParts.groupName;
      const baseName = nameParts.tokenName || style.name;
      entries.push({
        key: style.key,
        name: baseName,
        group,
        type: "text",
        value: { kind: "text", data: describeTextStyle(style) }
      });
    }
    for (const style of paintStyles) {
      const nameParts = splitVariableName(style.name);
      const group = nameParts.groupName;
      const baseName = nameParts.tokenName || style.name;
      entries.push({
        key: style.key,
        name: baseName,
        group,
        type: "paint",
        value: { kind: "paint", data: describePaintStyle(style) }
      });
    }
    return {
      meta: {
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        fileName: figma.root.name,
        library: figma.root.name
      },
      styles: entries
    };
  }
  function formatEffectType(type) {
    return type.toLowerCase().replace("_", " ");
  }
  function describeTextStyle(style) {
    const fontName = style.fontName;
    const fontLabel = fontName && fontName !== figma.mixed ? `${fontName.family} ${fontName.style}`.trim() : "\u2014";
    const fontSize = style.fontSize !== figma.mixed && typeof style.fontSize === "number" ? style.fontSize : null;
    const lineHeight = style.lineHeight !== figma.mixed && style.lineHeight ? formatLineHeight(style.lineHeight) : null;
    const letterSpacing = style.letterSpacing !== figma.mixed && style.letterSpacing ? formatLetterSpacing(style.letterSpacing) : null;
    return {
      fontName: fontLabel === "\u2014" ? null : fontLabel,
      fontSize,
      lineHeight,
      letterSpacing
    };
  }
  function describePaintStyle(style) {
    const paints = Array.isArray(style.paints) ? style.paints : [];
    return {
      paints: paints.map(serializePaintValue).filter(Boolean)
    };
  }
  function serializePaintValue(paint) {
    if (!paint) return null;
    if (paint.type === "SOLID") {
      const color = colorToString(paint.color);
      const opacity = typeof paint.opacity === "number" ? paint.opacity : void 0;
      return {
        type: "solid",
        color,
        opacity
      };
    }
    return {
      type: paint.type.toLowerCase().replace("_", " ")
    };
  }
  function formatLineHeight(lineHeight) {
    if (lineHeight.unit === "AUTO") return "auto";
    if (lineHeight.unit === "PIXELS") return formatNumber(lineHeight.value);
    if (lineHeight.unit === "PERCENT") return formatNumber(lineHeight.value) + "%";
    return String(lineHeight.value);
  }
  function formatLetterSpacing(letterSpacing) {
    if (letterSpacing.unit === "PIXELS") return formatNumber(letterSpacing.value);
    if (letterSpacing.unit === "PERCENT") {
      return formatNumber(letterSpacing.value) + "%";
    }
    return String(letterSpacing.value);
  }
  function formatNumber(value) {
    return Number.isFinite(value) ? value.toFixed(2) : String(value);
  }
  function colorToString(color) {
    const r = clampColorComponent3(color.r);
    const g = clampColorComponent3(color.g);
    const b = clampColorComponent3(color.b);
    const alpha = typeof color.a === "number" ? color.a : typeof color.alpha === "number" ? color.alpha : 1;
    const rgba = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
    return "#" + toHex3(r) + toHex3(g) + toHex3(b) + " / " + rgba;
  }
  function clampColorComponent3(value) {
    const normalized = typeof value === "number" ? value : 0;
    const scaled = Math.round(normalized * 255);
    return Math.max(0, Math.min(255, scaled));
  }
  function toHex3(component) {
    const hex = component.toString(16).toUpperCase();
    return hex.length === 1 ? "0" + hex : hex;
  }

  // src/code.ts
  console.log("[CODE] plugin loaded");
  logDebug("plugin-loaded");
  figma.showUI(__html__, { width: 1280, height: 720 });
  console.log("[CODE] UI shown");
  logDebug("ui-shown", { width: 1280, height: 720 });
  var pagedExport = createPagedExportController(sendExportResult);
  var GITHUB_OWNER = "ackedze";
  var GITHUB_REPO = "design-system_ab";
  var REFERENCE_SOURCES_PATH = "JSONS/referenceSourcesMVP.json";
  var WEB_CORP_COMPONENTS_PATH = "JSONS/web/components/web-corp";
  var APOLLO_RULES_REGISTRY_FILE = "apollo-rules-registry.json";
  figma.ui.onmessage = (msg) => {
    console.log("[CODE] received message from UI:", msg);
    logDebug("ui-message", msg);
    if (msg.type === "test") {
      console.log("[CODE] test message received, sending echo");
      figma.ui.postMessage({
        type: "echo",
        payload: { received: msg }
      });
      return;
    }
    if (msg.type === "export-components") {
      console.log("[CODE] starting paged export for document");
      logDebug("export-components-request");
      pagedExport.cancel();
      void pagedExport.startFromDocument();
      return;
    }
    if (msg.type === "export-components-current-page") {
      console.log("[CODE] starting paged export from current page");
      logDebug("export-current-page-request");
      pagedExport.cancel();
      void pagedExport.startFromCurrentPage();
      return;
    }
    if (msg.type === "export-components-continue") {
      console.log("[CODE] continuing paged export");
      logDebug("export-components-continue-request");
      pagedExport.continue();
      return;
    }
    if (msg.type === "cancel-export") {
      console.log("[CODE] cancel paged export");
      pagedExport.cancel();
      return;
    }
    if (msg.type === "collect-tokens") {
      console.log("[CODE] collecting tokens");
      logDebug("collect-tokens-request");
      collectTokensAndSend();
      return;
    }
    if (msg.type === "collect-styles") {
      console.log("[CODE] collecting styles");
      logDebug("collect-styles-request");
      collectStylesAndSend();
      return;
    }
    if (msg.type === "publish-with-token") {
      console.log("[CODE] publishing catalog with token from UI");
      const token = msg.token;
      const payload = msg.payload;
      if (!token || !payload) {
        console.error("[CODE] missing token or payload");
        return;
      }
      void publishWithToken(payload, token);
      return;
    }
  };
  function sendExportResult(scope, data) {
    const sanitized = sanitizeExportPayload(data);
    const json = JSON.stringify(sanitized, null, 2);
    console.log(`[CODE] sending export-result (${scope}). length =`, json.length);
    logDebug("send-export", {
      scope,
      components: data.components.length,
      meta: data.meta
    });
    figma.ui.postMessage({
      type: "export-result",
      payload: { json, data: sanitized, mode: "full" }
    });
  }
  async function collectTokensAndSend() {
    try {
      const payload = await collectTokensFromFile();
      const json = JSON.stringify(payload, null, 2);
      logDebug("collect-tokens-result", {
        collections: payload.collections.length
      });
      figma.ui.postMessage({
        type: "collect-tokens-result",
        payload: { json, data: payload }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430";
      console.error("[CODE] failed to collect tokens", error);
      logDebug("collect-tokens-error", { error: message });
      figma.notify(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0431\u0440\u0430\u0442\u044C \u0442\u043E\u043A\u0435\u043D\u044B: ${message}`, { timeout: 5e3 });
    }
  }
  async function collectStylesAndSend() {
    try {
      const payload = await collectStylesFromDocument();
      const json = JSON.stringify(payload, null, 2);
      logDebug("collect-styles-result", {
        styles: payload.styles.length
      });
      figma.ui.postMessage({
        type: "collect-styles-result",
        payload: { json, data: payload }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430";
      console.error("[CODE] failed to collect styles", error);
      logDebug("collect-styles-error", { error: message });
      figma.notify(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0431\u0440\u0430\u0442\u044C \u0441\u0442\u0438\u043B\u0438: ${message}`, { timeout: 5e3 });
    }
  }
  function stringToBase64(str) {
    const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(str) : Uint8Array.from(
      unescape(encodeURIComponent(str)).split("").map((char) => char.charCodeAt(0))
    );
    try {
      if (typeof btoa !== "undefined") {
        let binary = "";
        const chunkSize = 32768;
        for (let index = 0; index < bytes.length; index += chunkSize) {
          const chunk = bytes.subarray(index, index + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
      }
    } catch (error) {
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    let i = 0;
    while (i < bytes.length) {
      const a = bytes[i++];
      const hasB = i < bytes.length;
      const b = hasB ? bytes[i++] : 0;
      const hasC = i < bytes.length;
      const c = hasC ? bytes[i++] : 0;
      const bitmap = a << 16 | b << 8 | c;
      result += chars.charAt(bitmap >> 18 & 63);
      result += chars.charAt(bitmap >> 12 & 63);
      result += hasB ? chars.charAt(bitmap >> 6 & 63) : "=";
      result += hasC ? chars.charAt(bitmap & 63) : "=";
    }
    return result;
  }
  function buildGitHubAuthError() {
    return '\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u0438. GitHub token \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u044B\u043C, \u0438\u0441\u0442\u0451\u043A\u0448\u0438\u043C \u0438\u043B\u0438 \u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u044B\u043C\u0438 \u043F\u0440\u0430\u0432\u0430\u043C\u0438. \u041F\u043E\u043B\u0443\u0447\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 token \u043D\u0430 https://github.com/settings/tokens \u0441 scope "repo"';
  }
  function buildGitHubAccessError() {
    return "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435, \u0447\u0442\u043E \u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u0440\u0435\u043F\u043E\u0437\u0438\u0442\u043E\u0440\u0438\u044E ackedze/design-system_ab";
  }
  function base64ToString(value) {
    const normalized = value.replace(/\s+/g, "");
    let bytes;
    if (typeof atob !== "undefined") {
      const binary2 = atob(normalized);
      bytes = Uint8Array.from(binary2, (char) => char.charCodeAt(0));
    } else {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      const decodedBytes = [];
      let i = 0;
      while (i < normalized.length) {
        const enc1 = chars.indexOf(normalized.charAt(i++));
        const enc2 = chars.indexOf(normalized.charAt(i++));
        const enc3 = chars.indexOf(normalized.charAt(i++));
        const enc4 = chars.indexOf(normalized.charAt(i++));
        const chr1 = enc1 << 2 | enc2 >> 4;
        const chr2 = (enc2 & 15) << 4 | enc3 >> 2;
        const chr3 = (enc3 & 3) << 6 | enc4;
        decodedBytes.push(chr1);
        if (enc3 !== 64) {
          decodedBytes.push(chr2);
        }
        if (enc4 !== 64) {
          decodedBytes.push(chr3);
        }
      }
      bytes = Uint8Array.from(decodedBytes);
    }
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(bytes);
    }
    let binary = "";
    const chunkSize = 32768;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return decodeURIComponent(escape(binary));
  }
  function extractFigmaFileKey(link) {
    if (!link) return void 0;
    const match = link.match(/figma\.com\/(?:design|file)\/([^/?#]+)/i);
    return match == null ? void 0 : match[1];
  }
  function resolveReferenceSourceFileKey(source) {
    if (!source) return void 0;
    return source.fileKey || extractFigmaFileKey(source.figmaLibLink) || extractFigmaFileKey(source.figmaPageLink) || extractFigmaFileKey(source.figmaLink);
  }
  function resolveCurrentFileKey(meta) {
    if (typeof (meta == null ? void 0 : meta.fileKey) === "string" && meta.fileKey.trim()) {
      return meta.fileKey.trim();
    }
    const linkFileKey = typeof (meta == null ? void 0 : meta.figmaLink) === "string" ? extractFigmaFileKey(meta.figmaLink) : void 0;
    if (linkFileKey) {
      return linkFileKey;
    }
    return figma.fileKey;
  }
  function normalizeMatchKey(value) {
    return (value != null ? value : "").trim().toLowerCase();
  }
  function normalizeLooseMatchKey(value) {
    return (value != null ? value : "").replace(/\.json$/i, "").trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-+|-+$/g, "");
  }
  function normalizeRepoPath(value) {
    return value.replace(/^\/+/, "").trim();
  }
  function readString(value) {
    if (typeof value !== "string") {
      return void 0;
    }
    const trimmed = value.trim();
    return trimmed || void 0;
  }
  function stripJsonExtension(value) {
    return value.replace(/\.json$/i, "");
  }
  function sanitizeRepoFileName(value, fallback) {
    const normalized = stripJsonExtension(getPathBaseName(value)).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
    return normalized || fallback;
  }
  function getRepoDirectory(value) {
    if (!value) {
      return "";
    }
    const normalized = normalizeRepoPath(value).replace(/\\/g, "/");
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex === -1 ? "" : normalized.slice(0, slashIndex);
  }
  function getManifestPublishRoot() {
    const normalizedPath = normalizeRepoPath(REFERENCE_SOURCES_PATH);
    const lastSlashIndex = normalizedPath.lastIndexOf("/");
    if (lastSlashIndex === -1) {
      return normalizedPath;
    }
    return normalizedPath.slice(0, lastSlashIndex);
  }
  function resolvePublishRootFromBaseUrl(baseUrl) {
    const manifestRoot = getManifestPublishRoot();
    if (!baseUrl) return manifestRoot;
    try {
      const url = new URL(baseUrl);
      const segments = url.pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
      if (segments.length > 0 && normalizeMatchKey(segments[0]) === GITHUB_REPO) {
        segments.shift();
      }
      const parsedRoot = normalizeRepoPath(segments.join("/"));
      return parsedRoot || manifestRoot;
    } catch (error) {
      return manifestRoot;
    }
  }
  function joinRepoPath(root, relativePath) {
    const normalizedRoot = normalizeRepoPath(root);
    const normalizedPath = normalizeRepoPath(relativePath);
    if (!normalizedRoot) {
      return normalizedPath;
    }
    if (normalizeMatchKey(normalizedPath) === normalizeMatchKey(normalizedRoot) || normalizeMatchKey(normalizedPath).startsWith(
      normalizeMatchKey(normalizedRoot) + "/"
    )) {
      return normalizedPath;
    }
    return `${normalizedRoot}/${normalizedPath}`;
  }
  function getPathBaseName(value) {
    var _a;
    if (!value) return "";
    const normalized = value.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return (_a = parts[parts.length - 1]) != null ? _a : normalized;
  }
  function matchesReferenceEntry(entry, target) {
    const source = entry.source;
    if (!source || !target.kind) return false;
    if (source.kind !== target.kind) return false;
    const entryFileKey = resolveReferenceSourceFileKey(source);
    if (entryFileKey && target.fileKey && normalizeMatchKey(entryFileKey) !== normalizeMatchKey(target.fileKey)) {
      return false;
    }
    const entryBaseName = getPathBaseName(entry.path || entry.fileName);
    const entryFileName = getPathBaseName(entry.fileName);
    const nameMatches = normalizeLooseMatchKey(entryBaseName) === normalizeLooseMatchKey(target.catalogName) || normalizeLooseMatchKey(entryFileName) === normalizeLooseMatchKey(target.catalogName);
    if (target.kind === "components") {
      const pageMatches = normalizeLooseMatchKey(source.pageName) === normalizeLooseMatchKey(target.pageName);
      if (pageMatches || nameMatches) {
        return true;
      }
      return false;
    }
    if (nameMatches) {
      return true;
    }
    return Boolean(entryFileKey && target.fileKey);
  }
  function normalizeReferenceCatalogEntries(referenceList) {
    if (!referenceList) {
      return [];
    }
    const flatCatalogs = Array.isArray(referenceList.catalogs) ? referenceList.catalogs : [];
    const libraryCatalogs = [];
    if (Array.isArray(referenceList.libraries)) {
      referenceList.libraries.forEach((library) => {
        const catalogs = Array.isArray(library.catalogs) ? library.catalogs : [];
        catalogs.forEach((entry) => {
          libraryCatalogs.push(
            Object.assign({}, entry, {
              source: Object.assign({}, library.source || {}, entry.source || {})
            })
          );
        });
      });
    }
    return flatCatalogs.concat(libraryCatalogs);
  }
  function createEmptyReferenceCatalogList() {
    return {
      baseUrl: `https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/JSONS/`,
      libraries: []
    };
  }
  async function fetchReferenceCatalogFile(githubToken) {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${REFERENCE_SOURCES_PATH}`;
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (response.status === 404) {
      return { list: null };
    }
    if (response.status === 401) {
      throw new Error(buildGitHubAuthError());
    }
    if (response.status === 403) {
      throw new Error(buildGitHubAccessError());
    }
    if (!response.ok) {
      throw new Error(
        `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C referenceSourcesMVP.json: ${response.status} ${response.statusText}`
      );
    }
    const payload = await response.json();
    if (!payload.content) {
      return { list: null, sha: payload.sha };
    }
    return {
      list: JSON.parse(base64ToString(payload.content)),
      sha: payload.sha
    };
  }
  async function putReferenceCatalogList(referenceList, sha, githubToken, catalogName) {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${REFERENCE_SOURCES_PATH}`;
    const requestBody = {
      message: `Register design system catalog: ${stripJsonExtension(catalogName)}`,
      content: stringToBase64(`${JSON.stringify(referenceList, null, 2)}
`)
    };
    if (sha) {
      requestBody.sha = sha;
    }
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errorData = await response.json();
      let errorMessage = errorData.message || response.statusText;
      if (response.status === 401) {
        errorMessage = buildGitHubAuthError();
      } else if (response.status === 403) {
        errorMessage = buildGitHubAccessError();
      } else if (response.status === 409) {
        errorMessage = "referenceSourcesMVP.json \u0431\u044B\u043B \u0438\u0437\u043C\u0435\u043D\u0451\u043D \u043F\u0430\u0440\u0430\u043B\u043B\u0435\u043B\u044C\u043D\u043E. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u044E, \u0447\u0442\u043E\u0431\u044B Athena \u043F\u043E\u0434\u0442\u044F\u043D\u0443\u043B\u0430 \u0441\u0432\u0435\u0436\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E.";
      }
      throw new Error(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C referenceSourcesMVP.json: ${errorMessage}`);
    }
  }
  function findReferenceLibrary(referenceList, target) {
    var _a, _b, _c;
    if (!Array.isArray(referenceList.libraries)) {
      referenceList.libraries = [];
    }
    const libraryName = readString((_a = target.meta) == null ? void 0 : _a.library) || readString((_b = target.meta) == null ? void 0 : _b.fileName) || sanitizeRepoFileName(target.catalogName, "library");
    const normalizedLibraryName = normalizeLooseMatchKey(libraryName);
    const libraryByFileKey = referenceList.libraries.find((library2) => {
      const libraryFileKey = resolveReferenceSourceFileKey(library2.source);
      return libraryFileKey && target.fileKey && normalizeMatchKey(libraryFileKey) === normalizeMatchKey(target.fileKey);
    });
    if (libraryByFileKey) {
      return libraryByFileKey;
    }
    const libraryByName = referenceList.libraries.filter((library2) => normalizeLooseMatchKey(library2.name) === normalizedLibraryName).sort((a, b) => scoreReferenceLibrary(b) - scoreReferenceLibrary(a))[0];
    if (libraryByName) {
      return libraryByName;
    }
    const source = {};
    const figmaLink = readString((_c = target.meta) == null ? void 0 : _c.figmaLink);
    if (figmaLink) {
      source.figmaLibLink = figmaLink;
    }
    if (target.fileKey) {
      source.fileKey = target.fileKey;
    }
    const library = {
      name: libraryName,
      source,
      catalogs: []
    };
    referenceList.libraries.push(library);
    return library;
  }
  function scoreReferenceLibrary(library) {
    const catalogCount = Array.isArray(library.catalogs) ? library.catalogs.length : 0;
    const hasSource = library.source && Object.keys(library.source).length > 0;
    return catalogCount + (hasSource ? 1e3 : 0);
  }
  function inferCatalogDirectory(referenceList, library, kind) {
    if (kind === "tokens") {
      return "tokens";
    }
    if (kind === "styles") {
      return "styles";
    }
    const normalizedLibraryName = normalizeLooseMatchKey(library.name);
    const libraries = Array.isArray(referenceList.libraries) ? referenceList.libraries.filter(
      (candidate) => normalizeLooseMatchKey(candidate.name) === normalizedLibraryName
    ) : [library];
    const catalogs = libraries.flatMap(
      (candidate) => Array.isArray(candidate.catalogs) ? candidate.catalogs : []
    );
    const directoryCounts = {};
    catalogs.forEach((entry) => {
      var _a;
      const entryKind = (_a = entry.source) == null ? void 0 : _a.kind;
      if (entryKind !== kind) {
        return;
      }
      const directory = getRepoDirectory(entry.path || entry.fileName);
      if (!directory) {
        return;
      }
      directoryCounts[directory] = (directoryCounts[directory] || 0) + 1;
    });
    let bestDirectory = "";
    let bestCount = 0;
    Object.keys(directoryCounts).forEach((directory) => {
      const count = directoryCounts[directory];
      if (count > bestCount) {
        bestDirectory = directory;
        bestCount = count;
      }
    });
    if (bestDirectory) {
      return bestDirectory;
    }
    return inferComponentLibraryDirectory(library.name);
  }
  function inferComponentLibraryDirectory(libraryName) {
    const normalizedName = normalizeLooseMatchKey(libraryName);
    if (normalizedName.startsWith("web-")) {
      return `web/components/${normalizedName}`;
    }
    return `components/${sanitizeRepoFileName(libraryName || "", "library")}`;
  }
  function buildReferenceCatalogEntry(payload, target) {
    var _a;
    const source = {
      kind: target.kind,
      pageName: target.pageName
    };
    const figmaLink = readString((_a = payload.meta) == null ? void 0 : _a.figmaLink);
    if (figmaLink) {
      source.figmaPageLink = figmaLink;
    }
    if (target.fileKey) {
      source.fileKey = target.fileKey;
    }
    return {
      fileName: target.relativePath,
      path: target.relativePath,
      source
    };
  }
  function registerReferenceCatalogEntry(referenceList, payload, target) {
    const library = findReferenceLibrary(referenceList, {
      catalogName: payload.catalogName,
      fileKey: target.fileKey,
      meta: payload.meta
    });
    if (!Array.isArray(library.catalogs)) {
      library.catalogs = [];
    }
    const catalogBaseName = sanitizeRepoFileName(payload.catalogName, "catalog");
    const directory = inferCatalogDirectory(referenceList, library, target.kind);
    const relativePath = joinRepoPath(directory, `${catalogBaseName}.json`);
    const duplicateEntry = library.catalogs.find(
      (entry2) => normalizeMatchKey(entry2.path) === normalizeMatchKey(relativePath) || matchesReferenceEntry(entry2, {
        kind: target.kind,
        catalogName: payload.catalogName,
        fileKey: target.fileKey,
        pageName: target.pageName
      })
    );
    if (duplicateEntry) {
      return duplicateEntry;
    }
    const entry = buildReferenceCatalogEntry(payload, {
      kind: target.kind,
      fileKey: target.fileKey,
      pageName: target.pageName,
      relativePath
    });
    library.catalogs.push(entry);
    return entry;
  }
  async function resolvePublishFilePath(payload, githubToken) {
    var _a, _b;
    const kind = (_a = payload.meta) == null ? void 0 : _a.kind;
    const fileKey = resolveCurrentFileKey(payload.meta);
    const pageName = typeof ((_b = payload.meta) == null ? void 0 : _b.pageName) === "string" ? payload.meta.pageName : "";
    if (!kind) {
      throw new Error(
        "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u0442\u0438\u043F \u043F\u0443\u0431\u043B\u0438\u043A\u0443\u0435\u043C\u043E\u0433\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430. \u0414\u043B\u044F \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438 \u043D\u0443\u0436\u0435\u043D kind."
      );
    }
    if (kind === "component-index") {
      throw new Error("component-index \u043F\u0443\u0431\u043B\u0438\u043A\u0443\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u0430\u043A \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0439 \u0430\u0440\u0442\u0435\u0444\u0430\u043A\u0442 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432.");
    }
    const referenceFile = await fetchReferenceCatalogFile(githubToken);
    const referenceList = referenceFile.list || createEmptyReferenceCatalogList();
    const referenceEntries = normalizeReferenceCatalogEntries(referenceList);
    const matchedEntry = referenceEntries.find(
      (entry) => matchesReferenceEntry(entry, {
        kind,
        catalogName: payload.catalogName,
        fileKey,
        pageName
      })
    );
    let referenceUpdated = false;
    let resolvedEntry = matchedEntry;
    if (!(resolvedEntry == null ? void 0 : resolvedEntry.path)) {
      resolvedEntry = registerReferenceCatalogEntry(referenceList, payload, {
        kind,
        fileKey,
        pageName: pageName || stripJsonExtension(payload.catalogName)
      });
      referenceUpdated = true;
      console.log("[CODE] reference catalog registered:", {
        catalogName: payload.catalogName,
        path: resolvedEntry.path,
        kind,
        fileKey,
        pageName
      });
    }
    const publishRoot = resolvePublishRootFromBaseUrl(referenceList == null ? void 0 : referenceList.baseUrl);
    const referencePath = resolvedEntry.path;
    return {
      filePath: joinRepoPath(publishRoot, referencePath),
      referenceUpdated,
      referencePath,
      referenceList: referenceUpdated ? referenceList : void 0,
      referenceSha: referenceUpdated ? referenceFile.sha : void 0
    };
  }
  function buildComponentIndexPath(catalogPath) {
    const normalizedPath = normalizeRepoPath(catalogPath);
    const manifestRoot = getManifestPublishRoot();
    const rootPrefix = normalizedPath.startsWith(`${manifestRoot}/`) ? `${manifestRoot}/` : "";
    const relativeCatalogPath = rootPrefix ? normalizedPath.slice(rootPrefix.length) : normalizedPath;
    const indexRelativePath = relativeCatalogPath.replace(/\.json$/i, ".index.json");
    return joinRepoPath(rootPrefix ? `${manifestRoot}/indexes` : "indexes", indexRelativePath);
  }
  function buildComponentPackageArtifactPath(catalogPath, packageName, fileName) {
    const normalizedCatalogPath = normalizeRepoPath(catalogPath);
    const catalogDirectory = getRepoDirectory(normalizedCatalogPath);
    return joinRepoPath(catalogDirectory, `${packageName}/${fileName}`);
  }
  function enrichComponentIndexJson(rawJson, context) {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid component index payload");
    }
    const payload = parsed;
    payload.catalogPath = context.catalogPath;
    payload.indexPath = context.indexPath;
    if (Array.isArray(payload.components)) {
      payload.components = payload.components.map((entry) => {
        if (!entry || typeof entry !== "object") {
          return entry;
        }
        return Object.assign({}, entry, {
          catalogPath: context.catalogPath,
          indexPath: context.indexPath
        });
      });
    }
    if (Array.isArray(payload.entries)) {
      payload.entries = payload.entries.map((entry) => {
        if (!entry || typeof entry !== "object") {
          return entry;
        }
        return Object.assign({}, entry, {
          catalogPath: context.catalogPath,
          indexPath: context.indexPath
        });
      });
    }
    return JSON.stringify(payload, null, 2);
  }
  async function mergeComponentPackageArtifactJson(apiUrl, githubToken, nextJson) {
    const existingJson = await fetchExistingGitHubJson(apiUrl, githubToken);
    if (!existingJson) {
      return nextJson;
    }
    const existing = parseJsonObject(existingJson);
    const next = parseJsonObject(nextJson);
    if (!existing || !next) {
      return nextJson;
    }
    const documentType = readString(next.documentType);
    if (documentType === "component-agent-context") {
      return JSON.stringify(mergeAgentContextArtifact(existing, next), null, 2);
    }
    if (documentType === "component-audit-mapping") {
      return JSON.stringify(mergeAuditMappingArtifact(existing, next), null, 2);
    }
    return nextJson;
  }
  function mergeAgentContextArtifact(existing, next) {
    const generated = readRecord(next.generated) || {};
    const manual = readRecord(existing.manual) || extractAgentContextManual(existing);
    return stripUndefinedProperties({
      ...next,
      status: readString(existing.status) || readString(next.status) || "draft",
      manual,
      summary: readString(manual.summary) || readString(next.summary),
      criticalBaselines: manual.criticalBaselines || next.criticalBaselines,
      agentInstructions: manual.agentInstructions || next.agentInstructions,
      codeExports: manual.codeExports || next.codeExports,
      auditInterpretation: manual.auditInterpretation || next.auditInterpretation,
      source: generated.source || next.source,
      sourceFiles: generated.sourceFiles || next.sourceFiles,
      components: generated.components || next.components,
      includedComponents: generated.components || next.includedComponents
    });
  }
  function mergeAuditMappingArtifact(existing, next) {
    const generated = readRecord(next.generated) || {};
    const manual = readRecord(existing.manual) || extractAuditMappingManual(existing);
    return stripUndefinedProperties({
      ...next,
      status: readString(existing.status) || readString(next.status) || "draft",
      manual,
      classification: generated.classification || next.classification,
      groupingOrder: generated.groupingOrder || next.groupingOrder,
      evidencePolicy: generated.evidencePolicy || next.evidencePolicy,
      categories: manual.categories || generated.categories || next.categories,
      hostIntegrationNote: manual.hostIntegrationNote || next.hostIntegrationNote,
      codeExportAliases: manual.codeExportAliases || next.codeExportAliases
    });
  }
  function extractAgentContextManual(existing) {
    return stripUndefinedProperties({
      summary: existing.summary,
      criticalBaselines: existing.criticalBaselines,
      agentInstructions: existing.agentInstructions,
      codeExports: existing.codeExports,
      auditInterpretation: existing.auditInterpretation,
      notes: existing.notes
    });
  }
  function extractAuditMappingManual(existing) {
    return stripUndefinedProperties({
      categories: existing.categories,
      hostIntegrationNote: existing.hostIntegrationNote,
      codeExportAliases: existing.codeExportAliases,
      notes: existing.notes
    });
  }
  function stripUndefinedProperties(input) {
    const output = {};
    Object.keys(input).forEach((key) => {
      if (input[key] !== void 0) {
        output[key] = input[key];
      }
    });
    return output;
  }
  function parseJsonObject(value) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn("[CODE] failed to parse GitHub json for merge", error);
    }
    return void 0;
  }
  function readRecord(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    return void 0;
  }
  async function getExistingFileSha(apiUrl, githubToken) {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (response.status === 404) {
      return void 0;
    }
    if (response.status === 401) {
      throw new Error(buildGitHubAuthError());
    }
    if (response.status === 403) {
      throw new Error(buildGitHubAccessError());
    }
    if (!response.ok) {
      throw new Error(
        `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u0444\u0430\u0439\u043B \u0432 GitHub: ${response.status} ${response.statusText}`
      );
    }
    const fileData = await response.json();
    return fileData.sha;
  }
  async function fetchExistingGitHubJson(apiUrl, githubToken) {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (response.status === 404) {
      return void 0;
    }
    if (!response.ok) {
      throw new Error(
        `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 package artifact \u0438\u0437 GitHub: ${response.status} ${response.statusText}`
      );
    }
    const fileData = await response.json();
    if (!fileData.content || fileData.encoding !== "base64") {
      return void 0;
    }
    return base64ToString(fileData.content);
  }
  function isWebCorpComponentCatalogPath(filePath) {
    const normalizedPath = normalizeRepoPath(filePath).replace(/\\/g, "/");
    return normalizedPath === WEB_CORP_COMPONENTS_PATH || normalizedPath.startsWith(`${WEB_CORP_COMPONENTS_PATH}/`);
  }
  function getComponentPackageNameFromCatalog(catalogJson, catalogName) {
    const catalog = parseJsonObject(catalogJson);
    const source = catalog ? readRecord(catalog.source) : void 0;
    const sourceFiles = source && Array.isArray(source.files) ? source.files : [];
    const sourceName = sourceFiles.find(
      (value) => typeof value === "string" && value.trim()
    );
    const fallbackName = stripJsonExtension(catalogName).replace(
      /^Web _ Corp Components -- /,
      ""
    );
    const packageName = String(sourceName || fallbackName).replace(/::/g, " ").replace(/\s+/g, " ").trim();
    return packageName || void 0;
  }
  function slugifyComponentName(value) {
    return String(value || "").replace(/\[[DMT]\]/gi, " ").replace(/^[DMT]\]\s*/i, " ").replace(/\[[^\]]+\]/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^\wА-Яа-яЁё]+/g, "-").replace(/_+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }
  function getDefaultComponentKey(packageName) {
    return `web-corp.${slugifyComponentName(packageName)}`;
  }
  function removeLeadingComponentMarkers(value) {
    return String(value || "").replace(/^[^\wА-Яа-яЁё\[]+\s*/u, "").trim();
  }
  function addAlias(aliases, value) {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (normalized) {
      aliases.add(normalized);
    }
  }
  function getCatalogAliases(catalogJson, packageName) {
    const aliases = /* @__PURE__ */ new Set();
    addAlias(aliases, packageName);
    const catalog = parseJsonObject(catalogJson);
    const components = catalog && Array.isArray(catalog.components) ? catalog.components : [];
    components.forEach((component) => {
      const record = readRecord(component);
      const name = record ? readString(record.name) : void 0;
      if (!name) return;
      addAlias(aliases, name);
      addAlias(aliases, removeLeadingComponentMarkers(name));
    });
    return Array.from(aliases).sort((left, right) => left.localeCompare(right));
  }
  function buildDefaultComponentRules(catalogJson, packageName) {
    const componentKey = getDefaultComponentKey(packageName);
    const aliases = getCatalogAliases(catalogJson, packageName);
    return {
      schemaVersion: 1,
      documentType: "component-rules",
      componentKey,
      status: "generated-draft",
      rules: [
        {
          ruleId: `component:${componentKey}.component-properties-are-first-class`,
          severity: "info",
          source: "component-contract",
          appliesTo: "variant.*",
          checkType: "deterministic",
          matchKind: "exact_component_rule",
          target: {
            component: packageName,
            layers: aliases
          },
          ruleText: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F variant/property \u0432 \u044D\u0442\u043E\u043C \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0435 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432 \u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F component-property customizations. \u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0439 \u0438\u0445 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043E\u0442 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u043D\u044B\u0445 \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u0445 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 layer."
        },
        {
          ruleId: `component:${componentKey}.layer-properties-use-effective-baseline`,
          severity: "warning",
          source: "composition-contract",
          appliesTo: "layout.*|styles.text|fill|stroke|radius|opacity",
          checkType: "deterministic",
          matchKind: "exact_component_rule",
          target: {
            component: packageName,
            layers: aliases
          },
          ruleText: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F layer/style \u0432\u043D\u0443\u0442\u0440\u0438 \u044D\u0442\u043E\u0433\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432 \u043D\u0443\u0436\u043D\u043E \u0441\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0442\u044C \u0441 effective baseline \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E component variant \u0438 nested owner context."
        },
        {
          ruleId: `component:${componentKey}.lifecycle-context-is-informational`,
          severity: "info",
          source: "component-contract",
          appliesTo: "component.status",
          checkType: "manual",
          ruleText: "Lifecycle status \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u0430 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043E\u043C \u0434\u043B\u044F \u0430\u0433\u0435\u043D\u0442\u0430. \u041D\u0435 \u0441\u0447\u0438\u0442\u0430\u0439 \u0435\u0433\u043E \u0434\u0438\u0437\u0430\u0439\u043D-\u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435\u043C, \u0435\u0441\u043B\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 pattern \u0438\u043B\u0438 exact design rule."
        }
      ]
    };
  }
  async function putGitHubJsonFile(apiUrl, githubToken, json, message, sha) {
    const requestBody = {
      message,
      content: stringToBase64(`${json.trim()}
`)
    };
    if (sha) {
      requestBody.sha = sha;
    }
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || response.statusText;
      throw new Error(`GitHub API error (${response.status}): ${errorMessage}`);
    }
    const result = await response.json();
    return {
      catalogName: message,
      url: result.html_url || ""
    };
  }
  function buildRulesRegistryEntry(rules, packageName, rulesFilePath, catalogJson, existingEntry) {
    const aliases = /* @__PURE__ */ new Set();
    const existingAliases = existingEntry && Array.isArray(existingEntry.aliases) ? existingEntry.aliases : [];
    existingAliases.forEach((alias) => addAlias(aliases, alias));
    getCatalogAliases(catalogJson, packageName).forEach(
      (alias) => addAlias(aliases, alias)
    );
    return {
      componentKey: readString(rules.componentKey) || getDefaultComponentKey(packageName),
      packageName,
      aliases: Array.from(aliases).sort(
        (left, right) => left.localeCompare(right)
      ),
      rulesFile: rulesFilePath,
      rules: Array.isArray(rules.rules) ? rules.rules : []
    };
  }
  function buildUpdatedRulesRegistry(existingRegistry, entry) {
    const existingEntries = existingRegistry && Array.isArray(existingRegistry.entries) ? existingRegistry.entries : [];
    const packageName = readString(entry.packageName) || "";
    const componentKey = readString(entry.componentKey) || "";
    const entries = existingEntries.map((value) => readRecord(value)).filter((value) => Boolean(value)).filter((value) => {
      return readString(value.packageName) !== packageName && readString(value.componentKey) !== componentKey;
    });
    entries.push(entry);
    entries.sort((left, right) => {
      const leftName = readString(left.packageName) || "";
      const rightName = readString(right.packageName) || "";
      return leftName.localeCompare(rightName);
    });
    return {
      schemaVersion: 1,
      documentType: "apollo-component-rules-registry",
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      entries
    };
  }
  async function syncApolloRulesRegistry(filePath, catalogName, catalogJson, githubToken) {
    if (!isWebCorpComponentCatalogPath(filePath)) {
      return void 0;
    }
    const packageName = getComponentPackageNameFromCatalog(catalogJson, catalogName);
    if (!packageName) {
      throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u0438\u043C\u044F \u043F\u0430\u043A\u0435\u0442\u0430 \u0434\u043B\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F rules registry");
    }
    const packageRulesPath = buildComponentPackageArtifactPath(
      filePath,
      packageName,
      "rules.json"
    );
    const rulesApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${packageRulesPath}`;
    let rulesJson = await fetchExistingGitHubJson(rulesApiUrl, githubToken);
    let createdRules;
    if (!rulesJson) {
      const defaultRules = buildDefaultComponentRules(catalogJson, packageName);
      rulesJson = JSON.stringify(defaultRules, null, 2);
      const created = await putGitHubJsonFile(
        rulesApiUrl,
        githubToken,
        rulesJson,
        `Create component rules: ${packageName}`
      );
      createdRules = {
        catalogName: `${packageName} rules.json`,
        url: created.url
      };
    }
    const rules = parseJsonObject(rulesJson);
    if (!rules || readString(rules.documentType) !== "component-rules") {
      throw new Error(`\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 rules.json \u0434\u043B\u044F \u043F\u0430\u043A\u0435\u0442\u0430 ${packageName}`);
    }
    const registryPath = joinRepoPath(
      getRepoDirectory(filePath),
      APOLLO_RULES_REGISTRY_FILE
    );
    const registryApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${registryPath}`;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const registryResponse = await fetch(registryApiUrl, {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json"
        }
      });
      if (registryResponse.status === 401) {
        throw new Error(buildGitHubAuthError());
      }
      if (registryResponse.status === 403) {
        throw new Error(buildGitHubAccessError());
      }
      if (registryResponse.status !== 404 && !registryResponse.ok) {
        throw new Error(
          `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C Apollo rules registry: ${registryResponse.status} ${registryResponse.statusText}`
        );
      }
      let registry;
      let registrySha;
      if (registryResponse.ok) {
        const registryFile = await registryResponse.json();
        registrySha = registryFile.sha;
        registry = registryFile.content && registryFile.encoding === "base64" ? parseJsonObject(base64ToString(registryFile.content)) : void 0;
      }
      const existingEntry = registry && Array.isArray(registry.entries) ? registry.entries.map((value) => readRecord(value)).find((value) => value && readString(value.packageName) === packageName) : void 0;
      const entry = buildRulesRegistryEntry(
        rules,
        packageName,
        packageRulesPath,
        catalogJson,
        existingEntry
      );
      const nextRegistry = buildUpdatedRulesRegistry(registry, entry);
      try {
        const published = await putGitHubJsonFile(
          registryApiUrl,
          githubToken,
          JSON.stringify(nextRegistry, null, 2),
          `Sync Apollo rules registry: ${packageName}`,
          registrySha
        );
        return {
          packageName,
          createdRules,
          registry: {
            catalogName: APOLLO_RULES_REGISTRY_FILE,
            url: published.url
          }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (attempt < 3 && message.indexOf("409") !== -1) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C Apollo rules registry \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0445 \u043F\u043E\u043F\u044B\u0442\u043E\u043A");
  }
  async function publishWithToken(payload, githubToken) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
      if (!payload || !payload.json || !payload.catalogName) {
        throw new Error("Invalid publish payload");
      }
      if (!githubToken) {
        throw new Error("GitHub token is required");
      }
      const catalogName = payload.catalogName.replace(/\.json$/, "");
      const repo = `${GITHUB_OWNER}/${GITHUB_REPO}`;
      const owner = GITHUB_OWNER;
      const repoName = GITHUB_REPO;
      const publishResolution = await resolvePublishFilePath(payload, githubToken);
      const filePath = publishResolution.filePath;
      const publishTargets = [
        {
          json: payload.json,
          catalogName,
          filePath,
          kind: (_a = payload.meta) == null ? void 0 : _a.kind
        }
      ];
      if (((_b = payload.meta) == null ? void 0 : _b.kind) === "components" && ((_c = payload.relatedArtifacts) == null ? void 0 : _c.length)) {
        for (const artifact of payload.relatedArtifacts) {
          if (((_d = artifact.meta) == null ? void 0 : _d.kind) === "component-index") {
            const indexFilePath = buildComponentIndexPath(filePath);
            publishTargets.push({
              json: enrichComponentIndexJson(artifact.json, {
                catalogPath: filePath,
                indexPath: indexFilePath
              }),
              catalogName: artifact.catalogName.replace(/\.json$/, ""),
              filePath: indexFilePath,
              kind: artifact.meta.kind
            });
            continue;
          }
          if (((_e = artifact.meta) == null ? void 0 : _e.kind) === "component-package") {
            const packageName = readString(artifact.meta.packageName);
            const artifactFileName = readString(artifact.meta.fileName);
            if (!packageName || !artifactFileName) {
              console.warn("[CODE] skip component-package artifact without packageName/fileName");
              continue;
            }
            const packageFilePath = buildComponentPackageArtifactPath(
              filePath,
              packageName,
              artifactFileName
            );
            publishTargets.push({
              json: artifact.json,
              catalogName: artifact.catalogName.replace(/\.json$/, ""),
              filePath: packageFilePath,
              kind: artifact.meta.kind
            });
          }
        }
      }
      console.log("[CODE] publishing to GitHub:", {
        catalogName,
        filePath,
        kind: (_f = payload.meta) == null ? void 0 : _f.kind,
        fileKey: resolveCurrentFileKey(payload.meta),
        pageName: (_g = payload.meta) == null ? void 0 : _g.pageName,
        relatedArtifacts: publishTargets.length - 1,
        referenceUpdated: publishResolution.referenceUpdated,
        referencePath: publishResolution.referencePath
      });
      const results = [];
      for (const target of publishTargets) {
        const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${target.filePath}`;
        const sha = await getExistingFileSha(apiUrl, githubToken);
        const targetJson = target.kind === "component-package" && sha ? await mergeComponentPackageArtifactJson(apiUrl, githubToken, target.json) : target.json;
        const encodedContent = stringToBase64(targetJson);
        if (sha) {
          console.log("[CODE] existing file found, sha:", sha);
        } else {
          console.log("[CODE] file does not exist yet, creating new");
        }
        const requestBody = {
          message: `Publish design system catalog: ${target.catalogName}`,
          content: encodedContent
        };
        if (sha) {
          requestBody.sha = sha;
        }
        const putResponse = await fetch(apiUrl, {
          method: "PUT",
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });
        if (!putResponse.ok) {
          const errorData = await putResponse.json();
          let errorMessage = errorData.message || putResponse.statusText;
          if (putResponse.status === 401) {
            errorMessage = buildGitHubAuthError();
          } else if (putResponse.status === 403) {
            errorMessage = buildGitHubAccessError();
          }
          throw new Error(`GitHub API error: ${errorMessage}`);
        }
        const result = await putResponse.json();
        console.log("[CODE] catalog published successfully:", {
          catalogName: target.catalogName,
          kind: target.kind,
          url: result.html_url
        });
        results.push({ catalogName: target.catalogName, url: result.html_url });
      }
      if (((_h = payload.meta) == null ? void 0 : _h.kind) === "components") {
        const rulesRegistrySync = await syncApolloRulesRegistry(
          filePath,
          catalogName,
          payload.json,
          githubToken
        );
        if (rulesRegistrySync == null ? void 0 : rulesRegistrySync.createdRules) {
          results.push(rulesRegistrySync.createdRules);
        }
        if (rulesRegistrySync == null ? void 0 : rulesRegistrySync.registry) {
          results.push(rulesRegistrySync.registry);
          console.log("[CODE] Apollo rules registry synced:", {
            packageName: rulesRegistrySync.packageName,
            createdRules: Boolean(rulesRegistrySync.createdRules)
          });
        }
      }
      if (publishResolution.referenceUpdated && publishResolution.referenceList) {
        await putReferenceCatalogList(
          publishResolution.referenceList,
          publishResolution.referenceSha,
          githubToken,
          catalogName
        );
        console.log("[CODE] referenceSourcesMVP.json updated:", {
          catalogName,
          referencePath: publishResolution.referencePath
        });
      }
      const primaryResult = results[0];
      logDebug("publish-catalog-success", {
        catalogName,
        url: primaryResult == null ? void 0 : primaryResult.url,
        files: results.length,
        referenceUpdated: publishResolution.referenceUpdated
      });
      figma.notify(`\u2713 \u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043E \u0444\u0430\u0439\u043B\u043E\u0432: ${results.length} \u0432 ${repo}`, {
        timeout: 5e3
      });
      figma.ui.postMessage({
        type: "publish-result",
        payload: {
          success: true,
          catalogName,
          url: primaryResult == null ? void 0 : primaryResult.url,
          files: results,
          referenceUpdated: publishResolution.referenceUpdated,
          referencePath: publishResolution.referencePath
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430";
      console.error("[CODE] failed to publish catalog", error);
      logDebug("publish-catalog-error", { error: message });
      figma.notify(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433: ${message}`, {
        timeout: 5e3
      });
      figma.ui.postMessage({
        type: "publish-result",
        payload: {
          success: false,
          error: message
        }
      });
    }
  }
})();
//# sourceMappingURL=code.js.map
