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

let sales = [], myProfile = {};
let trendChart = null;

// وظيفة تسجيل الدخول
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    auth.signInWithEmailAndPassword(email, pass)
        .catch(err => alert("عذراً: " + err.message));
});

// مراقبة حالة المستخدم
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const doc = await db.collection("users").doc(user.email).get();
        if (doc.exists) {
            myProfile = doc.data();
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            document.getElementById('currentUserName').innerText = myProfile.permanentName;
            if (myProfile.role === "SuperAdmin") document.getElementById('adminNav').classList.remove('hidden');
            startDataSync();
        }
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    }
});

function startDataSync() {
    db.collection("sales").orderBy("startDate", "desc").limit(50).onSnapshot(snap => {
        sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    });
}

function renderDashboard() {
    const total = sales.reduce((acc, s) => acc + s.price, 0);
    const profit = sales.reduce((acc, s) => acc + s.profit, 0);
    document.getElementById('statTotalRev').innerText = total.toFixed(0) + " ₪";
    document.getElementById('statProfit').innerText = profit.toFixed(0) + " ₪";
    
    const body = document.getElementById('salesTableBody');
    body.innerHTML = sales.map(s => `
        <tr class="border-b border-slate-800/50 hover:bg-white/5 transition-colors">
            <td class="p-4 text-sm font-bold">${s.service}<br><span class="text-[9px] text-slate-500">${s.clientName}</span></td>
            <td class="p-4 text-center text-green-500 font-black">${s.profit.toFixed(0)} ₪</td>
        </tr>
    `).join('');
}

function showSection(id) {
    document.querySelectorAll('.space-content').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.sidebar-link').forEach(l => {
        l.classList.remove('active');
        if(l.getAttribute('onclick').includes(id)) l.classList.add('active');
    });
}

function toggleSidebar() { document.getElementById('mainSidebar').classList.toggle('hidden'); }
