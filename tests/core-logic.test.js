const test = require('node:test');
const assert = require('node:assert/strict');

const { createImportBatch } = require('../src/utils/importBatch');
const { createSortComparator, normalizeSortFunction } = require('../src/utils/sortFunction');

test('每次导入都生成独立根分组并重映射文件夹和书签 ID', () => {
  const source = {
    folders: [{ id: 'source_folder', name: '工作', parentId: 'root' }],
    bookmarks: [{ id: 'source_bookmark', name: '项目', url: 'https://example.com', folderId: 'source_folder' }]
  };
  const first = createImportBatch({ ...source, importRootName: '导入：一', batchId: 'batch_a' });
  const second = createImportBatch({ ...source, importRootName: '导入：二', batchId: 'batch_b' });

  assert.notEqual(first.rootFolder.id, second.rootFolder.id);
  assert.notEqual(first.folders[1].id, second.folders[1].id);
  assert.notEqual(first.bookmarks[0].id, second.bookmarks[0].id);
  assert.equal(first.folders[1].parentId, first.rootFolder.id);
  assert.equal(first.bookmarks[0].folderId, first.folders[1].id);
  assert.equal(second.bookmarks[0].folderId, second.folders[1].id);
});

test('导入批次不会按同名文件夹或 URL 去重', () => {
  const batch = createImportBatch({
    folders: [{ id: 'folder', name: '同名', parentId: 'root' }],
    bookmarks: [
      { id: 'a', name: 'A', url: 'https://same.example', folderId: 'root' },
      { id: 'b', name: 'B', url: 'https://same.example', folderId: 'root' }
    ],
    batchId: 'batch_unique'
  });
  assert.equal(batch.folders.length, 2);
  assert.equal(batch.bookmarks.length, 2);
});

test('自定义排序函数支持函数体和箭头函数，并可重复创建比较器', () => {
  const source = normalizeSortFunction('(a, b) => a.name.localeCompare(b.name)');
  const comparator = createSortComparator(source);
  const values = [{ name: 'C' }, { name: 'A' }, { name: 'B' }].sort(comparator.compare);
  assert.deepEqual(values.map(item => item.name), ['A', 'B', 'C']);
  assert.throws(() => normalizeSortFunction('return window.alert(1)'), /不安全/);
});
