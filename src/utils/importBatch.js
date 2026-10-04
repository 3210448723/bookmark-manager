/**
 * 生成一次独立导入批次的数据。
 *
 * 该模块不依赖 Vue/DOM，既方便在 store 中复用，也方便用 Node 做回归测试。
 * `batchId` 允许测试传入确定值，生产环境省略即可。
 * @param {Object} options
 * @returns {{ rootFolder: Object, folders: Object[], bookmarks: Object[] }}
 */
function createImportBatch(options) {
  const {
    bookmarks = [],
    folders = [],
    importRootName = '导入书签',
    rootFolderCount = 0,
    batchId = `import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  } = options || {};

  const rootId = `${batchId}_root`;
  const folderIdMap = new Map();
  const sourceFolders = folders.filter(folder => folder && folder.id !== 'root');
  sourceFolders.forEach((folder, index) => folderIdMap.set(folder.id, `${batchId}_folder_${index}`));

  const rootFolder = {
    id: rootId,
    name: importRootName,
    parentId: 'root',
    isExpanded: true,
    isImportRoot: true,
    createdAt: new Date().toISOString(),
    order: rootFolderCount
  };

  const addedFolders = [rootFolder];
  sourceFolders.forEach(folder => {
    const parentId = folder.parentId === 'root' ? rootId : (folderIdMap.get(folder.parentId) || rootId);
    addedFolders.push({
      ...folder,
      id: folderIdMap.get(folder.id),
      parentId,
      order: addedFolders.filter(item => item.parentId === parentId).length
    });
  });

  const addedBookmarks = bookmarks.map((bookmark, index) => ({
    ...bookmark,
    id: `${batchId}_bookmark_${index}`,
    folderId: bookmark.folderId === 'root' ? rootId : (folderIdMap.get(bookmark.folderId) || rootId),
    order: index
  }));

  return { rootFolder, folders: addedFolders, bookmarks: addedBookmarks };
}

module.exports = { createImportBatch };
