const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseBookmarkJSON,
  generateBookmarkJSON,
  generateBookmarkHTML
} = require('../src/utils/bookmarkFormats');
const { probeBookmark, probeBookmarks } = require('../src/utils/healthCheck');

test('通用 JSON 导出可以保留文件夹、书签和标签并再次导入', () => {
  const folders = [
    { id: 'root', name: '根目录', parentId: null },
    { id: 'work', name: '工作', parentId: 'root' }
  ];
  const bookmarks = [{ id: 'bookmark_a', name: '项目', url: 'https://example.com', folderId: 'work', tags: ['工作', '重要'] }];
  const exported = JSON.parse(generateBookmarkJSON(bookmarks, folders));
  const parsed = parseBookmarkJSON(exported);

  assert.ok(exported.roots.bookmark_bar);
  assert.ok(exported.roots.toolbar);
  assert.deepEqual(parsed.folders.map(folder => folder.name), ['工作']);
  assert.equal(parsed.bookmarks[0].url, 'https://example.com');
  assert.deepEqual(parsed.bookmarks[0].tags, ['工作', '重要']);
  assert.equal(parsed.bookmarks[0].folderId, parsed.folders[0].id);
});

test('可以导入 Chrome/Edge roots 与 Firefox places JSON 树', () => {
  const chrome = parseBookmarkJSON({
    roots: {
      bookmark_bar: {
        type: 'folder',
        children: [{ type: 'folder', id: 'folder_a', name: '常用', children: [{ type: 'url', id: 'url_a', name: 'OpenAI', url: 'https://openai.com', tags: 'ai, 工作' }] }]
      }
    }
  });
  const firefox = parseBookmarkJSON({
    roots: {
      toolbar: {
        type: 'container',
        children: [{ type: 'text', guid: 'text_a', title: 'Mozilla', uri: 'https://mozilla.org' }]
      }
    }
  });

  assert.equal(chrome.folders[0].name, '常用');
  assert.deepEqual(chrome.bookmarks[0].tags, ['ai', '工作']);
  assert.equal(firefox.bookmarks[0].name, 'Mozilla');
});

test('HTML 导出包含浏览器标准结构和标签属性', () => {
  const html = generateBookmarkHTML(
    [{ id: 'bookmark_a', name: '示例', url: 'https://example.com?a=1&b=2', folderId: 'root', tags: ['测试'] }],
    [{ id: 'root', name: '根目录', parentId: null }]
  );
  assert.match(html, /NETSCAPE-Bookmark-file-1/);
  assert.match(html, /HREF="https:\/\/example\.com\?a=1&amp;b=2"/);
  assert.match(html, /TAGS="测试"/);
});

test('健康检查返回 HTTP 状态并对不支持 HEAD 的站点回退 GET', async () => {
  const methods = [];
  const result = await probeBookmark(
    { id: 'bookmark_a', url: 'https://example.com' },
    { fetchImpl: async (url, options) => {
      methods.push(options.method);
      return options.method === 'HEAD' ? { status: 405, ok: false, statusText: 'Method Not Allowed' } : { status: 200, ok: true, statusText: 'OK' };
    } }
  );
  assert.deepEqual(methods, ['HEAD', 'GET']);
  assert.equal(result.reachable, true);
  assert.equal(result.status, 200);
});

test('健康检查保留输入顺序并将网络异常标记为不可达', async () => {
  const results = await probeBookmarks([
    { id: 'a', url: 'https://ok.example' },
    { id: 'b', url: 'https://down.example' }
  ], {
    fetchImpl: async url => {
      if (url.includes('down')) throw new Error('connection refused');
      return { status: 204, ok: true, statusText: 'No Content' };
    },
    concurrency: 2
  });
  assert.deepEqual(results.map(result => result.bookmarkId), ['a', 'b']);
  assert.equal(results[0].reachable, true);
  assert.equal(results[1].reachable, false);
  assert.equal(results[1].error, 'connection refused');
});
