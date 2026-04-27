const firebaseConfig = {
  apiKey: "AIzaSyBXFhv44tNiAoytKlC_1YS6aHeguxrgrmM",
  authDomain: "klikstore-erp-6d5fa.firebaseapp.com",
  projectId: "klikstore-erp-6d5fa",
  storageBucket: "klikstore-erp-6d5fa.firebasestorage.app",
  messagingSenderId: "810024534481",
  appId: "1:810024534481:web:93608156e51b04c97f60f0"
};

// تهيئة Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// دالة تسجيل الدخول
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    
    auth.signInWithEmailAndPassword(email, pass)
        .then(() => {
            console.log("تم تسجيل الدخول بنجاح");
        })
        .catch(err => {
            console.error("خطأ في الدخول:", err.code);
            alert("خطأ: " + err.message);
        });
});

// مراقبة حالة المستخدم والتبديل بين الواجهات
auth.onAuthStateChanged(async (user) => {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    
    if (user) {
        try {
            const doc = await db.collection("users").doc(user.email).get();
            if (doc.exists) {
                loginScreen.classList.add('hidden');
                mainApp.classList.remove('hidden');
                document.getElementById('currentUserName').innerText = doc.data().permanentName;
                startDataSync();
            } else {
                alert("بريدك مسجل لكن لا تملك بروفايل في قاعدة البيانات.");
            }
        } catch (error) {
            console.error("خطأ في جلب بيانات المستخدم:", error);
        }
    } else {
        loginScreen.classList.remove('hidden');
        mainApp.classList.add('hidden');
    }
});

function startDataSync() {
    db.collection("sales").orderBy("startDate", "desc").limit(50).onSnapshot(snap => {
        const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const body = document.getElementById('salesTableBody');
        if(body) {
            body.innerHTML = sales.map(s => `
                <tr class="border-b border-white/5 hover:bg-white/5">
                    <td class="p-4 text-sm font-bold">${s.service}</td>
                    <td class="p-4 text-green-500 font-black">${s.profit.toFixed(0)} ₪</td>
                </tr>
            `).join('');
        }
        
        // تحديث الأرقام الرئيسية
        const totalRev = sales.reduce((acc, s) => acc + s.price, 0);
        const totalPrf = sales.reduce((acc, s) => acc + s.profit, 0);
        if(document.getElementById('statTotalRev')) document.getElementById('statTotalRev').innerText = totalRev.toFixed(0) + " ₪";
        if(document.getElementById('statProfit')) document.getElementById('statProfit').innerText = totalPrf.toFixed(0) + " ₪";
    });
}

function toggleSidebar() {
    document.getElementById('mainSidebar').classList.toggle('hidden');
}

function showSection(id) {
    document.querySelectorAll('.space-content').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
