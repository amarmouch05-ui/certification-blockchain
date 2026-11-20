// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CertificateRegistry
/// @notice Registre de certificats académiques stockés on-chain.
/// @dev Seuls l'owner et les admins autorisés peuvent émettre / révoquer.
contract CertificateRegistry {
    struct Certificate {
        string studentName;
        string studentId;
        string diplomaTitle;
        string issueDate;
        string grade;
        address recipient;
        bool revoked;
    }

    address public owner;
    mapping(address => bool) public admins;

    uint256 public totalCertificates;
    mapping(uint256 => Certificate) private _certificates;

    /// keccak256(studentId, diplomaTitle) => certId (0 = inexistant).
    /// Un étudiant peut avoir plusieurs diplômes, mais pas deux fois le même.
    mapping(bytes32 => uint256) private _certIdByKey;

    uint256 public constant MAX_BATCH_SIZE = 50;

    event CertificateMinted(
        uint256 indexed certId,
        string studentId,
        string diplomaTitle,
        address indexed recipient,
        address indexed issuer
    );
    event CertificateRevoked(uint256 indexed certId, address indexed by);
    event AdminUpdated(address indexed account, bool isAdmin);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotAuthorized();
    error NotOwner();
    error EmptyField(string field);
    error DuplicateCertificate(string studentId, string diplomaTitle);
    error ArrayLengthMismatch();
    error BatchTooLarge(uint256 size, uint256 max);
    error CertificateNotFound(uint256 certId);
    error AlreadyRevoked(uint256 certId);
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != owner && !admins[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ───────────────────────── Administration ─────────────────────────

    function setAdmin(address account, bool isAdmin) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        admins[account] = isAdmin;
        emit AdminUpdated(account, isAdmin);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function isAuthorized(address account) external view returns (bool) {
        return account == owner || admins[account];
    }

    // ───────────────────────────── Mint ───────────────────────────────

    function mintCertificate(
        address to,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) external onlyAdmin returns (uint256 certId) {
        certId = _mint(to, studentName, studentId, diplomaTitle, issueDate, grade);
    }

    function batchMint(
        address[] calldata recipients,
        string[] calldata studentNames,
        string[] calldata studentIds,
        string[] calldata diplomaTitles,
        string[] calldata issueDates,
        string[] calldata grades
    ) external onlyAdmin {
        uint256 n = studentIds.length;
        if (n > MAX_BATCH_SIZE) revert BatchTooLarge(n, MAX_BATCH_SIZE);
        if (
            recipients.length != n ||
            studentNames.length != n ||
            diplomaTitles.length != n ||
            issueDates.length != n ||
            grades.length != n
        ) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < n; i++) {
            _mint(recipients[i], studentNames[i], studentIds[i], diplomaTitles[i], issueDates[i], grades[i]);
        }
    }

    function _mint(
        address to,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) internal returns (uint256 certId) {
        if (bytes(studentName).length == 0) revert EmptyField("studentName");
        if (bytes(studentId).length == 0) revert EmptyField("studentId");
        if (bytes(diplomaTitle).length == 0) revert EmptyField("diplomaTitle");
        if (bytes(issueDate).length == 0) revert EmptyField("issueDate");

        bytes32 key = keccak256(abi.encode(studentId, diplomaTitle));
        if (_certIdByKey[key] != 0) revert DuplicateCertificate(studentId, diplomaTitle);

        certId = ++totalCertificates; // les identifiants commencent à 1
        _certIdByKey[key] = certId;

        _certificates[certId] = Certificate({
            studentName: studentName,
            studentId: studentId,
            diplomaTitle: diplomaTitle,
            issueDate: issueDate,
            grade: grade,
            recipient: to,
            revoked: false
        });

        emit CertificateMinted(certId, studentId, diplomaTitle, to, msg.sender);
    }

    // ─────────────────────────── Révocation ───────────────────────────

    function revoke(uint256 certId) external onlyAdmin {
        if (certId == 0 || certId > totalCertificates) revert CertificateNotFound(certId);
        Certificate storage c = _certificates[certId];
        if (c.revoked) revert AlreadyRevoked(certId);
        c.revoked = true;
        emit CertificateRevoked(certId, msg.sender);
    }

    // ───────────────────────────── Lecture ────────────────────────────

    function getCertificate(uint256 certId) external view returns (Certificate memory) {
        if (certId == 0 || certId > totalCertificates) revert CertificateNotFound(certId);
        return _certificates[certId];
    }

    /// @return certId 0 si aucun certificat n'existe pour (studentId, diplomaTitle)
    function findCertificate(string calldata studentId, string calldata diplomaTitle)
        external
        view
        returns (uint256 certId)
    {
        return _certIdByKey[keccak256(abi.encode(studentId, diplomaTitle))];
    }

    function isValid(uint256 certId) external view returns (bool) {
        if (certId == 0 || certId > totalCertificates) return false;
        return !_certificates[certId].revoked;
    }
}
