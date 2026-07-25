import React, { useEffect, useMemo, useState } from 'react';
import {
  COLLAGE_PRESET_CATEGORIES,
  COLLAGE_PRESET_COUNTS,
  collagePresetsFor,
} from './collagePresetCatalog.js';
import './collagePresetPicker.css';

function PreviewFrame({ definition, index }) {
  return (
    <span
      className="collage-preset-preview-frame"
      style={{
        left: `${definition.x * 100}%`,
        top: `${definition.y * 100}%`,
        width: `${definition.width * 100}%`,
        height: `${definition.height * 100}%`,
        zIndex: Number(definition.zIndex) || 0,
      }}
    >
      {index + 1}
    </span>
  );
}

export default function CollagePresetPicker({ activeCount = 5, disabled = false, onApply }) {
  const initialCount = COLLAGE_PRESET_COUNTS.includes(Number(activeCount)) ? Number(activeCount) : 5;
  const [count, setCount] = useState(initialCount);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    const next = Number(activeCount);
    if (COLLAGE_PRESET_COUNTS.includes(next)) setCount(next);
  }, [activeCount]);

  const presets = useMemo(() => collagePresetsFor({ count, category }), [count, category]);

  return (
    <section className="collage-preset-picker" aria-label="Готовые композиции коллажа">
      <div className="collage-preset-picker-heading">
        <div>
          <h3>Готовые композиции</h3>
          <p>Сетки, журнальные варианты и фото внахлёст.</p>
        </div>
        <b>{count} фото</b>
      </div>

      <div className="collage-preset-counts" aria-label="Количество фото в композиции">
        {COLLAGE_PRESET_COUNTS.map((value) => (
          <button
            key={value}
            type="button"
            className={value === count ? 'active' : ''}
            aria-pressed={value === count}
            onClick={() => setCount(value)}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="collage-preset-categories" aria-label="Тип композиции">
        {COLLAGE_PRESET_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === category ? 'active' : ''}
            aria-pressed={item.id === category}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="collage-preset-grid">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`collage-preset-card collage-preset-${preset.category}`}
            data-preset-id={preset.id}
            disabled={disabled}
            onClick={() => onApply?.(preset)}
            title={`${preset.name}. ${preset.description}`}
          >
            <span className="collage-preset-preview" aria-hidden="true">
              {[...preset.frames]
                .sort((left, right) => (Number(left.zIndex) || 0) - (Number(right.zIndex) || 0))
                .map((definition, index) => (
                  <PreviewFrame key={`${preset.id}-${index}`} definition={definition} index={index} />
                ))}
            </span>
            <span className="collage-preset-card-copy">
              <b>{preset.name}</b>
              <small>{preset.description}</small>
            </span>
          </button>
        ))}
      </div>

      {!presets.length && <p className="collage-preset-empty">Для этой категории пока нет вариантов.</p>}
      <p className="collage-preset-note">Уже вставленные фото сохранятся и распределятся по новым окнам по порядку.</p>
    </section>
  );
}
