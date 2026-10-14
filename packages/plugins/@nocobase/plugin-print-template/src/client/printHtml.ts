/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Write rendered HTML into a hidden iframe and trigger the browser print dialog
 * (the user can then save it as a PDF).
 */
export function printHtml(html: string, filename?: string): void {
  if (typeof document === 'undefined' || !html) {
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('title', filename || 'print');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  const cleanup = () => {
    iframe.remove();
  };

  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    cleanup();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  if (filename) {
    const title = doc.createElement('title');
    title.textContent = filename;
    doc.head.appendChild(title);
  }
  win.addEventListener('afterprint', cleanup);
  // Fallback cleanup in case the 'afterprint' event is not fired
  window.setTimeout(cleanup, 60_000);
  // Give the browser a tick to finish rendering before opening the print dialog
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 50);
}
