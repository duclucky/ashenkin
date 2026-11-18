import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const Z = 1_000_000n;
const wait = async (promise: Promise<any>) => (await promise).wait();
const bal = async (token: any, signer: any): Promise<bigint> => {
  const handle = await token.confidentialBalanceOf(signer.address);
  return handle === ethers.ZeroHash ? 0n : fhevm.userDecryptEuint(FhevmType.euint64, handle, await token.getAddress(), signer);
};
async function measured(promise: Promise<any>) {
  const receipt = await wait(promise);
  const usage = fhevm.computeTransactionHCU(receipt);
  expect(usage.globalHCU).to.be.at.most(20_000_000);
  expect(usage.maxHCUDepth).to.be.at.most(5_000_000);
  return receipt;
}

async function base() {
  const [owner, alice, bob, carol, treasuryAccount] = await ethers.getSigners();
  const token: any = await ethers.deployContract("ConfidentialTokenMock");
  const lab: any = await ethers.deployContract("ChimeraLab", [await token.getAddress()]);
  const relics: any = await ethers.deployContract("ChimeraRelics", [await lab.getAddress(), await token.getAddress()]);
  for (const signer of [alice, bob]) await wait(token.mint(signer.address, 100n * Z));
  return { owner, alice, bob, carol, treasuryAccount, token, lab, relics };
}

describe("Reward settlement edge branches — local FHEVM", function () {
  this.timeout(180_000);
  before(function () { if (!fhevm.isMock) throw new Error("Reward edge fixtures require the local FHEVM mock"); });

  describe("Raffle proof binding and zero-payment rounds", function () {
    async function fixture() {
      const f = await base();
      const raffle: any = await ethers.deployContract("ChimeraRaffle", [await f.token.getAddress(), f.treasuryAccount.address]);
      await wait(raffle.setRelics(await f.relics.getAddress()));
      await wait(f.relics.setGame(await raffle.getAddress(), true));
      for (const signer of [f.alice, f.bob, f.carol]) await wait(f.token.connect(signer).setOperator(await raffle.getAddress(), (await time.latest()) + 30 * 86400));
      const buy = async (signer: any, count: number) => {
        const input = await fhevm.createEncryptedInput(await raffle.getAddress(), signer.address).add16(count).encrypt();
        await wait(raffle.connect(signer).buy(input.handles[0], input.inputProof));
      };
      const draw = async () => {
        const id = await raffle.currentRound();
        const [round] = await raffle.getRound(id);
        await time.increaseTo(round.endsAt);
        await wait(raffle.draw());
        const [, winner, pot] = await raffle.getRound(id);
        return fhevm.publicDecrypt([winner, pot]);
      };
      return { ...f, raffle, buy, draw };
    }

    it("an all-unpaid round rolls forward with no winner, payout or Relic", async function () {
      const f = await fixture();
      await f.buy(f.carol, 10);
      const proof = await f.draw();
      await measured(f.raffle.finalize(proof.abiEncodedClearValues, proof.decryptionProof));
      const [round] = await f.raffle.getRound(1);
      expect(round.done).to.equal(true);
      expect(round.winner).to.equal(ethers.ZeroAddress);
      expect(round.pot).to.equal(0);
      expect(await bal(f.token, f.treasuryAccount)).to.equal(0);
      expect(await f.relics.totalRelics()).to.equal(0);
      expect(await f.raffle.currentRound()).to.equal(2);
    });

    it("identical winner and pot values cannot reuse the prior round's KMS proof", async function () {
      const f = await fixture();
      await f.buy(f.alice, 1);
      const first = await f.draw();
      await measured(f.raffle.finalize(first.abiEncodedClearValues, first.decryptionProof));
      await f.buy(f.alice, 1);
      const second = await f.draw();
      expect(second.abiEncodedClearValues).to.equal(first.abiEncodedClearValues);
      await expect(f.raffle.finalize(first.abiEncodedClearValues, first.decryptionProof)).to.be.reverted;
      expect((await f.raffle.getRound(2))[0].done).to.equal(false);
      await measured(f.raffle.finalize(second.abiEncodedClearValues, second.decryptionProof));
      expect(await f.raffle.wins(f.alice.address)).to.equal(2);
      expect(await bal(f.token, f.treasuryAccount)).to.equal(200_000n);
      expect(await f.relics.totalRelics()).to.equal(2);
    });

    it("forged winner cleartexts and duplicate draw are rejected without consuming a valid payout", async function () {
      const f = await fixture();
      await f.buy(f.alice, 5);
      const proof = await f.draw();
      await expect(f.raffle.draw()).to.be.revertedWithCustomError(f.raffle, "AlreadyDrawing");
      const forged = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint64"], [f.bob.address, 5n * Z]);
      await expect(f.raffle.finalize(forged, proof.decryptionProof)).to.be.reverted;
      const before = await bal(f.token, f.alice);
      await measured(f.raffle.finalize(proof.abiEncodedClearValues, proof.decryptionProof));
      expect(await bal(f.token, f.alice) - before).to.equal(4_500_000n);
      expect(await bal(f.token, f.bob)).to.equal(100n * Z);
      await expect(f.raffle.finalize(proof.abiEncodedClearValues, proof.decryptionProof)).to.be.revertedWithCustomError(f.raffle, "NotDrawing");
    });
  });

  describe("Oracle winning-claim races", function () {
    async function fixture() {
      const f = await base();
      const oracle: any = await ethers.deployContract("ChimeraOracle", [await f.token.getAddress()]);
      await wait(oracle.setRules(3 * 86400, 40));
      await wait(oracle.setRelics(await f.relics.getAddress()));
      await wait(f.relics.setGame(await oracle.getAddress(), true));
      for (const signer of [f.alice, f.bob, f.carol]) await wait(f.token.connect(signer).setOperator(await oracle.getAddress(), (await time.latest()) + 30 * 86400));
      const guess = async (signer: any, genes: number[]) => {
        const packed = genes.reduce((value, gene, i) => value | gene << (4 * i), 0);
        const input = await fhevm.createEncryptedInput(await oracle.getAddress(), signer.address).add16(packed).encrypt();
        await wait(oracle.connect(signer).guess(input.handles[0], input.inputProof));
        const id = await oracle.totalGuesses();
        const [, handle] = await oracle.getGuess(id);
        const hint = Number(await fhevm.userDecryptEuint(FhevmType.euint8, handle, await oracle.getAddress(), signer));
        return { id, hint, codes: [0, 1, 2, 3].map(i => hint >> (2 * i) & 3) };
      };
      const answer = [-1, -1, -1, -1];
      let solved: any;
      for (let value = 0; value < 16 && answer.includes(-1); value++) {
        const genes = answer.map(gene => gene >= 0 ? gene : value);
        solved = await guess(f.alice, genes);
        solved.codes.forEach((code: number, i: number) => { if (code === 2) answer[i] = genes[i]; });
      }
      if (!solved.codes.every((code: number) => code === 2)) solved = await guess(f.alice, answer);
      expect(solved.codes).to.deep.equal([2, 2, 2, 2]);
      const claim = async (signer: any, id: bigint) => {
        await wait(oracle.connect(signer).claim(id));
        const [, , handle] = await oracle.getGuess(id);
        return fhevm.publicDecrypt([handle]);
      };
      return { ...f, oracle, answer, solved, guess, claim };
    }

    it("two correct claims can produce only one jackpot and one Relic", async function () {
      const f = await fixture();
      const bob = await f.guess(f.bob, f.answer);
      const aliceProof = await f.claim(f.alice, f.solved.id);
      const bobProof = await f.claim(f.bob, bob.id);
      const aliceBefore = await bal(f.token, f.alice), bobBefore = await bal(f.token, f.bob);
      const potHandle = await f.oracle.potHandle();
      const pot = (await fhevm.publicDecrypt([potHandle])).clearValues[potHandle as `0x${string}`];
      await measured(f.oracle.finalize(f.solved.id, aliceProof.abiEncodedClearValues, aliceProof.decryptionProof));
      await expect(f.oracle.finalize(bob.id, bobProof.abiEncodedClearValues, bobProof.decryptionProof)).to.emit(f.oracle, "ClaimRejected").withArgs(bob.id, f.bob.address);
      expect(await bal(f.token, f.alice) - aliceBefore).to.equal(pot);
      expect(await bal(f.token, f.bob) - bobBefore).to.equal(0);
      expect(await f.oracle.solves(f.alice.address)).to.equal(1);
      expect(await f.oracle.solves(f.bob.address)).to.equal(0);
      expect(await f.relics.totalRelics()).to.equal(1);
      await expect(f.oracle.finalize(f.solved.id, aliceProof.abiEncodedClearValues, aliceProof.decryptionProof)).to.be.revertedWithCustomError(f.oracle, "AlreadyClaimed");
    });

    it("knowing all four genes without paying cannot win the jackpot", async function () {
      const f = await fixture();
      const unpaid = await f.guess(f.carol, f.answer);
      expect(unpaid.hint).to.equal(255);
      const proof = await f.claim(f.carol, unpaid.id);
      expect(Object.values(proof.clearValues)[0]).to.equal(false);
      await expect(f.oracle.finalize(unpaid.id, proof.abiEncodedClearValues, proof.decryptionProof)).to.emit(f.oracle, "ClaimRejected");
      expect(await f.oracle.solves(f.carol.address)).to.equal(0);
      expect(await bal(f.token, f.carol)).to.equal(0);
      expect(await f.relics.totalRelics()).to.equal(0);
    });

    it("an exact claim finalized after expiry is rejected and its pot remains available", async function () {
      const f = await fixture();
      const proof = await f.claim(f.alice, f.solved.id);
      const before = await bal(f.token, f.alice);
      const pot = await f.oracle.potHandle();
      const amount = (await fhevm.publicDecrypt([pot])).clearValues[pot as `0x${string}`];
      await time.increase(3 * 86400);
      await wait(f.oracle.expire());
      await expect(f.oracle.finalize(f.solved.id, proof.abiEncodedClearValues, proof.decryptionProof)).to.emit(f.oracle, "ClaimRejected");
      expect(await bal(f.token, f.alice)).to.equal(before);
      expect(await f.relics.totalRelics()).to.equal(0);
      const afterHandle = await f.oracle.potHandle();
      expect((await fhevm.publicDecrypt([afterHandle])).clearValues[afterHandle as `0x${string}`]).to.equal(amount);
    });
  });

  describe("Season payout availability and precision", function () {
    async function fixture(seats: number[]) {
      const f = await base();
      const colosseum: any = await ethers.deployContract("ChimeraColosseum", [await f.lab.getAddress(), await f.token.getAddress()]);
      const raid: any = await ethers.deployContract("ChimeraRaid", [await f.lab.getAddress(), await f.token.getAddress()]);
      const oracle: any = await ethers.deployContract("ChimeraOracle", [await f.token.getAddress()]);
      const treasury: any = await ethers.deployContract("ChimeraTreasury", [await f.token.getAddress()]);
      const season: any = await ethers.deployContract("ChimeraSeason", [await colosseum.getAddress(), await oracle.getAddress(), await raid.getAddress(), await treasury.getAddress()]);
      await wait(f.lab.setArena(await colosseum.getAddress()));
      await wait(f.lab.setCombat(await raid.getAddress(), true));
      await wait(treasury.setGame(await season.getAddress(), true));
      await wait(f.relics.setGame(await season.getAddress(), true));
      await wait(season.setRelics(await f.relics.getAddress()));
      const signers = [f.alice, f.bob, f.carol];
      for (const seat of seats) {
        const signer = signers[seat];
        await wait(season.connect(signer).join());
        await wait(f.lab.connect(signer).hatchGenesis());
        const id = await f.lab.totalCreatures();
        await wait(raid.connect(signer).strike(id));
        await wait(season.connect(signer).claimThrone(seat));
      }
      return { ...f, season, treasury, signers };
    }

    it("an empty season closes and restarts without attempting a payout", async function () {
      const f = await fixture([]);
      await time.increase(14 * 86400);
      await measured(f.season.endSeason());
      expect(await f.season.season()).to.equal(2);
      expect(await f.treasury.payouts()).to.equal(0);
      expect(await f.relics.totalRelics()).to.equal(0);
      expect(await f.season.winnersOf(1)).to.deep.equal([ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress]);
    });

    it("one occupied third seat receives the entire affordable pool", async function () {
      const f = await fixture([2]);
      await wait(f.token.mint(await f.treasury.getAddress(), 10_000n * Z));
      const before = await bal(f.token, f.carol);
      await time.increase(14 * 86400);
      await measured(f.season.endSeason());
      expect(await bal(f.token, f.carol) - before).to.equal(100n * Z);
      expect(await f.season.rankIn(1, f.carol.address)).to.equal(3);
    });

    it("zero configured cash prizes still grant three crowns and caches", async function () {
      const f = await fixture([0, 1, 2]);
      await wait(f.season.setPrizes([0, 0, 0]));
      const before = [];
      for (const signer of f.signers) before.push(await bal(f.token, signer));
      await time.increase(14 * 86400);
      await measured(f.season.endSeason());
      for (let i = 0; i < 3; i++) {
        expect(await bal(f.token, f.signers[i])).to.equal(before[i]);
        expect(await f.season.crowns(f.signers[i].address)).to.equal(1);
      }
      expect(await f.relics.totalRelics()).to.equal(3);
      expect(await f.treasury.payouts()).to.equal(0);
    });

    it("extreme valid weights keep six-decimal precision without uint64 multiplication overflow", async function () {
      const f = await fixture([0, 1]);
      await wait(f.token.mint(await f.treasury.getAddress(), 10_000n * Z));
      await wait(f.season.setPrizes([(1n << 64n) - 2n, 1, 0]));
      const beforeAlice = await bal(f.token, f.alice), beforeBob = await bal(f.token, f.bob);
      await time.increase(14 * 86400);
      await measured(f.season.endSeason());
      expect(await bal(f.token, f.alice) - beforeAlice).to.equal(100n * Z - 1n);
      expect(await bal(f.token, f.bob) - beforeBob).to.equal(1n);
    });
  });
});
