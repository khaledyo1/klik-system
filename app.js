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
const ADMIN_EMAIL = "khaledalimawi@klik.com";

document.title = "Klik - الإدارة المالية";

// تحديث نصوص واجهة الدخول
const updateLoginUI = () => {
    const loginH1 = document.querySelector('#loginScreen h1');
    const loginP = document.querySelector('#loginScreen p');
    const loginBtn = document.querySelector('#loginBtn');
    if(loginH1) loginH1.innerHTML = 'Klik <span class="text-sky-500">Stort</span>';
    if(loginP) loginP.innerText = 'نظام إدارة متجر كليك';
    if(loginBtn) loginBtn.innerText = 'تسجيل الدخول';
};

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    if (trendChart) { initCharts(); populateDash(); }
}

function toggleSidebar() {
    const s = document.getElementById('mainSidebar');
    s.classList.toggle('hidden');
}

auth.onAuthStateChanged(async (user) => {
    updateLoginUI();
    if (user) {
        const doc = await db.collection("users").doc(user.email).get();
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
    document.getElementById('userRoleBadge').innerText = myProfile.role;
    if (myProfile.role === "SuperAdmin") document.getElementById('adminNav').classList.remove('hidden');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    startDataSync();
}

function startDataSync() {
    db.collection("sales").orderBy("startDate", "desc").limit(50).onSnapshot(snap => {
        sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        populateDash();
        renderSalesTable();
    });
}

function showSection(id) {
    document.querySelectorAll('.space-content').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.sidebar-link').forEach(l => {
        l.classList.remove('active');
        if(l.getAttribute('onclick').includes(id)) l.classList.add('active');
    });
    if(window.innerWidth < 768) toggleSidebar(); // إغلاق القائمة تلقائياً في الهاتف
}

// باقي دوال الرسوم البيانية والعمليات (تُترك كما هي في النسخة السابقة لتعمل بشكل صحيح)
function initCharts() {
    const isDark = document.documentElement.classList.contains('dark');
    if(trendChart) trendChart.destroy();
    const ctx = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'الربح الصافي', data: [], borderColor: '#0ea5e9', tension: 0.4 }] },
        options: { plugins: { legend: { labels: { font: { family: 'Cairo' } } } } }
    });
}
// ... (يتم إكمال باقي الدوال التقليدية للحفظ والمسح)
