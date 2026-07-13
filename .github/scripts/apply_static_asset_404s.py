from pathlib import Path

path = Path('server.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import { basename, extname, join, normalize, resolve, sep } from 'node:path';\n",
    "import { basename, extname, join, resolve } from 'node:path';\n",
    'path imports',
)

replace_once(
    "import { RequestBodyError, readJsonBody } from './server/requestBody.js';\n",
    "import { RequestBodyError, readJsonBody } from './server/requestBody.js';\nimport { resolveStaticRequest } from './server/staticFiles.js';\n",
    'static resolver import',
)

replace_once(
    "function safeJoin(baseDir, requestedPath) {\n  let decodedPath = '';\n  try {\n    decodedPath = decodeURIComponent(requestedPath.split('?')[0]);\n  } catch {\n    return null;\n  }\n\n  const cleanPath = normalize(decodedPath).replace(/^[/\\\\]+/, '');\n  const resolvedPath = resolve(join(baseDir, cleanPath));\n  const baseWithSep = baseDir.endsWith(sep) ? baseDir : `${baseDir}${sep}`;\n\n  if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseWithSep)) return null;\n  return resolvedPath;\n}\n\n",
    "",
    'old safeJoin helper',
)

replace_once(
    "  const requestedUrl = request.url === '/' ? '/index.html' : request.url || '/index.html';\n  const filePath = safeJoin(distDir, requestedUrl);\n\n  try {\n    if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {\n      sendFile(response, filePath);\n      return;\n    }\n  } catch {\n    // Fallback to SPA entry below.\n  }\n\n  sendFile(response, join(distDir, 'index.html'));\n",
    "  const staticResult = resolveStaticRequest({\n    distDir,\n    requestUrl: request.url || '/',\n    method: request.method || 'GET',\n  });\n\n  if (staticResult.kind === 'file' || staticResult.kind === 'spa') {\n    sendFile(response, staticResult.path);\n    return;\n  }\n\n  if (staticResult.kind === 'not_found') {\n    response.writeHead(404, {\n      'Content-Type': 'text/plain; charset=utf-8',\n      'Cache-Control': 'no-store',\n      'X-Content-Type-Options': 'nosniff',\n    });\n    response.end('Not found');\n    return;\n  }\n",
    'static file fallback',
)

path.write_text(text, encoding='utf-8')
