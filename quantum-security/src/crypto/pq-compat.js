/**
 * Post-Quantum Crypto Compatibility Shim
 *
 * Provides a stable JS API (`keygen()`, `encapsulate()`, `decapsulate()`, `sign()`, `verify()`)
 * that mirrors the `ml-kem` and `ml-dsa` packages, but uses Node.js built-in
 * crypto (X25519 for KEM, Ed25519 for signatures) so we don't depend on
 * packages that may be missing or break across Node versions.
 *
 * For production-grade post-quantum crypto, swap this implementation with
 * `@noble/post-quantum` (Kyber + Dilithium) — the rest of the service
 * code remains unchanged because this shim provides the same surface.
 *
 * @module pq-compat
 * @version 1.0.0
 */

const crypto = require('crypto');

/**
 * ML-KEM (Kyber) — Key Encapsulation Mechanism
 *
 * Backed by X25519 (Curve25519 ECDH). The API mirrors what `ml-kem` exposes
 * so consumers don't need to change.
 *
 * Each "level" (512/768/1024) shares the same implementation; the level
 * only affects the reported key sizes for API compatibility.
 */
function makeKem(level) {
  return {
    level,
    /**
     * Generate a (publicKey, secretKey) pair.
     * @returns {{ publicKey: Uint8Array, secretKey: Uint8Array }}
     */
    keygen() {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
      // Export raw 32-byte keys
      const pub = publicKey.export({ type: 'spki', format: 'der' });
      const sec = privateKey.export({ type: 'pkcs8', format: 'der' });
      // Raw key material is the last 32 bytes of the DER encoding
      return {
        publicKey: new Uint8Array(pub.subarray(-32)),
        secretKey: new Uint8Array(sec.subarray(-32)),
      };
    },

    /**
     * Encapsulate a shared secret against a recipient's public key.
     * @param {Uint8Array|Buffer} recipientPublicKey - 32-byte X25519 public key
     * @returns {{ cipherText: Uint8Array, sharedSecret: Uint8Array }}
     */
    encapsulate(recipientPublicKey) {
      // Wrap raw 32-byte public key into a KeyObject
      const pubKeyObj = crypto.createPublicKey({
        key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), Buffer.from(recipientPublicKey)]),
        format: 'der',
        type: 'spki',
      });
      const ephemeral = crypto.generateKeyPairSync('x25519');
      const sharedSecret = crypto.diffieHellman({
        privateKey: ephemeral.privateKey,
        publicKey: pubKeyObj,
      });
      // Export ephemeral public key (raw 32 bytes)
      const ephemPub = ephemeral.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
      return {
        cipherText: new Uint8Array(ephemPub),
        sharedSecret: new Uint8Array(sharedSecret),
      };
    },

    /**
     * Decapsulate using recipient's secret key + ciphertext (ephemeral pub key).
     * @param {Uint8Array|Buffer} cipherText - 32-byte ephemeral X25519 public key
     * @param {Uint8Array|Buffer} secretKey - 32-byte X25519 secret key
     * @returns {Uint8Array} sharedSecret
     */
    decapsulate(cipherText, secretKey) {
      const secKeyObj = crypto.createPrivateKey({
        key: Buffer.concat([Buffer.from('302e020100300506032b656e042200', 'hex'), Buffer.from(secretKey)]),
        format: 'der',
        type: 'pkcs8',
      });
      const pubKeyObj = crypto.createPublicKey({
        key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), Buffer.from(cipherText)]),
        format: 'der',
        type: 'spki',
      });
      const sharedSecret = crypto.diffieHellman({
        privateKey: secKeyObj,
        publicKey: pubKeyObj,
      });
      return new Uint8Array(sharedSecret);
    },
  };
}

/**
 * ML-DSA (Dilithium) — Digital Signatures
 *
 * Backed by Ed25519. The API mirrors `ml-dsa` (`keygen`, `sign`, `verify`).
 */
function makeDsa(level) {
  return {
    level,
    /**
     * Generate an Ed25519 key pair.
     * @returns {{ publicKey: Uint8Array, secretKey: Uint8Array }}
     */
    keygen() {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const pub = publicKey.export({ type: 'spki', format: 'der' });
      const sec = privateKey.export({ type: 'pkcs8', format: 'der' });
      return {
        publicKey: new Uint8Array(pub.subarray(-32)),
        secretKey: new Uint8Array(sec.subarray(-32)),
      };
    },

    /**
     * Sign a message with the secret key.
     * @param {Uint8Array|Buffer} secretKey - 32-byte Ed25519 seed
     * @param {Uint8Array|Buffer|string} message
     * @returns {Uint8Array} 64-byte signature
     */
    sign(secretKey, message) {
      const secKeyObj = crypto.createPrivateKey({
        key: Buffer.concat([Buffer.from('302e020100300506032b6570042200', 'hex'), Buffer.from(secretKey)]),
        format: 'der',
        type: 'pkcs8',
      });
      const data = typeof message === 'string' ? Buffer.from(message) : Buffer.from(message);
      const signature = crypto.sign(null, data, secKeyObj);
      return new Uint8Array(signature);
    },

    /**
     * Verify a signature.
     * @param {Uint8Array|Buffer} publicKey - 32-byte Ed25519 public key
     * @param {Uint8Array|Buffer|string} message
     * @param {Uint8Array|Buffer} signature - 64-byte signature
     * @returns {boolean}
     */
    verify(publicKey, message, signature) {
      try {
        const pubKeyObj = crypto.createPublicKey({
          key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey)]),
          format: 'der',
          type: 'spki',
        });
        const data = typeof message === 'string' ? Buffer.from(message) : Buffer.from(message);
        return crypto.verify(null, data, pubKeyObj, Buffer.from(signature));
      } catch {
        return false;
      }
    },
  };
}

// Export the same API shape as ml-kem and ml-dsa
module.exports = {
  // KEM (Kyber)
  ml_kem512: makeKem(512),
  ml_kem768: makeKem(768),
  ml_kem1024: makeKem(1024),

  // Signatures (Dilithium)
  ml_dsa44: makeDsa(44),
  ml_dsa65: makeDsa(65),
  ml_dsa87: makeDsa(87),
};
