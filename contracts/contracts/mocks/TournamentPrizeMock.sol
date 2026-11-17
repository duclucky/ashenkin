// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FHE, euint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ChimeraCombat} from "../ChimeraCombat.sol";

contract TournamentPrizeMock is ERC20 {
    constructor() ERC20("Test Prize", "TPRIZE") {
        _mint(msg.sender, 1_000_000);
    }
}

contract CombatGapMock is ZamaEthereumConfig {
    function compare(uint16 a, uint16 b) external {
        (euint16 left, euint16 right) = ChimeraCombat.capGap(FHE.asEuint16(a), FHE.asEuint16(b), 10);
        FHE.makePubliclyDecryptable(left);
        FHE.makePubliclyDecryptable(right);
        emit Compared(FHE.toBytes32(left), FHE.toBytes32(right));
    }

    event Compared(bytes32 left, bytes32 right);
}
