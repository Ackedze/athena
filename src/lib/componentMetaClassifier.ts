// src/lib/componentMetaClassifier.ts

import type {
  ComponentPlatform,
  ComponentRole,
  ComponentStatus,
} from '../engine/types';

export interface ComponentClassificationContext {
  /**
   * Имя компонента в фигме, например:
   * "[D] BenefitCard", "Onboarding Tooltip ❌", "🔩 Parts / Button"
   */
  componentName: string;

  /**
   * Имя страницы, если нужно учитывать её паттерны
   * Например: "Onboarding Tooltip [D]"
   */
  pageName?: string | null;

  /**
   * Имя секции / фрейма верхнего уровня,
   * где лежит компонент (если ты его пробрасываешь).
   * Например: "🔩 Parts", "❌ Deprecated", "🔄 To be removed"
   */
  sectionName?: string | null;

  /**
   * Имя библиотеки (документа), если нужно учитывать её метки.
   */
  libraryName?: string | null;
}

export interface ComponentClassificationResult {
  role: ComponentRole;
  status: ComponentStatus;
  platform: ComponentPlatform;
}

/**
 * Классифицируем компонент по роли и статусу
 * на основе имени компонента, страницы и секции.
 */
export function classifyComponentMeta(
  ctx: ComponentClassificationContext,
): ComponentClassificationResult {
  const { componentName, pageName, sectionName, libraryName } = ctx;
  const sources = [componentName ?? '', pageName ?? '', sectionName ?? ''];
  const statusSources = [...sources, libraryName ?? ''];
  const normalized = sources.join(' | ').toLowerCase();

  const status = detectStatus(statusSources);
  const role = detectRole(sources, normalized);
  const platform = detectPlatform(sources);

  return { role, status, platform };
}

function detectStatus(sources: string[]): ComponentStatus {
  if (sources.some((value) => value.includes('❌'))) {
    return 'deprecated';
  }

  if (sources.some((value) => value.includes('🔄'))) {
    return 'scheduled';
  }

  return 'active';
}

function detectRole(
  sources: string[],
  normalizedFullName: string,
): ComponentRole {
  if (sources.some((value) => value.includes('🔩'))) {
    return 'part';
  }

  return 'main';
}

function detectPlatform(sources: string[]): ComponentPlatform {
  const normalized = sources.join(' ').toLowerCase();

  if (normalized.includes('[d]')) {
    return 'desktop';
  }

  if (normalized.includes('[m]')) {
    return 'mobile-web';
  }

  return 'universal';
}
