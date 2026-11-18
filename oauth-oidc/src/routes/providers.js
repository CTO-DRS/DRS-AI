const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * Generate PKCE (code_verifier + code_challenge) pair per RFC 7636.
 * - code_verifier: 43-128 char random string of [A-Z][a-z][0-9]-._~
 * - code_challenge: BASE64URL(SHA256(code_verifier))
 */
function generatePkce(length = 43) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.randomBytes(length);
  let verifier = '';
  for (let i = 0; i < length; i++) verifier += chars[bytes[i] % chars.length];
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { code_verifier: verifier, code_challenge: challenge };
}

router.get('/', (req, res) => {
  res.json({ providers: req.app.locals.providerRegistry.list() });
});

router.get('/configured', (req, res) => {
  res.json({ providers: req.app.locals.providerRegistry.listConfigured() });
});

router.post('/:id/configure', asyncHandler(async (req, res) => {
  try { res.json(await req.app.locals.providerRegistry.configure(req.params.id, req.body || {})); }
  catch (e) { throw new AppError(e.message, 404, 'PROVIDER_NOT_FOUND'); }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const p = await req.app.locals.providerRegistry.remove(req.params.id);
  if (!p) throw new AppError('Provider not found', 404, 'NOT_FOUND');
  res.json(p);
}));

/**
 * Begin the OAuth2 / OIDC authorization flow.
 * Generates PKCE challenge if provider supports it.
 */
router.get('/:id/authorize', asyncHandler(async (req, res) => {
  const provider = req.app.locals.providerRegistry.get(req.params.id);
  if (!provider || !provider.configured) throw new AppError('Provider not configured', 404, 'NOT_CONFIGURED');

  const state = uuidv4();
  const userId = req.query.userId || req.headers['x-user-id'] || 'anonymous';

  // Build PKCE pair if supported
  let pkce = null;
  if (provider.pkce) {
    const { code_verifier, code_challenge } = generatePkce(43);
    pkce = { verifier: code_verifier, challenge: code_challenge, method: 'S256' };
  }

  // Stash state for callback verification
  await req.app.locals.stateStore.set(`drs:oauth:state:${state}`, JSON.stringify({
    providerId: provider.id,
    userId,
    pkce,
    createdAt: Date.now(),
  }), 600);

  const authEndpoint = req.app.locals.providerRegistry.resolveAuthorizationEndpoint(provider);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    state,
    scope: (provider.scopes || []).join(' '),
  });
  if (pkce) {
    params.set('code_challenge', pkce.challenge);
    params.set('code_challenge_method', pkce.method);
  }

  res.json({ authorizationUrl: `${authEndpoint}?${params.toString()}`, state });
}));

/**
 * Handle the OAuth2 callback — exchange code for tokens.
 */
router.post('/:id/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.body || {};
  if (!code || !state) throw new AppError('code and state required', 400, 'MISSING_PARAM');

  const stateRaw = await req.app.locals.stateStore.get(`drs:oauth:state:${state}`);
  if (!stateRaw) throw new AppError('Invalid or expired state', 400, 'INVALID_STATE');
  const stateData = JSON.parse(stateRaw);
  if (stateData.providerId !== req.params.id) throw new AppError('State/provider mismatch', 400, 'STATE_MISMATCH');

  const provider = req.app.locals.providerRegistry.get(req.params.id);
  if (!provider) throw new AppError('Provider not found', 404, 'NOT_FOUND');

  // Exchange code for tokens
  const tokenEndpoint = req.app.locals.providerRegistry.resolveTokenEndpoint(provider);
  const tokenBody = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: provider.redirectUri,
    client_id: provider.clientId,
  };
  if (provider.clientSecret) tokenBody.client_secret = provider.clientSecret;
  if (stateData.pkce) tokenBody.code_verifier = stateData.pkce.verifier;

  const tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams(tokenBody).toString(),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new AppError(`Token exchange failed: ${text}`, 400, 'TOKEN_EXCHANGE_FAILED');
  }
  const tokens = await tokenRes.json();

  // Fetch userinfo
  let userInfo = null;
  try {
    const userinfoEndpoint = req.app.locals.providerRegistry.resolveUserinfoEndpoint(provider);
    const userRes = await fetch(userinfoEndpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (userRes.ok) userInfo = await userRes.json();
  } catch (e) { logger.warn(`userinfo fetch failed: ${e.message}`); }

  // Store tokens
  const stored = await req.app.locals.tokenStore.store(stateData.userId, provider.id, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    tokenType: tokens.token_type,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    scope: tokens.scope,
  });

  // Clean up state
  await req.app.locals.stateStore.del(`drs:oauth:state:${state}`);

  res.json({ tokens: stored, userInfo });
}));

module.exports = router;
