const { existsSync } = require('node:fs')
const path = require('node:path')
const express = require('express')
const nft = require('./routes/nft')
const { beaconScout } = require('./routes/beacon')
const { settlementRouter } = require('./routes/settlement')
const { createSettlementSponsor } = require('./lib/settlement-sponsor')

const demo = process.argv.includes('--demo')
const dist = path.resolve(__dirname, '../frontend/dist')
if (demo && !existsSync(path.join(dist, 'index.html'))) {
  throw new Error('Build the frontend before starting the demo: npm --prefix frontend run build')
}

const app = express()
app.disable('x-powered-by')
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/ashenkin-nft', nft)
app.use('/api/nft', nft)
app.use('/api/nft-v2', nft)
app.use('/api/settlement', settlementRouter(createSettlementSponsor()))
app.use('/api/beacon/scout', beaconScout)
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }))

if (demo) {
  app.use(express.static(dist, {
    setHeaders(res, file) {
      if (file === path.join(dist, 'index.html')) res.set('Cache-Control', 'no-cache')
    },
  }))
}

const host = process.env.BACKEND_HOST || '127.0.0.1'
const port = Number(process.env.BACKEND_PORT || (demo ? process.env.PORT || 4173 : 3001))
app.listen(port, host, () => {
  console.log(`Ashenkin ${demo ? 'demo' : 'API'} listening on http://${host}:${port}`)
})
