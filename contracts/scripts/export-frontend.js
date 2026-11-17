// Writes ABIs + deployed addresses for the frontend: node scripts/export-frontend.js [network]
const fs = require("fs");
const path = require("path");

const network = process.argv[2] || "sepolia";
const out = path.join(__dirname, "../../frontend/src/chimera/contracts.json");
const names = ["ChimeraLab", "ChimeraArena", "ChimeraMarket", "ChimeraTreasury", "ChimeraRaid", "ChimeraExpeditions", "ChimeraQuests", "ChimeraTraining", "ChimeraColosseum", "ChimeraRelics", "ChimeraOracle", "ChimeraAscension", "ChimeraSeason", "ChimeraRaffle", "ChimeraDepths"];
const SEPOLIA_CZAMA = "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB";
const SEPOLIA_ZAMA_MOCK = "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57";

const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
const result = { network, chainId: 11155111, cZAMA: SEPOLIA_CZAMA, zamaMock: SEPOLIA_ZAMA_MOCK, deployBlock: prev.deployBlock ?? 0, addresses: {}, abis: {} };

for (const n of names) {
  const art = require(`../artifacts/contracts/${n}.sol/${n}.json`);
  result.abis[n] = art.abi;
  const dep = path.join(__dirname, `../deployments/${network}/${n}.json`);
  if (fs.existsSync(dep)) {
    const d = JSON.parse(fs.readFileSync(dep, "utf8"));
    result.addresses[n] = d.address;
    if (n === "ChimeraLab" && d.receipt?.blockNumber) result.deployBlock = d.receipt.blockNumber;
  } else {
    result.addresses[n] = prev.addresses?.[n] ?? null;
  }
}
// Season of Masks: where the new contracts start (log scans) + retired contracts kept for history
const col = path.join(__dirname, `../deployments/${network}/ChimeraColosseum.json`);
if (fs.existsSync(col)) result.seasonBlock = JSON.parse(fs.readFileSync(col, "utf8")).receipt?.blockNumber ?? prev.seasonBlock;
const p1 = path.join(__dirname, `../deployments/${network}/ChimeraSeason.json`);
if (fs.existsSync(p1)) result.p1Block = JSON.parse(fs.readFileSync(p1, "utf8")).receipt?.blockNumber ?? prev.p1Block;
const p2 = path.join(__dirname, `../deployments/${network}/ChimeraRaffle.json`);
if (fs.existsSync(p2)) result.raffleBlock = JSON.parse(fs.readFileSync(p2, "utf8")).receipt?.blockNumber ?? prev.raffleBlock;
const p3 = path.join(__dirname, `../deployments/${network}/ChimeraDepths.json`);
if (fs.existsSync(p3)) result.depthsBlock = JSON.parse(fs.readFileSync(p3, "utf8")).receipt?.blockNumber ?? prev.depthsBlock;
const v1 = path.join(__dirname, "../deployments-archive/ChimeraTraining-v1.json");
result.legacy = { ...(prev.legacy ?? {}) };
if (fs.existsSync(v1)) result.legacy.ChimeraTraining = JSON.parse(fs.readFileSync(v1, "utf8")).address;
fs.writeFileSync(out, JSON.stringify(result, null, 2));
// backend (NFT metadata) only needs addresses
const backendOut = path.join(__dirname, "../../backend/lib/chimera.json");
fs.mkdirSync(path.dirname(backendOut), { recursive: true });
fs.writeFileSync(backendOut, JSON.stringify({ network, chainId: result.chainId, addresses: result.addresses }, null, 2));
console.log("wrote", out, result.addresses);
