from pathlib import Path


def replace_once(text, old, new, label):
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'patch anchor not found: {label}')


path = Path('src/AppLive.jsx')
source = path.read_text(encoding='utf-8')

source = replace_once(
    source,
    """} from './editor/photoAssets';
import { loadCachedImage as loadImage } from './editor/imageCache';
""",
    """} from './editor/photoAssets';
import { cleanupOrphanedPhotoAssets } from './editor/photoAssetCleanup';
import { loadCachedImage as loadImage } from './editor/imageCache';
""",
    'cleanup import',
)

source = replace_once(
    source,
    """  useEffect(() => () => releaseAllPhotoRuntimeUrls(), []);

  useEffect(() => {
    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateRecords)); } catch { /* ignore localStorage errors */ }
  }, [templateRecords]);
""",
    """  useEffect(() => () => releaseAllPhotoRuntimeUrls(), []);

  useEffect(() => {
    const timer = setTimeout(() => {
      cleanupPhotoAssetsInBackground(window.__collageApp?.getProject?.());
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateRecords)); } catch { /* ignore localStorage errors */ }
  }, [templateRecords]);
""",
    'startup cleanup effect',
)

source = replace_once(
    source,
    """


  function liveProject() {
""",
    """


  function cleanupPhotoAssetsInBackground(currentProject) {
    void cleanupOrphanedPhotoAssets({ currentProject })
      .then((result) => {
        if (!result.deletedCount) return;
        releaseUnusedPhotoRuntimeUrls(result.activeAssetIds);
        console.info(`Photo asset cleanup removed ${result.deletedCount} orphaned files`);
      })
      .catch((error) => console.warn('Photo asset cleanup skipped', error));
  }

  function liveProject() {
""",
    'cleanup helper',
)

source = replace_once(
    source,
    """    const outcome = describeSaveResult({ local, indexedDb, cloud, cloudError });
    show(outcome.message);
    return { ok: outcome.ok, local, indexedDb, cloud, cloudError, data };
""",
    """    const outcome = describeSaveResult({ local, indexedDb, cloud, cloudError });
    show(outcome.message);
    if (outcome.ok) cleanupPhotoAssetsInBackground(data);
    return { ok: outcome.ok, local, indexedDb, cloud, cloudError, data };
""",
    'post-save cleanup',
)

path.write_text(source, encoding='utf-8')
