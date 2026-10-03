import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, privateDecrypt, constants, createDecipheriv, createHash } from 'node:crypto';
import { sealSiteContentBackup } from '../scripts/site-content-backup.mjs';

test('retained backup decrypts only with the corresponding local key and detects tampering', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sql = Buffer.from("CREATE TABLE test (id TEXT);\nINSERT INTO test VALUES ('private recovery fixture');\n");
  const proof = {
    database: 'offline',
    bookmark: 'before',
    bytes: sql.length,
    sha256: createHash('sha256').update(sql).digest('hex'),
  };
  const envelope = sealSiteContentBackup(sql, keys.publicKey.export({ type: 'spki', format: 'pem' }), proof);
  assert.equal(JSON.stringify(envelope).includes('private recovery fixture'), false);
  const key = privateDecrypt(
    { key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.wrappedKey, 'base64')
  );
  const open = (ciphertext) => {
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    cipher.setAAD(Buffer.from(envelope.aad, 'base64'));
    cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([cipher.update(ciphertext), cipher.final()]);
  };
  assert.deepEqual(open(Buffer.from(envelope.ciphertext, 'base64')), sql);
  assert.deepEqual(JSON.parse(Buffer.from(envelope.aad, 'base64').toString('utf8')), {
    version: 1,
    ...proof,
    keyFingerprint: envelope.keyFingerprint,
  });
  const tampered = Buffer.from(envelope.ciphertext, 'base64');
  tampered[0] ^= 1;
  assert.throws(() => open(tampered));
  const unrelated = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() =>
    privateDecrypt(
      { key: unrelated.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(envelope.wrappedKey, 'base64')
    )
  );
  assert.throws(() =>
    sealSiteContentBackup(sql, keys.publicKey.export({ type: 'spki', format: 'pem' }), { ...proof, sha256: 'wrong' })
  );
  key.fill(0);
});
