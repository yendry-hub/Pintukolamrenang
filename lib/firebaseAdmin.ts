import admin from 'firebase-admin'

function initFirebaseAdmin() {
  if (!admin.apps.length) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Let the SDK pick up credentials from the environment variable file
      admin.initializeApp()
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
      // Use service account credentials provided via environment variables
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey
        })
      })
    } else {
      // Fallback to default initialization (may throw if no credentials available)
      try {
        admin.initializeApp()
      } catch (e) {
        // no-op, let calls surface a meaningful error
      }
    }
  }
  return admin
}

export default initFirebaseAdmin
