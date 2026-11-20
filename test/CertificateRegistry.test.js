const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateRegistry", () => {
  let registry, owner, admin, stranger, student;

  const sample = (i = 1, title = "Licence Informatique") => [
    student.address,
    `Etudiant ${i}`,
    `2023-INF-${String(i).padStart(3, "0")}`,
    title,
    "2026-06-15",
    "Mention Bien",
  ];

  beforeEach(async () => {
    [owner, admin, stranger, student] = await ethers.getSigners();
    registry = await (await ethers.getContractFactory("CertificateRegistry")).deploy();
    await registry.waitForDeployment();
  });

  it("l'owner peut émettre un certificat et l'event est émis", async () => {
    await expect(registry.mintCertificate(...sample(1)))
      .to.emit(registry, "CertificateMinted")
      .withArgs(1, "2023-INF-001", "Licence Informatique", student.address, owner.address);

    const c = await registry.getCertificate(1);
    expect(c.studentName).to.equal("Etudiant 1");
    expect(c.studentId).to.equal("2023-INF-001");
    expect(c.diplomaTitle).to.equal("Licence Informatique");
    expect(c.issueDate).to.equal("2026-06-15");
    expect(c.grade).to.equal("Mention Bien");
    expect(c.recipient).to.equal(student.address);
    expect(c.revoked).to.equal(false);
    expect(await registry.totalCertificates()).to.equal(1);
  });

  it("refuse un compte non autorisé", async () => {
    await expect(registry.connect(stranger).mintCertificate(...sample(1))).to.be.revertedWithCustomError(
      registry,
      "NotAuthorized"
    );
  });

  it("un admin ajouté par l'owner peut émettre, puis ne peut plus une fois retiré", async () => {
    await registry.setAdmin(admin.address, true);
    await registry.connect(admin).mintCertificate(...sample(1));
    await registry.setAdmin(admin.address, false);
    await expect(registry.connect(admin).mintCertificate(...sample(2))).to.be.revertedWithCustomError(
      registry,
      "NotAuthorized"
    );
  });

  it("seul l'owner peut gérer les admins", async () => {
    await expect(registry.connect(stranger).setAdmin(stranger.address, true)).to.be.revertedWithCustomError(
      registry,
      "NotOwner"
    );
  });

  it("empêche le double enregistrement du même (studentId, diplôme)", async () => {
    await registry.mintCertificate(...sample(1));
    await expect(registry.mintCertificate(...sample(1))).to.be.revertedWithCustomError(
      registry,
      "DuplicateCertificate"
    );
  });

  it("autorise un même étudiant avec un diplôme différent", async () => {
    await registry.mintCertificate(...sample(1, "Licence Informatique"));
    await registry.mintCertificate(...sample(1, "Master Informatique"));
    expect(await registry.totalCertificates()).to.equal(2);
  });

  it("refuse les champs obligatoires vides", async () => {
    const args = sample(1);
    args[1] = "";
    await expect(registry.mintCertificate(...args)).to.be.revertedWithCustomError(registry, "EmptyField");
  });

  it("accepte une adresse destinataire nulle (optionnelle)", async () => {
    const args = sample(1);
    args[0] = ethers.ZeroAddress;
    await registry.mintCertificate(...args);
    expect((await registry.getCertificate(1)).recipient).to.equal(ethers.ZeroAddress);
  });

  it("batchMint émet plusieurs certificats", async () => {
    const rows = [1, 2, 3].map((i) => sample(i));
    await expect(
      registry.batchMint(
        rows.map((r) => r[0]),
        rows.map((r) => r[1]),
        rows.map((r) => r[2]),
        rows.map((r) => r[3]),
        rows.map((r) => r[4]),
        rows.map((r) => r[5])
      )
    ).to.emit(registry, "CertificateMinted");
    expect(await registry.totalCertificates()).to.equal(3);
    expect((await registry.getCertificate(3)).studentId).to.equal("2023-INF-003");
  });

  it("batchMint est annulé en entier si un doublon est présent", async () => {
    await registry.mintCertificate(...sample(2));
    const rows = [1, 2, 3].map((i) => sample(i));
    await expect(
      registry.batchMint(
        rows.map((r) => r[0]),
        rows.map((r) => r[1]),
        rows.map((r) => r[2]),
        rows.map((r) => r[3]),
        rows.map((r) => r[4]),
        rows.map((r) => r[5])
      )
    ).to.be.revertedWithCustomError(registry, "DuplicateCertificate");
    expect(await registry.totalCertificates()).to.equal(1);
  });

  it("batchMint refuse des tableaux de tailles différentes", async () => {
    await expect(
      registry.batchMint([student.address], ["A", "B"], ["1"], ["D"], ["2026-01-01"], ["G"])
    ).to.be.revertedWithCustomError(registry, "ArrayLengthMismatch");
  });

  it("révocation : change le statut, émet un event, pas de double révocation", async () => {
    await registry.mintCertificate(...sample(1));
    expect(await registry.isValid(1)).to.equal(true);
    await expect(registry.revoke(1)).to.emit(registry, "CertificateRevoked").withArgs(1, owner.address);
    expect((await registry.getCertificate(1)).revoked).to.equal(true);
    expect(await registry.isValid(1)).to.equal(false);
    await expect(registry.revoke(1)).to.be.revertedWithCustomError(registry, "AlreadyRevoked");
    await expect(registry.connect(stranger).revoke(1)).to.be.revertedWithCustomError(registry, "NotAuthorized");
  });

  it("getCertificate échoue pour un id inexistant", async () => {
    await expect(registry.getCertificate(99)).to.be.revertedWithCustomError(registry, "CertificateNotFound");
    await expect(registry.getCertificate(0)).to.be.revertedWithCustomError(registry, "CertificateNotFound");
  });

  it("findCertificate retrouve l'id par (studentId, diplôme)", async () => {
    await registry.mintCertificate(...sample(5));
    expect(await registry.findCertificate("2023-INF-005", "Licence Informatique")).to.equal(1);
    expect(await registry.findCertificate("inconnu", "x")).to.equal(0);
  });
});
