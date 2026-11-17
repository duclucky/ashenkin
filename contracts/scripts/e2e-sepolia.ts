/** Sepolia smoke test for the same Lab, Colosseum and Market flow as the game. */
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import type { BytesLike, ContractTransactionResponse, Interface, Signer } from "ethers";
import { deployments, ethers, network } from "hardhat";
import type { ChimeraColosseum, ChimeraLab, ChimeraMarket } from "../types";

const PRICE = 15_000_000n; // 15 cZAMA (6 decimals)
const STRIKE_GUARD_FEINT = 0 | (1 << 2) | (2 << 4);
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Keeper = Signer & { address: string };
type Game = { lab: ChimeraLab; colosseum: ChimeraColosseum; market: ChimeraMarket };
type Decrypt = (handles: string[]) => Promise<{ abiEncodedClearValues: BytesLike; decryptionProof: BytesLike }>;
type Demo = Game & {
  seller: Keeper;
  buyer: Keeper;
  decrypt: Decrypt;
  encryptPlan: (plan: number) => Promise<{ handles: BytesLike[]; inputProof: BytesLike }>;
  waitUntil: (timestamp: bigint) => Promise<void>;
};

async function send(label: string, transaction: Promise<ContractTransactionResponse>) {
  const receipt = await (await transaction).wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${label} failed`);
  console.log(`${label}: ${receipt.hash} (${receipt.gasUsed} gas)`);
  return receipt;
}

function eventArgs(
  receipt: Awaited<ReturnType<typeof send>>,
  contract: { target: string | { getAddress(): Promise<string> }; interface: Interface },
  name: string,
) {
  const address = String(contract.target).toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address) continue;
    const event = contract.interface.parseLog(log);
    if (event?.name === name) return event.args;
  }
  throw new Error(`${name} event missing from ${receipt.hash}`);
}

async function sell(
  lab: ChimeraLab,
  market: ChimeraMarket,
  seller: Keeper,
  buyer: Keeper,
  child: bigint,
  decrypt: Decrypt,
) {
  if ((await lab.ownerOf(child)) !== seller.address) throw new Error(`Seller does not own specimen #${child}`);
  const marketAddress = await market.getAddress();
  await send("Approve specimen", lab.connect(seller).approve(marketAddress, child));
  const listed = await send("List specimen", market.connect(seller).list(child, PRICE));
  const { listingId } = eventArgs(listed, market, "Listed");
  const bought = await send("Buy specimen", market.connect(buyer).buy(listingId));
  const { paidHandle } = eventArgs(bought, market, "PurchaseStarted");
  const proof = await decrypt([paidHandle]);
  const settled = await send(
    "Finalize sale",
    market.connect(buyer).finalize(listingId, proof.abiEncodedClearValues, proof.decryptionProof),
  );
  if ((await lab.ownerOf(child, { blockTag: settled.blockNumber })) !== buyer.address)
    throw new Error("Sale did not transfer the specimen. Check the buyer's cZAMA balance.");
  eventArgs(settled, market, "Sold");
  return listingId as bigint;
}

/** The same transaction and proof sequence runs with either the mock or the real KMS. */
export async function runDemo({ lab, colosseum, market, seller, buyer, decrypt, encryptPlan, waitUntil }: Demo) {
  const owned = await lab.creaturesOf(seller.address);
  const parents: { id: bigint; cooldownUntil: bigint }[] = [];
  const maxBreeds = await lab.MAX_BREEDS();
  for (const id of owned) {
    const creature = await lab.getCreature(id);
    if (creature.breeds < maxBreeds) parents.push({ id, cooldownUntil: creature.cooldownUntil });
    if (parents.length === 2) break;
  }
  const embryos = Number((await lab.GENESIS_PER_WALLET()) - (await lab.genesisClaimed(seller.address)));
  if (parents.length + embryos < 2)
    throw new Error("The seller needs two breedable specimens or unused Genesis embryos.");
  while (parents.length < 2) {
    const hatch = await send("Hatch Genesis embryo", lab.connect(seller).hatchGenesis());
    const { id } = eventArgs(hatch, lab, "Hatched");
    const { cooldownUntil } = await lab.getCreature(id, { blockTag: hatch.blockNumber });
    parents.push({ id, cooldownUntil });
  }

  const [a, b] = parents;
  await waitUntil(a.cooldownUntil > b.cooldownUntil ? a.cooldownUntil : b.cooldownUntil);
  const bred = await send("Lay egg", lab.connect(seller).breed(a.id, b.id));
  const { eggId, paidHandle } = eventArgs(bred, lab, "EggLaid");
  const eggProof = await decrypt([paidHandle]);
  const hatched = await send(
    "Hatch bred egg",
    lab.connect(seller).hatchEgg(eggId, eggProof.abiEncodedClearValues, eggProof.decryptionProof),
  );
  const [paid] = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], eggProof.abiEncodedClearValues);
  if (!paid) throw new Error("The egg did not hatch. Check the seller's cZAMA balance.");
  const { id: child } = eventArgs(hatched, lab, "Hatched");

  const plan = await encryptPlan(STRIKE_GUARD_FEINT);
  const fight = await send(
    "Explore Colosseum",
    colosseum.connect(seller).explore(child, plan.handles[0], plan.inputProof),
  );
  const { battleId, roundHandles } = eventArgs(fight, colosseum, "BattleStarted");
  const roundProof = await decrypt([...roundHandles]);
  const result = await send(
    "Settle three rounds",
    colosseum.connect(seller).settle(battleId, roundProof.abiEncodedClearValues, roundProof.decryptionProof),
  );
  eventArgs(result, colosseum, "BattleSettled");

  const listingId = await sell(lab, market, seller, buyer, child, decrypt);
  return { child: child as bigint, battleId: battleId as bigint, listingId };
}

async function main() {
  if (network.name !== "sepolia") throw new Error("Use --network sepolia for the live smoke test.");
  const sellerKey = process.env.E2E_SELLER_PRIVATE_KEY;
  const buyerKey = process.env.E2E_BUYER_PRIVATE_KEY;
  if (!sellerKey || !buyerKey)
    throw new Error("Set E2E_SELLER_PRIVATE_KEY and E2E_BUYER_PRIVATE_KEY for two funded test wallets.");
  const seller = new ethers.Wallet(sellerKey, ethers.provider);
  const buyer = new ethers.Wallet(buyerKey, ethers.provider);
  if (seller.address === buyer.address) throw new Error("Use separate seller and buyer test wallets.");
  const marketOnly = process.env.ONLY_MARKET;
  const existingSpecimen = marketOnly ? BigInt(marketOnly) : undefined;

  const lab = await ethers.getContractAt("ChimeraLab", (await deployments.get("ChimeraLab")).address);
  const colosseum = await ethers.getContractAt("ChimeraColosseum", (await deployments.get("ChimeraColosseum")).address);
  const market = await ethers.getContractAt("ChimeraMarket", (await deployments.get("ChimeraMarket")).address);
  const tokenAddress = await lab.token();
  if ((await market.token()) !== tokenAddress) throw new Error("Lab and Market must use the same cZAMA token.");
  const tokenAbi = ["function isOperator(address,address) view returns (bool)", "function setOperator(address,uint48)"];
  const rpc = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const fhe = await createInstance({ ...SepoliaConfig, network: rpc });

  const decrypt: Decrypt = async (handles) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fhe.publicDecrypt(handles);
      } catch (error) {
        if (attempt === 12) throw error;
        await delay(5000);
      }
    }
  };

  async function approve(keeper: Keeper, operator: string) {
    const token = await ethers.getContractAt(tokenAbi, tokenAddress, keeper);
    if (await token.isOperator(keeper.address, operator)) return;
    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("Sepolia did not return the latest block.");
    await send("Authorize cZAMA operator", token.setOperator(operator, block.timestamp + 86400));
    for (let attempt = 0; attempt < 12; attempt++) {
      if (await token.isOperator(keeper.address, operator)) return;
      await delay(3000);
    }
    throw new Error("The cZAMA operator approval is still syncing. Retry the smoke test once it appears.");
  }

  async function waitUntil(timestamp: bigint) {
    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("Sepolia did not return the latest block.");
    if (BigInt(block.timestamp) >= timestamp) return;
    console.log(`Waiting for the parents' cooldown until ${new Date(Number(timestamp) * 1000).toISOString()}`);
    const deadline = Date.now() + Number(timestamp - BigInt(block.timestamp)) * 1000 + 60_000;
    do {
      await delay(6000);
      const latest = await ethers.provider.getBlock("latest");
      if (latest && BigInt(latest.timestamp) >= timestamp) return;
    } while (Date.now() < deadline);
    throw new Error("Sepolia did not reach the parents' cooldown in time.");
  }

  await approve(buyer, await market.getAddress());
  if (existingSpecimen !== undefined) {
    await sell(lab, market, seller, buyer, existingSpecimen, decrypt);
    return;
  }
  await approve(seller, await lab.getAddress());
  const colosseumAddress = await colosseum.getAddress();
  const result = await runDemo({
    lab,
    colosseum,
    market,
    seller,
    buyer,
    decrypt,
    waitUntil,
    encryptPlan: (plan) => fhe.createEncryptedInput(colosseumAddress, seller.address).add8(plan).encrypt(),
  });
  console.log(`Demo complete: specimen #${result.child}, fight #${result.battleId}, listing #${result.listingId}.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.shortMessage ?? String(error).split("\n")[0]);
    process.exitCode = 1;
  });
}
