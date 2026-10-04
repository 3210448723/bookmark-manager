/**
 * 前端书签健康度探测。
 *
 * 浏览器的同源策略可能阻止跨域读取响应状态，此时返回可识别的网络错误，
 * 不会把它误报成成功。对 405/501 等不支持 HEAD 的站点自动回退到 GET。
 */

const getErrorMessage = (error) => {
  if (error && error.name === 'AbortError') return '请求超时';
  if (error && error.message) return error.message;
  return '网络请求失败或被浏览器跨域策略阻止';
};

const probeBookmark = async (bookmark, options = {}) => {
  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 5000;
  const checkedAt = new Date().toISOString();

  if (!bookmark || !bookmark.url) {
    return { bookmarkId: bookmark && bookmark.id, url: '', reachable: false, status: null, error: 'URL 为空', checkedAt };
  }
  if (!fetchImpl) {
    return { bookmarkId: bookmark.id, url: bookmark.url, reachable: false, status: null, error: '当前环境不支持网络探测', checkedAt };
  }

  let controller;
  let timeoutId;
  try {
    controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    timeoutId = setTimeout(() => controller && controller.abort(), timeout);
    const request = (method) => fetchImpl(bookmark.url, {
      method,
      mode: 'cors',
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    });
    let response = await request('HEAD');
    if (response.status === 405 || response.status === 501) response = await request('GET');
    return {
      bookmarkId: bookmark.id,
      url: bookmark.url,
      reachable: Boolean(response.ok),
      status: typeof response.status === 'number' ? response.status : null,
      statusText: response.statusText || '',
      error: response.ok ? null : `HTTP ${response.status}`,
      checkedAt
    };
  } catch (error) {
    return { bookmarkId: bookmark.id, url: bookmark.url, reachable: false, status: null, error: getErrorMessage(error), checkedAt };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const probeBookmarks = async (bookmarks, options = {}) => {
  const list = Array.isArray(bookmarks) ? bookmarks : [];
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 4, 10));
  const results = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await probeBookmark(list[index], options);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return results;
};

module.exports = { probeBookmark, probeBookmarks };
