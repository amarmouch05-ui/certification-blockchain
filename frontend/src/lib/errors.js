// Transforme les erreurs viem / MetaMask en messages lisibles.
const CUSTOM = {
  NotAuthorized: () => "Ce compte n'est pas autorisé à émettre/révoquer. Utilisez le compte owner ou un admin.",
  NotOwner: () => "Action réservée à l'owner du contrat.",
  EmptyField: (a) => `Champ obligatoire vide : ${a?.[0] ?? "?"}.`,
  DuplicateCertificate: (a) => `Certificat déjà enregistré pour ${a?.[0]} / ${a?.[1]}.`,
  ArrayLengthMismatch: () => "Les tableaux du lot n'ont pas la même taille.",
  BatchTooLarge: (a) => `Lot trop grand (${a?.[0]} > ${a?.[1]}).`,
  CertificateNotFound: () => "Aucun certificat avec cet identifiant.",
  AlreadyRevoked: () => "Ce certificat est déjà révoqué.",
  ZeroAddress: () => "Adresse nulle interdite.",
};

export function readableError(e) {
  if (!e) return "Erreur inconnue";
  if (typeof e.walk === "function") {
    const rejected = e.walk((x) => x?.name === "UserRejectedRequestError" || x?.code === 4001);
    if (rejected) return "Transaction refusée dans MetaMask.";
    const reverted = e.walk((x) => x?.name === "ContractFunctionRevertedError");
    if (reverted) {
      const name = reverted.data?.errorName;
      if (name && CUSTOM[name]) return CUSTOM[name](reverted.data?.args);
      return reverted.reason || reverted.shortMessage || "Transaction annulée par le contrat.";
    }
  }
  return e.shortMessage || e.message || String(e);
}
