import { http, createConfig } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// MetaMask = fournisseur injecté (window.ethereum). Aucune clé privée n'est jamais manipulée ici :
// toutes les transactions sont signées dans MetaMask.
export const config = createConfig({
  chains: [hardhat, sepolia],
  connectors: [injected({ target: "metaMask" })],
  transports: {
    [hardhat.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL || undefined),
  },
});

export const CHAIN_LABELS = {
  [hardhat.id]: "Hardhat local (31337)",
  [sepolia.id]: "Sepolia (11155111)",
};
