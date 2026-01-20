// Экспорт локальных styles: эффекты, текстовые и paint styles.
import { splitVariableName } from './nameUtils';

export interface StyleEntry {
  key: string;
  name: string;
  group: string;
  type: string;
  value: StyleValue;
}

export type StyleValue =
  | { kind: 'effect'; data: Effect }
  | {
      kind: 'text';
      data: {
        fontName: string | null;
        fontSize: number | null;
        lineHeight: string | null;
        letterSpacing: string | null;
      };
    }
  | {
      kind: 'paint';
      data: {
        paints: Array<{
          type: string;
          color?: string;
          opacity?: number;
        }>;
      };
    };

export interface StyleExportPayload {
  meta: {
    generatedAt: string;
    fileName: string;
    library: string;
  };
  styles: StyleEntry[];
}

export function collectStylesFromDocument(): StyleExportPayload {
  // Собираем стили и нормализуем имена для группировки в UI.
  const effectStyles = figma.getLocalEffectStyles();
  const textStyles = figma.getLocalTextStyles();
  const paintStyles = figma.getLocalPaintStyles();
  const entries: StyleEntry[] = [];
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
        value: { kind: 'effect', data: effect },
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
      type: 'text',
      value: { kind: 'text', data: describeTextStyle(style) },
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
      type: 'paint',
      value: { kind: 'paint', data: describePaintStyle(style) },
    });
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      fileName: figma.root.name,
      library: figma.root.name,
    },
    styles: entries,
  };
}

function formatEffectType(type: Effect['type']): string {
  return type.toLowerCase().replace('_', ' ');
}

function describeEffectValue(effect: Effect): string {
  const parts: string[] = [];
  if (effect.offset) {
    parts.push(
      'offset: ' +
        formatNumber(effect.offset.x) +
        ', ' +
        formatNumber(effect.offset.y),
    );
  }
  if (typeof effect.radius === 'number') {
    parts.push('radius: ' + formatNumber(effect.radius));
  }
  if (typeof effect.spread === 'number') {
    parts.push('spread: ' + formatNumber(effect.spread));
  }
  if (effect.color) {
    parts.push('color: ' + colorToString(effect.color));
  }
  return parts.length ? parts.join(' • ') : '—';
}

function describeTextStyle(style: TextStyle): {
  fontName: string | null;
  fontSize: number | null;
  lineHeight: string | null;
  letterSpacing: string | null;
} {
  const fontName = style.fontName;
  const fontLabel =
    fontName && fontName !== figma.mixed
      ? `${fontName.family} ${fontName.style}`.trim()
      : '—';
  const fontSize =
    style.fontSize !== figma.mixed && typeof style.fontSize === 'number'
      ? style.fontSize
      : null;
  const lineHeight =
    style.lineHeight !== figma.mixed && style.lineHeight
      ? formatLineHeight(style.lineHeight)
      : null;
  const letterSpacing =
    style.letterSpacing !== figma.mixed && style.letterSpacing
      ? formatLetterSpacing(style.letterSpacing)
      : null;
  return {
    fontName: fontLabel === '—' ? null : fontLabel,
    fontSize,
    lineHeight,
    letterSpacing,
  };
}

function describePaintStyle(style: PaintStyle): {
  paints: Array<{ type: string; color?: string; opacity?: number }>;
} {
  const paints = Array.isArray(style.paints) ? style.paints : [];
  return {
    paints: paints.map(serializePaintValue).filter(Boolean),
  };
}

function serializePaintValue(
  paint: Paint,
): { type: string; color?: string; opacity?: number } | null {
  if (!paint) return null;
  if (paint.type === 'SOLID') {
    const color = colorToString(paint.color);
    const opacity =
      typeof paint.opacity === 'number' ? paint.opacity : undefined;
    return {
      type: 'solid',
      color,
      opacity,
    };
  }
  return {
    type: paint.type.toLowerCase().replace('_', ' '),
  };
}

function formatLineHeight(lineHeight: LineHeight): string {
  if (lineHeight.unit === 'AUTO') return 'auto';
  if (lineHeight.unit === 'PIXELS') return formatNumber(lineHeight.value);
  if (lineHeight.unit === 'PERCENT') return formatNumber(lineHeight.value) + '%';
  return String(lineHeight.value);
}

function formatLetterSpacing(letterSpacing: LetterSpacing): string {
  if (letterSpacing.unit === 'PIXELS') return formatNumber(letterSpacing.value);
  if (letterSpacing.unit === 'PERCENT') {
    return formatNumber(letterSpacing.value) + '%';
  }
  return String(letterSpacing.value);
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function colorToString(color: RGB | RGBA): string {
  const r = clampColorComponent(color.r);
  const g = clampColorComponent(color.g);
  const b = clampColorComponent(color.b);
  const alpha =
    typeof color.a === 'number' ? color.a : typeof color.alpha === 'number'
      ? color.alpha
      : 1;
  const rgba = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
  return '#' + toHex(r) + toHex(g) + toHex(b) + ' / ' + rgba;
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
