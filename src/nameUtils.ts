// Разделяем имя на группу и токен по разделителю '/'.
export function splitVariableName(rawName?: string | null) {
  if (!rawName) {
    return { groupName: 'Без группы', tokenName: 'Без названия' };
  }
  const trimmed = rawName.trim();
  if (!trimmed) {
    return { groupName: 'Без группы', tokenName: 'Без названия' };
  }
  const parts = trimmed.split('/');
  if (parts.length <= 1) {
    return { groupName: 'Без группы', tokenName: trimmed };
  }
  return {
    groupName: parts[0] || 'Без группы',
    tokenName: parts.slice(1).join('/') || 'Без названия',
  };
}
