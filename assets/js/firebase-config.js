/**
 * SSDNS Firebase config (shared by DM Command Center + player sheet Join room).
 *
 * Project: ssdns-dm-hub
 * Used only for live table sync (rooms). Characters stay on-device as .ssdns files.
 *
 * Sheet load order (after Join patch):
 *   ...
 *   <script type="module"> import { initializeApp } ... OR classic compat CDN </script>
 *   <script src="assets/js/firebase-config.js"></script>
 *   <script src="assets/js/dm-join.js"></script>
 *   <script src="assets/js/app.js"></script>
 *
 * DMCC loads this from ../assets/js/firebase-config.js relative to /dm/.
 *
 * Tonight: create Realtime Database + enable Anonymous auth in the Firebase console
 * (see DM-SETUP.md). Until then, DMCC Demo mode works fully offline.
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
