import { createError } from 'h3';
import type { LibraryQuery } from './library';
import type { AssetSelectionConstraints } from '../../../shared/asset-library';
import {
  parseAcceptedExtensions,
  parseOptionalPositiveInt,
  parseSizeLimitPolicy,
} from './upload-request';

export function parseLibraryQuery(
  query: Record<string, unknown>,
): LibraryQuery {
  const string = (key: string) =>
    typeof query[key] === 'string' ? (query[key] as string) : '';
  if (string('q').length > 500)
    throw createError({ statusCode: 400, message: 'Search is too long' });
  if (
    string('type') &&
    !['image', 'video', 'audio', 'other'].includes(string('type'))
  )
    throw createError({ statusCode: 400, message: 'Invalid asset type' });
  if (string('usage') && !['used', 'unused'].includes(string('usage')))
    throw createError({ statusCode: 400, message: 'Invalid usage filter' });
  return {
    q: string('q'),
    type: string('type'),
    usage: string('usage'),
    page: Number(string('page') || 1),
    ...parseSelectionConstraints(query),
  };
}

export function parseSelectionConstraints(
  input: Record<string, unknown>,
): AssetSelectionConstraints {
  const extensions = input.acceptedExtensions;
  if (
    extensions !== undefined &&
    typeof extensions !== 'string' &&
    !Array.isArray(extensions)
  )
    throw createError({
      statusCode: 400,
      message: 'Invalid acceptedExtensions',
    });
  if (
    input.maxSize !== undefined &&
    typeof input.maxSize !== 'number' &&
    typeof input.maxSize !== 'string'
  )
    throw createError({ statusCode: 400, message: 'Invalid maxSize' });
  const imageOnly = input.imageOnly;
  if (
    imageOnly !== undefined &&
    imageOnly !== true &&
    imageOnly !== false &&
    imageOnly !== 'true' &&
    imageOnly !== 'false'
  )
    throw createError({ statusCode: 400, message: 'Invalid imageOnly' });
  return {
    acceptedExtensions: parseAcceptedExtensions(
      Array.isArray(extensions)
        ? JSON.stringify(extensions)
        : ((extensions as string | undefined) ?? ''),
    ),
    maxSize: parseOptionalPositiveInt(String(input.maxSize ?? '')),
    sizeLimitPolicy: parseSizeLimitPolicy(String(input.sizeLimitPolicy ?? '')),
    imageOnly: imageOnly === true || imageOnly === 'true',
  };
}
