import React from 'react';

export default function PhotoImportReport({ report, onClose }) {
  if (!report) return null;
  const duplicateCount = Math.max(0, Number(report.duplicates) || 0);
  const failedCount = Math.max(0, Number(report.failed) || 0);
  const stateClass = failedCount ? 'has-problems' : duplicateCount ? 'has-skips' : 'all-good';

  return (
    <section className={`photo-import-report ${stateClass}`} aria-live="polite">
      <div className="photo-import-report-head">
        <div>
          <strong>Последняя загрузка</strong>
          <span>Выбрано: {report.selected} · добавлено: {report.added}</span>
        </div>
        <button type="button" aria-label="Закрыть отчёт загрузки" onClick={onClose}>×</button>
      </div>

      <div className="photo-import-report-stats">
        {duplicateCount > 0 && <span>Уже были: {duplicateCount}</span>}
        {failedCount > 0 && <span>Не удалось: {failedCount}</span>}
        {report.converted > 0 && <span>HEIC → JPEG: {report.converted}</span>}
        {duplicateCount === 0 && failedCount === 0 && <span>Все выбранные фото добавлены</span>}
      </div>

      {report.issues?.length > 0 && (
        <details open>
          <summary>Что произошло с пропущенными файлами ({report.issues.length})</summary>
          <ul>
            {report.issues.map((item, index) => (
              <li key={`${item.name}-${item.reason}-${index}`} className={item.kind || 'skipped'}>
                <strong>{item.name}</strong>
                <span>{item.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
