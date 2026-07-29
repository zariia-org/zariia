// zariia-sign.mjs — origin, not secrecy.
//
// The carrier had confidentiality and NO authenticity: AES-GCM proves the ciphertext was
// not tampered with *given the key*, and says nothing about who made the file. So anyone
// could build a FLAC carrying the ZRKA id, seal anything with a key of their choosing, and
// hand it round as a Zariia release. Nothing could tell the difference.
//
// That matters here more than it would elsewhere. A forged release is a way to put
// something into the scene that the scene will trust — misinformation, or content that
// incriminates whoever is found holding it. exists precisely to keep this
// project from becoming that vector.
//
// Design decisions:
//   - ONE label keypair, not one per member. A published label public key names the LABEL,
//     not the scene. That is the whole difference between this and the public-key
//     distribution model rejected in docs/concept/the-key.md, which would have required a
//     membership list — a social graph, and the most dangerous object this project could
//     hold.
//   - ECDSA P-256, not Ed25519. P-256 is available in every WebCrypto implementation;
//     Ed25519 support in browsers is still uneven, and a signature nobody can verify is
//     worse than none.
//   - The signature covers the AUDIO DIGEST *and* the SEALED BLOB, so neither the song nor
//     the sealed channel can be swapped under a valid signature.
//   - It lives OUTSIDE the encryption (a ZRKS block), so origin is checkable without the
//     key. Presence open, content keyed — origin open too.
//
// 🔴 What this is NOT: a verification badge. forbids authority markers. A
// player must report origin plainly ("signed by the label key" / "origin not verified")
// and must never render a tick, a shield, or anything that dresses a claim in authority.

const subtle = globalThis.crypto?.subtle;
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

/** What the signature covers: the open track's digest, then the sealed blob. */
function signedBytes(audioDigest, sealedBlob) {
  const out = new Uint8Array(audioDigest.length + sealedBlob.length);
  out.set(audioDigest, 0);
  out.set(sealedBlob, audioDigest.length);
  return out;
}

/** Make a label keypair. The private JWK never leaves the label; the public one is published. */
export async function generateLabelKeypair() {
  const kp = await subtle.generateKey(ALGO, true, ['sign', 'verify']);
  return {
    privateJwk: await subtle.exportKey('jwk', kp.privateKey),
    publicJwk: await subtle.exportKey('jwk', kp.publicKey),
  };
}

export async function signRelease(privateJwk, audioDigest, sealedBlob) {
  const key = await subtle.importKey('jwk', privateJwk, ALGO, false, ['sign']);
  return new Uint8Array(await subtle.sign(SIGN, key, signedBytes(audioDigest, sealedBlob)));
}

/** True only if this exact pairing was signed by the holder of the label key. */
export async function verifyRelease(publicJwk, audioDigest, sealedBlob, signature) {
  try {
    const key = await subtle.importKey('jwk', publicJwk, ALGO, false, ['verify']);
    return await subtle.verify(SIGN, key, signature, signedBytes(audioDigest, sealedBlob));
  } catch {
    return false;   // a malformed key or signature is an unverified origin, never a throw
  }
}
