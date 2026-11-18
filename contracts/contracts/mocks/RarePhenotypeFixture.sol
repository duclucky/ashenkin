// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @dev Local-only ciphertext fixture. Never changes the production Lab or its RNG.
contract RarePhenotypeFixture is ZamaEthereumConfig {
    event Prepared(bytes32[7] handles);

    constructor() {
        require(block.chainid == 31337, "Local QA only");
    }

    function prepare(address lab, uint8[7] calldata values) external {
        bytes32[7] memory handles;
        for (uint8 i = 0; i < 7; i++) {
            // A fresh encrypted zero avoids duplicate trivial handles for repeated traits.
            euint8 noise = FHE.randEuint8();
            euint8 value = FHE.add(FHE.asEuint8(values[i]), FHE.sub(noise, noise));
            FHE.allowThis(value);
            FHE.allow(value, lab);
            FHE.makePubliclyDecryptable(value);
            handles[i] = FHE.toBytes32(value);
        }
        emit Prepared(handles);
    }
}
