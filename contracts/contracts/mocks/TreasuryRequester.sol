// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IChimeraTreasury} from "../interfaces/IChimeraEconomy.sol";

/// @dev Test-only caller exercising the real Treasury and confidential token.
contract TreasuryRequester is ZamaEthereumConfig {
    function request(IChimeraTreasury treasury, address to, uint64 value) external {
        euint64 amount = FHE.asEuint64(value);
        FHE.allowTransient(amount, address(treasury));
        treasury.pay(to, amount);
    }
}
