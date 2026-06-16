import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva';

const STORAGE_KEY = 'collage-creator-project-v1';
const CANVAS = {
  width: 1000,
  height: 700,
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

function CollageImage({ item, selected, onSelect, onChange }) {
  const imageRef = useRef(null);
  const transformerRef = useRef(null);
  const [image, setImage] = useState(null);

  useEffect(() => {
    let active = true;
    loadImage(item.src)
      .then((loadedImage) => {
        if (active) setImage(loadedImage);
      })
      .catch(() => {
        if (active) setImage(null);
      });

    return () => {
      active = false;
    };
  }, [item.src]);

  useEffect(() => {
    if (!selected || !transformerRef.current || !imageRef.current) return;
    transformerRef.current.nodes([imageRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selected]);

  return (
    <>
      <KonvaImage
        ref={imageRef}
        image={image}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rotation={item.rotation}
        draggable
        onMouseDown={onSelect}
        onTap={onSelect}
        onDragEnd={(event) => {
          onChange({
            ...item,
            x: Math.round(event.target.x()),
            y: Math.round(event.target.y()),
          });
        }}
        onTransformEnd={() => {
          const node = imageRef.current;
          if (!node) return;

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          node.scaleX(1);
          node.scaleY(1);

          onChange({
            ...item,
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: Math.max(30, Math.round(node.width() * scaleX)),
            height: Math.max(30, Math.round(node.height() * scaleY)),
            rotation: Math.round(node.rotation()),
          });
        }}
      />

      {selected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 40 || newBox.height < 40) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

export default function App() {
  const stageRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [library, setLibrary] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);

  function showNotice(text) {
    setNotice(text);
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => setNotice(''), 2600);
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
    showNotice('Фото добавлены в левую панель');
  }

  function addPhotoToCanvas(photo) {
    const offset = (items.length % 6) * 24;
    const nextItem = {
      id: createId(),
      src: photo.src,
      name: photo.name,
      x: 120 + offset,
      y: 90 + offset,
      width: 260,
      height: 180,
      rotation: 0,
    };

    setItems((current) => [...current, nextItem]);
    setSelectedId(nextItem.id);
  }

  function updateItem(nextItem) {
    setItems((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
  }

  function deleteSelected() {
    if (!selectedId) return;
    setItems((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function moveSelected(direction) {
    if (!selectedId) return;

    setItems((current) => {
      const index = current.findIndex((item) => item.id === selectedId);
      if (index === -1) return current;

      const next = [...current];
      const targetIndex = direction === 'forward' ? Math.min(index + 1, next.length - 1) : Math.max(index - 1, 0);
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  function duplicateSelected() {
    if (!selectedItem) return;

    const copy = {
      ...selectedItem,
      id: createId(),
      x: selectedItem.x + 28,
      y: selectedItem.y + 28,
    };

    setItems((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  function clearCanvas() {
    setItems([]);
    setSelectedId(null);
    showNotice('Холст очищен');
  }

  function saveProject() {
    const project = {
      version: 1,
      canvas: CANVAS,
      library,
      items,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
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
      setLibrary(Array.isArray(project.library) ? project.library : []);
      setItems(Array.isArray(project.items) ? project.items : []);
      setSelectedId(null);
      showNotice('Проект загружен');
    } catch {
      showNotice('Не получилось открыть сохранение');
    }
  }

  function exportJson() {
    const project = {
      version: 1,
      canvas: CANVAS,
      library,
      items,
      savedAt: new Date().toISOString(),
    };

    downloadFile('collage-project.json', JSON.stringify(project, null, 2), 'application/json;charset=utf-8');
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result);
        setLibrary(Array.isArray(project.library) ? project.library : []);
        setItems(Array.isArray(project.items) ? project.items : []);
        setSelectedId(null);
        showNotice('JSON-проект открыт');
      } catch {
        showNotice('Файл не похож на проект коллажа');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function exportPng() {
    setSelectedId(null);
    window.requestAnimationFrame(() => {
      const uri = stageRef.current?.toDataURL({ pixelRatio: 3, mimeType: 'image/png' });
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
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const tagName = document.activeElement?.tagName?.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea') return;
        deleteSelected();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Минимальная база</p>
          <h1>Свободный коллаж</h1>
        </div>

        <div className="topbar-actions">
          <label className="button primary">
            Загрузить фото
            <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} />
          </label>
          <button className="button" onClick={saveProject}>Сохранить</button>
          <button className="button" onClick={loadProject}>Открыть</button>
          <button className="button" onClick={exportJson}>Скачать JSON</button>
          <button className="button" onClick={() => jsonInputRef.current?.click()}>Загрузить JSON</button>
          <input ref={jsonInputRef} className="hidden-input" type="file" accept="application/json" onChange={importJson} />
          <button className="button accent" onClick={exportPng}>Скачать PNG</button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="workspace">
        <aside className="sidebar">
          <div className="panel-title">
            <h2>Фото</h2>
            <span>{library.length}</span>
          </div>

          {library.length === 0 ? (
            <div className="empty-state">
              <p>Загрузи фото, потом нажимай на миниатюры — они появятся на холсте.</p>
            </div>
          ) : (
            <div className="photo-grid">
              {library.map((photo) => (
                <button key={photo.id} className="photo-card" onClick={() => addPhotoToCanvas(photo)} title={photo.name}>
                  <img src={photo.src} alt={photo.name} />
                  <span>{photo.name}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="canvas-area">
          <div className="canvas-toolbar">
            <div>
              <strong>Холст 1000×700</strong>
              <span> фото можно двигать, тянуть за углы и поворачивать</span>
            </div>

            <div className="canvas-actions">
              <button className="small-button" disabled={!selectedId} onClick={duplicateSelected}>Дублировать</button>
              <button className="small-button" disabled={!selectedId} onClick={() => moveSelected('back')}>Назад</button>
              <button className="small-button" disabled={!selectedId} onClick={() => moveSelected('forward')}>Вперёд</button>
              <button className="small-button danger" disabled={!selectedId} onClick={deleteSelected}>Удалить</button>
              <button className="small-button" onClick={clearCanvas}>Очистить</button>
            </div>
          </div>

          <div className="stage-frame">
            <Stage
              ref={stageRef}
              width={CANVAS.width}
              height={CANVAS.height}
              onMouseDown={(event) => {
                const isEmpty = event.target === event.target.getStage() || event.target.name() === 'background';
                if (isEmpty) setSelectedId(null);
              }}
              onTouchStart={(event) => {
                const isEmpty = event.target === event.target.getStage() || event.target.name() === 'background';
                if (isEmpty) setSelectedId(null);
              }}
            >
              <Layer>
                <Rect
                  name="background"
                  x={0}
                  y={0}
                  width={CANVAS.width}
                  height={CANVAS.height}
                  fill="#ffffff"
                  shadowColor="rgba(20, 20, 30, 0.12)"
                  shadowBlur={18}
                  shadowOffsetY={8}
                />

                {items.map((item) => (
                  <CollageImage
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={() => setSelectedId(item.id)}
                    onChange={updateItem}
                  />
                ))}

                {items.length === 0 && (
                  <Text
                    x={0}
                    y={CANVAS.height / 2 - 26}
                    width={CANVAS.width}
                    align="center"
                    text="Загрузи фото и добавь их на холст"
                    fontSize={28}
                    fill="#b7a99d"
                  />
                )}
              </Layer>
            </Stage>
          </div>
        </section>
      </section>
    </main>
  );
}
