// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";

library ChimeraCombat {
    uint8 internal constant FEINT = 2;
    uint8 internal constant ELEMENT_VOID = 3;
    uint16 internal constant ADVANTAGE_BONUS = 25;
    uint16 internal constant VOID_BONUS = 12;
    uint16 internal constant ROLL_BOUND = 32;
    uint16 internal constant MOVE_BONUS = 30;

    function withElement(euint16 power, euint8 element, euint8 opponent) internal returns (euint16) {
        ebool counters = FHE.eq(opponent, FHE.rem(FHE.add(element, 1), 3));
        euint16 bonus = FHE.select(counters, FHE.asEuint16(ADVANTAGE_BONUS), FHE.asEuint16(0));
        return FHE.add(power, FHE.select(FHE.eq(element, ELEMENT_VOID), FHE.asEuint16(VOID_BONUS), bonus));
    }

    function capGap(euint16 left, euint16 right, uint16 maximum) internal returns (euint16, euint16) {
        return (FHE.min(left, FHE.add(right, maximum)), FHE.min(right, FHE.add(left, maximum)));
    }

    function round(euint16 left, euint16 right, euint8 planA, euint8 planB, uint8 index, bool fairTie) internal returns (ebool won) {
        euint8 key = FHE.add(FHE.shl(_move(planA, index), 2), _move(planB, index));
        ebool aBeats = FHE.or(FHE.or(FHE.eq(key, 4), FHE.eq(key, 9)), FHE.eq(key, 2));
        ebool bBeats = FHE.or(FHE.or(FHE.eq(key, 1), FHE.eq(key, 6)), FHE.eq(key, 8));
        euint16 scoreA = FHE.add(left, FHE.randEuint16(ROLL_BOUND));
        euint16 scoreB = FHE.add(right, FHE.randEuint16(ROLL_BOUND));
        scoreA = FHE.add(scoreA, FHE.select(aBeats, FHE.asEuint16(MOVE_BONUS), FHE.asEuint16(0)));
        scoreB = FHE.add(scoreB, FHE.select(bBeats, FHE.asEuint16(MOVE_BONUS), FHE.asEuint16(0)));
        won = FHE.gt(scoreA, scoreB);
        if (fairTie) won = FHE.or(won, FHE.and(FHE.eq(scoreA, scoreB), FHE.randEbool()));
        FHE.allowThis(won);
        FHE.makePubliclyDecryptable(won);
    }

    function _move(euint8 plan, uint8 index) private returns (euint8) {
        euint8 m = index == 0 ? FHE.and(plan, 3) : FHE.and(FHE.shr(plan, 2 * index), 3);
        return FHE.min(m, FEINT);
    }
}
