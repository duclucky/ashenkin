// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @dev Test-only stand-in for cZAMAMock (ERC-7984, 6 decimals) with a free faucet.
contract ConfidentialTokenMock is ERC7984, ZamaEthereumConfig {
    constructor() ERC7984("Confidential ZAMA Mock", "cZAMA", "") {}

    function mint(address to, uint64 amount) external {
        _mint(to, FHE.asEuint64(amount));
    }
}
