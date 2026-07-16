import Konva from 'konva';

const TRANSFORMER_NAME = 'collage-text-selection-transformer';
const SAFE_BODY_FONT_ID = 'system';
const BODY_TEXT_BUTTONS = new Set(['+ Обычный текст', '+ Текст']);
const MIN_TEXT_WIDTH = 40;
const MAX_TEXT_WIDTH = 4000;

const FONT_OPTIONS = [
  { id: 'system', family: 'Arial, sans-serif' },
  { id: 'onest', family: "'Collage Onest', Arial, sans-serif" },
  { id: 'lato-light', family: "'Collage Lato Light', Arial, sans-serif" },
  { id: 'montserrat-alt', family: "'Collage Montserrat Alternates', Arial, sans-serif" },
  { id: 'bebas', family: "'Collage Bebas Neue', Arial, sans-serif" },
  { id: 'new-standard', family: "'Collage New Standard Old', Georgia, serif" },
  { id: 'caslon', family: "'Collage Caslon Becker', Georgia, serif" },
  { id: 'agreverence', family: "'Collage AGReverence', Georgia, serif" },
  { id: 'good-vibes', family: "'Collage Good Vibes', cursive" },
  { id: 'chopin', family: "'Collage Chopin Script', cursive" },
  { id: 'thin-pen', family: "'Collage Script Thin Pen', cursive" },
  { id: 'shelley', family: "'Collage Shelley Volante', cursive" },
  { id: 'calligraphia', family: "'Collage Calligraphia One', cursive" },
  { id: 'czizh', family: "'Collage Czizh', serif" },
  { id: 'karsten', family: "'Collage Karsten', serif" },
  { id: 'patefon', family: "'Collage Patefon', serif" },
  { id: 'romand', family: "'Collage RomanD', serif" },
  { id: 'web-serveroff', family: "'Collage Web Serveroff', sans-serif" },
  { id: 'zector', family: "'Collage Zector', sans-serif" },
  { id: 'zeferino', family: "'Collage Zeferino Two', serif" },
];

const FONT_BY_ID = new Map(FONT_OPTIONS.map((font) => [font.id, font]));
let fontPreloadPromise = null;

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function afterReactPaint(callback) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

function visibleEditorStage() {
  return Array.from(Konva.stages || []).find((stage) => {
    const container = stage?.container?.();
    return container?.closest?.('.stage-frame') && container.offsetParent !== null;
  }) || null;
}

function isUserTextNode(node) {
  return node?.getClassName?.() === 'Text'
    && node.attrs?.width != null
    && typeof node.text?.() === 'string';
}

function userTextNodes(stage) {
  if (!stage?.find) return [];
  return stage.find('Text').filter(isUserTextNode);
}

function selectedTextNode(stage) {
  return userTextNodes(stage).find((node) => (
    node.listening?.()
    && Number(node.shadowBlur?.() || 0) > 0
  )) || null;
}

function targetPreviewPixelRatio() {
  return Math.min(2, Math.max(1.5, Number(window.devicePixelRatio) || 1));
}

function sharpenVisibleStage(stage) {
  if (!stage) return 1;
  const target = targetPreviewPixelRatio();
  let applied = 1;

  stage.getLayers?.().forEach((layer) => {
    const sceneCanvas = layer.getCanvas?.();
    const hitCanvas = layer.getHitCanvas?.();
    const current = Number(sceneCanvas?.getPixelRatio?.() || 1);
    applied = Math.max(applied, current);

    if (current + 0.01 < target) {
      sceneCanvas?.setPixelRatio?.(target);
      hitCanvas?.setPixelRatio?.(target);
      applied = target;
      layer.batchDraw?.();
    }
  });

  return applied;
}

function fieldControl(labelText, selector) {
  const labels = Array.from(document.querySelectorAll('.album-mode-inspector label.field'));
  const field = labels.find((label) => normalizeLabel(label.querySelector('span')?.textContent) === labelText);
  return field?.querySelector(selector) || null;
}

function fontSelectControl() {
  return fieldControl('Гарнитура', 'select');
}

function setNativeControlValue(control, value, eventName = 'input') {
  if (!control) return false;
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) return false;

  control.focus?.();
  setter.call(control, String(value));
  control.dispatchEvent(new Event(eventName, { bubbles: true }));
  if (eventName !== 'change') control.dispatchEvent(new Event('change', { bubbles: true }));
  control.blur?.();
  return true;
}

function commitSelectedTextWidth(width) {
  const safeWidth = Math.max(MIN_TEXT_WIDTH, Math.min(MAX_TEXT_WIDTH, Math.round(Number(width) || MIN_TEXT_WIDTH)));
  const input = fieldControl('Ширина', 'input[type="number"]');
  return setNativeControlValue(input, safeWidth, 'input');
}

function currentTextInspectorState() {
  const inspector = document.querySelector('.album-mode-inspector');
  const textarea = inspector?.querySelector('textarea');
  const fontSelect = fontSelectControl();
  return {
    textarea,
    fontSelect,
    text: textarea?.value || '',
    fontId: fontSelect?.value || '',
  };
}

function applySafeBodyFont({ allowExistingPlaceholder = false } = {}) {
  const { textarea, fontSelect, text, fontId } = currentTextInspectorState();
  if (!textarea || !fontSelect || fontId !== 'onest') return false;
  if (!allowExistingPlaceholder && !BODY_TEXT_BUTTONS.has(normalizeLabel(document.body.dataset.pendingTextPreset))) return false;
  if (allowExistingPlaceholder && text !== 'Новый текст') return false;
  return setNativeControlValue(fontSelect, SAFE_BODY_FONT_ID, 'change');
}

function destroyTransformer(stage) {
  const transformer = stage?.findOne?.(`.${TRANSFORMER_NAME}`);
  if (!transformer) return;
  const layer = transformer.getLayer?.();
  transformer.destroy?.();
  layer?.batchDraw?.();
}

function ensureTextTransformer(stage, textNode) {
  if (!stage || !textNode) {
    destroyTransformer(stage);
    return null;
  }

  const layer = textNode.getLayer?.();
  if (!layer) return null;

  let transformer = stage.findOne?.(`.${TRANSFORMER_NAME}`) || null;
  if (!transformer) {
    transformer = new Konva.Transformer({
      name: TRANSFORMER_NAME,
      rotateEnabled: false,
      keepRatio: false,
      flipEnabled: false,
      enabledAnchors: ['middle-left', 'middle-right'],
      anchorSize: 30,
      anchorCornerRadius: 3,
      anchorStroke: '#3e484d',
      anchorStrokeWidth: 2,
      anchorFill: '#ffffff',
      borderStroke: '#3e484d',
      borderStrokeWidth: 2,
      borderDash: [12, 8],
      padding: 10,
      ignoreStroke: true,
      boundBoxFunc: (oldBox, newBox) => ({
        ...newBox,
        width: Math.max(MIN_TEXT_WIDTH, newBox.width),
        height: oldBox.height,
        y: oldBox.y,
      }),
    });
    layer.add(transformer);
  } else if (transformer.getLayer?.() !== layer) {
    transformer.moveTo?.(layer);
  }

  transformer.off?.('.stage4b');
  transformer.nodes?.([textNode]);
  transformer.moveToTop?.();
  transformer.on?.('transformend.stage4b', () => {
    const node = transformer.nodes?.()[0];
    if (!node) return;
    const nextWidth = Math.max(MIN_TEXT_WIDTH, Math.min(MAX_TEXT_WIDTH, node.width() * node.scaleX()));
    node.width(nextWidth);
    node.scaleX(1);
    node.scaleY(1);
    transformer.forceUpdate?.();
    commitSelectedTextWidth(nextWidth);
    node.getLayer?.()?.batchDraw?.();
  });

  transformer.forceUpdate?.();
  layer.batchDraw?.();
  return transformer;
}

function fontDefinition(fontId) {
  return FONT_BY_ID.get(fontId) || FONT_BY_ID.get(SAFE_BODY_FONT_ID);
}

function preloadFontOptions() {
  if (fontPreloadPromise) return fontPreloadPromise;
  if (!document.fonts?.load) return Promise.resolve([]);
  fontPreloadPromise = Promise.allSettled(FONT_OPTIONS.map((font) => (
    document.fonts.load(`16px ${font.family}`, 'АаБбВв')
  )));
  return fontPreloadPromise;
}

function updateFontControlState(select, controls) {
  if (!select || !controls) return;
  const options = Array.from(select.options || []);
  const index = Math.max(0, select.selectedIndex);
  const status = controls.querySelector('.font-picker-live-status');
  const nextText = `${options[index]?.textContent || 'Шрифт'} · ${index + 1}/${Math.max(1, options.length)}`;
  if (status && status.textContent !== nextText) status.textContent = nextText;
}

function setFontSelectValue(select, nextIndex) {
  const options = Array.from(select?.options || []);
  if (!select || !options.length) return false;
  const safeIndex = (nextIndex + options.length) % options.length;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(select, options[safeIndex].value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function ensureFontPickerControls(onStep) {
  const select = fontSelectControl();
  const field = select?.closest('label.field');
  const block = field?.parentElement;
  if (!select || !field || !block) return null;

  field.classList.add('font-picker-live-field');
  let controls = block.querySelector('.font-picker-live-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'font-picker-live-controls';

    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'button font-picker-live-step';
    previous.setAttribute('aria-label', 'Предыдущий шрифт');
    previous.title = 'Предыдущий шрифт';
    previous.textContent = '←';
    previous.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onStep(-1);
    });

    const status = document.createElement('span');
    status.className = 'font-picker-live-status';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'button font-picker-live-step';
    next.setAttribute('aria-label', 'Следующий шрифт');
    next.title = 'Следующий шрифт';
    next.textContent = '→';
    next.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onStep(1);
    });

    controls.append(previous, status, next);
    field.insertAdjacentElement('afterend', controls);
  }

  if (!select.dataset.liveFontKeyboard) {
    select.dataset.liveFontKeyboard = 'true';
    select.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onStep(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onStep(1);
      }
    });
  }

  updateFontControlState(select, controls);
  preloadFontOptions();
  return { select, controls };
}

export function installTextEditingBehavior() {
  if (window.__collageTextEditingBehaviorInstalled) return;
  window.__collageTextEditingBehaviorInstalled = true;

  let scheduled = false;
  let lastPixelRatio = 1;
  let fontLoadRequest = 0;
  const checkedDefaultNodes = new WeakSet();

  function redrawSelectedFont(select = fontSelectControl()) {
    if (!select) return false;
    const stage = visibleEditorStage();
    const textNode = selectedTextNode(stage);
    const font = fontDefinition(select.value);
    if (!textNode || !font) return false;

    textNode.fontFamily(font.family);
    textNode.clearCache?.();
    textNode.getLayer?.()?.batchDraw?.();
    stage?.findOne?.(`.${TRANSFORMER_NAME}`)?.forceUpdate?.();
    return true;
  }

  function scheduleFontRedraw(select = fontSelectControl()) {
    if (!select) return;
    const requestId = ++fontLoadRequest;
    redrawSelectedFont(select);
    afterReactPaint(() => redrawSelectedFont(fontSelectControl()));

    const stage = visibleEditorStage();
    const textNode = selectedTextNode(stage);
    const font = fontDefinition(select.value);
    if (!document.fonts?.load || !font) return;
    const style = String(textNode?.fontStyle?.() || 'normal 500');
    const sample = String(textNode?.text?.() || 'АаБбВв');

    Promise.resolve(document.fonts.load(`${style} 16px ${font.family}`, sample))
      .then(() => {
        if (requestId !== fontLoadRequest) return;
        afterReactPaint(() => redrawSelectedFont(fontSelectControl()));
      })
      .catch(() => {});
  }

  function stepFont(direction) {
    const select = fontSelectControl();
    if (!select) return false;
    const changed = setFontSelectValue(select, select.selectedIndex + direction);
    if (changed) {
      updateFontControlState(select, select.parentElement?.nextElementSibling);
      scheduleFontRedraw(select);
    }
    return changed;
  }

  function sync() {
    scheduled = false;
    const stage = visibleEditorStage();
    if (!stage) return;

    lastPixelRatio = sharpenVisibleStage(stage);
    const textNode = selectedTextNode(stage);
    ensureTextTransformer(stage, textNode);
    ensureFontPickerControls(stepFont);

    if (textNode && !checkedDefaultNodes.has(textNode)) {
      checkedDefaultNodes.add(textNode);
      applySafeBodyFont({ allowExistingPlaceholder: true });
    }
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    afterReactPaint(sync);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button');
    const label = normalizeLabel(button?.textContent);

    if (BODY_TEXT_BUTTONS.has(label)) {
      document.body.dataset.pendingTextPreset = label;
      afterReactPaint(() => {
        applySafeBodyFont();
        delete document.body.dataset.pendingTextPreset;
        scheduleSync();
      });
      return;
    }

    scheduleSync();
  }, true);

  document.addEventListener('pointerup', scheduleSync, true);
  document.addEventListener('change', (event) => {
    const target = event.target instanceof HTMLSelectElement ? event.target : null;
    if (target && target === fontSelectControl()) {
      const controls = target.closest('.inspector-block')?.querySelector('.font-picker-live-controls');
      updateFontControlState(target, controls);
      scheduleFontRedraw(target);
    }
    scheduleSync();
  }, true);
  document.addEventListener('input', (event) => {
    const target = event.target instanceof HTMLSelectElement ? event.target : null;
    if (target && target === fontSelectControl()) {
      const controls = target.closest('.inspector-block')?.querySelector('.font-picker-live-controls');
      updateFontControlState(target, controls);
      scheduleFontRedraw(target);
    }
    scheduleSync();
  }, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.fonts?.ready?.then(scheduleSync).catch(() => {});
  window.addEventListener('resize', scheduleSync);

  window.__collageTextEditing = {
    getState: () => {
      const stage = visibleEditorStage();
      const selected = selectedTextNode(stage);
      const transformer = stage?.findOne?.(`.${TRANSFORMER_NAME}`) || null;
      const inspector = currentTextInspectorState();
      const controls = document.querySelector('.font-picker-live-controls');
      return {
        hasStage: Boolean(stage),
        hasSelectedText: Boolean(selected),
        hasTransformer: Boolean(transformer),
        hasFontControls: Boolean(controls),
        pixelRatio: lastPixelRatio,
        fontId: inspector.fontId,
        text: inspector.text,
        renderedFontFamily: selected?.fontFamily?.() || null,
        width: selected ? Math.round(selected.width() * selected.scaleX()) : null,
      };
    },
    resizeSelectedText: (width) => {
      const stage = visibleEditorStage();
      const selected = selectedTextNode(stage);
      if (!selected) return false;
      const safeWidth = Math.max(MIN_TEXT_WIDTH, Math.min(MAX_TEXT_WIDTH, Math.round(Number(width) || MIN_TEXT_WIDTH)));
      selected.width(safeWidth);
      selected.scaleX(1);
      selected.getLayer?.()?.batchDraw?.();
      const committed = commitSelectedTextWidth(safeWidth);
      scheduleSync();
      return committed;
    },
    stepFont,
  };

  scheduleSync();
}
