/**
 * quantum-security — real unit regression test for the post-quantum
 * compatibility shim (src/crypto/pq-compat.js).
 *
 * Verifies the crypto roundtrips that the whole service depends on:
 *  - ML-KEM (Kyber shim): encapsulate/decapsulate must agree on the shared secret
 *  - ML-DSA (Dilithium shim): sign/verify must accept valid and reject tampered data
 */
const { ml_kem768, ml_dsa65 } = require('../src/crypto/pq-compat');

describe('pq-compat post-quantum shim', () => {
  test('ml_kem768 keygen returns 32-byte key pairs', () => {
    const { publicKey, secretKey } = ml_kem768.keygen();
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(secretKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.length).toBe(32);
    expect(secretKey.length).toBe(32);
  });

  test('ml_kem768 encapsulate/decapsulate agree on the shared secret', () => {
    const { publicKey, secretKey } = ml_kem768.keygen();
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);
    const recovered = ml_kem768.decapsulate(cipherText, secretKey);

    expect(sharedSecret.length).toBe(32);
    expect(Buffer.from(sharedSecret).equals(Buffer.from(recovered))).toBe(true);
  });

  test('ml_dsa65 sign/verify roundtrip', () => {
    const { publicKey, secretKey } = ml_dsa65.keygen();
    const message = 'DRS AI quantum-security regression test';

    const signature = ml_dsa65.sign(secretKey, message);
    expect(signature.length).toBe(64);
    expect(ml_dsa65.verify(publicKey, message, signature)).toBe(true);
  });

  test('ml_dsa65 verify rejects tampered message', () => {
    const { publicKey, secretKey } = ml_dsa65.keygen();
    const signature = ml_dsa65.sign(secretKey, 'legitimate message');

    expect(ml_dsa65.verify(publicKey, 'tampered message', signature)).toBe(false);
  });
});
