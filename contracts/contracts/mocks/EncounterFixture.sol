// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;
import {AshenkinEncounters, IEncounterLab} from "../AshenkinEncounters.sol";
import {FHE, euint8, euint16} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

// Controlled edge-case coverage only; cannot be deployed on Sepolia/mainnet.
contract EncounterFixture is AshenkinEncounters {
    bytes32 public tested;
    constructor(IEncounterLab lab_) AshenkinEncounters(lab_) { require(block.chainid == 31337); }
    function resolve(uint16 power, uint8 element, uint16 entropy) external {
        euint16 noise = FHE.randEuint16();
        euint16 zero = FHE.sub(noise, noise);
        euint16 result = _resolve(FHE.add(FHE.asEuint16(power), zero),
            FHE.asEuint8(FHE.add(FHE.asEuint16(element), zero)), FHE.add(FHE.asEuint16(entropy), zero));
        FHE.allowThis(result);
        FHE.makePubliclyDecryptable(result);
        tested = FHE.toBytes32(result);
    }
}
