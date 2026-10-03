import { createCipheriv, createHash, createPublicKey, publicEncrypt, randomBytes, constants } from 'node:crypto';

/** The private RSA recovery key remains local, protected with Windows DPAPI. */
export function sealSiteContentBackup(bytes, publicKeyPem, proof) {
  const publicKey = createPublicKey(publicKeyPem);
  if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 2048)
    throw new Error('A valid RSA backup public key is required');
  if (
    !bytes?.length ||
    !proof.database ||
    !proof.bookmark ||
    proof.sha256 !== createHash('sha256').update(bytes).digest('hex')
  )
    throw new Error('Backup proof does not match nonempty SQL bytes');
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  const keyFingerprint = createHash('sha256').update(publicDer).digest('hex');
  const aad = Buffer.from(JSON.stringify({ version: 1, ...proof, keyFingerprint }));
  const key = randomBytes(32);
  const iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const wrappedKey = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      key
    );
    return {
      algorithm: 'RSA-OAEP-SHA256/AES-256-GCM',
      aad: aad.toString('base64'),
      keyFingerprint,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      wrappedKey: wrappedKey.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  } finally {
    key.fill(0);
  }
}
