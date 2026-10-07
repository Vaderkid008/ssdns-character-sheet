/**
 * SSDNS Firebase config (shared by DM Command Center + player sheet Join room).
 *
 * Whoever hosts this copy puts their own Web app config in the object below.
 * Another DM replaces all seven fields in their fork before creating a live room.
 * Steps: /setup/ and DM-SETUP.md.
 *
 * Characters stay on-device as .ssdns files. Firebase only syncs the live table.
 * Demo mode (/dm/?demo=1) works fully offline, with no Firebase.
 *
 * Sheet load order:
 *   <script src="assets/js/firebase-config.js"></script>
 *   <script src="assets/js/dm-join.js"></script>
 *   <script src="assets/js/app.js"></script>
 *
 * DMCC loads this from ../assets/js/firebase-config.js relative to /dm/.
 */
(function (root) {
  "use strict";
  root.SSDNS_FIREBASE_CONFIG = {
    apiKey: "AIzaSyD3-yU0mz1PPLKgjeSPqbSory4GMXPoMP0",
    authDomain: "ssdns-dm-hub.firebaseapp.com",
    databaseURL: "https://ssdns-dm-hub-default-rtdb.firebaseio.com",
    projectId: "ssdns-dm-hub",
    storageBucket: "ssdns-dm-hub.firebasestorage.app",
    messagingSenderId: "948655439663",
    appId: "1:948655439663:web:d1c2be6268f0ff320cabda"
  };
})(typeof window !== "undefined" ? window : globalThis);
