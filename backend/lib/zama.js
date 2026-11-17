const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
let instance

function zama() {
  if (!instance) {
    instance = Promise.resolve().then(() => {
      const sdk = require('@zama-fhe/relayer-sdk/node')
      return sdk.createInstance({ ...sdk.SepoliaConfig, network: RPC })
    }).catch(error => {
      instance = undefined
      throw error
    })
  }
  return instance
}

module.exports = { RPC, zama }
