import type { ContentFieldModelValue } from './content';

export interface ProjectStructuredItemBase {
  title: string;
  summary: string;
  isPrivate: boolean;
  content?: ContentFieldModelValue | null;
}

export function normalizeProjectStructuredItemId(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id || undefined;
}
