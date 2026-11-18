import { ethers, network } from 'hardhat';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Default is a read-only quote. Broadcasting requires explicit release approval
// and ASHENKIN_DEPLOY_LIVING=true. Never prints environment/key material.
async function main() {
  if (network.name !== 'sepolia') throw new Error('This release script targets Sepolia only');
  const deployment = require('../../backend/lib/ashenkin.json');
  const [deployer] = await ethers.getSigners();
  const lab = await ethers.getContractAt('ChimeraLab', deployment.addresses.ChimeraLab);
  const owner = await lab.owner();
  const quoteProvider = new ethers.JsonRpcProvider((network.config as { url: string }).url);
  const factory = await ethers.getContractFactory('AshenkinEncounters', deployer);
  const request = await factory.getDeployTransaction(await lab.getAddress());
  const nonce = await ethers.provider.getTransactionCount(owner, 'pending');
  const predicted = ethers.getCreateAddress({ from: owner, nonce });
  const gas = await quoteProvider.estimateGas({ ...request, from: owner, gasLimit: 16_000_000n });
  const aclGas = await quoteProvider.estimateGas({ from: owner, to: await lab.getAddress(), data: lab.interface.encodeFunctionData('setCombat', [predicted, true]), gasLimit: 16_000_000n });
  const deploymentLimit = gas * 13n / 10n > 16_000_000n ? 16_000_000n : gas * 13n / 10n;
  const fees = await quoteProvider.getFeeData();
  const maxFee = fees.maxFeePerGas;
  if (maxFee === null) throw new Error('No Sepolia fee estimate available');
  const quote = { chainId: 11155111, signer: owner, lab: await lab.getAddress(), predicted,
    deploymentGas: String(gas), aclGas: String(aclGas), maxFeePerGas: String(maxFee),
    deploymentGasLimit: String(deploymentLimit),
    conservativeEth: ethers.formatEther((deploymentLimit + aclGas * 13n / 10n) * maxFee),
    broadcasts: process.env.ASHENKIN_DEPLOY_LIVING === 'true',
  };
  console.log(JSON.stringify(quote, null, 2));
  const folder = path.resolve(__dirname, '../../uploads');
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'living-deployment-quote.json'), JSON.stringify(quote, null, 2) + '\n');
  if (!quote.broadcasts) return;
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) throw new Error('Release signer is not the Lab owner');
  if (await deployer.getNonce('latest') !== nonce) throw new Error('Resolve pending release-signer transactions first');
  if (maxFee > ethers.parseUnits('0.1', 'gwei')) throw new Error('Release fee exceeds 0.1 gwei cap');
  const game = await factory.deploy(await lab.getAddress(), { gasLimit: deploymentLimit, maxFeePerGas: maxFee, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n });
  await game.waitForDeployment();
  if ((await game.getAddress()).toLowerCase() !== predicted.toLowerCase()) throw new Error('Unexpected deployed address');
  const permission = await lab.setCombat(predicted, true, { gasLimit: aclGas * 13n / 10n });
  await permission.wait(2);
  if (!await lab.isCombat(predicted) || await game.RULES() !== 1n) throw new Error('Living encounter activation failed');
  const manifest = { ...quote, address: predicted, deployHash: game.deploymentTransaction()?.hash, aclHash: permission.hash, at: new Date().toISOString() };
  writeFileSync(path.join(folder, 'living-deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ deployed: predicted, deployHash: manifest.deployHash, aclHash: manifest.aclHash }));
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1; });
