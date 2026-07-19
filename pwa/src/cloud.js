import { appConfig } from "./config.js?v=20260628-family1";

export const REACTION_OPTIONS = [
  { value: "like", label: "Like" },
  { value: "would_eat_again", label: "Would eat again" },
  { value: "maybe", label: "Maybe" },
  { value: "okay", label: "Okay" }
];

const PLACEHOLDER_PATTERN = /^(your-|000000|1:000000)/i;
const LOCAL_CONFIG_PATH = "./firebase-config.js";

export async function createFamilyCloudClient({ onAuthChange = () => {}, onDataChange = () => {}, onError = () => {} } = {}) {
  const runtimeConfig = await loadFirebaseRuntimeConfig();

  if (!isFirebaseReady(runtimeConfig)) {
    return createDisabledClient(runtimeConfig);
  }

  const sdk = await loadFirebaseSDK(runtimeConfig.sdkVersion);
  const app = sdk.initializeApp(runtimeConfig.config);
  const auth = sdk.getAuth(app);
  const db = sdk.getFirestore(app);
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  return new FamilyCloudClient({
    auth,
    db,
    householdId: runtimeConfig.householdId,
    onAuthChange,
    onDataChange,
    onError,
    provider,
    sdk
  });
}

export function reactionLabel(value) {
  return REACTION_OPTIONS.find((reaction) => reaction.value === value)?.label || "";
}

export function initialsForProfile(profile = {}) {
  const source = profile.displayName || profile.email || "";
  const parts = String(source)
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

class FamilyCloudClient {
  constructor({ auth, db, householdId, onAuthChange, onDataChange, onError, provider, sdk }) {
    this.auth = auth;
    this.db = db;
    this.householdId = householdId;
    this.onAuthChange = onAuthChange;
    this.onDataChange = onDataChange;
    this.onError = onError;
    this.provider = provider;
    this.sdk = sdk;
    this.user = null;
    this.profile = null;
    this.membership = null;
    this.authUnsubscribe = null;
    this.dataUnsubscribes = [];
    this.data = {
      members: [],
      reactions: [],
      recipes: []
    };
  }

  get isConfigured() {
    return true;
  }

  async start() {
    this.sdk.getRedirectResult(this.auth).catch((error) => {
      this.onError(authErrorMessage(error));
    });

    this.authUnsubscribe = this.sdk.onAuthStateChanged(this.auth, async (user) => {
      await this.handleAuthUser(user);
    });
  }

  async signIn() {
    try {
      await this.sdk.signInWithPopup(this.auth, this.provider);
    } catch (error) {
      if (shouldUseRedirect(error)) {
        await this.sdk.signInWithRedirect(this.auth, this.provider);
        return;
      }
      throw new Error(authErrorMessage(error));
    }
  }

  async signOut() {
    await this.sdk.signOut(this.auth);
  }

  async saveRecipe(recipe) {
    this.requireHouseholdAccess();

    const id = recipe.id || crypto.randomUUID();
    const ref = this.sdk.doc(this.db, "recipes", id);
    const existing = await this.sdk.getDoc(ref).catch(() => null);
    const existingData = existing?.exists() ? existing.data() : null;
    const createdByUserId = existingData?.createdByUserId || recipe.createdByUserId || this.user.uid;
    const payload = recipePayloadForFirestore({
      ...recipe,
      id,
      householdId: this.householdId,
      createdByUserId
    });

    if (existingData?.createdAt) {
      delete payload.createdAt;
    } else {
      payload.createdAt = this.sdk.serverTimestamp();
    }

    payload.updatedAt = this.sdk.serverTimestamp();
    await this.sdk.setDoc(ref, payload, { merge: true });

    return {
      ...recipe,
      id,
      householdId: this.householdId,
      createdByUserId,
      updatedAt: new Date().toISOString()
    };
  }

  async deleteRecipe(recipeId) {
    this.requireHouseholdAccess();
    await this.sdk.deleteDoc(this.sdk.doc(this.db, "recipes", recipeId));
  }

  async setRecipeReaction(recipe, reaction) {
    this.requireHouseholdAccess();

    const recipeId = typeof recipe === "string" ? recipe : recipe.id;
    const id = reactionDocumentId(recipeId, this.user.uid);
    const ref = this.sdk.doc(this.db, "recipeReactions", id);

    if (!reaction) {
      await this.sdk.deleteDoc(ref);
      return null;
    }

    if (!REACTION_OPTIONS.some((option) => option.value === reaction)) {
      throw new Error("Choose one of the supported recipe reactions.");
    }

    const existing = await this.sdk.getDoc(ref).catch(() => null);
    const payload = {
      householdId: this.householdId,
      recipeId,
      userId: this.user.uid,
      reaction,
      updatedAt: this.sdk.serverTimestamp()
    };

    if (!existing?.exists()) payload.createdAt = this.sdk.serverTimestamp();

    await this.sdk.setDoc(ref, payload, { merge: true });
    return {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  stop() {
    this.authUnsubscribe?.();
    this.clearDataSubscriptions();
  }

  async handleAuthUser(user) {
    this.clearDataSubscriptions();
    this.user = user || null;
    this.profile = user ? profileFromUser(user) : null;
    this.membership = null;
    this.data = { members: [], reactions: [], recipes: [] };

    if (!user) {
      this.emitAuth({ status: "signedOut" });
      this.onDataChange(this.data);
      return;
    }

    this.emitAuth({
      status: "checking",
      user: this.user,
      profile: this.profile,
      householdId: this.householdId
    });

    try {
      await this.ensureProfile();
      this.membership = await this.resolveMembership();

      if (!this.membership) {
        this.emitAuth({
          status: "pending",
          user: this.user,
          profile: this.profile,
          householdId: this.householdId
        });
        return;
      }

      this.emitAuth({
        status: "authorized",
        user: this.user,
        profile: this.profile,
        membership: this.membership,
        householdId: this.householdId
      });
      this.subscribeToHousehold();
    } catch (error) {
      this.emitAuth({
        status: "error",
        user: this.user,
        profile: this.profile,
        householdId: this.householdId,
        message: error.message || "Shared cookbook access could not be checked."
      });
      this.onError(error.message || "Shared cookbook access could not be checked.");
    }
  }

  emitAuth(payload) {
    this.onAuthChange({
      householdId: this.householdId,
      isConfigured: true,
      ...payload
    });
  }

  async ensureProfile() {
    const profileRef = this.sdk.doc(this.db, "profiles", this.user.uid);
    const existing = await this.sdk.getDoc(profileRef).catch(() => null);
    const profile = profileFromUser(this.user);
    const payload = {
      ...profile,
      updatedAt: this.sdk.serverTimestamp()
    };

    if (!existing?.exists()) payload.createdAt = this.sdk.serverTimestamp();
    await this.sdk.setDoc(profileRef, payload, { merge: true });
    this.profile = profile;
  }

  async resolveMembership() {
    const memberRef = this.sdk.doc(this.db, "householdMembers", memberDocumentId(this.householdId, this.user.uid));
    const member = await this.sdk.getDoc(memberRef);

    if (isActiveMember(member)) return normalizeMember(member);

    await this.claimInvite(memberRef);
    const claimedMember = await this.sdk.getDoc(memberRef);
    return isActiveMember(claimedMember) ? normalizeMember(claimedMember) : null;
  }

  async claimInvite(memberRef) {
    const email = this.user.email || "";
    if (!email) return;

    const inviteRef = this.sdk.doc(this.db, "householdInvites", inviteDocumentId(this.householdId, email));
    const invite = await this.sdk.getDoc(inviteRef).catch(() => null);
    if (!invite?.exists()) return;

    const inviteData = invite.data();
    if (inviteData.status && inviteData.status !== "open") return;
    if (inviteData.householdId !== this.householdId || inviteData.email !== email) return;

    const profile = profileFromUser(this.user);
    await this.sdk.setDoc(memberRef, {
      householdId: this.householdId,
      userId: this.user.uid,
      role: inviteData.role === "admin" ? "admin" : "member",
      status: "active",
      email,
      displayName: profile.displayName,
      initials: profile.initials,
      joinedAt: this.sdk.serverTimestamp(),
      updatedAt: this.sdk.serverTimestamp()
    });
  }

  subscribeToHousehold() {
    const recipesQuery = this.sdk.query(
      this.sdk.collection(this.db, "recipes"),
      this.sdk.where("householdId", "==", this.householdId)
    );
    const membersQuery = this.sdk.query(
      this.sdk.collection(this.db, "householdMembers"),
      this.sdk.where("householdId", "==", this.householdId)
    );
    const reactionsQuery = this.sdk.query(
      this.sdk.collection(this.db, "recipeReactions"),
      this.sdk.where("householdId", "==", this.householdId)
    );

    this.dataUnsubscribes = [
      this.sdk.onSnapshot(recipesQuery, (snapshot) => {
        this.data.recipes = snapshot.docs.map(normalizeRecipe).sort(sortByUpdatedAt);
        this.onDataChange({ ...this.data });
      }, (error) => this.onError(error.message || "Family recipes could not be loaded.")),
      this.sdk.onSnapshot(membersQuery, (snapshot) => {
        this.data.members = snapshot.docs.map(normalizeMember).filter((member) => member.status === "active");
        this.onDataChange({ ...this.data });
      }, (error) => this.onError(error.message || "Family members could not be loaded.")),
      this.sdk.onSnapshot(reactionsQuery, (snapshot) => {
        this.data.reactions = snapshot.docs.map(normalizeReaction);
        this.onDataChange({ ...this.data });
      }, (error) => this.onError(error.message || "Recipe reactions could not be loaded."))
    ];
  }

  clearDataSubscriptions() {
    for (const unsubscribe of this.dataUnsubscribes) unsubscribe();
    this.dataUnsubscribes = [];
  }

  requireHouseholdAccess() {
    if (!this.user || !this.membership) {
      throw new Error("Sign in with household access before saving shared recipes.");
    }
  }
}

async function loadFirebaseRuntimeConfig() {
  const baseConfig = appConfig.firebase || {};
  const localModule = await import(LOCAL_CONFIG_PATH).catch(() => null);
  const localConfig = localModule?.firebaseRuntimeConfig || {};

  return {
    ...baseConfig,
    ...localConfig,
    config: {
      ...(baseConfig.config || {}),
      ...(localConfig.config || {})
    }
  };
}

function createDisabledClient(runtimeConfig) {
  return {
    isConfigured: false,
    disabledReason: disabledReason(runtimeConfig),
    start() {},
    stop() {},
    async signIn() {
      throw new Error(disabledReason(runtimeConfig));
    },
    async signOut() {},
    async saveRecipe() {
      throw new Error("Shared cookbook is not configured.");
    },
    async deleteRecipe() {
      throw new Error("Shared cookbook is not configured.");
    },
    async setRecipeReaction() {
      throw new Error("Shared cookbook is not configured.");
    }
  };
}

function isFirebaseReady(runtimeConfig) {
  if (!runtimeConfig?.enabled) return false;
  if (!runtimeConfig.householdId || PLACEHOLDER_PATTERN.test(runtimeConfig.householdId)) return false;
  const config = runtimeConfig.config || {};
  return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
    const value = String(config[key] || "");
    return value && !PLACEHOLDER_PATTERN.test(value);
  });
}

function disabledReason(runtimeConfig) {
  if (!runtimeConfig?.enabled) {
    return "Shared cookbook sign-in is off until Firebase is configured.";
  }
  if (!runtimeConfig.householdId || PLACEHOLDER_PATTERN.test(runtimeConfig.householdId)) {
    return "Set firebase.householdId in pwa/src/firebase-config.js before signing in.";
  }
  return "Fill in the Firebase web config in pwa/src/firebase-config.js before signing in.";
}

async function loadFirebaseSDK(version = "10.12.5") {
  const baseURL = `https://www.gstatic.com/firebasejs/${version}`;
  const [app, auth, firestore] = await Promise.all([
    import(`${baseURL}/firebase-app.js`),
    import(`${baseURL}/firebase-auth.js`),
    import(`${baseURL}/firebase-firestore.js`)
  ]);

  return {
    ...app,
    ...auth,
    ...firestore
  };
}

function profileFromUser(user) {
  const profile = {
    userId: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email || "Family member",
    photoURL: user.photoURL || ""
  };

  return {
    ...profile,
    initials: initialsForProfile(profile)
  };
}

function memberDocumentId(householdId, userId) {
  return `${householdId}_${userId}`;
}

function inviteDocumentId(householdId, email) {
  return `${householdId}_${email}`;
}

function reactionDocumentId(recipeId, userId) {
  return `${recipeId}_${userId}`;
}

function isActiveMember(snapshot) {
  return snapshot?.exists() && snapshot.data().status === "active";
}

function normalizeMember(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    householdId: data.householdId || "",
    userId: data.userId || "",
    role: data.role || "member",
    status: data.status || "active",
    email: data.email || "",
    displayName: data.displayName || data.email || "Family member",
    initials: data.initials || initialsForProfile(data)
  };
}

function normalizeRecipe(snapshot) {
  const data = snapshot.data();
  return {
    ...data,
    id: data.id || snapshot.id,
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    instructions: Array.isArray(data.instructions) ? data.instructions : [],
    images: Array.isArray(data.images) ? data.images : [],
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt)
  };
}

function normalizeReaction(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    householdId: data.householdId || "",
    recipeId: data.recipeId || "",
    userId: data.userId || "",
    reaction: data.reaction || "",
    createdAt: toISODate(data.createdAt),
    updatedAt: toISODate(data.updatedAt)
  };
}

function sortByUpdatedAt(left, right) {
  return new Date(right.updatedAt) - new Date(left.updatedAt);
}

function toISODate(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000).toISOString();
  return new Date(value).toISOString();
}

function recipePayloadForFirestore(recipe) {
  const {
    localOnly,
    reactionSummary,
    userReaction,
    creatorInitials,
    creatorName,
    syncSource,
    ...payload
  } = recipe;

  return removeUndefinedValues(payload);
}

function removeUndefinedValues(value) {
  if (Array.isArray(value)) return value.map(removeUndefinedValues);
  if (!value || typeof value !== "object") return value;

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    next[key] = removeUndefinedValues(child);
  }
  return next;
}

function shouldUseRedirect(error) {
  return /popup|cancelled-popup-request|operation-not-supported/i.test(error?.code || error?.message || "");
}

function authErrorMessage(error) {
  if (/popup-closed-by-user/i.test(error?.code || "")) return "Sign-in was closed before it finished.";
  if (/unauthorized-domain/i.test(error?.code || "")) return "Add this app URL to Firebase Auth authorized domains.";
  return error?.message || "Google sign-in could not be started.";
}
