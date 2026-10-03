import { isSafeHref } from 'emdash';
import type { SeedField } from 'emdash/seed';

export type InnerPageCollection =
  'page_about' | 'page_services' | 'page_contact' | 'page_pricing' | 'page_products' | 'page_english';
export const INNER_PAGE_COLLECTIONS: readonly InnerPageCollection[] = [
  'page_about',
  'page_services',
  'page_contact',
  'page_pricing',
  'page_products',
  'page_english',
];
export const INNER_PAGE_LOCALES = ['zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr'] as const;

interface ColumnBinding {
  slug: string;
  path: string[];
  lines: boolean;
}
interface FieldBinding {
  field: SeedField;
  path: string[];
  columns?: ColumnBinding[];
  arrayKind?: 'objects' | 'tuples' | 'strings';
  tupleLength?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function snake(path: readonly string[]): string {
  return path
    .join('_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
function label(path: readonly string[]): string {
  return path
    .join(' / ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ');
}
function at(value: unknown, path: readonly string[]): unknown {
  for (const key of path) {
    if (!record(value)) return undefined;
    value = value[key];
  }
  return value;
}
function assign(value: Record<string, unknown>, path: readonly string[], next: unknown): void {
  for (const key of path.slice(0, -1)) {
    if (!record(value[key])) value[key] = {};
    value = value[key] as Record<string, unknown>;
  }
  value[path[path.length - 1]] = next;
}
function text(value: unknown, path: readonly string[] = []): string | undefined {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 6000 ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  )
    return undefined;
  if (/href|url$/i.test(path[path.length - 1] ?? '') && !isSafeHref(value)) return undefined;
  return value;
}
function leafColumns(value: unknown, path: string[] = []): ColumnBinding[] {
  if (typeof value === 'string') return [{ slug: snake(path), path, lines: false }];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return [{ slug: snake(path), path, lines: true }];
  }
  if (record(value)) return Object.entries(value).flatMap(([key, item]) => leafColumns(item, [...path, key]));
  throw new Error('Unsupported nested repeater shape');
}

/** Flatten nested headings into named fields; arrays remain editable repeaters. */
export function pageCopyBindings(defaults: object, collection: InnerPageCollection): FieldBinding[] {
  const bindings: FieldBinding[] = [];
  const visit = (value: unknown, path: string[]) => {
    // The disclaimer accompanies a fixed illustrative example and is not an
    // editable marketing claim. Its original translation is always retained.
    if (path.length === 1 && path[0] === 'scenarioQualifier') return;
    const slug = snake(path) === 'terms' ? 'terms_label' : snake(path);
    if (typeof value === 'string') {
      bindings.push({
        path,
        field: {
          slug,
          label: label(path),
          type: 'text',
          translatable: true,
          validation: { maxLength: 6000 },
          widget: 'textarea',
        },
      });
      return;
    }
    if (Array.isArray(value)) {
      if (!value.length) throw new Error('A repeater requires an existing item shape');
      const first = value[0];
      let columns: ColumnBinding[];
      let arrayKind: FieldBinding['arrayKind'];
      let tupleLength: number | undefined;
      if (typeof first === 'string') {
        arrayKind = 'strings';
        columns = [{ slug: 'text', path: [], lines: false }];
      } else if (Array.isArray(first) && first.every((item) => typeof item === 'string')) {
        arrayKind = 'tuples';
        tupleLength = first.length;
        columns = first.map((_, index) => ({
          slug: index === 0 ? 'label' : index === 1 ? 'description' : `text_${index + 1}`,
          path: [String(index)],
          lines: false,
        }));
      } else {
        arrayKind = 'objects';
        columns = leafColumns(first);
      }
      const fixedPricingCards = collection === 'page_pricing' && slug === 'cards';
      bindings.push({
        path,
        columns,
        arrayKind,
        tupleLength,
        field: {
          slug,
          label: label(path),
          type: 'repeater',
          translatable: true,
          validation: {
            minItems: fixedPricingCards ? value.length : 1,
            maxItems: fixedPricingCards ? value.length : 40,
            subFields: columns.map((column) => ({
              slug: column.slug,
              label: column.lines ? `${label(column.path)} (one item per line)` : label(column.path) || 'Text',
              type: 'text',
              required: true,
            })),
          },
        },
      });
      return;
    }
    if (record(value)) {
      for (const [key, item] of Object.entries(value)) visit(item, [...path, key]);
      return;
    }
    throw new Error('Unsupported public page field type');
  };
  visit(defaults, []);
  const names = bindings.map((binding) => binding.field.slug);
  if (new Set(names).size !== names.length) throw new Error('Duplicate flattened page field');
  return bindings;
}

export function pageCopySeedFields(defaults: object, collection: InnerPageCollection): SeedField[] {
  return pageCopyBindings(defaults, collection).map(({ field }) => field);
}

export function pageCopySeedData(defaults: object, collection: InnerPageCollection): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const binding of pageCopyBindings(defaults, collection)) {
    const value = at(defaults, binding.path);
    if (!binding.columns) {
      data[binding.field.slug] = value;
      continue;
    }
    data[binding.field.slug] = (value as unknown[]).map((item) =>
      Object.fromEntries(
        binding.columns!.map((column) => {
          let cell: unknown;
          if (binding.arrayKind === 'strings') cell = item;
          else if (binding.arrayKind === 'tuples') cell = (item as unknown[])[Number(column.path[0])];
          else cell = at(item, column.path);
          return [column.slug, column.lines ? (cell as string[]).join('\n') : cell];
        })
      )
    );
  }
  return data;
}

/** Apply only known, typed fields. Invalid repeater rows preserve the entire original section. */
export function mergePageCopy<T extends object>(data: unknown, defaults: T, collection: InnerPageCollection): T {
  const copy = structuredClone(defaults) as T & Record<string, unknown>;
  if (!record(data)) return copy;
  for (const binding of pageCopyBindings(defaults, collection)) {
    const value = data[binding.field.slug];
    if (!binding.columns) {
      const next = text(value, binding.path);
      if (next !== undefined) assign(copy, binding.path, next);
      continue;
    }
    const minimum = Number(binding.field.validation?.minItems ?? 1);
    const maximum = Number(binding.field.validation?.maxItems ?? 40);
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) continue;
    const rows: unknown[] = [];
    let valid = true;
    for (const row of value) {
      if (!record(row)) {
        valid = false;
        break;
      }
      const decoded: Record<string, unknown> = {};
      const tuple: string[] = [];
      for (const column of binding.columns) {
        const cell = text(row[column.slug], column.path);
        if (cell === undefined) {
          valid = false;
          break;
        }
        const next = column.lines
          ? cell
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
          : cell;
        if (Array.isArray(next) && (!next.length || next.length > 40)) {
          valid = false;
          break;
        }
        if (binding.arrayKind === 'tuples') tuple[Number(column.path[0])] = cell;
        else if (binding.arrayKind === 'strings') decoded.text = cell;
        else assign(decoded, column.path, next);
      }
      if (!valid) break;
      rows.push(binding.arrayKind === 'tuples' ? tuple : binding.arrayKind === 'strings' ? decoded.text : decoded);
    }
    if (valid) assign(copy, binding.path, rows);
  }
  return copy;
}

export function pageCopyFromEntry<T extends object>(
  entry: unknown,
  locale: string,
  collection: InnerPageCollection,
  slug: string,
  defaults: T,
  flags: { isPreview: boolean; fallbackLocale?: string }
): T | undefined {
  if (!record(entry) || !record(entry.data) || flags.fallbackLocale) return undefined;
  const data = entry.data;
  if (
    data.locale !== locale ||
    data.slug !== slug ||
    (data.status !== 'published' && !(flags.isPreview === true && data.status === 'draft'))
  )
    return undefined;
  return mergePageCopy(data, defaults, collection);
}
