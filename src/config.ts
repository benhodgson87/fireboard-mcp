import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { name, version } = require('../package.json') as { name: string; version: string }

export { name, version }
