import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { CHAIN_LABELS } from "./wagmi";
import { getContractAddress } from "./contract";
import AdminPanel from "./components/AdminPanel";
import PublicVerify from "./components/PublicVerify";

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function App() {
  const [tab, setTab] = useState("public");
  const [readChainId, setReadChainId] = useState(hardhat.id); // réseau de lecture quand aucun wallet n'est connecté

  const { address, isConnected, chainId: walletChainId } = useAccount();
  const walletChainSupported = walletChainId === hardhat.id || walletChainId === sepolia.id;
  const activeChainId = isConnected ? walletChainId : readChainId;
  const contractAddress = getContractAddress(activeChainId);

  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const hasMetaMask = typeof window !== "undefined" && Boolean(window.ethereum);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>🎓 Certificats académiques</h1>
          <p className="muted">Émission et vérification on-chain</p>
        </div>

        <div className="wallet">
          {!isConnected && (
            <>
              <select value={readChainId} onChange={(e) => setReadChainId(Number(e.target.value))} title="Réseau de lecture">
                <option value={hardhat.id}>{CHAIN_LABELS[hardhat.id]}</option>
                <option value={sepolia.id}>{CHAIN_LABELS[sepolia.id]}</option>
              </select>
              <button className="primary" disabled={isPending || !hasMetaMask} onClick={() => connect({ connector: connectors[0] })}>
                {isPending ? "Connexion…" : "Connecter MetaMask"}
              </button>
            </>
          )}
          {isConnected && (
            <>
              <span className="pill">{walletChainSupported ? CHAIN_LABELS[walletChainId] : `Réseau non supporté (${walletChainId})`}</span>
              <span className="pill mono" title={address}>{short(address)}</span>
              <button onClick={() => disconnect()}>Déconnecter</button>
            </>
          )}
        </div>
      </header>

      {!hasMetaMask && (
        <div className="banner warn">MetaMask n'est pas détecté. Installez l'extension pour émettre des certificats (la consultation publique reste possible).</div>
      )}
      {connectError && <div className="banner error">{connectError.shortMessage || connectError.message}</div>}

      {isConnected && !walletChainSupported && (
        <div className="banner warn">
          Votre wallet est sur un réseau non supporté.{" "}
          <button onClick={() => switchChain({ chainId: hardhat.id })}>Passer sur Hardhat local</button>{" "}
          <button onClick={() => switchChain({ chainId: sepolia.id })}>Passer sur Sepolia</button>
        </div>
      )}
      {(!isConnected || walletChainSupported) && !contractAddress && (
        <div className="banner warn">
          Aucun contrat déployé connu sur {CHAIN_LABELS[activeChainId]}. Déployez-le (<code>npm run deploy:local</code> /{" "}
          <code>deploy:sepolia</code>) puis rechargez la page.
        </div>
      )}
      {contractAddress && (
        <p className="muted small">
          Contrat : <span className="mono">{contractAddress}</span>
        </p>
      )}

      <nav className="tabs">
        <button className={tab === "public" ? "active" : ""} onClick={() => setTab("public")}>Vérification publique</button>
        <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>Administration</button>
      </nav>

      <main>
        {tab === "public" && <PublicVerify chainId={activeChainId} contractAddress={contractAddress} />}
        {tab === "admin" && (
          <AdminPanel
            chainId={activeChainId}
            contractAddress={contractAddress}
            walletReady={isConnected && walletChainSupported}
            account={address}
          />
        )}
      </main>
    </div>
  );
}
