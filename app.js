// ==========================================
// Klik ERP - Production Frontend V7
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

let sales = [];
let users = [];
let auditLogs = [];
let myProfile = { role: 'User', permanentName: '...' };
let trendChart = null;
let splitChart = null;
let dashboardDateFilter = null;
let dbUnsubscribe = null;
let usersUnsubscribe = null;
let auditUnsubscribe = null;
let currentLimit = 50;
let currentUser = null;

const ADMIN_EMAIL = "khaledalimawi@klik.com";
const MONEY = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SECTION_META = {
  dashboard: ['اللوحة المعلوماتية', 'مؤشرات فورية من قاعدة البيانات'],
  sales: ['السجل والأرشفة', 'بحث، فلترة، تعديل، وتصدير العمليات'],
  analytics: ['التحليل المالي', 'تحليل الربحية والمخاطر'],
  alerts: ['التنبيهات', 'اشتراكات تنتهي قريباً وتحتاج متابعة'],
  audit: ['سجل النشاط', 'تتبع الإنشاء والتعديل والحذف'],
  profile: ['إعدادات حسابي', 'إدارة بيانات الدخول والهوية'],
  userMgmt: ['إدارة الصلاحيات', 'إدارة المستخدمين والأدوار']
};

function byId(id) { return document.getElementById(id); }
function n(value) { return Number(value) || 0; }
function shekel(value) { return `${MONEY.format(n(value))} ₪`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message, type = 'info') {
  const root = byId('toastRoot');
  const el = document.createElement('div');
  const colors = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    warning: 'bg-orange-500 text-white',
    info: 'bg-slate-900 text-white dark:bg-slate-800'
  };
  el.className = `toast ${colors[type] || colors.info}`;
  el.innerText = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function setLoading(button, isLoading, labelWhenDone) {
  if (!button) return;
  button.disabled = isLoading;
  button.dataset.originalText = button.dataset.originalText || button.innerText;
  button.innerText = isLoading ? 'جاري التنفيذ...' : (labelWhenDone || button.dataset.originalText);
}

function updateThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  const btn = byId('themeToggleBtn');
  if (btn) btn.innerText = isDark ? '☀️' : '🌙';
}
updateThemeIcon();

function toggleDarkMode() {
  const html = document.documentElement;
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    localStorage.theme = 'light';
  } else {
    html.classList.add('dark');
    localStorage.theme = 'dark';
  }
  updateThemeIcon();
  initCharts();
  populateDash();
}

function toggleSidebar() {
  const sidebar = byId('mainSidebar');
  if (window.innerWidth < 768) {
    sidebar.classList.toggle('sidebar-hidden');
  } else {
    sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
  }
}

function canManage() {
  return ['SuperAdmin', 'Manager'].includes(myProfile.role);
}

function canDeleteSale(sale) {
  return canManage() || sale.addedByEmail === currentUser?.email;
}

function statusOfSale(sale) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(sale.endDate);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end - now) / 86400000);
  if (diff < 0) return { key: 'expired', text: `منتهي منذ ${Math.abs(diff)} يوم`, cls: 'badge-red' };
  if (diff <= 3) return { key: 'soon', text: diff === 0 ? 'ينتهي اليوم' : `تبقّى ${diff} أيام`, cls: 'badge-orange' };
  return { key: 'active', text: 'فعال', cls: 'badge-green' };
}

function normalizePhone(phone) {
  let cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('0')) cleaned = '970' + cleaned.slice(1);
  if (cleaned.length === 9 && cleaned.startsWith('5')) cleaned = '970' + cleaned;
  return cleaned;
}

function whatsappUrl(sale) {
  const phone = normalizePhone(sale.clientPhone);
  const message = `مرحباً ${sale.clientName}،\n\nنذكّرك بأن اشتراكك في خدمة (${sale.service}) سينتهي بتاريخ ${sale.endDate}.\n\nلضمان استمرار الخدمة يرجى تأكيد رغبتك بالتجديد.\n\nتحياتنا،\nKlik Store 🚀`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function writeAudit(action, payload = {}) {
  try {
    if (!currentUser) return;
    await db.collection('auditLogs').add({
      action,
      payload,
      actorEmail: currentUser.email,
      actorName: myProfile.permanentName || currentUser.email,
      actorRole: myProfile.role || 'User',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn('Audit failed', err);
  }
}

function showSync() {
  const el = byId('syncStatus');
  if (!el) return;
  el.classList.remove('hidden');
  clearTimeout(showSync.timer);
  showSync.timer = setTimeout(() => el.classList.add('hidden'), 900);
}

// ==========================================
// Auth
// ==========================================

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (!user) {
    byId('loginScreen').classList.remove('hidden');
    byId('mainApp').classList.add('hidden');
    byId('mainApp').classList.remove('flex');
    stopRealtime();
    return;
  }

  try {
    const userRef = db.collection('users').doc(user.email);
    const doc = await userRef.get();
    if (!doc.exists) {
      byId('loginScreen').classList.add('hidden');
      byId('forceNameModal').classList.remove('hidden');
    } else {
      myProfile = doc.data();
      initializeAppShell(user);
    }
  } catch (err) {
    console.error(err);
    toast('تعذر تحميل بيانات المستخدم. تأكد من صلاحيات Firestore Rules.', 'error');
  }
});

byId('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = byId('loginBtn');
  const error = byId('loginError');
  error.classList.add('hidden');
  setLoading(btn, true);

  try {
    const email = byId('loginEmail').value.trim().toLowerCase();
    const pass = byId('loginPassword').value;
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    error.innerText = translateFirebaseError(err);
    error.classList.remove('hidden');
  } finally {
    setLoading(btn, false, 'دخول آمن');
  }
});

byId('forceNameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = byId('forceNameInput').value.trim();
  const user = auth.currentUser;
  if (!user || name.length < 3) return;

  const isSuper = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const data = {
    email: user.email,
    permanentName: name,
    role: isSuper ? 'SuperAdmin' : 'User',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('users').doc(user.email).set(data);
  myProfile = data;
  await writeAudit('user_created_profile', { email: user.email, role: data.role });
  initializeAppShell(user);
});

byId('updatePassForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pass = byId('profPass').value;
  if (pass.length < 6) return toast('كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'warning');
  try {
    await auth.currentUser.updatePassword(pass);
    byId('profPass').value = '';
    await writeAudit('password_updated');
    toast('تم تحديث كلمة المرور بنجاح.', 'success');
  } catch (err) {
    toast(translateFirebaseError(err), 'error');
  }
});

function translateFirebaseError(err) {
  const code = err?.code || '';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'بيانات الدخول غير صحيحة.';
  if (code.includes('user-not-found')) return 'هذا المستخدم غير موجود.';
  if (code.includes('too-many-requests')) return 'محاولات كثيرة. حاول لاحقاً.';
  if (code.includes('requires-recent-login')) return 'سجّل خروج ثم ادخل مجدداً قبل تغيير كلمة المرور.';
  if (code.includes('permission-denied')) return 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  return 'حدث خطأ غير متوقع. راجع الإعدادات أو اتصال الإنترنت.';
}

function initializeAppShell(user) {
  byId('currentUserName').innerText = myProfile.permanentName || user.email;
  byId('currentUserEmail').innerText = user.email;
  byId('profName').value = myProfile.permanentName || user.email;
  byId('userRoleBadge').innerText = myProfile.role || 'User';
  byId('adminNav').classList.toggle('hidden', myProfile.role !== 'SuperAdmin');
  byId('loginScreen').classList.add('hidden');
  byId('forceNameModal').classList.add('hidden');
  byId('mainApp').classList.remove('hidden');
  byId('mainApp').classList.add('flex');

  initCharts();
  startDataSync();
  startAuditSync();
  if (myProfile.role === 'SuperAdmin') startUsersSync();
}

function stopRealtime() {
  if (dbUnsubscribe) dbUnsubscribe();
  if (usersUnsubscribe) usersUnsubscribe();
  if (auditUnsubscribe) auditUnsubscribe();
  dbUnsubscribe = usersUnsubscribe = auditUnsubscribe = null;
}

async function logout() {
  stopRealtime();
  await auth.signOut();
  toast('تم تسجيل الخروج.', 'success');
}

// ==========================================
// Realtime Firestore
// ==========================================

function startDataSync() {
  if (dbUnsubscribe) dbUnsubscribe();
  dbUnsubscribe = db.collection('sales')
    .orderBy('startDate', 'desc')
    .limit(currentLimit)
    .onSnapshot((snap) => {
      showSync();
      sales = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      populateDash();
      renderSalesTable();
      updateAnalytics();
      renderAlerts();
    }, (err) => {
      console.error(err);
      toast('فشل تحميل المبيعات. راجع Firestore Rules أو الفهارس.', 'error');
    });
}

function loadMoreSales() {
  currentLimit += 50;
  startDataSync();
}

function startUsersSync() {
  if (usersUnsubscribe) usersUnsubscribe();
  usersUnsubscribe = db.collection('users').orderBy('createdAt', 'desc').onSnapshot((snap) => {
    users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderUsers();
  }, (err) => {
    console.error(err);
    toast('تعذر تحميل المستخدمين.', 'error');
  });
}

function startAuditSync() {
  if (auditUnsubscribe) auditUnsubscribe();
  auditUnsubscribe = db.collection('auditLogs')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .onSnapshot((snap) => {
      auditLogs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderAudit();
    }, () => {
      auditLogs = [];
      renderAudit();
    });
}

// ==========================================
// Navigation
// ==========================================

function showSection(id, event) {
  if (id === 'userMgmt' && myProfile.role !== 'SuperAdmin') {
    toast('هذه الصفحة للآدمن فقط.', 'warning');
    return;
  }
  document.querySelectorAll('.space-content').forEach((s) => s.classList.add('hidden'));
  byId(id).classList.remove('hidden');
  document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('active'));
  if (event?.currentTarget) event.currentTarget.classList.add('active');
  const [title, sub] = SECTION_META[id] || SECTION_META.dashboard;
  byId('sectionTitle').innerText = title;
  byId('sectionSubTitle').innerText = sub;
  if (id === 'dashboard') populateDash();
  if (id === 'sales') renderSalesTable();
  if (id === 'analytics') updateAnalytics();
  if (id === 'alerts') renderAlerts();
  if (id === 'audit') renderAudit();
  if (window.innerWidth < 768) byId('mainSidebar').classList.add('sidebar-hidden');
}

// ==========================================
// Sale Modal and CRUD
// ==========================================

function openModalForAdd() {
  byId('editSaleId').value = '';
  byId('modalTitle').innerText = 'تسجيل مبيعة جديدة';
  byId('saleForm').reset();
  byId('inExchange').value = '3.70';
  byId('inFee').value = '0';
  byId('inStart').value = todayISO();
  const end = new Date();
  end.setDate(end.getDate() + 30);
  byId('inEnd').value = end.toISOString().slice(0, 10);
  calculateFinancialPreview();
  byId('addSaleModal').classList.remove('hidden');
  byId('addSaleModal').classList.add('flex');
}

function openModalForEdit(id) {
  const sale = sales.find((x) => x.id === id);
  if (!sale) return;
  byId('editSaleId').value = sale.id;
  byId('modalTitle').innerText = 'تعديل بيانات المبيعة';
  byId('inService').value = sale.service || '';
  byId('inClientName').value = sale.clientName || '';
  byId('inClientPhone').value = sale.clientPhone || '';
  byId('inSupplier').value = sale.supplier || '';
  byId('inSourceLink').value = sale.sourceLink || '';
  byId('inLabel').value = sale.label || '';
  byId('inStart').value = sale.startDate || todayISO();
  byId('inEnd').value = sale.endDate || todayISO();
  byId('inCostUSD').value = sale.costUSD ?? '';
  byId('inExchange').value = sale.exchangeRate ?? '3.70';
  byId('inFee').value = sale.fee ?? 0;
  byId('inPrice').value = sale.price ?? '';
  byId('inNotes').value = sale.notes || '';
  calculateFinancialPreview();
  byId('addSaleModal').classList.remove('hidden');
  byId('addSaleModal').classList.add('flex');
}

function closeModal(id) {
  byId(id).classList.add('hidden');
  byId(id).classList.remove('flex');
}

function calculateFinancialPreview() {
  const costUSD = n(byId('inCostUSD').value);
  const rate = n(byId('inExchange').value);
  const fee = n(byId('inFee').value);
  const price = n(byId('inPrice').value);
  const costILS = costUSD * rate;
  const gross = price - costILS - fee;
  const positiveGross = Math.max(0, gross);
  const extraCapital = positiveGross * 0.15;
  const emergency = positiveGross * 0.15;
  const profit = gross > 0 ? positiveGross * 0.7 : gross;
  byId('pvCost').innerText = shekel(costILS);
  byId('pvGross').innerText = shekel(gross);
  byId('pvCap').innerText = shekel(extraCapital);
  byId('pvEmergency').innerText = shekel(emergency);
  byId('pvProfit').innerText = shekel(profit);
  byId('pvProfit').className = profit >= 0 ? 'text-green-300' : 'text-red-300';
  return { costUSD, rate, fee, price, costILS, gross, extraCapital, emergency, profit };
}

byId('saleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = byId('saveSaleBtn');
  const financial = calculateFinancialPreview();

  const service = byId('inService').value.trim();
  const clientName = byId('inClientName').value.trim();
  const clientPhone = byId('inClientPhone').value.trim();
  const startDate = byId('inStart').value;
  const endDate = byId('inEnd').value;

  if (!service || !clientName || !clientPhone) return toast('أكمل بيانات الخدمة والعميل.', 'warning');
  if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) return toast('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.', 'warning');
  if (financial.price <= 0) return toast('المبلغ المقبوض يجب أن يكون أكبر من صفر.', 'warning');
  if (financial.costUSD < 0 || financial.rate <= 0 || financial.fee < 0) return toast('راجع بيانات التكلفة والصرف والرسوم.', 'warning');

  const data = {
    service,
    clientName,
    clientPhone,
    phoneNormalized: normalizePhone(clientPhone),
    supplier: byId('inSupplier').value.trim(),
    sourceLink: byId('inSourceLink').value.trim(),
    label: byId('inLabel').value.trim(),
    startDate,
    endDate,
    notes: byId('inNotes').value.trim(),
    price: financial.price,
    costUSD: financial.costUSD,
    exchangeRate: financial.rate,
    fee: financial.fee,
    costILS: financial.costILS,
    grossProfit: financial.gross,
    extraCapital: financial.extraCapital,
    emergency: financial.emergency,
    profit: financial.profit,
    addedBy: myProfile.permanentName,
    addedByEmail: currentUser.email,
    addedByRole: myProfile.role,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.email
  };

  setLoading(btn, true);
  try {
    const id = byId('editSaleId').value;
    if (id) {
      await db.collection('sales').doc(id).update(data);
      await writeAudit('sale_updated', { saleId: id, service, clientName, price: financial.price, profit: financial.profit });
      toast('تم تحديث المبيعة بنجاح.', 'success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection('sales').add(data);
      await writeAudit('sale_created', { saleId: ref.id, service, clientName, price: financial.price, profit: financial.profit });
      toast('تم حفظ المبيعة بنجاح.', 'success');
    }
    closeModal('addSaleModal');
  } catch (err) {
    console.error(err);
    toast(translateFirebaseError(err), 'error');
  } finally {
    setLoading(btn, false, 'حفظ وتوثيق الحركة 🚀');
  }
});

async function deleteSale(id) {
  const sale = sales.find((x) => x.id === id);
  if (!sale) return;
  if (!canDeleteSale(sale)) return toast('لا تملك صلاحية حذف هذه العملية.', 'error');
  if (!confirm('هل أنت متأكد من حذف هذه العملية نهائياً؟')) return;
  try {
    await db.collection('sales').doc(id).delete();
    await writeAudit('sale_deleted', { saleId: id, service: sale.service, clientName: sale.clientName, price: sale.price });
    toast('تم حذف العملية.', 'success');
  } catch (err) {
    toast(translateFirebaseError(err), 'error');
  }
}

// ==========================================
// Dashboard
// ==========================================

function initCharts() {
  const trendCanvas = byId('trendChart');
  const splitCanvas = byId('splitChart');
  if (!trendCanvas || !splitCanvas) return;

  const isDark = document.documentElement.classList.contains('dark');
  const txtColor = isDark ? '#94a3b8' : '#475569';
  if (trendChart) trendChart.destroy();
  if (splitChart) splitChart.destroy();

  trendChart = new Chart(trendCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'الإيراد ₪', data: [], borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.08)', tension: 0.4, fill: true, borderWidth: 3 },
        { label: 'الربح الصافي ₪', data: [], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.10)', tension: 0.4, fill: true, borderWidth: 3 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: txtColor, font: { family: 'Cairo', weight: 'bold' } } } },
      scales: { x: { ticks: { color: txtColor } }, y: { ticks: { color: txtColor } } }
    }
  });

  splitChart = new Chart(splitCanvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['تكلفة فعلية', 'رأس مال إضافي', 'طوارئ', 'صافي أرباح'],
      datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#64748b', '#8b5cf6', '#f97316', '#22c55e'], borderWidth: 0 }]
    },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { color: txtColor, font: { family: 'Cairo', weight: 'bold' } } } } }
  });
}

function getFilteredForDashboard() {
  return dashboardDateFilter ? sales.filter((s) => s.startDate === dashboardDateFilter) : sales;
}

function summarize(list) {
  return list.reduce((acc, s) => {
    acc.rev += n(s.price);
    acc.cost += n(s.costILS);
    acc.cap += n(s.extraCapital);
    acc.emg += n(s.emergency);
    acc.prf += n(s.profit);
    acc.count += 1;
    return acc;
  }, { rev: 0, cost: 0, cap: 0, emg: 0, prf: 0, count: 0 });
}

function populateDash() {
  if (!trendChart || !splitChart) initCharts();
  const filtered = getFilteredForDashboard();
  const t = summarize(filtered);
  const margin = t.rev > 0 ? (t.prf / t.rev) * 100 : 0;

  byId('statTotalRev').innerText = shekel(t.rev);
  byId('statRealCost').innerText = shekel(t.cost);
  byId('statExtraCap').innerText = shekel(t.cap);
  byId('statEmergency').innerText = shekel(t.emg);
  byId('statProfit').innerText = shekel(t.prf);
  byId('statSalesCount').innerText = `${t.count} عملية`;
  byId('statMargin').innerText = `هامش ${margin.toFixed(1)}%`;
  byId('statProfit').className = `metric-value ${t.prf >= 0 ? 'text-green-600' : 'text-red-600'}`;

  updateCharts(filtered, t);
  renderTopServices(filtered);
  renderRecentSales();
}

function updateCharts(filtered, totals) {
  if (!trendChart || !splitChart) return;
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  trendChart.data.labels = days.map((d) => d.slice(5));
  trendChart.data.datasets[0].data = days.map((date) => filtered.filter((s) => s.startDate === date).reduce((sum, s) => sum + n(s.price), 0));
  trendChart.data.datasets[1].data = days.map((date) => filtered.filter((s) => s.startDate === date).reduce((sum, s) => sum + n(s.profit), 0));
  trendChart.update();

  splitChart.data.datasets[0].data = [totals.cost, totals.cap, totals.emg, Math.max(0, totals.prf)];
  splitChart.update();
}

function renderTopServices(list) {
  const root = byId('topServicesList');
  const map = new Map();
  list.forEach((s) => {
    const key = s.service || 'غير محدد';
    const old = map.get(key) || { count: 0, profit: 0, revenue: 0 };
    old.count += 1;
    old.profit += n(s.profit);
    old.revenue += n(s.price);
    map.set(key, old);
  });
  const items = [...map.entries()].sort((a, b) => b[1].profit - a[1].profit).slice(0, 5);
  if (!items.length) {
    root.innerHTML = `<div class="text-center text-slate-500 text-sm font-bold py-6">لا توجد بيانات بعد.</div>`;
    return;
  }
  root.innerHTML = items.map(([name, v], i) => `
    <div class="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-950/50 p-4 border dark:border-slate-800">
      <div><div class="font-black">${i + 1}. ${escapeHtml(name)}</div><div class="text-xs text-slate-500 font-bold">${v.count} عملية • إيراد ${shekel(v.revenue)}</div></div>
      <div class="font-black text-green-600">${shekel(v.profit)}</div>
    </div>
  `).join('');
}

function renderRecentSales() {
  const root = byId('recentSalesList');
  const items = sales.slice(0, 5);
  if (!items.length) {
    root.innerHTML = `<div class="text-center text-slate-500 text-sm font-bold py-6">لا توجد عمليات بعد.</div>`;
    return;
  }
  root.innerHTML = items.map((s) => `
    <div class="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-950/50 p-4 border dark:border-slate-800">
      <div><div class="font-black">${escapeHtml(s.service)}</div><div class="text-xs text-slate-500 font-bold">${escapeHtml(s.clientName)} • ${escapeHtml(s.startDate)}</div></div>
      <div class="font-black ${n(s.profit) >= 0 ? 'text-green-600' : 'text-red-600'}">${shekel(s.profit)}</div>
    </div>
  `).join('');
}

function applyDashFilter() {
  dashboardDateFilter = byId('dashDateFilter').value || null;
  populateDash();
}
function clearDashFilter() {
  dashboardDateFilter = null;
  byId('dashDateFilter').value = '';
  populateDash();
}

// ==========================================
// Sales Table and Filters
// ==========================================

function populateFilters() {
  const labelSelect = byId('filterLabel');
  const monthSelect = byId('filterMonth');
  const selectedLabel = labelSelect.value || 'ALL';
  const selectedMonth = monthSelect.value || 'ALL';

  const labels = [...new Set(sales.map((s) => s.label).filter(Boolean))].sort();
  labelSelect.innerHTML = '<option value="ALL">جميع التصنيفات</option>' + labels.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join('');
  labelSelect.value = labels.includes(selectedLabel) ? selectedLabel : 'ALL';

  const months = [...new Set(sales.map((s) => String(s.startDate || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  monthSelect.innerHTML = '<option value="ALL">جميع الأشهر</option>' + months.map((m) => `<option value="${m}">${m}</option>`).join('');
  monthSelect.value = months.includes(selectedMonth) ? selectedMonth : 'ALL';
}

function filterSalesTable() {
  renderSalesTable();
}

function currentSalesFilter() {
  const q = byId('salesSearch')?.value?.trim().toLowerCase() || '';
  const label = byId('filterLabel')?.value || 'ALL';
  const month = byId('filterMonth')?.value || 'ALL';
  const status = byId('filterStatus')?.value || 'ALL';
  return sales.filter((s) => {
    const text = `${s.service || ''} ${s.clientName || ''} ${s.clientPhone || ''} ${s.supplier || ''} ${s.label || ''}`.toLowerCase();
    const st = statusOfSale(s).key;
    return (!q || text.includes(q)) &&
      (label === 'ALL' || s.label === label) &&
      (month === 'ALL' || String(s.startDate || '').startsWith(month)) &&
      (status === 'ALL' || st === status);
  });
}

function renderSalesTable(data) {
  populateFilters();
  const body = byId('salesTableBody');
  const rows = data || currentSalesFilter();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-500 font-bold">لا توجد عمليات مطابقة.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((s) => {
    const st = statusOfSale(s);
    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
        <td class="px-6 py-4">
          <div class="font-black text-base">${escapeHtml(s.service)}</div>
          <div class="text-[11px] text-slate-500 font-bold mt-1">${escapeHtml(s.clientName)} • <span dir="ltr">${escapeHtml(s.clientPhone)}</span></div>
          <div class="mt-2 flex flex-wrap gap-1">
            ${s.label ? `<span class="badge badge-sky">${escapeHtml(s.label)}</span>` : ''}
            ${s.supplier ? `<span class="badge badge-slate">المورد: ${escapeHtml(s.supplier)}</span>` : ''}
          </div>
        </td>
        <td class="px-4 py-4 text-center font-black text-sky-600">${shekel(s.price)}</td>
        <td class="px-4 py-4 text-center font-bold text-slate-500">${shekel(s.costILS)}</td>
        <td class="px-4 py-4 text-center font-black ${n(s.profit) >= 0 ? 'text-green-600' : 'text-red-600'}">${shekel(s.profit)}</td>
        <td class="px-4 py-4 text-center"><span class="badge ${st.cls}">${st.text}</span></td>
        <td class="px-4 py-4 text-center"><div class="text-[10px] font-black">${escapeHtml(s.addedBy || '-')}</div><div class="text-[9px] text-slate-400">${escapeHtml(s.startDate)} → ${escapeHtml(s.endDate)}</div></td>
        <td class="px-4 py-4 text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="openModalForEdit('${s.id}')" class="icon-btn text-sm" title="تعديل">✏️</button>
            <button onclick="deleteSale('${s.id}')" class="icon-btn text-sm" title="حذف">🗑️</button>
            <button onclick="window.open('${whatsappUrl(s)}', '_blank')" class="icon-btn text-sm" title="واتساب">💬</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// Analytics and Alerts
// ==========================================

function updateAnalytics() {
  const periods = [
    ['اليوم', 1],
    ['أسبوع', 7],
    ['شهر', 30],
    ['ربع سنة', 90],
    ['سنة', 365]
  ];
  const grid = byId('anaGrid');
  grid.innerHTML = periods.map(([label, days]) => {
    const limit = new Date(Date.now() - (days - 1) * 86400000);
    limit.setHours(0, 0, 0, 0);
    const list = sales.filter((s) => new Date(s.startDate) >= limit);
    const total = list.reduce((sum, s) => sum + n(s.profit), 0);
    return `
      <div class="metric-card text-center">
        <div class="metric-label">${label}</div>
        <div class="metric-value ${total >= 0 ? 'text-green-600' : 'text-red-600'}">${shekel(total)}</div>
        <div class="metric-note">${list.length} عملية</div>
      </div>
    `;
  }).join('');
  renderServiceProfitList();
  renderRiskSalesList();
}

function renderServiceProfitList() {
  const root = byId('serviceProfitList');
  const map = new Map();
  sales.forEach((s) => {
    const key = s.service || 'غير محدد';
    const old = map.get(key) || { profit: 0, count: 0 };
    old.profit += n(s.profit);
    old.count += 1;
    map.set(key, old);
  });
  const items = [...map.entries()].sort((a, b) => b[1].profit - a[1].profit).slice(0, 10);
  root.innerHTML = items.length ? items.map(([service, v]) => `
    <div class="flex justify-between rounded-2xl bg-slate-50 dark:bg-slate-950/50 p-4 border dark:border-slate-800">
      <div class="font-black">${escapeHtml(service)} <span class="text-xs text-slate-500">(${v.count})</span></div>
      <div class="font-black ${v.profit >= 0 ? 'text-green-600' : 'text-red-600'}">${shekel(v.profit)}</div>
    </div>
  `).join('') : `<div class="text-center text-slate-500 font-bold py-6">لا توجد بيانات.</div>`;
}

function renderRiskSalesList() {
  const root = byId('riskSalesList');
  const risky = sales.filter((s) => {
    const margin = n(s.price) > 0 ? n(s.profit) / n(s.price) : 0;
    return n(s.profit) <= 0 || margin < 0.12;
  }).slice(0, 10);
  root.innerHTML = risky.length ? risky.map((s) => `
    <div class="flex justify-between rounded-2xl bg-red-50 dark:bg-red-950/10 p-4 border border-red-100 dark:border-red-900/40">
      <div><div class="font-black">${escapeHtml(s.service)}</div><div class="text-xs text-slate-500 font-bold">${escapeHtml(s.clientName)} • ${escapeHtml(s.startDate)}</div></div>
      <div class="font-black text-red-600">${shekel(s.profit)}</div>
    </div>
  `).join('') : `<div class="text-center text-slate-500 font-bold py-6">لا توجد عمليات خطرة حالياً.</div>`;
}

function renderAlerts() {
  const expiring = sales.filter((s) => ['soon', 'expired'].includes(statusOfSale(s).key)).sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  byId('alertCount').innerText = expiring.length;
  const root = byId('alertsList');
  if (!expiring.length) {
    root.innerHTML = `<div class="panel text-center py-12 text-slate-500 font-black">لا توجد اشتراكات تحتاج متابعة حالياً ✅</div>`;
    return;
  }
  root.innerHTML = expiring.map((s) => {
    const st = statusOfSale(s);
    return `
      <div class="panel flex flex-col md:flex-row justify-between md:items-center gap-4 border-r-4 ${st.key === 'expired' ? 'border-red-600' : 'border-orange-500'}">
        <div>
          <div class="font-black text-lg">${escapeHtml(s.service)}</div>
          <div class="text-sm text-slate-500 font-bold">${escapeHtml(s.clientName)} • <span dir="ltr">${escapeHtml(s.clientPhone)}</span></div>
          <div class="mt-2"><span class="badge ${st.cls}">${st.text}</span></div>
        </div>
        <button onclick="window.open('${whatsappUrl(s)}', '_blank')" class="btn-primary px-5 py-3 text-sm">إرسال تذكير واتساب</button>
      </div>
    `;
  }).join('');
}

// ==========================================
// Users and Audit
// ==========================================

function renderUsers() {
  const body = byId('usersListBody');
  body.innerHTML = users.map((u) => `
    <tr class="border-b dark:border-slate-800">
      <td class="py-4 font-bold text-xs"><div dir="ltr">${escapeHtml(u.email)}</div><div class="text-slate-500">${escapeHtml(u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('ar') : '')}</div></td>
      <td class="py-4"><input type="text" id="un_${cssId(u.id)}" value="${escapeHtml(u.permanentName || '')}" class="form-input compact text-xs" /></td>
      <td class="py-4 text-center"><select id="ur_${cssId(u.id)}" class="form-input compact text-xs font-bold"><option value="User" ${u.role === 'User' ? 'selected' : ''}>موظف</option><option value="Manager" ${u.role === 'Manager' ? 'selected' : ''}>مدير</option><option value="SuperAdmin" ${u.role === 'SuperAdmin' ? 'selected' : ''}>آدمن</option></select></td>
      <td class="py-4 text-center"><button onclick="updateUser('${escapeHtml(u.id)}')" class="btn-primary px-3 py-2 text-[10px]">تحديث</button></td>
    </tr>
  `).join('');
}

function cssId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function updateUser(id) {
  if (myProfile.role !== 'SuperAdmin') return toast('هذه العملية للآدمن فقط.', 'error');
  const safe = cssId(id);
  const permanentName = byId(`un_${safe}`).value.trim();
  const role = byId(`ur_${safe}`).value;
  if (!permanentName) return toast('اسم المستخدم لا يمكن أن يكون فارغاً.', 'warning');
  try {
    await db.collection('users').doc(id).update({ permanentName, role, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.email });
    await writeAudit('user_updated', { email: id, permanentName, role });
    toast('تم تحديث المستخدم.', 'success');
  } catch (err) {
    toast(translateFirebaseError(err), 'error');
  }
}

function renderAudit() {
  const root = byId('auditList');
  if (!root) return;
  if (!auditLogs.length) {
    root.innerHTML = `<div class="p-8 text-center text-slate-500 font-bold">لا يوجد سجل نشاط ظاهر، أو لا تملك صلاحية قراءته.</div>`;
    return;
  }
  root.innerHTML = auditLogs.map((log) => {
    const time = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ar') : '...';
    return `
      <div class="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div><div class="font-black">${actionLabel(log.action)}</div><div class="text-xs text-slate-500 font-bold">${escapeHtml(log.actorName)} • <span dir="ltr">${escapeHtml(log.actorEmail)}</span></div></div>
        <div class="text-xs text-slate-500 font-bold">${escapeHtml(time)}</div>
      </div>
    `;
  }).join('');
}

function actionLabel(action) {
  const labels = {
    sale_created: 'إضافة مبيعة',
    sale_updated: 'تعديل مبيعة',
    sale_deleted: 'حذف مبيعة',
    user_updated: 'تحديث مستخدم',
    user_created_profile: 'إنشاء ملف مستخدم',
    password_updated: 'تحديث كلمة مرور'
  };
  return labels[action] || action || 'نشاط';
}

// ==========================================
// Export
// ==========================================

function exportData(period) {
  const now = new Date();
  let filtered = [...sales];
  if (period === 'week') {
    const limit = new Date(now.getTime() - 7 * 86400000);
    filtered = sales.filter((s) => new Date(s.startDate) >= limit);
  } else if (period === 'month') {
    const currentMonth = now.toISOString().slice(0, 7);
    filtered = sales.filter((s) => String(s.startDate || '').startsWith(currentMonth));
  }
  if (!filtered.length) return toast('لا توجد بيانات لهذا النطاق.', 'warning');

  const headers = ['التاريخ', 'الخدمة', 'العميل', 'الهاتف', 'المورد', 'التصنيف', 'الإيراد', 'التكلفة', 'الرسوم', 'رأس مال إضافي', 'طوارئ', 'الربح الصافي', 'المسؤول', 'تاريخ الانتهاء'];
  const csvRows = [headers.join(',')];
  filtered.forEach((s) => {
    const row = [
      s.startDate, s.service, s.clientName, s.clientPhone, s.supplier || '', s.label || '',
      n(s.price), n(s.costILS).toFixed(2), n(s.fee).toFixed(2), n(s.extraCapital).toFixed(2), n(s.emergency).toFixed(2), n(s.profit).toFixed(2),
      s.addedBy || '', s.endDate
    ].map(csvEscape).join(',');
    csvRows.push(row);
  });
  downloadText(`Klik_Report_${period}_${now.toISOString().slice(0, 10)}.csv`, '\uFEFF' + csvRows.join('\n'), 'text/csv;charset=utf-8;');
  toast('تم تجهيز التقرير.', 'success');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

window.onload = () => {
  initCharts();
  byId('mainSidebar')?.classList.add(window.innerWidth < 768 ? 'sidebar-hidden' : '');
};
