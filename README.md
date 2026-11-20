# Système de certification académique sur blockchain

Smart contract **CertificateRegistry** (Solidity / Hardhat) + frontend **React + Vite + wagmi/viem** + import **Excel/CSV** (SheetJS).

```
certification-blockchain/
├── contracts/CertificateRegistry.sol     # le smart contract
├── test/CertificateRegistry.test.js      # 14 tests Hardhat
├── scripts/deploy.js                     # déploie + exporte ABI/adresse vers le frontend
├── hardhat.config.js
├── sample/                               # etudiants.xlsx, etudiants.csv, etudiants_avec_erreurs.xlsx
└── frontend/                             # app React (zone admin + zone publique)
    └── src/{App.jsx, components/, lib/parseCertificates.js, contract/}
```

## 1. Prérequis
- Node.js ≥ 18 (testé avec Node 22)
- Extension navigateur **MetaMask**

## 2. Installation
```bash
npm install                 # contrat (Hardhat)
cd frontend && npm install  # frontend
```

## 3. Tests du contrat
```bash
npx hardhat test
```
14 tests : droits (owner/admin), event `CertificateMinted`, anti-doublon, champs vides, batch (succès, doublon, tailles incohérentes), révocation, lecture.

## 4. Lancer en local (Hardhat)

**Terminal 1 — blockchain locale** (laisser ouvert ; affiche 20 comptes de test avec leurs clés privées) :
```bash
npx hardhat node
```
**Terminal 2 — déploiement** :
```bash
npm run deploy:local
```
→ affiche l'adresse du contrat (ex. `0x5FbDB2315678afecb367f032d93F642f64180aa3`) et écrit `frontend/src/contract/abi.json` + `deployments.json` (le frontend les lit automatiquement).

**Terminal 3 — frontend** :
```bash
cd frontend && npm run dev      # http://localhost:5173
```

## 5. Connecter MetaMask au réseau local

### 5.1 Ajouter le réseau Hardhat dans MetaMask
MetaMask → menu des réseaux → **Ajouter un réseau** → *Ajouter un réseau manuellement* :

| Champ | Valeur |
|---|---|
| Nom du réseau | Hardhat Local |
| URL RPC | `http://127.0.0.1:8545` |
| ID de chaîne | `31337` |
| Symbole | `ETH` |

### 5.2 Importer le compte administrateur
Le contrat est déployé par le **compte #0** de Hardhat : c'est l'**owner**, le seul à pouvoir émettre au départ.
MetaMask → icône du compte → **Importer un compte** → collez la clé privée du compte #0 affichée par `npx hardhat node` :
```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```
> ⚠️ Cette clé est **publique** (identique pour tout le monde). Ne l'utilisez **que** sur le réseau local, jamais avec de vrais fonds.

### 5.3 Se connecter depuis l'application
1. Dans MetaMask, sélectionnez le réseau **Hardhat Local** et le compte importé.
2. Ouvrez http://localhost:5173 → **Connecter MetaMask** → validez.
3. Onglet **Administration** : le formulaire de mint et l'import Excel apparaissent. Chaque émission ouvre une fenêtre MetaMask : **Confirmer**.
4. Onglet **Vérification publique** : saisissez un identifiant (1, 2, …) — aucun wallet requis.

### 5.4 Problèmes fréquents
- **« Nonce too high » / transaction bloquée** après avoir relancé `hardhat node` : MetaMask → Paramètres → Avancé → **Effacer les données d'activité et de nonce** (pour le compte local).
- **« Réseau non supporté »** : l'app gère uniquement 31337 (local) et 11155111 (Sepolia) ; utilisez les boutons de bascule.
- **« Le compte n'est ni owner ni admin »** : vous n'êtes pas sur le compte qui a déployé. Ajoutez des admins avec `setAdmin(adresse, true)` (voir §9).
- **Après avoir relancé le nœud**, redéployez (`npm run deploy:local`) : la chaîne repart de zéro.

## 6. Déployer sur Sepolia
1. Récupérez du SepoliaETH gratuit (faucet, ex. Google Cloud Web3 Faucet, Alchemy Faucet) sur un **wallet de test dédié**.
2. Créez un RPC Sepolia (Alchemy ou Infura).
3. Copiez `.env.example` → `.env` et renseignez `SEPOLIA_RPC_URL` et `DEPLOYER_PRIVATE_KEY` (la clé reste **côté Hardhat**, jamais dans le frontend ; `.env` est dans `.gitignore`).
4. Déployez :
   ```bash
   npm run deploy:sepolia
   ```
5. Dans MetaMask, passez sur **Sepolia** (réseau déjà présent, activez « Afficher les réseaux de test »), importez/choisissez le wallet déployeur, relancez le frontend. L'adresse Sepolia est enregistrée dans `frontend/src/contract/deployments.json` sous la clé `11155111`.
6. (Optionnel) `frontend/.env` : `VITE_SEPOLIA_RPC_URL=...` si le RPC public par défaut est limité.

**Adresse du contrat déployé** : _à compléter après votre déploiement_ → `0x...`
**Capture d'écran d'un mint réussi** : _à ajouter dans `docs/`_

## 7. Utilisation

### Mint unitaire
Administration → *Émettre un certificat* → remplir les champs (*) → **Émettre**. L'app affiche l'identifiant du certificat et le hash de la transaction ; les erreurs du contrat sont traduites (doublon, compte non autorisé…).

### Import Excel / CSV
1. Administration → *Import Excel / CSV* → choisissez `sample/etudiants.xlsx`.
2. L'aperçu valide chaque ligne **avant toute transaction** : champs obligatoires, date `AAAA-MM-JJ`, adresse wallet, doublons dans le fichier **et** déjà présents sur la blockchain.
3. Cochez/décochez les lignes (seules les lignes valides sont sélectionnables).
4. Choisissez **Par lots** (`batchMint`, lots de 5/10/15) ou **Un par un** (`mintCertificate`), puis **Émettre**. Chaque lot = une confirmation MetaMask ; le hash de chaque transaction est affiché. L'émission s'arrête au premier échec (un lot est atomique : tout passe ou rien).
5. `sample/etudiants_avec_erreurs.xlsx` sert à tester la validation.

Format attendu (1re feuille, 1re ligne = en-têtes) : `studentName, studentId, diplomaTitle, issueDate, recipientAddress (optionnel), grade`.
> Astuce Excel : formatez la colonne `issueDate` en **Texte** ; les vraies dates Excel sont toutefois converties automatiquement.

### Vérification publique
Onglet *Vérification publique* → identifiant → nom, diplôme, date, mention, destinataire, statut **VALIDE / RÉVOQUÉ**. Le lien (`?cert=3`) est partageable. On peut aussi retrouver l'identifiant via `studentId` + diplôme.

## 8. Choix de conception
- **Anti-doublon** : unicité de la paire (`studentId`, `diplomaTitle`) — un étudiant peut avoir plusieurs diplômes, mais pas deux fois le même.
- **Contrôle d'accès** : `owner` + mapping `admins` ; `setAdmin`/`transferOwnership` réservés à l'owner.
- **Identifiants** : `certId` commence à 1 ; `getCertificate(0)` ou inexistant → erreur `CertificateNotFound`.
- **Batch** : limité à 50 par le contrat (`MAX_BATCH_SIZE`), 5–15 conseillé côté UI (~170 000 gas par certificat mesuré en local).
- **Lectures** : `view` uniquement (`getCertificate`, `findCertificate`, `isValid`, `isAuthorized`) → gratuites, sans transaction.
- **Sécurité** : aucune clé privée dans le frontend ; tout est signé par MetaMask.
- **Confidentialité** : les données sont **publiques et permanentes** on-chain (nom, CNE…). À considérer avant un usage réel (RGPD) : stocker plutôt un hash.

## 9. Ajouter un admin / révoquer (console Hardhat)
```bash
npx hardhat console --network localhost
> const r = await ethers.getContractAt("CertificateRegistry", "ADRESSE_DU_CONTRAT")
> await r.setAdmin("0xAdresseAdmin", true)
> await r.revoke(1)
```
