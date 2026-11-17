const { Router, json } = require('express')

const beaconScout = Router()
const trailChoices = new Set(['tracks', 'stones'])
const passageChoices = new Set(['road', 'ridge'])

beaconScout.post('/', json({ limit: '1kb' }), (req, res) => {
  const route = req.body?.route
  if (!Array.isArray(route) || route.length !== 2 || !trailChoices.has(route[0]) || !passageChoices.has(route[1])) {
    return res.status(400).json({ error: 'Invalid scouting route' })
  }
  return res.json({ found: route[0] === 'tracks' && route[1] === 'ridge' })
})

module.exports = { beaconScout }
