import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva';

const STORAGE_KEY = 'collage-creator-project-v2';

const CANVAS_PRESETS = [
  { id: 'a5-portrait', label: 'A5 вертикальный', width: 1480, height: 2100 },
  { id: 'a5-landscape', label: 'A5 горизонтальный', width: 2100, height: 1480 },
  { id: 'a4-portrait', label: 'A4 вертикальный', width: 2100, height: 2970 },
  { id: 'square', label: 'Квадрат', width: 2000, height: 2000 },
  { id: 'draft', label: 'Черновик', width: 1000, height: 700 },
  { id: 'custom', label: 'Свой размер', width: 1480, height: 2100 },
];

const DEFAULT_CANVAS = {
  width: 1480,
  height: 2100,
};

const DEFAULT_SETTINGS = {
  presetId: 'a5-portrait',
  frameCount: 5,
  padding: 70,
  gap: 28,
  borderWidth: 0,
  borderColor: '#ffffff',
  backgroundColor: '#ffffff',
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function getLayoutRows(frameCount) {
  const layouts = {
    1: [1],
    2: [2],
    3: [2, 1],
    4: [2, 2],
    5: [2, 2, 1],
    6: [3, 3],
    7: [3, 3, 1],
    8: [4, 4],
    9: [3, 3, 3],
  };

  return layouts[frameCount] ?? layouts[5];
}

function createFrames(canvas, settings, previousFrames = []) {
  const rows = getLayoutRows(settings.frameCount);
  const padding = Math.min(settings.padding, Math.floor(canvas.width / 3), Math.floor(canvas.height / 3));
  const gap = Math.max(0, settings.gap);
  const innerWidth = Math.max(40, canvas.width - padding * 2);
  const innerHeight = Math.max(40, canvas.height - padding * 2);
  const rowHeight = (innerHeight - gap * (rows.length - 1)) / rows.length;
  const frames = [];

  rows.forEach((columns, rowIndex) => {
    const columnWidth = (innerWidth - gap * (columns - 1)) / columns;
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const previous = previousFrames[frames.length];
      frames.push({
        id: previous?.id ?? `frame_${frames.length + 1}`,
        x: Math.round(padding + columnIndex * (columnWidth + gap)),
        y: Math.round(padding + rowIndex * (rowHeight + gap)),
        width: Math.round(columnWidth),
        height: Math.round(rowHeight),
        photo: previous?.photo ?? null,
      });
    }
  });

  return frames.slice(0, settings.frameCount);
}

function getCoverRect(image, frame, photo) {
  if (!image) return null;

  const zoom = photo?.zoom ?? 1;
  const coverScale = Math.max(frame.width / image.width, frame.height / image.height) * zoom;
  const width = image.width * coverScale;
  const height = image.height * coverScale;
  const baseX = (frame.width - width) / 2;
  const baseY = (frame.height - height) / 2;

  return {
    x: baseX + (photo?.offsetX ?? 0),
    y: baseY + (photo?.offsetY ?? 0),
    baseX,
    baseY,
    width,
    height,
  };
}

function CollageFrame({ frame, selected, borderWidth, borderColor, onSelect, onPhotoMove }) {
  const [image, setImage] = useState(null);
  const photo = frame.photo;
  const cover = photo ? getCoverRect(image, frame, photo) : null;

  useEffect(() => {
    let active = true;

    if (!photo?.src) {
      setImage(null);
      return () => {
        active = false;
      };
    }

    loadImage(photo.src)
      .then((loadedImage) => {
        if (active) setImage(loadedImage);
      })
      .catch(() => {
        if (active) setImage(null);
      });

    return () => {
      active = false;
    };
  }, [photo?.src]);

  return (
    <Group
      x={frame.x}
      y={frame.y}
      clipX={0}
      clipY={0}
      clipWidth={frame.width}
      clipHeight={frame.height}
      onMouseDown={onSelect}
      onTap={onSelect}
    >
      <Rect
        x={0}
        y={0}
        width={frame.width}
        height={frame.height}
        fill="#fbf7f2"
        stroke={selected ? '#c27b4f' : borderColor}
        strokeWidth={selected ? Math.max(5, borderWidth) : borderWidth}
      />

      {photo && cover && (
        <KonvaImage
          image={image}
          x={cover.x}
          y={cover.y}
          width={cover.width}
          height={cover.height}
          draggable={selected}
          onMouseDown={onSelect}
          onTap={onSelect}
          onDragEnd={(event) => {
            onPhotoMove(frame.id, {
              offsetX: Math.round(event.target.x() - cover.baseX),
              offsetY: Math.round(event.target.y() - cover.baseY),
            });
          }}
        />
      )}

      {!photo && (
        <>
          <Rect
            x={14}
            y={14}
            width={Math.max(0, frame.width - 28)}
            height={Math.max(0, frame.height - 28)}
            stroke="#d8c7b9"
            strokeWidth={2}
            dash={[14, 10]}
            cornerRadius={12}
          />
          <Text
            x={20}
            y={frame.height / 2 - 22}
            width={Math.max(0, frame.width - 40)}
            align="center"
            text="Перетащи фото сюда"
            fontSize={Math.max(18, Math.min(34, frame.width / 18))}
            fill="#b49a87"
            fontStyle="700"
          />
        </>
      )}
    </Group>
  );
}

export default function App() {
  const stageRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [library, setLibrary] = useState([]);
  const [canvas, setCanvas] = useState(DEFAULT_CANVAS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [frames, setFrames] = useState(() => createFrames(DEFAULT_CANVAS, DEFAULT_SETTINGS));
  const [selectedFrameId, setSelectedFrameId] = useState(null);
  const [notice, setNotice] = useState('');

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? null,
    [frames, selectedFrameId]
  );

  function showNotice(text) {
    setNotice(text);
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => setNotice(''), 2600);
  }

  function rebuildFrames(nextCanvas = canvas, nextSettings = settings) {
    setFrames((current) => createFrames(nextCanvas, nextSettings, current));
    setSelectedFrameId(null);
  }

  function updateSetting(key, value) {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    rebuildFrames(canvas, nextSettings);
  }

  function updateCanvasSize(width, height, presetId = settings.presetId) {
    const nextCanvas = {
      width: clampNumber(width, 300, 5000),
      height: clampNumber(height, 300, 5000),
    };
    const nextSettings = { ...settings, presetId };
    setCanvas(nextCanvas);
    setSettings(nextSettings);
    rebuildFrames(nextCanvas, nextSettings);
  }

  function handlePresetChange(event) {
    const preset = CANVAS_PRESETS.find((item) => item.id === event.target.value) ?? CANVAS_PRESETS[0];
    updateCanvasSize(preset.width, preset.height, preset.id);
  }

  function handlePhotoUpload(event) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = () => {
        setLibrary((current) => [
          ...current,
          {
            id: createId(),
            name: file.name,
            src: reader.result,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    event.target.value = '';
    showNotice('Фото загружены. Теперь перетащи их в рамки.');
  }

  function putPhotoIntoFrame(frameId, photo) {
    setFrames((current) =>
      current.map((frame) =>
        frame.id === frameId
          ? {
              ...frame,
              photo: {
                id: photo.id,
                name: photo.name,
                src: photo.src,
                zoom: 1,
                offsetX: 0,
                offsetY: 0,
              },
            }
          : frame
      )
    );
    setSelectedFrameId(frameId);
  }

  function handleCanvasDrop(event) {
    event.preventDefault();
    const photoId = event.dataTransfer.getData('photo-id');
    const photo = library.find((item) => item.id === photoId);

    if (!photo || !stageRef.current) return;

    stageRef.current.setPointersPositions(event);
    const point = stageRef.current.getPointerPosition();

    if (!point) return;

    const targetFrame = frames.find(
      (frame) => point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= frame.y && point.y <= frame.y + frame.height
    );

    if (!targetFrame) {
      showNotice('Перетащи фото прямо в нужную рамку');
      return;
    }

    putPhotoIntoFrame(targetFrame.id, photo);
  }

  function updateFramePhoto(frameId, patch) {
    setFrames((current) =>
      current.map((frame) =>
        frame.id === frameId && frame.photo
          ? {
              ...frame,
              photo: {
                ...frame.photo,
                ...patch,
              },
            }
          : frame
      )
    );
  }

  function updateSelectedFrameGeometry(key, value) {
    if (!selectedFrame) return;

    setFrames((current) =>
      current.map((frame) => {
        if (frame.id !== selectedFrame.id) return frame;

        const maxForKey = key === 'x' || key === 'width' ? canvas.width : canvas.height;
        return {
          ...frame,
          [key]: clampNumber(value, key === 'width' || key === 'height' ? 30 : 0, maxForKey),
        };
      })
    );
  }

  function removeSelectedPhoto() {
    if (!selectedFrame) return;
    setFrames((current) =>
      current.map((frame) => (frame.id === selectedFrame.id ? { ...frame, photo: null } : frame))
    );
  }

  function resetSelectedPhoto() {
    if (!selectedFrame?.photo) return;
    updateFramePhoto(selectedFrame.id, { zoom: 1, offsetX: 0, offsetY: 0 });
  }

  function clearCanvas() {
    setFrames((current) => current.map((frame) => ({ ...frame, photo: null })));
    setSelectedFrameId(null);
    showNotice('Фото убраны из рамок');
  }

  function createProject() {
    return {
      version: 2,
      canvas,
      settings,
      library,
      frames,
      savedAt: new Date().toISOString(),
    };
  }

  function saveProject() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createProject()));
    showNotice('Проект сохранён в браузере');
  }

  function loadProject() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      showNotice('Сохранённого проекта пока нет');
      return;
    }

    try {
      const project = JSON.parse(raw);
      setCanvas(project.canvas ?? DEFAULT_CANVAS);
      setSettings(project.settings ?? DEFAULT_SETTINGS);
      setLibrary(Array.isArray(project.library) ? project.library : []);
      setFrames(Array.isArray(project.frames) ? project.frames : createFrames(project.canvas ?? DEFAULT_CANVAS, project.settings ?? DEFAULT_SETTINGS));
      setSelectedFrameId(null);
      showNotice('Проект загружен');
    } catch {
      showNotice('Не получилось открыть сохранение');
    }
  }

  function exportJson() {
    downloadFile('collage-project.json', JSON.stringify(createProject(), null, 2), 'application/json;charset=utf-8');
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result);
        const nextCanvas = project.canvas ?? DEFAULT_CANVAS;
        const nextSettings = project.settings ?? DEFAULT_SETTINGS;
        setCanvas(nextCanvas);
        setSettings(nextSettings);
        setLibrary(Array.isArray(project.library) ? project.library : []);
        setFrames(Array.isArray(project.frames) ? project.frames : createFrames(nextCanvas, nextSettings));
        setSelectedFrameId(null);
        showNotice('JSON-проект открыт');
      } catch {
        showNotice('Файл не похож на проект коллажа');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function exportPng() {
    setSelectedFrameId(null);
    window.requestAnimationFrame(() => {
      const uri = stageRef.current?.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
      if (!uri) return;

      const link = document.createElement('a');
      link.href = uri;
      link.download = 'collage.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const tagName = document.activeElement?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
      removeSelectedPhoto();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFrame]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Редактор коллажа</p>
          <h1>Collage Creator</h1>
        </div>

        <div className="topbar-actions">
          <button className="button" onClick={saveProject}>Сохранить</button>
          <button className="button" onClick={loadProject}>Открыть</button>
          <button className="button" onClick={exportJson}>Скачать JSON</button>
          <button className="button" onClick={() => jsonInputRef.current?.click()}>Загрузить JSON</button>
          <input ref={jsonInputRef} className="hidden-input" type="file" accept="application/json" onChange={importJson} />
          <button className="button accent" onClick={exportPng}>Скачать PNG</button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="settings-bar">
        <label className="field wide-field">
          <span>Размер холста</span>
          <select value={settings.presetId} onChange={handlePresetChange}>
            {CANVAS_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>

        <label className="field small-field">
          <span>Ширина px</span>
          <input
            type="number"
            min="300"
            max="5000"
            value={canvas.width}
            onChange={(event) => updateCanvasSize(event.target.value, canvas.height, 'custom')}
          />
        </label>

        <label className="field small-field">
          <span>Высота px</span>
          <input
            type="number"
            min="300"
            max="5000"
            value={canvas.height}
            onChange={(event) => updateCanvasSize(canvas.width, event.target.value, 'custom')}
          />
        </label>

        <label className="field small-field">
          <span>Окон</span>
          <select value={settings.frameCount} onChange={(event) => updateSetting('frameCount', Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>
        </label>

        <label className="field small-field">
          <span>Рамка/зазор</span>
          <input
            type="number"
            min="0"
            max="200"
            value={settings.gap}
            onChange={(event) => updateSetting('gap', clampNumber(event.target.value, 0, 200))}
          />
        </label>

        <label className="field small-field">
          <span>Поля</span>
          <input
            type="number"
            min="0"
            max="300"
            value={settings.padding}
            onChange={(event) => updateSetting('padding', clampNumber(event.target.value, 0, 300))}
          />
        </label>
      </section>

      <section className="workspace three-columns">
        <aside className="sidebar">
          <div className="panel-title">
            <div>
              <h2>Фото</h2>
              <p>Загрузи сначала фото сюда, потом перетащи в нужную рамку.</p>
            </div>
            <span>{library.length}</span>
          </div>

          <label className="upload-box">
            <strong>Загрузить фото</strong>
            <small>Можно сразу несколько</small>
            <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} />
          </label>

          {library.length === 0 ? (
            <div className="empty-state">
              <p>Пока фото нет. Нажми “Загрузить фото” и добавь изображения для коллажа.</p>
            </div>
          ) : (
            <div className="photo-grid">
              {library.map((photo) => (
                <div
                  key={photo.id}
                  className="photo-card"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData('photo-id', photo.id);
                  }}
                  title="Перетащи фото в рамку"
                >
                  <img src={photo.src} alt={photo.name} draggable="false" />
                  <span>{photo.name}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="canvas-area">
          <div className="canvas-toolbar">
            <div>
              <strong>{canvas.width}×{canvas.height}px</strong>
              <span> Перетащи фото слева в нужное окно коллажа</span>
            </div>
            <button className="small-button" onClick={() => rebuildFrames()}>Перестроить рамки</button>
            <button className="small-button" onClick={clearCanvas}>Очистить фото</button>
          </div>

          <div className="stage-frame" onDragOver={(event) => event.preventDefault()} onDrop={handleCanvasDrop}>
            <Stage
              ref={stageRef}
              width={canvas.width}
              height={canvas.height}
              onMouseDown={(event) => {
                if (event.target === event.target.getStage() || event.target.name() === 'background') {
                  setSelectedFrameId(null);
                }
              }}
              onTouchStart={(event) => {
                if (event.target === event.target.getStage() || event.target.name() === 'background') {
                  setSelectedFrameId(null);
                }
              }}
            >
              <Layer>
                <Rect
                  name="background"
                  x={0}
                  y={0}
                  width={canvas.width}
                  height={canvas.height}
                  fill={settings.borderColor}
                />

                <Rect
                  x={settings.padding}
                  y={settings.padding}
                  width={Math.max(0, canvas.width - settings.padding * 2)}
                  height={Math.max(0, canvas.height - settings.padding * 2)}
                  fill={settings.borderColor}
                />

                {frames.map((frame, index) => (
                  <CollageFrame
                    key={frame.id}
                    frame={frame}
                    selected={frame.id === selectedFrameId}
                    borderWidth={settings.borderWidth}
                    borderColor={settings.borderColor}
                    onSelect={() => setSelectedFrameId(frame.id)}
                    onPhotoMove={updateFramePhoto}
                  />
                ))}

                {library.length === 0 && (
                  <Text
                    x={0}
                    y={canvas.height / 2 - 28}
                    width={canvas.width}
                    align="center"
                    text="Загрузи фото слева, затем перетащи их в рамки"
                    fontSize={Math.max(26, Math.min(56, canvas.width / 24))}
                    fill="#b7a99d"
                  />
                )}
              </Layer>
            </Stage>
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-title compact">
            <div>
              <h2>Настройки окна</h2>
              <p>{selectedFrame ? 'Выбрана рамка коллажа' : 'Выбери рамку на холсте'}</p>
            </div>
          </div>

          <div className="inspector-block">
            <h3>Цвет и рамка</h3>
            <label className="field color-field">
              <span>Цвет рамки</span>
              <input
                type="color"
                value={settings.borderColor}
                onChange={(event) => updateSetting('borderColor', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Обводка внутри окна</span>
              <input
                type="number"
                min="0"
                max="80"
                value={settings.borderWidth}
                onChange={(event) => updateSetting('borderWidth', clampNumber(event.target.value, 0, 80))}
              />
            </label>
          </div>

          {selectedFrame ? (
            <>
              <div className="inspector-block">
                <h3>Положение рамки</h3>
                <div className="geometry-grid">
                  <label className="field">
                    <span>X</span>
                    <input type="number" value={selectedFrame.x} onChange={(event) => updateSelectedFrameGeometry('x', event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Y</span>
                    <input type="number" value={selectedFrame.y} onChange={(event) => updateSelectedFrameGeometry('y', event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Ширина</span>
                    <input type="number" value={selectedFrame.width} onChange={(event) => updateSelectedFrameGeometry('width', event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Высота</span>
                    <input type="number" value={selectedFrame.height} onChange={(event) => updateSelectedFrameGeometry('height', event.target.value)} />
                  </label>
                </div>
                <p className="hint">Сейчас точная правка рамки через цифры. Следующим шагом сделаем перетягивание разделителей.</p>
              </div>

              <div className="inspector-block">
                <h3>Фото внутри окна</h3>
                {selectedFrame.photo ? (
                  <>
                    <p className="photo-name">{selectedFrame.photo.name}</p>
                    <label className="range-row">
                      <span>Масштаб</span>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.01"
                        value={selectedFrame.photo.zoom}
                        onChange={(event) => updateFramePhoto(selectedFrame.id, { zoom: Number(event.target.value) })}
                      />
                      <b>{selectedFrame.photo.zoom.toFixed(2)}</b>
                    </label>
                    <button className="button full" onClick={resetSelectedPhoto}>Центрировать фото</button>
                    <button className="button full danger-button" onClick={removeSelectedPhoto}>Убрать фото из окна</button>
                  </>
                ) : (
                  <p className="hint">Перетащи фото из левой панели в выбранную рамку.</p>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state small-empty">
              <p>Нажми на любое окно коллажа, чтобы настроить фото, масштаб и положение рамки.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
