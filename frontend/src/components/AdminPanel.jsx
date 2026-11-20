import { useCallback, useEffect, useMemo, useState } from "react";
import { usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { parseEventLogs, zeroAddress, isAddress } from "viem";
import { abi } from "../contract";
import { parseCertificateFile } from "../lib/parseCertificates";
import { readableError } from "../lib/errors";

const EMPTY_FORM = { to: "", studentName: "", studentId: "", diplomaTitle: "", issueDate: "", grade: "" };

export default function AdminPanel({ chainId, contractAddress, walletReady, account }) {
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();

  const authorized = useReadContract({
    address: contractAddress,
    abi,
    chainId,
    functionName: "isAuthorized",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(contractAddress && account && walletReady) },
  });

  if (!walletReady) {
    return (
      <section>
        <h2>Administration</h2>
        <div className="banner warn">Connectez MetaMask (sur un réseau supporté) pour émettre des certificats.</div>
      </section>
    );
  }
  if (!contractAddress) {
    return (
      <section>
        <h2>Administration</h2>
        <div className="banner warn">Contrat introuvable sur ce réseau.</div>
      </section>
    );
  }

  return (
    <section>
      <h2>Administration</h2>
      {authorized.data === false && (
        <div className="banner error">
          Le compte connecté (<span className="mono">{account}</span>) n'est ni owner ni admin : les transactions seront refusées.
          Utilisez le compte qui a déployé le contrat.
        </div>
      )}
      <SingleMint publicClient={publicClient} writeContractAsync={writeContractAsync} contractAddress={contractAddress} />
      <ExcelImport publicClient={publicClient} writeContractAsync={writeContractAsync} contractAddress={contractAddress} />
    </section>
  );
}

/* ───────────────────────── Mint unitaire ───────────────────────── */

function SingleMint({ publicClient, writeContractAsync, contractAddress }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState({ phase: "idle" }); // idle | signing | pending | done | error
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const problems = useMemo(() => {
    const p = [];
    if (!form.studentName.trim()) p.push("Nom requis");
    if (!form.studentId.trim()) p.push("studentId requis");
    if (!form.diplomaTitle.trim()) p.push("Diplôme requis");
    if (!form.issueDate) p.push("Date requise");
    if (form.to.trim() && !isAddress(form.to.trim())) p.push("Adresse wallet invalide");
    return p;
  }, [form]);

  async function submit(e) {
    e.preventDefault();
    if (problems.length) return;
    try {
      setStatus({ phase: "signing" });
      const hash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName: "mintCertificate",
        args: [
          form.to.trim() || zeroAddress,
          form.studentName.trim(),
          form.studentId.trim(),
          form.diplomaTitle.trim(),
          form.issueDate,
          form.grade.trim(),
        ],
      });
      setStatus({ phase: "pending", hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction échouée (revert).");
      const [log] = parseEventLogs({ abi, logs: receipt.logs, eventName: "CertificateMinted" });
      setStatus({ phase: "done", hash, certId: log?.args.certId });
      setForm(EMPTY_FORM);
    } catch (err) {
      setStatus({ phase: "error", message: readableError(err) });
    }
  }

  return (
    <div className="card">
      <h3>Émettre un certificat</h3>
      <form className="grid" onSubmit={submit}>
        <label>Nom de l'étudiant *<input value={form.studentName} onChange={set("studentName")} placeholder="Amina Benali" /></label>
        <label>Identifiant (CNE) *<input value={form.studentId} onChange={set("studentId")} placeholder="2023-INF-042" /></label>
        <label>Diplôme *<input value={form.diplomaTitle} onChange={set("diplomaTitle")} placeholder="Licence Informatique" /></label>
        <label>Date d'émission *<input type="date" value={form.issueDate} onChange={set("issueDate")} /></label>
        <label>Mention<input value={form.grade} onChange={set("grade")} placeholder="Mention Bien" /></label>
        <label>Adresse wallet (optionnelle)<input value={form.to} onChange={set("to")} placeholder="0x…" className="mono" /></label>
        <div className="full">
          {problems.length > 0 && <p className="muted small">{problems.join(" · ")}</p>}
          <button className="primary" type="submit" disabled={problems.length > 0 || ["signing", "pending"].includes(status.phase)}>
            {status.phase === "signing" ? "Confirmez dans MetaMask…" : status.phase === "pending" ? "Confirmation en cours…" : "Émettre le certificat"}
          </button>
        </div>
      </form>
      <TxStatus status={status} />
    </div>
  );
}

function TxStatus({ status }) {
  if (status.phase === "pending") return <p className="muted">Transaction envoyée : <span className="mono">{status.hash}</span></p>;
  if (status.phase === "done")
    return (
      <div className="banner ok">
        Certificat émis{status.certId !== undefined && <> — identifiant <strong>{status.certId.toString()}</strong></>}.
        <br />Hash : <span className="mono">{status.hash}</span>
      </div>
    );
  if (status.phase === "error") return <div className="banner error">{status.message}</div>;
  return null;
}

/* ───────────────────────── Import Excel / CSV ───────────────────────── */

function ExcelImport({ publicClient, writeContractAsync, contractAddress }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [fileErrors, setFileErrors] = useState([]);
  const [onchain, setOnchain] = useState({}); // line -> true si déjà émis
  const [selected, setSelected] = useState(new Set());
  const [mode, setMode] = useState("batch"); // batch | single
  const [batchSize, setBatchSize] = useState(10);
  const [log, setLog] = useState([]); // [{label, status, hash?, message?}]
  const [running, setRunning] = useState(false);

  const checkOnChain = useCallback(
    async (parsedRows) => {
      const flags = {};
      await Promise.all(
        parsedRows
          .filter((r) => r.errors.length === 0)
          .map(async (r) => {
            try {
              const id = await publicClient.readContract({
                address: contractAddress,
                abi,
                functionName: "findCertificate",
                args: [r.data.studentId, r.data.diplomaTitle],
              });
              if (id > 0n) flags[r.line] = true;
            } catch {
              /* lecture impossible : on laisse la ligne sélectionnable */
            }
          })
      );
      setOnchain(flags);
      return flags;
    },
    [publicClient, contractAddress]
  );

  const emittable = (r, flags = onchain) => r.errors.length === 0 && !flags[r.line];

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLog([]);
    const { rows: parsed, fileErrors: fe } = parseCertificateFile(await file.arrayBuffer(), file.name);
    setRows(parsed);
    setFileErrors(fe);
    const flags = await checkOnChain(parsed);
    setSelected(new Set(parsed.filter((r) => emittable(r, flags)).map((r) => r.line)));
  }

  const counts = useMemo(() => {
    const invalid = rows.filter((r) => r.errors.length).length;
    const already = rows.filter((r) => !r.errors.length && onchain[r.line]).length;
    return { total: rows.length, invalid, already, ok: rows.length - invalid - already };
  }, [rows, onchain]);

  const toggle = (line) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(line) ? n.delete(line) : n.add(line);
      return n;
    });
  const selectAllOk = () => setSelected(new Set(rows.filter((r) => emittable(r)).map((r) => r.line)));
  const clearSel = () => setSelected(new Set());

  async function emit() {
    const chosen = rows.filter((r) => selected.has(r.line) && emittable(r));
    if (!chosen.length) return;
    setRunning(true);
    setLog([]);

    const groups = mode === "batch" ? chunk(chosen, batchSize) : chosen.map((r) => [r]);
    const push = (entry) => setLog((l) => [...l, entry]);
    const patch = (i, entry) => setLog((l) => l.map((x, k) => (k === i ? { ...x, ...entry } : x)));

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const label = mode === "batch" ? `Lot ${i + 1}/${groups.length} (${g.length} certificats)` : `Ligne ${g[0].line} — ${g[0].data.studentName}`;
      push({ label, status: "signing" });
      try {
        const col = (k) => g.map((r) => r.data[k]);
        const to = g.map((r) => r.data.recipientAddress || zeroAddress);
        const hash =
          mode === "batch"
            ? await writeContractAsync({
                address: contractAddress,
                abi,
                functionName: "batchMint",
                args: [to, col("studentName"), col("studentId"), col("diplomaTitle"), col("issueDate"), col("grade")],
              })
            : await writeContractAsync({
                address: contractAddress,
                abi,
                functionName: "mintCertificate",
                args: [to[0], g[0].data.studentName, g[0].data.studentId, g[0].data.diplomaTitle, g[0].data.issueDate, g[0].data.grade],
              });
        patch(i, { status: "pending", hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction échouée (revert).");
        patch(i, { status: "done" });
      } catch (err) {
        patch(i, { status: "error", message: readableError(err) });
        break; // on s'arrête au premier échec pour éviter de lancer des lots en cascade
      }
    }
    const flags = await checkOnChain(rows);
    setSelected((s) => new Set([...s].filter((line) => !flags[line])));
    setRunning(false);
  }

  return (
    <div className="card">
      <h3>Import Excel / CSV</h3>
      <p className="muted small">
        Colonnes : <span className="mono">studentName, studentId, diplomaTitle, issueDate (AAAA-MM-JJ), recipientAddress (optionnel), grade</span>
      </p>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={running} />
      {fileName && <p className="muted small">Fichier : {fileName}</p>}
      {fileErrors.map((m) => <div key={m} className="banner error">{m}</div>)}

      {rows.length > 0 && (
        <>
          <p>
            <strong>{counts.total}</strong> ligne(s) · <span className="ok-text">{counts.ok} valide(s)</span> ·{" "}
            <span className="error-text">{counts.invalid} en erreur</span> · {counts.already} déjà émise(s) · <strong>{selected.size}</strong> sélectionnée(s)
          </p>
          <div className="row">
            <button onClick={selectAllOk} disabled={running}>Sélectionner les valides</button>
            <button onClick={clearSel} disabled={running}>Tout désélectionner</button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th></th><th>#</th><th>Nom</th><th>studentId</th><th>Diplôme</th><th>Date</th><th>Mention</th><th>Wallet</th><th>État</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ok = emittable(r);
                  return (
                    <tr key={r.line} className={r.errors.length ? "row-error" : onchain[r.line] ? "row-done" : ""}>
                      <td><input type="checkbox" checked={selected.has(r.line)} disabled={!ok || running} onChange={() => toggle(r.line)} /></td>
                      <td>{r.line}</td>
                      <td>{r.data.studentName}</td>
                      <td className="mono">{r.data.studentId}</td>
                      <td>{r.data.diplomaTitle}</td>
                      <td>{r.data.issueDate}</td>
                      <td>{r.data.grade}</td>
                      <td className="mono">{r.data.recipientAddress ? `${r.data.recipientAddress.slice(0, 8)}…` : "—"}</td>
                      <td>{r.errors.length ? r.errors.join(" ; ") : onchain[r.line] ? "Déjà émis" : "OK"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="row options">
            <label><input type="radio" checked={mode === "batch"} onChange={() => setMode("batch")} /> Par lots (batchMint)</label>
            <label><input type="radio" checked={mode === "single"} onChange={() => setMode("single")} /> Un par un (mintCertificate)</label>
            {mode === "batch" && (
              <label>Taille des lots
                <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}>
                  {[5, 10, 15].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
          </div>

          <button className="primary" onClick={emit} disabled={running || selected.size === 0}>
            {running ? "Émission en cours…" : `Émettre ${selected.size} certificat(s)`}
          </button>
        </>
      )}

      {log.length > 0 && (
        <ul className="log">
          {log.map((l, i) => (
            <li key={i} className={l.status}>
              <strong>{l.label}</strong> —{" "}
              {l.status === "signing" && "confirmez dans MetaMask…"}
              {l.status === "pending" && "en attente de confirmation"}
              {l.status === "done" && "confirmé ✔"}
              {l.status === "error" && <span className="error-text">{l.message}</span>}
              {l.hash && <div className="mono small">{l.hash}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
