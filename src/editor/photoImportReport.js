function safeName(file) {
  return String(file?.sourceName || file?.name || 'Фото');
}

function safeReason(error, fallback) {
  const message = String(error?.message || '').trim();
  return message || fallback;
}

function addFiles(target, files, reason, kind = 'skipped') {
  for (const file of Array.from(files || [])) {
    target.push({ name: safeName(file), reason, kind });
  }
}

export function buildPhotoImportReport({
  selectedFiles = [],
  added = 0,
  duplicates = [],
  initialSelection = {},
  prepared = {},
  finalSelection = {},
  storageFailures = [],
  unexpectedError = null,
} = {}) {
  const issues = [];

  addFiles(issues, duplicates, 'Такое фото уже было загружено', 'duplicate');
  addFiles(issues, initialSelection.rejectedTypeFiles, 'Формат файла не распознан');
  addFiles(issues, initialSelection.rejectedSizeFiles, 'Файл больше 25 МБ');
  addFiles(issues, initialSelection.rejectedLimitFiles, 'Достигнут лимит загрузки или библиотеки');

  for (const item of Array.from(prepared.failed || [])) {
    issues.push({
      name: safeName(item?.file),
      reason: safeReason(item?.error, 'Не удалось преобразовать HEIC в JPEG'),
      kind: 'error',
    });
  }

  addFiles(issues, finalSelection.rejectedTypeFiles, 'Формат после обработки не распознан');
  addFiles(issues, finalSelection.rejectedSizeFiles, 'После преобразования файл стал больше 25 МБ');
  addFiles(issues, finalSelection.rejectedLimitFiles, 'Достигнут лимит загрузки или библиотеки');

  for (const item of Array.from(storageFailures || [])) {
    issues.push({
      name: safeName(item?.file),
      reason: safeReason(item?.error || item?.persistenceError, 'Браузер не смог сохранить фотографию'),
      kind: 'error',
    });
  }

  if (unexpectedError) {
    issues.push({
      name: 'Вся загрузка',
      reason: safeReason(unexpectedError, 'Неизвестная ошибка загрузки'),
      kind: 'error',
    });
  }

  const selected = Array.from(selectedFiles || []).length;
  const addedCount = Math.max(0, Number(added) || 0);
  const duplicateCount = Array.from(duplicates || []).length;
  const failedCount = issues.filter((item) => item.kind !== 'duplicate').length;

  return {
    selected,
    added: addedCount,
    notAdded: Math.max(0, selected - addedCount),
    duplicates: duplicateCount,
    failed: failedCount,
    converted: Math.max(0, Number(prepared.converted) || 0),
    issues,
    createdAt: Date.now(),
  };
}
