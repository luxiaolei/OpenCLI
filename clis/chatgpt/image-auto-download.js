const AUTO_DOWNLOAD_POLL_SLICE_SECONDS = 3;

function parsePositiveInt(value, fallback = 30) {
  const parsed = Number.parseInt(String(value ?? fallback).trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isRetryableChatGPTImageDownload(rows) {
  const firstRow = Array.isArray(rows) ? rows[0] : null;
  return Boolean(firstRow && String(firstRow.status ?? '').trim() === '⚠️ no-images');
}

export async function pollChatGPTImageDownloads(page, {
  url,
  op,
  timeout,
  downloader,
  all = true,
  downloadKwargs = {},
}) {
  const totalTimeout = parsePositiveInt(timeout, 30);
  let remaining = totalTimeout;
  let lastRows = [];

  while (remaining > 0) {
    const slice = Math.min(remaining, AUTO_DOWNLOAD_POLL_SLICE_SECONDS);
    const rows = await downloader(page, {
      ...(downloadKwargs || {}),
      url,
      op,
      timeout: String(slice),
      all,
    });
    lastRows = Array.isArray(rows) ? rows : [];
    if (!isRetryableChatGPTImageDownload(lastRows) || remaining <= slice) {
      return lastRows;
    }
    remaining -= slice;
  }

  return lastRows;
}
