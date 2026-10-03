param(
  [Parameter(Mandatory=$true)][string]$EncryptedBackup,
  [Parameter(Mandatory=$true)][string]$ProtectedPrivateKey,
  [Parameter(Mandatory=$true)][string]$ProtectedSqlOutput
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $ProtectedSqlOutput) { throw 'Refusing to replace an existing recovery file' }
$taskEnvelope = Get-Content -LiteralPath $EncryptedBackup -Raw | ConvertFrom-Json
if ($taskEnvelope.algorithm -ne 'RSA-OAEP-SHA256/AES-256-GCM') { throw 'Unsupported backup envelope' }
$taskPrivate = [System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($ProtectedPrivateKey), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$taskRsa = [System.Security.Cryptography.RSA]::Create()
$taskKey = $null
$taskSql = $null
try {
  $taskConsumed = 0
  $taskRsa.ImportPkcs8PrivateKey($taskPrivate, [ref]$taskConsumed)
  $taskFingerprint = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($taskRsa.ExportSubjectPublicKeyInfo())).ToLowerInvariant()
  if ($taskFingerprint -ne $taskEnvelope.keyFingerprint) { throw 'Recovery key fingerprint does not match backup' }
  $taskAad = [Convert]::FromBase64String($taskEnvelope.aad)
  $taskProof = [System.Text.Encoding]::UTF8.GetString($taskAad) | ConvertFrom-Json
  if ($taskProof.version -ne 1 -or $taskProof.database -ne '88da0e99-bbf0-45f6-82f6-74922e1ba2f7' -or $taskProof.keyFingerprint -ne $taskFingerprint) { throw 'Recovery proof does not name the exact production CMS database' }
  $taskKey = $taskRsa.Decrypt([Convert]::FromBase64String($taskEnvelope.wrappedKey), [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
  $taskCiphertext = [Convert]::FromBase64String($taskEnvelope.ciphertext)
  $taskSql = [byte[]]::new($taskCiphertext.Length)
  $taskGcm = [System.Security.Cryptography.AesGcm]::new($taskKey, 16)
  try {
    $taskGcm.Decrypt([Convert]::FromBase64String($taskEnvelope.iv), $taskCiphertext, [Convert]::FromBase64String($taskEnvelope.tag), $taskSql, $taskAad)
  } finally { $taskGcm.Dispose() }
  $taskHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($taskSql)).ToLowerInvariant()
  if ($taskSql.Length -ne $taskProof.bytes -or $taskHash -ne $taskProof.sha256) { throw 'Recovered SQL does not match original backup proof' }
  $taskProtectedSql = [System.Security.Cryptography.ProtectedData]::Protect($taskSql, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  [System.IO.File]::WriteAllBytes($ProtectedSqlOutput, $taskProtectedSql)
  Write-Output 'Backup authenticated and recovered as Windows DPAPI-protected SQL. No database was changed.'
} finally {
  if ($taskSql) { [Array]::Clear($taskSql, 0, $taskSql.Length) }
  if ($taskKey) { [Array]::Clear($taskKey, 0, $taskKey.Length) }
  [Array]::Clear($taskPrivate, 0, $taskPrivate.Length)
  $taskRsa.Dispose()
}
