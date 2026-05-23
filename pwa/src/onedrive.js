import { appConfig } from "./config.js";
import { getSetting, setSetting } from "./db.js";

const TOKEN_SETTING = "microsoftGraphToken";
const VERIFIER_SETTING = "microsoftPkceVerifier";

export async function handleMicrosoftRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code || !appConfig.microsoftClientId) return false;

  const verifier = await getSetting(VERIFIER_SETTING);
  if (!verifier) return false;

  const token = await exchangeCodeForToken(code, verifier);
  await setSetting(TOKEN_SETTING, token);
  await setSetting(VERIFIER_SETTING, "");
  window.history.replaceState({}, document.title, window.location.pathname);
  return true;
}

export async function getAccountStatus() {
  const token = await getValidToken();
  if (!token) return { signedIn: false, label: "OneDrive" };
  return { signedIn: true, label: "OneDrive Connected" };
}

export async function signInToOneDrive() {
  if (!appConfig.microsoftClientId) {
    throw new Error("Add your Microsoft application client ID in pwa/src/config.js.");
  }

  const verifier = randomString(96);
  const challenge = await codeChallenge(verifier);
  await setSetting(VERIFIER_SETTING, verifier);

  const redirectURI = window.location.origin + window.location.pathname;
  const authorizeURL = new URL(`https://login.microsoftonline.com/${appConfig.microsoftTenant}/oauth2/v2.0/authorize`);
  authorizeURL.searchParams.set("client_id", appConfig.microsoftClientId);
  authorizeURL.searchParams.set("response_type", "code");
  authorizeURL.searchParams.set("redirect_uri", redirectURI);
  authorizeURL.searchParams.set("response_mode", "query");
  authorizeURL.searchParams.set("scope", appConfig.graphScopes.join(" "));
  authorizeURL.searchParams.set("code_challenge", challenge);
  authorizeURL.searchParams.set("code_challenge_method", "S256");
  window.location.assign(authorizeURL.href);
}

export async function signOutFromOneDrive() {
  await setSetting(TOKEN_SETTING, null);
}

export async function uploadBlobToOneDrive(blob, fileName) {
  const token = await getValidToken();
  if (!token) throw new Error("OneDrive is not connected.");

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(fileName)}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": blob.type || "application/octet-stream"
      },
      body: blob
    }
  );

  if (!response.ok) throw new Error("OneDrive upload failed.");
  const item = await response.json();
  return {
    itemId: item.id,
    oneDrivePath: `/Apps/RecipeCookbook/${fileName}`,
    webURL: item.webUrl || ""
  };
}

async function getValidToken() {
  const token = await getSetting(TOKEN_SETTING);
  if (!token?.access_token) return null;
  if (token.expires_at && token.expires_at > Date.now() + 60_000) return token;
  return null;
}

async function exchangeCodeForToken(code, verifier) {
  const redirectURI = window.location.origin + window.location.pathname;
  const body = new URLSearchParams({
    client_id: appConfig.microsoftClientId,
    scope: appConfig.graphScopes.join(" "),
    code,
    redirect_uri: redirectURI,
    grant_type: "authorization_code",
    code_verifier: verifier
  });

  const response = await fetch(`https://login.microsoftonline.com/${appConfig.microsoftTenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error("Microsoft sign-in failed.");
  const token = await response.json();
  return { ...token, expires_at: Date.now() + token.expires_in * 1000 };
}

function randomString(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function codeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
