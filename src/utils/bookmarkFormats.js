/**
 * 浏览器书签格式转换器。
 * 支持 Bookmark HTML（Chrome/Edge/Firefox）以及以下 JSON 形态：
 * 1. bookmark-manager 的 folders/bookmarks 通用格式；
 * 2. Chrome/Edge 的 roots 树；
 * 3. Firefox places.json 的 roots/children 树。
 */

const SUPPORTED_PROTOCOLS = ['http:', 'https:', 'ftp:'];

const cleanText = (value) => String(value == null ? '' : value)
  .replace(/[<>]/g, '')
  .split('')
  .filter(char => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127;
  })
  .join('')
  .trim();

const normalizeTags = (tags) => {
  const values = Array.isArray(tags) ? tags : String(tags || '').split(/[\n,]/);
  return Array.from(new Set(values.map(tag => cleanText(tag)).filter(Boolean))).slice(0, 30);
};

const isValidUrl = (url) => {
  try { return SUPPORTED_PROTOCOLS.includes(new URL(url).protocol); } catch (error) { return false; }
};

const dateFromValue = (value) => {
  if (!value) return new Date().toISOString();
  const number = Number(value);
  if (Number.isFinite(number)) {
    const milliseconds = number > 1000000000000000 ? number / 1000 : number > 10000000000 ? number : number * 1000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const escapeHtml = (value, attribute = false) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  .replace(attribute ? /\r?\n/g : /$^/, attribute ? '&#10;' : '');

const safeId = (value, prefix, used) => {
  const base = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || `${prefix}_${used.size}`;
  let id = base;
  let suffix = 1;
  while (used.has(id) || id === 'root') id = `${base}_${suffix++}`.slice(0, 50);
  used.add(id);
  return id;
};

const parseBookmarkJSON = (input) => {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch (error) { throw new Error(`JSON 格式无效: ${error.message}`); }
  }
  if (!data || typeof data !== 'object') throw new Error('JSON 根节点必须是对象');

  const folders = [];
  const bookmarks = [];
  const usedFolderIds = new Set(['root']);
  const usedBookmarkIds = new Set();
  let folderIndex = 0;
  let bookmarkIndex = 0;

  if (Array.isArray(data.folders) || Array.isArray(data.bookmarks)) {
    const folderIdMap = new Map([['root', 'root']]);
    (data.folders || []).forEach(folder => {
      if (!folder || folder.id === 'root') return;
      const id = safeId(folder.id, 'folder', usedFolderIds);
      folderIdMap.set(folder.id, id);
      folders.push({ id, sourceId: folder.id, name: cleanText(folder.name || folder.title || '未命名文件夹'), parentId: folder.parentId || 'root' });
    });
    folders.forEach(folder => { folder.parentId = folderIdMap.get(folder.parentId) || 'root'; });
    (data.bookmarks || []).forEach(bookmark => {
      if (!bookmark) return;
      const url = bookmark.url || bookmark.uri || bookmark.href;
      if (!isValidUrl(url)) return;
      const id = safeId(bookmark.id, `bookmark_${bookmarkIndex++}`, usedBookmarkIds);
      const folderId = folderIdMap.get(bookmark.folderId) || 'root';
      bookmarks.push({ id, name: cleanText(bookmark.name || bookmark.title || url), url: String(url).trim(), folderId, tags: normalizeTags(bookmark.tags), description: cleanText(bookmark.description || ''), createdAt: dateFromValue(bookmark.createdAt || bookmark.dateAdded) });
    });
    return { bookmarks, folders };
  }

  const visit = (node, parentId = 'root', depth = 0) => {
    if (!node || depth > 50) return;
    const children = Array.isArray(node.children) ? node.children : [];
    const url = node.url || node.uri || node.href;
    const isFolder = children.length > 0 || node.type === 'folder' || node.type === 'container';
    if (isFolder) {
      const folderId = safeId(node.id || node.guid || `folder_${folderIndex++}`, 'folder', usedFolderIds);
      folders.push({ id: folderId, sourceId: node.id || node.guid, name: cleanText(node.name || node.title || '未命名文件夹'), parentId });
      children.forEach(child => visit(child, folderId, depth + 1));
    } else if (url && isValidUrl(url)) {
      const id = safeId(node.id || node.guid || `bookmark_${bookmarkIndex++}`, 'bookmark', usedBookmarkIds);
      bookmarks.push({ id, name: cleanText(node.name || node.title || url), url: String(url).trim(), folderId: parentId, tags: normalizeTags(node.tags), description: cleanText(node.description || ''), createdAt: dateFromValue(node.createdAt || node.dateAdded) });
    }
  };

  if (data.roots && typeof data.roots === 'object') {
    Object.keys(data.roots).forEach(key => {
      const root = data.roots[key];
      (root && Array.isArray(root.children) ? root.children : []).forEach(child => visit(child, 'root'));
    });
  } else if (Array.isArray(data.children)) {
    data.children.forEach(child => visit(child, 'root'));
  } else if (data.type || data.url || data.uri) {
    visit(data, 'root');
  }
  return { bookmarks, folders };
};

const createBrowserRoot = (bookmarks, folders, kind) => {
  const folderNodes = new Map();
  const root = { type: kind === 'firefox' ? 'container' : 'folder', name: '书签栏', title: '书签栏', children: [] };
  folderNodes.set('root', root);
  (folders || []).filter(folder => folder.id !== 'root').forEach(folder => {
    folderNodes.set(folder.id, {
      type: kind === 'firefox' ? 'container' : 'folder',
      name: folder.name,
      title: folder.name,
      id: folder.id,
      guid: folder.id,
      children: []
    });
  });
  (folders || []).filter(folder => folder.id !== 'root').forEach(folder => {
    const parent = folderNodes.get(folder.parentId) || root;
    parent.children.push(folderNodes.get(folder.id));
  });
  (bookmarks || []).forEach(bookmark => {
    const parent = folderNodes.get(bookmark.folderId) || root;
    const tags = normalizeTags(bookmark.tags);
    parent.children.push(kind === 'firefox'
      ? { type: 'text', title: bookmark.name, name: bookmark.name, uri: bookmark.url, id: bookmark.id, guid: bookmark.id, tags }
      : { type: 'url', name: bookmark.name, url: bookmark.url, id: bookmark.id, tags });
  });
  return root;
};

const generateBookmarkJSON = (bookmarks, folders) => JSON.stringify({
  format: 'bookmark-manager-json',
  version: 1,
  exportedAt: new Date().toISOString(),
  folders: (folders || []).map(folder => ({ id: folder.id, name: folder.name, parentId: folder.parentId, order: folder.order })),
  bookmarks: (bookmarks || []).map(bookmark => ({ id: bookmark.id, name: bookmark.name, url: bookmark.url, folderId: bookmark.folderId, tags: normalizeTags(bookmark.tags), description: bookmark.description || '', createdAt: bookmark.createdAt })),
  // 同时提供两种浏览器备份树，Chrome/Edge 使用 bookmark_bar，Firefox 使用 toolbar。
  roots: {
    bookmark_bar: createBrowserRoot(bookmarks, folders, 'chrome'),
    toolbar: createBrowserRoot(bookmarks, folders, 'firefox')
  }
}, null, 2);

const generateBookmarkHTML = (bookmarks, folders) => {
  const folderMap = {};
  (folders || []).forEach(folder => { folderMap[folder.id] = { ...folder, children: [], bookmarks: [] }; });
  Object.values(folderMap).forEach(folder => {
    if (folder.parentId !== null && folderMap[folder.parentId]) folderMap[folder.parentId].children.push(folder);
  });
  (bookmarks || []).forEach(bookmark => { if (folderMap[bookmark.folderId]) folderMap[bookmark.folderId].bookmarks.push(bookmark); });
  Object.values(folderMap).forEach(folder => {
    folder.children.sort((a, b) => (a.order || 0) - (b.order || 0));
    folder.bookmarks.sort((a, b) => (a.order || 0) - (b.order || 0));
  });
  let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<!-- This is an automatically generated file. -->\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
  const renderFolder = (folder, depth) => {
    if (depth > 50) return '';
    const indent = '    '.repeat(depth);
    let output = `${indent}<DT><H3>${escapeHtml(folder.name)}</H3>\n${indent}<DL><p>\n`;
    folder.bookmarks.forEach(bookmark => {
      const timestamp = Math.floor(new Date(bookmark.createdAt || Date.now()).getTime() / 1000);
      const tags = normalizeTags(bookmark.tags);
      const tagsAttribute = tags.length ? ` TAGS="${escapeHtml(tags.join(','), true)}"` : '';
      output += `${indent}    <DT><A HREF="${escapeHtml(bookmark.url, true)}" ADD_DATE="${timestamp}"${tagsAttribute}>${escapeHtml(bookmark.name)}</A>\n`;
    });
    folder.children.forEach(child => { output += renderFolder(child, depth + 1); });
    return `${output}${indent}</DL><p>\n`;
  };
  const root = folderMap.root;
  if (root) {
    root.children.forEach(folder => { html += renderFolder(folder, 1); });
    root.bookmarks.forEach(bookmark => {
      const timestamp = Math.floor(new Date(bookmark.createdAt || Date.now()).getTime() / 1000);
      const tags = normalizeTags(bookmark.tags);
      const tagsAttribute = tags.length ? ` TAGS="${escapeHtml(tags.join(','), true)}"` : '';
      html += `    <DT><A HREF="${escapeHtml(bookmark.url, true)}" ADD_DATE="${timestamp}"${tagsAttribute}>${escapeHtml(bookmark.name)}</A>\n`;
    });
  }
  return `${html}</DL><p>`;
};

module.exports = { parseBookmarkJSON, generateBookmarkJSON, generateBookmarkHTML, normalizeTags, isValidUrl, escapeHtml };
