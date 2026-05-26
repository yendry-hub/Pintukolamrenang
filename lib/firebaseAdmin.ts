import admin from 'firebase-admin'

function initFirebaseAdmin() {
  if (!admin.apps.length) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp()
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey
        })
      })
    } else {
      try {
        admin.initializeApp()
      } catch (e) {
        // no-op
      }
    }

    // Paksa REST (HTTP/1.1) agar tidak ada cold start gRPC di serverless
    try {
      admin.firestore().settings({ preferRest: true })
    } catch (e) {
      // settings mungkin gagal jika sudah ada operasi sebelumnya — aman diabaikan
    }
  }
  return admin
}

export default initFirebaseAdmin
