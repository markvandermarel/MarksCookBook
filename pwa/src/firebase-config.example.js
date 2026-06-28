// Copy this file to pwa/src/firebase-config.js for local development or deployment.
// Keep firebase-config.js out of git if you do not want project-specific config committed.
// Firebase web config is not a server secret, but it identifies your project.

export const firebaseRuntimeConfig = {
  enabled: true,
  sdkVersion: "10.12.5",
  householdId: "family",
  config: {
    apiKey: "your-firebase-web-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000000000"
  }
};
