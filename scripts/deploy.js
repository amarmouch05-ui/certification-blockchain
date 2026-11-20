// Déploie CertificateRegistry et exporte adresse + ABI vers le frontend.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Déploiement avec le compte :", deployer.address);

  const registry = await (await hre.ethers.getContractFactory("CertificateRegistry")).deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  console.log(`CertificateRegistry déployé à : ${address} (chainId ${chainId}, réseau ${hre.network.name})`);

  // Export vers le frontend
  const artifact = await hre.artifacts.readArtifact("CertificateRegistry");
  const outDir = path.join(__dirname, "..", "frontend", "src", "contract");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, "abi.json"), JSON.stringify(artifact.abi, null, 2));

  const deploymentsFile = path.join(outDir, "deployments.json");
  const deployments = fs.existsSync(deploymentsFile) ? JSON.parse(fs.readFileSync(deploymentsFile, "utf8")) : {};
  deployments[chainId] = address;
  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
  console.log("ABI et adresse exportés dans frontend/src/contract/");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
