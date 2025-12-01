// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// *** ให้คัดลอกค่าที่ได้จาก Firebase Console มาวางแทนที่ตรงนี้ ***
const firebaseConfig = {
  apiKey: "AIzaSyB2gZVNSEHZZAqqnDgHtzqTD2_RckNH7lE",
  authDomain: "uniformstock-4c2f9.firebaseapp.com",
  projectId: "uniformstock-4c2f9",
  storageBucket: "uniformstock-4c2f9.appspot.com",
  messagingSenderId: "303952498212",
  appId: "1:303952498212:web:6b41e0d6faefdf3dc752b1",
  measurementId: "G-1CT43YJXZL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);