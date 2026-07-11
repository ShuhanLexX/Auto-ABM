import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales')
const en = fs.readFileSync(path.join(localesDir, 'en.ts'), 'utf8')

const keys = [
  'empty.quick.code',
  'empty.quick.app',
  'empty.quick.components',
  'empty.quick.theme',
  'empty.quick.landing',
  'empty.quick.docs',
  'empty.quick.assets',
  'empty.quick.codePrompt',
  'empty.quick.appPrompt',
  'empty.quick.componentsPrompt',
  'empty.quick.themePrompt',
  'empty.quick.landingPrompt',
  'empty.quick.docsPrompt',
  'empty.quick.assetsPrompt',
]

function extractValue(content, key) {
  const match = content.match(new RegExp(`'${key.replace('.', '\\.')}': '([^']*)',`))
  return match?.[1] ?? key
}

const blockFromEn = keys
  .map((key) => `  '${key}': '${extractValue(en, key)}',`)
  .join('\n')

for (const file of ['en.ts', 'jp.ts', 'kr.ts', 'zh-TW.ts']) {
  const filePath = path.join(localesDir, file)
  let content = fs.readFileSync(filePath, 'utf8')
  if (content.includes('empty.quick.code')) continue
  content = content.replace(
    /('empty\.slashCommands': '[^']+',)/,
    `$1\n${blockFromEn}`,
  )
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('patched', file)
}
