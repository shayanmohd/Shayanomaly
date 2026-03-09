import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const FORK_RPC = process.env.FORK_RPC_URL || "https://ethereum-rpc.publicnode.com";
// Pin a block for determinism (requires archival RPC like Alchemy/Infura).
// Leave unset to fork from latest (works with free public RPCs).
const FORK_BLOCK = process.env.FORK_BLOCK
  ? parseInt(process.env.FORK_BLOCK)
  : undefined;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      forking: {
        url: FORK_RPC,
        blockNumber: FORK_BLOCK,
        enabled: true,
      },
    },
  },
};

export default config;
