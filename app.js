const firebaseConfig = {
  apiKey: "AIzaSyBXFhv44tNiAoytKlC_1YS6aHeguxrgrmM",
  authDomain: "klikstore-erp-6d5fa.firebaseapp.com",
  projectId: "klikstore-erp-6d5fa",
  storageBucket: "klikstore-erp-6d5fa.firebasestorage.app",
  messagingSenderId: "810024534481",
  appId: "1:810024534481:web:93608156e51b04c97f60f0"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let sales = [], myProfile = {};
const ADMIN_EMAIL = "khaledalimawi@klik.com";

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

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value)
    .catch(err => alert("خطأ: " + err.message));
});

function startDataSync() {
    db.collection("sales").orderBy("startDate", "desc").limit(50).onSnapshot(snap => {
        sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateDashboard();
        renderSalesTable();
    });
}

function updateDashboard() {
    const totalRev = sales.reduce((acc, s) => acc + (s.price || 0), 0);
    const totalPrf = sales.reduce((acc, s) => acc + (s.profit || 0), 0);
    document.getElementById('statTotalRev').innerText = totalRev.toFixed(0) + " ₪";
    document.getElementById('statProfit').innerText = totalPrf.toFixed(0) + " ₪";
}

function renderSalesTable() {
    const body = document.getElementById('salesTableBody');
    body.innerHTML = sales.map(s => `
        <tr class="border-b border-white/5 hover:bg-white/5">
            <td class="p-4"><div class="font-bold text-sm">${s.service}</div><div class="text-[10px] text-slate-500">${s.clientName}</div></td>
            <td class="p-4 text-green-500 font-black text-center">${(s.profit || 0).toFixed(0)} ₪</td>
            <td class="p-4 text-center"><button onclick="deleteSale('${s.id}')" class="text-red-500 text-xs">🗑️</button></td>
        </tr>
    `).join('');
}

async function deleteSale(id) { if(confirm('حذف نهائي؟')) await db.collection("sales").doc(id).delete(); }

document.getElementById('saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const price = parseFloat(document.getElementById('inPrice').value);
    const cost = parseFloat(document.getElementById('inCostUSD').value) * parseFloat(document.getElementById('inExchange').value);
    const gross = price - cost;
    const data = {
        service: document.getElementById('inService').value, clientName: document.getElementById('inClientName').value,
        clientPhone: document.getElementById('inClientPhone').value, startDate: document.getElementById('inStart').value,
        endDate: document.getElementById('inEnd').value, price, costUSD: parseFloat(document.getElementById('inCostUSD').value),
        costILS: cost, profit: gross * 0.7, emergency: gross * 0.15, extraCapital: gross * 0.15, addedBy: myProfile.permanentName
    };
    await db.collection("sales").add(data);
    document.getElementById('addSaleModal').classList.add('hidden');
});

function showSection(id) {
    document.querySelectorAll('.space-content').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.sidebar-link').forEach(l => {
        l.classList.remove('active');
        if(l.getAttribute('onclick').includes(id)) l.classList.add('active');
    });
    if(window.innerWidth < 768) toggleSidebar();
}

function toggleSidebar() { document.getElementById('mainSidebar').classList.toggle('hidden'); }
function openModalForAdd() { document.getElementById('saleForm').reset(); document.getElementById('addSaleModal').classList.remove('hidden'); }
