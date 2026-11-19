const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
function documents(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name)
    return entry.isDirectory() ? documents(name) : entry.isFile() && name.endsWith('.md') ? [name] : []
  })
}
const files = ['README.md', 'contracts/README.md', ...documents('docs')]
const failures = []
let checked = 0
for (const name of new Set(files)) {
  const file = path.join(root, name)
  if (!fs.existsSync(file)) continue
  let fenced = false
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return }
    if (fenced) return
    for (const match of line.matchAll(/!?\[[^\]]*\]\(([^\s)]+)/g)) {
      const target = match[1]
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue
      const local = decodeURIComponent(target.split('#')[0].split('?')[0])
      if (!local) continue
      checked++
      const resolved = local.startsWith('/') ? path.join(root, local) : path.resolve(path.dirname(file), local)
      if (!fs.existsSync(resolved)) failures.push(`${name}:${index + 1}: ${target}`)
    }
  })
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else console.log(`Checked ${checked} local Markdown links across ${new Set(files).size} documents.`)
