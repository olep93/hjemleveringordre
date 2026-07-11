import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

type ServiceAccountJson = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function readServiceAccount(): ServiceAccountJson {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT mangler.");

  const parsed = JSON.parse(raw) as ServiceAccountJson;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Firebase service account mangler obligatoriske felt.");
  }
  return parsed;
}

const serviceAccount = readServiceAccount();

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key
    }),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ??
      `${serviceAccount.project_id}.firebasestorage.app`
  });

export const adminDb = getFirestore(app);
export const adminStorage = getStorage(app);
