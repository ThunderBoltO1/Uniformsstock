const admin = require('firebase-admin');

// This environment variable should contain the JSON of your service account key.
// It's a secure way to handle credentials without hardcoding them.
const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountString) {
  throw new Error('The FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
}

try {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(serviceAccountString, 'base64').toString('ascii'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error('Firebase Admin Initialization Error:', error.message);
  throw new Error('Failed to initialize Firebase Admin SDK. Please check your FIREBASE_SERVICE_ACCOUNT environment variable.');
}

module.exports = admin;
