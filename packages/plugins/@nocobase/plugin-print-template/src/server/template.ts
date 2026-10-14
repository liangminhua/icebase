/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Escape a string for safe interpolation into an HTML document.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type PrimitiveValue = string | number | boolean | bigint;

function isPrimitive(value: unknown): value is PrimitiveValue {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
  );
}

/**
 * Resolve a dot path (e.g. `user.name`) from a record object.
 * Returns `undefined` when the path cannot be resolved.
 */
export function getPathValue(record: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!record || !path) {
    return undefined;
  }
  let current: unknown = record;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Convert a placeholder value to its text form. Non-primitive values render as empty string.
 */
export function stringifyValue(value: unknown): string {
  return isPrimitive(value) ? String(value) : '';
}

/**
 * Render `{{ path }}` placeholders in a template with values from the record.
 * HTML characters in values are escaped; unresolved paths render as empty string.
 */
export function renderTemplate(content: string, record: Record<string, unknown> | null | undefined): string {
  return (content ?? '').replace(/\{\{\s*([\w$]+(?:\.[\w$]+)*)\s*\}\}/g, (_, path: string) => {
    return escapeHtml(stringifyValue(getPathValue(record, path)));
  });
}

/**
 * Render the filename template without HTML escaping (a filename is not HTML).
 * Falls back to `<template.title>_<YYYY-MM-DD>` when no filename is produced.
 */
export function renderFilename(
  filenameTemplate: string | null | undefined,
  record: Record<string, unknown> | null | undefined,
  title: string,
): string {
  const date = new Date();
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
  const fallback = `${title || 'print'}_${dateText}`;
  if (!filenameTemplate) {
    return fallback;
  }
  const rendered = filenameTemplate.replace(/\{\{\s*([\w$]+(?:\.[\w$]+)*)\s*\}\}/g, (_, path: string) => {
    return stringifyValue(getPathValue(record, path));
  });
  return rendered.trim() || fallback;
}
