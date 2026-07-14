from pathlib import Path


def replace_once(text, old, new, label):
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'Expected source block not found: {label}')


app_path = Path('src/AppLive.jsx')
app = app_path.read_text(encoding='utf-8')
app = replace_once(app,
"""    let cloud = null;
    let cloudError = null;
    try {
      cloud = await saveCloudProject(await portableProject());
    } catch (error) {
      cloudError = error;
      console.warn('Cloud project save failed', error);
    }
""",
"""    let cloud = null;
    let cloudError = null;
    const canSaveCloud = window.__collageCloudAuth?.isAuthenticated?.() === true;
    if (canSaveCloud) {
      try {
        cloud = await saveCloudProject(await portableProject());
      } catch (error) {
        cloudError = error;
        console.warn('Cloud project save failed', error);
      }
    }
""",
'authenticated cloud serialization')
app_path.write_text(app, encoding='utf-8')

cloud_path = Path('public/cloud-auth.js')
cloud = cloud_path.read_text(encoding='utf-8')
cloud = replace_once(cloud,
"""  const state = {
    user: null,
    projects: [],
    collapsed: localStorage.getItem('collage-cloud-panel-collapsed') === '1',
    busy: false,
  };

  function el(tag, attrs = {}, children = []) {
""",
"""  const state = {
    user: null,
    projects: [],
    collapsed: localStorage.getItem('collage-cloud-panel-collapsed') === '1',
    busy: false,
  };

  window.__collageCloudAuth = {
    isAuthenticated: () => Boolean(state.user),
  };

  function el(tag, attrs = {}, children = []) {
""",
'cloud authentication bridge')
cloud_path.write_text(cloud, encoding='utf-8')
