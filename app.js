// ==========================================
// ⚠️ إعدادات FIREBASE
// ==========================================
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

let sales = [], users = [], myProfile = { role: 'User', permanentName: '...' };
let trendChart = null, splitChart = null;
let dashboardDateFilter = null;
let dbUnsubscribe = null;
let currentLimit = 50; 
const ADMIN_EMAIL = "khaledalimawi@klik.com"; // <-- ضع بريدك هنا

function updateThemeIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    document.getElementById('themeToggleBtn').innerText = isDark ? '☀️' : '🌙';
}
updateThemeIcon();

function toggleDarkMode() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark'); localStorage.theme = 'light';
    } else {
        html.classList.add('dark'); localStorage.theme = 'dark';
    }
    updateThemeIcon();
    if (trendChart && splitChart) { initCharts(); populateDash(); }
}

function toggleSidebar() {
    const s = document.getElementById('mainSidebar');
    s.style.display = s.style.display === 'none' ? 'flex' : 'none';
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userRef = db.collection("users").doc(user.email);
        const doc = await userRef.get();
        if (!doc.exists) {
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('forceNameModal').classList.remove('hidden');
        } else {
            myProfile = doc.data();
            initializeApp(user);
        }
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    }
});

function initializeApp(user) {
    document.getElementById('currentUserName').innerText = myProfile.permanentName;
    document.getElementById('profName').value = myProfile.permanentName;
    document.getElementById('userRoleBadge').innerText = myProfile.role;
    if (myProfile.role === "SuperAdmin") {
        document.getElementById('adminNav').classList.remove('hidden');
        startUsersSync();
    }
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('forceNameModal').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    startDataSync();
}

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(() => {
        return auth.signInWithEmailAndPassword(email, pass);
    }).catch(() => document.getElementById('loginError').classList.remove('hidden'));
});

document.getElementById('forceNameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('forceNameInput').value;
    const user = auth.currentUser;
    const isSuper = (user.email === ADMIN_EMAIL);
    const data = { email: user.email, permanentName: name, role: isSuper ? "SuperAdmin" : "User", createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    await db.collection("users").doc(user.email).set(data);
    myProfile = data;
    initializeApp(user);
});

function startDataSync() {
    if(dbUnsubscribe) dbUnsubscribe();
    dbUnsubscribe = db.collection("sales")
        .orderBy("startDate", "desc")
        .limit(currentLimit)
        .onSnapshot(snap => {
            document.getElementById('syncStatus').classList.remove('hidden');
            sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            populateDash();
            renderSalesTable();
            updateAnalytics();
            renderAlerts();
            setTimeout(() => document.getElementById('syncStatus').classList.add('hidden'), 800);
        });
}

function loadMoreSales() {
    currentLimit += 50;
    startDataSync();
}

function startUsersSync() {
    db.collection("users").onSnapshot(snap => {
        users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const body = document.getElementById('usersListBody');
        body.innerHTML = users.map(u => `
            <tr class="border-b dark:border-slate-800">
                <td class="py-4 font-bold text-xs">${u.email}</td>
                <td class="py-4"><input type="text" id="un_${u.id}" value="${u.permanentName}" class="p-1 border dark:bg-slate-700 rounded w-full text-xs"></td>
                <td class="py-4">
                    <select id="ur_${u.id}" class="p-1 border dark:bg-slate-700 rounded text-xs">
                        <option value="User" ${u.role==='User'?'selected':''}>موظف</option>
                        <option value="Manager" ${u.role==='Manager'?'selected':''}>مدير</option>
                        <option value="SuperAdmin" ${u.role==='SuperAdmin'?'selected':''}>آدمن</option>
                    </select>
                </td>
                <td class="py-4 text-center"><button onclick="updateUser('${u.id}')" class="bg-green-600 text-white px-3 py-1 rounded text-[10px]">تحديث</button></td>
            </tr>
        `).join('');
    });
}

async function updateUser(id) {
    const n = document.getElementById(`un_${id}`).value;
    const r = document.getElementById(`ur_${id}`).value;
    await db.collection("users").doc(id).update({ permanentName: n, role: r });
    alert('تم تحديث المستخدم.');
}

function exportData(period) {
    const now = new Date();
    let filtered = [];
    if(period === 'week') {
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = sales.filter(s => new Date(s.startDate) >= lastWeek);
    } else {
        const currentMonth = now.toISOString().slice(0, 7);
        filtered = sales.filter(s => s.startDate.startsWith(currentMonth));
    }

    if(!filtered.length) return alert('لا توجد بيانات لهذا النطاق.');

    let csv = "\uFEFFالتاريخ,الخدمة,الزبون,الهاتف,الإيراد,الربح الصافي,المسؤول\n";
    filtered.forEach(s => {
        csv += `${s.startDate},${s.service},${s.clientName},${s.clientPhone},${s.price},${s.profit.toFixed(1)},${s.addedBy}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Klik_Report_${period}_${now.toISOString().slice(0,10)}.csv`;
    link.click();
}

function initCharts() {
    const isDark = document.documentElement.classList.contains('dark');
    const txtColor = isDark ? '#94a3b8' : '#475569';
    
    if(trendChart) trendChart.destroy();
    if(splitChart) splitChart.destroy();

    const ctx1 = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(ctx1, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'الربح الصافي ₪', data: [], borderColor: '#22c55e', tension: 0.4, fill: true, backgroundColor: 'rgba(34,197,94,0.1)' }] },
        options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: txtColor, font: { family: 'Cairo' } } } } }
    });

    const ctx2 = document.getElementById('splitChart').getContext('2d');
    splitChart = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels: ['رأس مال', 'طوارئ', 'أرباح'], datasets: [{ data: [0,0,0], backgroundColor: ['#64748b', '#f97316', '#22c55e'], borderWidth: 0 }] },
        options: { maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: txtColor, font: { family: 'Cairo' } } } } }
    });
}

function populateDash() {
    if(!trendChart) initCharts();
    const filtered = dashboardDateFilter ? sales.filter(s => s.startDate === dashboardDateFilter) : sales;
    const t = filtered.reduce((acc, s) => { 
        acc.rev += s.price; 
        acc.cap += (s.costILS + s.extraCapital); 
        acc.emg += s.emergency; 
        acc.prf += s.profit; 
        return acc; 
    }, { rev:0, cap:0, emg:0, prf:0 });

    document.getElementById('statTotalRev').innerText = t.rev.toFixed(1) + " ₪";
    document.getElementById('statTotalCap').innerText = t.cap.toFixed(1) + " ₪";
    document.getElementById('statEmergency').innerText = t.emg.toFixed(1) + " ₪";
    document.getElementById('statProfit').innerText = t.prf.toFixed(1) + " ₪";

    const last5 = sales.slice(0, 5).reverse();
    trendChart.data.labels = last5.map(s => s.startDate.slice(5));
    trendChart.data.datasets[0].data = last5.map(s => s.profit);
    trendChart.update();

    splitChart.data.datasets[0].data = [t.cap, t.emg, Math.max(0, t.prf)];
    splitChart.update();
}

function filterSalesTable() {
    const q = document.getElementById('salesSearch').value.toLowerCase();
    const l = document.getElementById('filterLabel').value;
    const m = document.getElementById('filterMonth').value;
    const filtered = sales.filter(s => 
        (s.service.toLowerCase().includes(q) || s.clientName.toLowerCase().includes(q) || s.clientPhone.includes(q)) &&
        (l === 'ALL' || s.label === l) &&
        (m === 'ALL' || s.startDate.startsWith(m))
    );
    renderSalesTable(filtered);
}

function renderSalesTable(data = sales) {
    const body = document.getElementById('salesTableBody');
    body.innerHTML = data.map(s => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-700/50">
            <td class="px-6 py-4">
                <div class="font-bold text-base">${s.service}</div>
                <div class="text-[10px] text-slate-500">${s.clientName} | ${s.clientPhone}</div>
            </td>
            <td class="px-4 py-4 text-center font-black text-green-600">${s.profit.toFixed(1)} ₪</td>
            <td class="px-4 py-4 text-center">
                <div class="text-[10px] font-black">${s.addedBy}</div>
                <div class="text-[8px] text-slate-400">${s.startDate}</div>
            </td>
            <td class="px-4 py-4 text-center">
                <button onclick="openModalForEdit('${s.id}')" class="text-sky-500 ml-2">✏️</button>
                <button onclick="deleteSale('${s.id}')" class="text-red-500">🗑️</button>
            </td>
        </tr>
    `).join('');
    populateFilters();
}

function populateFilters() {
    const lSel = document.getElementById('filterLabel'), mSel = document.getElementById('filterMonth');
    if(lSel.options.length > 0) return;
    const labels = [...new Set(sales.map(s => s.label).filter(x => x))];
    lSel.innerHTML = '<option value="ALL">جميع التصنيفات</option>' + labels.map(l => `<option value="${l}">${l}</option>`).join('');
    const months = [...new Set(sales.map(s => s.startDate.slice(0, 7)))].sort().reverse();
    mSel.innerHTML = '<option value="ALL">جميع الأشهر</option>' + months.map(m => `<option value="${m}">${m}</option>`).join('');
}

function showSection(id) {
    document.querySelectorAll('.space-content').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    event.currentTarget.classList.add('active');
    if(id === 'dashboard') populateDash();
}

function logout() { auth.signOut(); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModalForAdd() { document.getElementById('editSaleId').value=''; document.getElementById('saleForm').reset(); document.getElementById('addSaleModal').classList.remove('hidden'); }
function openModalForEdit(id) {
    const s = sales.find(x => x.id === id);
    document.getElementById('editSaleId').value = s.id;
    document.getElementById('inService').value = s.service;
    document.getElementById('inClientName').value = s.clientName;
    document.getElementById('inClientPhone').value = s.clientPhone;
    document.getElementById('inPrice').value = s.price;
    document.getElementById('inCostUSD').value = s.costUSD;
    document.getElementById('inStart').value = s.startDate;
    document.getElementById('inEnd').value = s.endDate;
    document.getElementById('addSaleModal').classList.remove('hidden');
}
async function deleteSale(id) { if(confirm('حذف نهائي؟')) await db.collection("sales").doc(id).delete(); }

document.getElementById('saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const price = parseFloat(document.getElementById('inPrice').value);
    const cost = parseFloat(document.getElementById('inCostUSD').value) * parseFloat(document.getElementById('inExchange').value);
    const gross = price - cost;
    const data = {
        service: document.getElementById('inService').value, clientName: document.getElementById('inClientName').value,
        clientPhone: document.getElementById('inClientPhone').value, label: document.getElementById('inLabel').value,
        startDate: document.getElementById('inStart').value, endDate: document.getElementById('inEnd').value,
        price, costUSD: parseFloat(document.getElementById('inCostUSD').value), costILS: cost,
        profit: gross > 0 ? gross * 0.7 : gross, emergency: gross > 0 ? gross * 0.15 : 0, extraCapital: gross > 0 ? gross * 0.15 : 0,
        addedBy: myProfile.permanentName, addedByRole: myProfile.role
    };
    const id = document.getElementById('editSaleId').value;
    if(id) await db.collection("sales").doc(id).update(data); else await db.collection("sales").add(data);
    closeModal('addSaleModal');
});

function applyDashFilter() { dashboardDateFilter = document.getElementById('dashDateFilter').value; populateDash(); }
function clearDashFilter() { dashboardDateFilter = null; populateDash(); }

function updateAnalytics() {
    const getP = (days) => {
        const limit = new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000);
        return sales.filter(s => new Date(s.startDate) >= limit).reduce((a, b) => a + b.profit, 0);
    };
    const grid = document.getElementById('anaGrid');
    grid.innerHTML = ['اليوم', 'أسبوع', 'شهر', 'ربع سنة', 'سنة'].map((label, i) => `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border dark:border-slate-700 text-center">
            <div class="text-xs text-slate-500 mb-2">${label}</div>
            <div class="text-2xl font-black text-green-600">${getP([1,7,30,90,365][i]).toFixed(1)} ₪</div>
        </div>
    `).join('');
}

function renderAlerts() {
    const expiring = sales.filter(s => {
        const diff = (new Date(s.endDate) - new Date()) / (1000*60*60*24);
        return diff <= 3 && diff >= -1;
    });
    document.getElementById('alertCount').innerText = expiring.length;
    document.getElementById('alertsList').innerHTML = expiring.map(s => `
        <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border-r-4 border-red-500 flex justify-between items-center shadow-sm">
            <div><div class="font-bold">${s.service}</div><div class="text-xs">${s.clientName}</div></div>
            <button onclick="window.open('https://wa.me/${s.clientPhone}')" class="bg-green-600 text-white px-4 py-2 rounded text-xs font-bold">واتساب</button>
        </div>
    `).join('');
}

window.onload = () => { initCharts(); };