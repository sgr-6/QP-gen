import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyACofVweF8kax7kBFgaQesrEkoAzXF1X2I",
  authDomain: "sjb-qpgen.firebaseapp.com",
  databaseURL: "https://sjb-qpgen-default-rtdb.firebaseio.com",
  projectId: "sjb-qpgen",
  storageBucket: "sjb-qpgen.firebasestorage.app",
  messagingSenderId: "359981150908",
  appId: "1:359981150908:web:c37001c465e739b85c16b9",
  measurementId: "G-1Z8BRKFB7J"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
