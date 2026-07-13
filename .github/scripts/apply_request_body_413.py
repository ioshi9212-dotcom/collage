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
    "} from './server/projectQuotas.js';\n",
    "} from './server/projectQuotas.js';\nimport { RequestBodyError, readJsonBody } from './server/requestBody.js';\n",
    'request body import',
)

replace_once(
    "function readBody(request) {\n  return new Promise((resolveBody, rejectBody) => {\n    let body = '';\n    let size = 0;\n\n    request.on('data', (chunk) => {\n      size += chunk.length;\n      if (size > jsonLimitBytes) {\n        rejectBody(new Error('JSON payload is too large'));\n        request.destroy();\n        return;\n      }\n      body += chunk;\n    });\n\n    request.on('end', () => {\n      if (!body) return resolveBody({});\n      try {\n        resolveBody(JSON.parse(body));\n      } catch {\n        rejectBody(new Error('Invalid JSON'));\n      }\n    });\n\n    request.on('error', rejectBody);\n  });\n}\n",
    "function readBody(request) {\n  return readJsonBody(request, jsonLimitBytes);\n}\n",
    'read body implementation',
)

replace_once(
    "  } catch (error) {\n    console.error(error);\n    sendJson(response, 500, {\n      error: 'server_error',\n      message: isProduction ? 'Server error' : error.message || 'Server error',\n    });\n    return;\n  }\n",
    "  } catch (error) {\n    if (error instanceof RequestBodyError) {\n      sendJson(response, error.status, {\n        error: error.code,\n        message: error.message,\n      });\n      return;\n    }\n\n    console.error(error);\n    sendJson(response, 500, {\n      error: 'server_error',\n      message: isProduction ? 'Server error' : error.message || 'Server error',\n    });\n    return;\n  }\n",
    'request body error response',
)

path.write_text(text, encoding='utf-8')
