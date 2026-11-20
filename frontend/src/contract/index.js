import abi from "./abi.json";
import deployments from "./deployments.json";

export { abi };

/** Adresse du contrat pour un réseau donné (variable d'env > deployments.json). */
export function getContractAddress(chainId) {
  return import.meta.env[`VITE_CONTRACT_ADDRESS_${chainId}`] || deployments[String(chainId)] || undefined;
}
