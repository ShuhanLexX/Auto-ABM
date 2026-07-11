import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales')
const zhPath = path.join(localesDir, 'zh.ts')
let zh = fs.readFileSync(zhPath, 'utf8')

if (!zh.includes('empty.quick.code')) {
  zh = zh.replace(
    "  'empty.slashCommands': '斜杠命令',",
    `  'empty.slashCommands': '斜杠命令',
  'empty.quick.code': '生成代码',
  'empty.quick.app': '启动应用',
  'empty.quick.components': 'UI 组件',
  'empty.quick.theme': '主题灵感',
  'empty.quick.landing': '落地页',
  'empty.quick.docs': '上传文档',
  'empty.quick.assets': '图片素材',
  'empty.quick.codePrompt': '帮我生成可用于生产的代码：',
  'empty.quick.appPrompt': '帮我搭建并启动一个新应用：',
  'empty.quick.componentsPrompt': '帮我设计可复用的 UI 组件：',
  'empty.quick.themePrompt': '为以下场景推荐现代视觉主题与配色：',
  'empty.quick.landingPrompt': '为以下产品构思一个落地页：',
  'empty.quick.docsPrompt': '分析这些需求并给出实现方案：',
  'empty.quick.assetsPrompt': '帮我准备图片与图标素材：',`,
  )
  fs.writeFileSync(zhPath, zh, 'utf8')
}

console.log('zh quick actions done')
