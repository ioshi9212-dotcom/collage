from pathlib import Path

app_path = Path('src/AppLive.jsx')
styles_path = Path('src/styles.css')
app = app_path.read_text(encoding='utf-8')
styles = styles_path.read_text(encoding='utf-8')

if "import PhotoLibraryThumbnail from './editor/PhotoLibraryThumbnail';" not in app:
    anchor = "import { compactProjectPhotos } from './editor/photoStorage';\n"
    if anchor not in app:
        raise SystemExit('Photo import anchor not found')
    app = app.replace(
        anchor,
        "import PhotoLibraryThumbnail from './editor/PhotoLibraryThumbnail';\n"
        "import { readPhotoFilesAsDataUrls } from './editor/photoImportQueue';\n"
        + anchor,
        1,
    )

if 'const photoUploadInFlightRef = useRef(false);' not in app:
    anchor = '  const noticeTimerRef = useRef(null);\n'
    if anchor not in app:
        raise SystemExit('Upload ref anchor not found')
    app = app.replace(anchor, anchor + '  const photoUploadInFlightRef = useRef(false);\n', 1)

if 'const [photoImporting, setPhotoImporting] = useState(false);' not in app:
    anchor = '  const [selectedPhotoId, setSelectedPhotoId] = useState(null);\n'
    if anchor not in app:
        raise SystemExit('Upload state anchor not found')
    app = app.replace(anchor, anchor + '  const [photoImporting, setPhotoImporting] = useState(false);\n', 1)

if 'async function uploadPhotos(event)' not in app:
    start = app.find('  function uploadPhotos(event) {')
    end = app.find('\n\n  function putPhoto(', start)
    if start < 0 or end < 0:
        raise SystemExit('Upload function boundaries not found')
    replacement = '''  async function uploadPhotos(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (photoUploadInFlightRef.current) return show('Дождись окончания текущей загрузки фото');

    const selection = selectPhotoUploads(files, library.length);
    if (!selection.accepted.length) {
      if (selection.rejectedSize) return show('Фото слишком большие. Максимум 25 МБ на файл.');
      if (selection.rejectedLimit) return show(`В библиотеке можно хранить не больше ${MAX_LIBRARY_PHOTOS} фото`);
      return show('Подходящих изображений не найдено');
    }

    photoUploadInFlightRef.current = true;
    setPhotoImporting(true);
    const skippedBeforeRead = selection.rejectedType + selection.rejectedSize + selection.rejectedLimit;
    show(`Загружаю фото: ${selection.accepted.length}`);

    try {
      const result = await readPhotoFilesAsDataUrls(selection.accepted);
      const availableSlots = Math.max(0, MAX_LIBRARY_PHOTOS - library.length);
      const additions = result.loaded.slice(0, availableSlots).map(({ file, dataUrl }) => ({
        id: makeId(),
        name: file.name,
        src: dataUrl,
      }));
      if (additions.length) {
        setLibrary((current) => [...current, ...additions].slice(0, MAX_LIBRARY_PHOTOS));
      }

      const overflow = Math.max(0, result.loaded.length - additions.length);
      const skipped = skippedBeforeRead + result.failed.length + overflow;
      const suffix = skipped ? ` · пропущено: ${skipped}` : '';
      show(`Фото загружены: ${additions.length}${suffix}`);
    } catch (error) {
      console.warn('Photo import failed', error);
      show('Не удалось загрузить фотографии');
    } finally {
      photoUploadInFlightRef.current = false;
      setPhotoImporting(false);
    }
  }'''
    app = app[:start] + replacement + app[end:]

old_upload = '<label className="upload-box"><strong>Загрузить фото</strong><small>Можно сразу несколько</small><input type="file" accept="image/*" multiple onChange={uploadPhotos} /></label>'
new_upload = '<label className={`upload-box ${photoImporting ? \'disabled-upload-box\' : \'\'}`}><strong>{photoImporting ? \'Загружаю фото…\' : \'Загрузить фото\'}</strong><small>{photoImporting ? \'Оригиналы читаются по очереди\' : \'Можно сразу несколько\'}</small><input type="file" accept="image/*" multiple disabled={photoImporting} onChange={uploadPhotos} /></label>'
if old_upload in app:
    app = app.replace(old_upload, new_upload, 1)
elif new_upload not in app:
    raise SystemExit('Upload control anchor not found')

old_clear = "disabled={library.length === 0}>Очистить список фото</button>"
new_clear = "disabled={library.length === 0 || photoImporting}>Очистить список фото</button>"
if old_clear in app:
    app = app.replace(old_clear, new_clear, 1)
elif new_clear not in app:
    raise SystemExit('Clear photo button anchor not found')

old_image = '<img src={photo.src} alt={photo.name} draggable="false" />'
new_image = '<PhotoLibraryThumbnail photo={photo} />'
if old_image in app:
    app = app.replace(old_image, new_image, 1)
elif new_image not in app:
    raise SystemExit('Library image anchor not found')

if 'content-visibility: auto;' not in styles:
    start = styles.find('.photo-card {')
    end = styles.find('\n}', start)
    if start < 0 or end < 0:
        raise SystemExit('Photo card CSS block not found')
    styles = styles[:end] + '\n  content-visibility: auto;\n  contain: layout paint style;\n  contain-intrinsic-size: 96px 132px;' + styles[end:]

if '.photo-thumbnail-placeholder' not in styles:
    anchor = '.photo-card:hover { outline: 3px solid rgba(79, 143, 116, 0.22); }\n'
    if anchor not in styles:
        raise SystemExit('Photo thumbnail CSS anchor not found')
    block = '''.photo-card:hover { outline: 3px solid rgba(79, 143, 116, 0.22); }
.photo-thumbnail {
  display: grid;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  place-items: center;
  background: linear-gradient(145deg, #f4f7f5, #e7eeea);
  pointer-events: none;
}
.photo-thumbnail-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: #87918c;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .05em;
  text-transform: uppercase;
}
.photo-thumbnail-failed .photo-thumbnail-placeholder { color: #9f5b52; }
.disabled-upload-box { opacity: .62; cursor: progress; }
'''
    styles = styles.replace(anchor, block, 1)

app_path.write_text(app, encoding='utf-8')
styles_path.write_text(styles, encoding='utf-8')
