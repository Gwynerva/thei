import { createError } from 'h3';
import type { LibraryFeedQuery, LibraryQuery } from './library';
import {
  ASSET_LIBRARY_QUERY_LIMIT,
  ASSET_LIBRARY_UTC_OFFSET_MAX,
  ASSET_SOURCE_TYPES,
  isAssetLibraryOrder,
  type AssetLibraryHere,
  isAssetLibrarySourceFilter,
  type AssetSelectionConstraints,
} from '../../../shared/asset-library';
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
  if (string('q').length > ASSET_LIBRARY_QUERY_LIMIT)
    throw createError({ statusCode: 400, message: 'Search is too long' });
  if (
    string('type') &&
    !['image', 'video', 'audio', 'other'].includes(string('type'))
  )
    throw createError({ statusCode: 400, message: 'Invalid asset type' });
  if (string('usage') && !['used', 'unused'].includes(string('usage')))
    throw createError({ statusCode: 400, message: 'Invalid usage filter' });
  const source = string('source');
  if (source && !isAssetLibrarySourceFilter(source))
    throw createError({ statusCode: 400, message: 'Invalid source filter' });
  return {
    q: string('q'),
    type: string('type'),
    usage: string('usage'),
    source: isAssetLibrarySourceFilter(source) ? source : undefined,
    page: Number(string('page') || 1),
    ...parseSelectionConstraints(query),
  };
}

/** The library's run through time (`listLibraryFeed`), as asked in a query. */
export function parseLibraryFeedQuery(
  query: Record<string, unknown>,
): LibraryFeedQuery {
  const string = (key: string) =>
    typeof query[key] === 'string' ? (query[key] as string) : '';
  const order = string('order');
  if (order && !isAssetLibraryOrder(order))
    throw createError({ statusCode: 400, message: 'Invalid order' });
  const year = string('year');
  if (year && !/^\d{4}$/.test(year))
    throw createError({ statusCode: 400, message: 'Invalid year' });
  const offset = Number(string('offset') || 0);
  if (!Number.isInteger(offset) || offset < 0)
    throw createError({ statusCode: 400, message: 'Invalid offset' });
  const utcOffset = Number(string('utcOffset') || 0);
  if (
    !Number.isInteger(utcOffset) ||
    Math.abs(utcOffset) > ASSET_LIBRARY_UTC_OFFSET_MAX
  )
    throw createError({ statusCode: 400, message: 'Invalid UTC offset' });
  const hereValue = string('here');
  const split = hereValue.indexOf(':');
  const hereType = hereValue.slice(0, split);
  const here =
    split > 0 &&
    (ASSET_SOURCE_TYPES as readonly string[]).includes(hereType) &&
    hereType !== 'unused'
      ? ({
          type: hereType,
          id: hereValue.slice(split + 1),
        } as AssetLibraryHere)
      : undefined;
  return {
    ...parseLibraryQuery(query),
    order: isAssetLibraryOrder(order) ? order : 'new',
    offset,
    ...(year ? { year } : {}),
    ...(utcOffset ? { utcOffset } : {}),
    head: string('head') === '1',
    ...(here ? { here } : {}),
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
