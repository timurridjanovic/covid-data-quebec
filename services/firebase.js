import * as firebase from "firebase/app";
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAPjI2HzkrKAt4eLFE5AHlgYu6uf3lvVx4",
  authDomain: "covid-data-quebec.firebaseapp.com",
  projectId: "covid-data-quebec",
  storageBucket: "covid-data-quebec.appspot.com",
  messagingSenderId: "777827210642",
  appId: "1:777827210642:web:9189bfc68e3fa6a5059d4b",
  measurementId: "G-VGXVZFQ6X7"
};

const firebaseApp = firebase.initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp)

export default storage;
