import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { abi } from "../contract";
import { readableError } from "../lib/errors";

export default function PublicVerify({ chainId, contractAddress }) {
  const initial = new URLSearchParams(window.location.search).get("cert") ?? "";
  const [input, setInput] = useState(initial);
  const [certId, setCertId] = useState(/^\d+$/.test(initial) ? BigInt(initial) : null);

  // Recherche secondaire : par (studentId, diplôme)
  const [sid, setSid] = useState("");
  const [dip, setDip] = useState("");
  const [lookupMsg, setLookupMsg] = useState("");

  const common = { address: contractAddress, abi, chainId };

  const total = useReadContract({ ...common, functionName: "totalCertificates", query: { enabled: Boolean(contractAddress) } });
  const cert = useReadContract({
    ...common,
    functionName: "getCertificate",
    args: certId !== null ? [certId] : undefined,
    query: { enabled: Boolean(contractAddress) && certId !== null, retry: false },
  });
  const find = useReadContract({
    ...common,
    functionName: "findCertificate",
    args: sid && dip ? [sid.trim(), dip.trim()] : undefined,
    query: { enabled: false },
  });

  useEffect(() => {
    if (certId !== null) {
      const url = new URL(window.location.href);
      url.searchParams.set("cert", certId.toString());
      window.history.replaceState(null, "", url);
    }
  }, [certId]);

  function search(e) {
    e.preventDefault();
    setCertId(/^\d+$/.test(input.trim()) ? BigInt(input.trim()) : null);
  }

  async function lookup(e) {
    e.preventDefault();
    setLookupMsg("");
    const res = await find.refetch();
    const id = res.data;
    if (id && id > 0n) {
      setInput(id.toString());
      setCertId(id);
    } else {
      setLookupMsg("Aucun certificat trouvé pour cet étudiant et ce diplôme.");
    }
  }

  const c = cert.data;
  return (
    <section>
      <h2>Vérifier un certificat</h2>
      <p className="muted">
        {total.data !== undefined ? `${total.data.toString()} certificat(s) enregistré(s) sur ce réseau.` : "Lecture publique, aucun wallet requis."}
      </p>

      <form className="row" onSubmit={search}>
        <input placeholder="Identifiant du certificat (ex : 1)" value={input} onChange={(e) => setInput(e.target.value)} inputMode="numeric" />
        <button className="primary" type="submit" disabled={!contractAddress || !/^\d+$/.test(input.trim())}>Rechercher</button>
      </form>

      <details>
        <summary>Retrouver l'identifiant à partir du studentId et du diplôme</summary>
        <form className="row" onSubmit={lookup}>
          <input placeholder="studentId (ex : 2023-INF-042)" value={sid} onChange={(e) => setSid(e.target.value)} />
          <input placeholder="Intitulé du diplôme" value={dip} onChange={(e) => setDip(e.target.value)} />
          <button type="submit" disabled={!contractAddress || !sid || !dip}>Chercher</button>
        </form>
        {lookupMsg && <p className="error">{lookupMsg}</p>}
      </details>

      {cert.isLoading && <p className="muted">Lecture de la blockchain…</p>}
      {cert.isError && <div className="banner error">{readableError(cert.error)}</div>}

      {c && (
        <article className="card">
          <div className="card-head">
            <h3>Certificat n° {certId.toString()}</h3>
            <span className={`status ${c.revoked ? "revoked" : "valid"}`}>{c.revoked ? "RÉVOQUÉ" : "VALIDE"}</span>
          </div>
          <dl>
            <dt>Étudiant</dt><dd>{c.studentName}</dd>
            <dt>Identifiant (CNE)</dt><dd className="mono">{c.studentId}</dd>
            <dt>Diplôme</dt><dd>{c.diplomaTitle}</dd>
            <dt>Date d'émission</dt><dd>{c.issueDate}</dd>
            <dt>Mention</dt><dd>{c.grade || "—"}</dd>
            <dt>Destinataire</dt><dd className="mono">{/^0x0{40}$/.test(c.recipient) ? "Non renseigné" : c.recipient}</dd>
          </dl>
          <button onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copier le lien de vérification</button>
        </article>
      )}
    </section>
  );
}
