import React from 'react';

export default function PhotoImportReport({ report, onClose }) {
  if (!report) return null;
  const problemCount = Math.max(0, Number(report.notAdded) || 0);

  return (
    <section className={`photo-import-report ${problemCount ? 'has-problems' : 'all-good'}`} aria-live="polite">
      <div className="photo-import-report-head">
        <div>
          <strong>Последняя загрузка</strong>
          <span>Выбрано: {report.selected} · добавлено: {report.added} · не добавлено: {problemCount}</span>
        </div>
        <button type="button" aria-label="Закрыть отчёт загрузки" onClick={onClose}>×</button>
      </div>

      <div className="photo-import-report-stats">
        {report.duplicates > 0 && <span>Повторы: {report.duplicates}</span>}
        {report.converted > 0 && <span>HEIC → JPEG: {report.converted}</span>}
        {problemCount === 0 && <span>Все выбранные фото добавлены</span>}
      </div>

      {report.issues?.length > 0 && (
        <details open>
          <summary>Почему не добавились фото ({report.issues.length})</summary>
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
