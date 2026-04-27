const firebaseConfig = {
  apiKey: "AIzaSyBXFhv44tNiAoytKlC_1YS6aHeguxrgrmM",
  authDomain: "klikstore-erp-6d5fa.firebaseapp.com",
  projectId: "klikstore-erp-6d5fa",
  storageBucket: "klikstore-erp-6d5fa.firebasestorage.app",
  messagingSenderId: "810024534481",
  appId: "1:810024534481:web:93608156e51b04c97f60f0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const ADMIN_EMAIL = "khaledalimawi@klik.com";

function toggleSidebar() { document.getElementById('mainSidebar').classList.toggle('hidden'); }

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const doc = await db.collection("users").doc(user.email).get();
        if (doc.exists) {
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            document.getElementById('currentUserName').innerText = doc.data().permanentName;
            startDataSync();
        }
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
    }
});

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value)
    .catch(err => alert("خطأ في الدخول: " + err.message));
});

function startDataSync() {
    db.collection("sales").orderBy("startDate", "desc").limit(50).onSnapshot(snap => {
        const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderSales(sales);
    });
}

function renderSales(data) {
    const body = document.getElementById('salesTableBody');
    body.innerHTML = data.map(s => `<tr class="border-b dark:border-slate-700"><td class="p-4 font-bold">${s.service}</td><td class="p-4 text-green-600">${s.profit.toFixed(0)} ₪</td></tr>`).join('');
}
