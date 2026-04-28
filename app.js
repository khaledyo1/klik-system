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
let dashboardPeriod = 'all';
let salesPeriod = 'all';
let salesDateFilter = null;
let dbUnsubscribe = null;
let usersUnsubscribe = null;
let auditUnsubscribe = null;
let currentLimit = 50;
let currentUser = null;
let systemSettings = { profitRatio: 70, emergencyRatio: 15, capitalRatio: 15 };

const ADMIN_EMAIL = "khaledalimawi@klik.com";
const ADMIN_EMAILS = ["khaledalimawi@klik.com", "khaled.yous3f19@gmail.com"];
const MONEY = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const SECTION_META = {
  dashboard: ['اللوحة المعلوماتية', 'مؤشرات فورية من قاعدة البيانات'],
  sales: ['السجل والأرشفة', 'بحث، فلترة، تعديل، وتصدير العمليات'],
  analytics: ['التحليل المالي', 'تحليل الربحية والمخاطر'],
  alerts: ['التنبيهات', 'اشتراكات تنتهي قريباً وتحتاج متابعة'],
  audit: ['سجل النشاط', 'تتبع الإنشاء والتعديل والحذف'],
  trash: ['سلة المحذوفات', 'مراجعة العمليات المحذوفة وتفريغها بواسطة الآدمن فقط'],
  backup: ['النسخ الاحتياطي', 'تصدير واستعادة بيانات النظام بأمان'],
  settings: ['إعدادات النسب', 'إدارة نسب الأرباح والطوارئ ورأس المال'],
  profile: ['إعدادات حسابي', 'إدارة بيانات الدخول والهوية'],
  userMgmt: ['إدارة الصلاحيات', 'إدارة المستخدمين والأدوار']
};

function byId(id) { return document.getElementById(id); }
function n(value) { return Number(value) || 0; }
function shekel(value) { return `${MONEY.format(n(value))} ₪`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function endOfDay(date) { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; }
function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  return d;
}
function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
function startOfMonth(date) { const d = startOfDay(date); d.setDate(1); return d; }
function endOfMonth(date) { const d = startOfMonth(date); d.setMonth(d.getMonth() + 1); d.setMilliseconds(-1); return d; }
function dateInRange(value, start, end) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}
function periodRange(period, dateValue) {
  const base = dateValue ? new Date(dateValue) : new Date();
  if (period === 'day') return [startOfDay(base), endOfDay(base), 'اليوم'];
  if (period === 'week') return [startOfWeek(base), endOfWeek(base), 'الأسبوع'];
  if (period === 'month') return [startOfMonth(base), endOfMonth(base), 'الشهر'];
  return [null, null, 'كل البيانات'];
}
function filterByPeriod(list, period, dateValue) {
  const [start, end] = periodRange(period, dateValue);
  if (!start || !end) return list;
  return list.filter((s) => dateInRange(s.startDate, start, end));
}
function setActivePeriodButtons(prefix, active) {
  ['day', 'week', 'month', 'all'].forEach((period) => {
    const id = prefix + period.charAt(0).toUpperCase() + period.slice(1);
    byId(id)?.classList.toggle('active', period === active);
  });
}
function updatePeriodLabels() {
  const dashLabel = byId('dashboardFilterLabel');
  const salesLabel = byId('salesPeriodLabel');
  const [, , dashText] = periodRange(dashboardPeriod, dashboardDateFilter);
  const [, , salesText] = periodRange(salesPeriod, salesDateFilter);
  if (dashLabel) dashLabel.innerText = `عرض لوحة المعلومات: ${dashText}`;
  if (salesLabel) salesLabel.innerText = `عرض السجل: ${salesText}`;
  setActivePeriodButtons('dashPeriod', dashboardPeriod);
  setActivePeriodButtons('salesPeriod', salesPeriod);
}
function saleTrueProfit(s) {
  if (isCompensationRecord(s)) return 0;
  if (typeof s.trueProfit === 'number') return n(s.trueProfit);
  const reconstructed = n(s.profit) + n(s.extraCapital) + n(s.emergency);
  if (reconstructed !== 0) return reconstructed;
  return n(s.price) - n(s.costILS) - n(s.compensationCost);
}
function saleTotalCost(s) {
  if (isCompensationRecord(s)) return compensationAmount(s);
  return n(s.costILS) + n(s.compensationCost);
}
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function plainCopy(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function summarizeSaleForAudit(sale) {
  if (!sale) return {};
  return {
    service: sale.service || sale.linkedSaleService || '',
    clientName: sale.clientName || sale.linkedSaleClientName || '',
    clientPhone: sale.clientPhone || sale.linkedSaleClientPhone || '',
    price: n(sale.price),
    trueProfit: saleTrueProfit(sale),
    accountStatus: sale.accountStatus || '',
    paymentMethod: sale.supplier || '',
    date: transactionDate(sale)
  };
}

function diffObjects(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  return keys
    .filter((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null))
    .map((key) => ({ field: key, before: before?.[key] ?? '', after: after?.[key] ?? '' }));
}

function ratioValue(key, fallback) {
  return Number(systemSettings?.[key]) >= 0 ? Number(systemSettings[key]) : fallback;
}

function isCompensationRecord(s) {
  return s?.transactionType === 'compensation';
}

function isDeletedRecord(s) {
  return Boolean(s?.deletedAt || s?.isDeleted === true || s?.deleted === true);
}

function liveRecords(list = sales) {
  return list.filter((s) => !isDeletedRecord(s));
}

function trashRecords(list = sales) {
  return list.filter((s) => isDeletedRecord(s));
}

function activeSales(list = sales) {
  return list.filter((s) => !isDeletedRecord(s) && !isCompensationRecord(s));
}

function compensationRecords(list = sales) {
  return list.filter((s) => !isDeletedRecord(s) && isCompensationRecord(s));
}

function transactionDate(s) {
  return s?.startDate || s?.compensationDate || '';
}

function compensationAmount(s) {
  return n(s?.emergencyWithdrawal) || n(s?.compensationCost);
}

function saleTitle(s) {
  if (isCompensationRecord(s)) return `تعويض من الطوارئ: ${s.service || s.linkedSaleService || 'عملية مرتبطة'}`;
  return s.service || 'عملية غير محددة';
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
  if (!sidebar) return;
  sidebar.classList.toggle('sidebar-collapsed');
}

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isSuperAdmin() {
  const email = normalizedEmail(currentUser?.email || auth.currentUser?.email);
  const adminEmails = (Array.isArray(ADMIN_EMAILS) ? ADMIN_EMAILS : [ADMIN_EMAIL]).map(normalizedEmail);
  const role = String(myProfile?.role || '').trim();
  return adminEmails.includes(email) || ['SuperAdmin', 'Admin', 'Owner', 'آدمن', 'ادمن', 'مدير عام'].includes(role);
}

function canManage() {
  return ['SuperAdmin', 'Manager'].includes(myProfile.role) || isSuperAdmin();
}

function canDeleteSale(sale) {
  return canManage() || sale.addedByEmail === currentUser?.email;
}

function statusOfSale(sale) {
  if (isCompensationRecord(sale)) return { key: 'compensation', text: 'تعويض من الطوارئ', cls: 'badge-orange' };
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
    setLoading(btn, false, 'تسجيل الدخول');
  }
});

byId('forceNameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = byId('forceNameInput').value.trim();
  const user = auth.currentUser;
  if (!user || name.length < 3) return;

  const isSuper = ADMIN_EMAILS.map(normalizedEmail).includes(normalizedEmail(user.email));
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
  byId('adminNav').classList.toggle('hidden', !isSuperAdmin());
  byId('loginScreen').classList.add('hidden');
  byId('forceNameModal').classList.add('hidden');
  byId('mainApp').classList.remove('hidden');
  byId('mainApp').classList.add('flex');

  loadSystemSettings().finally(() => {
    initCharts();
    startDataSync();
  });
  startAuditSync();
  if (isSuperAdmin()) startUsersSync();
  writeAudit('login_success', { userEmail: user.email, userName: myProfile.permanentName || user.email, role: myProfile.role || 'User' });
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
      updateTrashCount();
      renderTrash();
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
  if ((id === 'userMgmt' || id === 'backup' || id === 'settings') && myProfile.role !== 'SuperAdmin') {
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
  if (id === 'trash') renderTrash();
  if (id === 'settings') renderSettings();
  if (window.innerWidth < 768) byId('mainSidebar').classList.add('sidebar-collapsed');
}

// ==========================================
// Sale Modal and CRUD
// ==========================================

function openModalForAdd() {
  byId('editSaleId').value = '';
  byId('modalTitle').innerText = 'تسجيل مبيعة جديدة';
  byId('saleForm').reset();
  byId('inPurchaseCurrency').value = 'USD';
  byId('inExchange').value = '3.70';
  byId('inAccountStatus').value = 'فعال';
  byId('inCompensationCost').value = '0';
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
  byId('inPurchaseCurrency').value = sale.purchaseCurrency || 'USD';
  byId('inCostUSD').value = sale.purchaseCost ?? sale.costUSD ?? '';
  byId('inExchange').value = sale.exchangeRate ?? '3.70';
  byId('inPrice').value = sale.price ?? '';
  byId('inAccountStatus').value = sale.accountStatus || 'فعال';
  byId('inCompensationCost').value = sale.compensationCost ?? 0;
  byId('inCompensationReason').value = sale.compensationReason || '';
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
  const purchaseCurrency = byId('inPurchaseCurrency')?.value || 'USD';
  const purchaseCost = n(byId('inCostUSD').value);
  const rate = purchaseCurrency === 'ILS' ? 1 : n(byId('inExchange').value);
  const price = n(byId('inPrice').value);
  const feeMode = 'fixed';
  const feeValue = 0;
  const paymentFee = 0;
  const compensationCost = n(byId('inCompensationCost')?.value);
  const costILS = purchaseCost * rate;
  const grossProfit = price - costILS;
  const trueProfit = price - costILS - paymentFee - compensationCost;
  const positiveTrueProfit = Math.max(0, trueProfit);
  const extraCapital = positiveTrueProfit * (ratioValue('capitalRatio', 15) / 100);
  const emergency = positiveTrueProfit * (ratioValue('emergencyRatio', 15) / 100);
  const profit = trueProfit > 0 ? positiveTrueProfit * (ratioValue('profitRatio', 70) / 100) : trueProfit;

  byId('pvCost').innerText = shekel(costILS);
  byId('pvCompensation').innerText = shekel(compensationCost);
  byId('pvGross').innerText = shekel(grossProfit);
  byId('pvTrueProfit').innerText = shekel(trueProfit);
  byId('pvCap').innerText = shekel(extraCapital);
  byId('pvEmergency').innerText = shekel(emergency);
  byId('pvProfit').innerText = shekel(profit);
  byId('pvTrueProfit').className = trueProfit >= 0 ? 'text-emerald-300' : 'text-red-300';
  byId('pvProfit').className = profit >= 0 ? 'text-green-300' : 'text-red-300';

  return { purchaseCurrency, purchaseCost, rate, feeMode, feeValue, paymentFee, compensationCost, price, costILS, grossProfit, trueProfit, extraCapital, emergency, profit };
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
  const accountStatus = byId('inAccountStatus').value;

  if (!service || !clientName || !clientPhone) return toast('أكمل بيانات الخدمة والعميل.', 'warning');
  if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) return toast('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.', 'warning');
  if (financial.price <= 0) return toast('المبلغ المقبوض يجب أن يكون أكبر من صفر.', 'warning');
  if (financial.purchaseCost < 0 || financial.rate <= 0 || financial.compensationCost < 0) return toast('راجع بيانات التكلفة والصرف والتعويض.', 'warning');
  if (accountStatus === 'تم التعويض' && financial.compensationCost <= 0) return toast('إذا كان التعويض فوري داخل نفس العملية، أدخل التكلفة. للتعويض بعد فترة استخدم زر تعويض من السجل.', 'warning');

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
    purchaseCurrency: financial.purchaseCurrency,
    purchaseCost: financial.purchaseCost,
    price: financial.price,
    costUSD: financial.purchaseCost,
    exchangeRate: financial.rate,
    paymentMethod: '',
    feeMode: 'fixed',
    feeValue: 0,
    fee: 0,
    costILS: financial.costILS,
    grossProfit: financial.grossProfit,
    trueProfit: financial.trueProfit,
    extraCapital: financial.extraCapital,
    emergency: financial.emergency,
    profit: financial.profit,
    accountStatus,
    compensationCost: financial.compensationCost,
    compensationReason: byId('inCompensationReason').value.trim(),
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
      const oldSale = sales.find((x) => x.id === id) || {};
      const before = summarizeSaleForAudit(oldSale);
      await db.collection('sales').doc(id).update(data);
      const after = summarizeSaleForAudit({ ...oldSale, ...data });
      await writeAudit('sale_updated', { saleId: id, service, clientName, price: financial.price, trueProfit: financial.trueProfit, accountStatus, before, after, changes: diffObjects(before, after) });
      toast('تم تحديث المبيعة بنجاح.', 'success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection('sales').add(data);
      const after = summarizeSaleForAudit({ id: ref.id, ...data });
      await writeAudit('sale_created', { saleId: ref.id, service, clientName, price: financial.price, trueProfit: financial.trueProfit, accountStatus, after });
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

function openModalForCompensation(id) {
  const sale = sales.find((x) => x.id === id);
  if (!sale || isCompensationRecord(sale)) return;
  byId('compSaleId').value = sale.id;
  byId('compSaleSummary').innerText = `${sale.service || '-'} • ${sale.clientName || '-'} • ${sale.startDate || '-'}`;
  byId('compDate').value = todayISO();
  byId('compAmount').value = '';
  byId('compSupplier').value = sale.supplier || '';
  byId('compReason').value = '';
  byId('compNotes').value = '';
  byId('compensationModal').classList.remove('hidden');
  byId('compensationModal').classList.add('flex');
}

byId('compensationForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const saleId = byId('compSaleId').value;
  const sale = sales.find((x) => x.id === saleId);
  if (!sale) return toast('تعذر العثور على المبيعة الأصلية.', 'error');
  const amount = n(byId('compAmount').value);
  const compDate = byId('compDate').value || todayISO();
  const reason = byId('compReason').value.trim();
  const supplier = byId('compSupplier').value.trim();
  const notes = byId('compNotes').value.trim();
  if (amount <= 0) return toast('أدخل تكلفة التعويض بدقة، حتى لو كانت 0.003.', 'warning');
  if (!reason) return toast('اكتب سبب التعويض حتى يبقى السجل واضحاً.', 'warning');

  const btn = byId('saveCompensationBtn');
  setLoading(btn, true);
  try {
    const data = {
      transactionType: 'compensation',
      linkedSaleId: sale.id,
      linkedSaleService: sale.service || '',
      linkedSaleClientName: sale.clientName || '',
      linkedSaleClientPhone: sale.clientPhone || '',
      service: sale.service || 'تعويض',
      clientName: sale.clientName || '',
      clientPhone: sale.clientPhone || '',
      phoneNormalized: normalizePhone(sale.clientPhone || ''),
      supplier,
      sourceLink: sale.sourceLink || '',
      label: 'تعويض',
      startDate: compDate,
      endDate: compDate,
      notes,
      purchaseCurrency: 'ILS',
      purchaseCost: amount,
      price: 0,
      costUSD: 0,
      exchangeRate: 1,
      paymentMethod: 'صندوق الطوارئ',
      feeMode: 'fixed',
      feeValue: 0,
      fee: 0,
      costILS: 0,
      grossProfit: 0,
      trueProfit: 0,
      extraCapital: 0,
      emergency: -amount,
      emergencyWithdrawal: amount,
      profit: 0,
      accountStatus: 'تعويض من الطوارئ',
      compensationCost: amount,
      compensationReason: reason,
      addedBy: myProfile.permanentName,
      addedByEmail: currentUser.email,
      addedByRole: myProfile.role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email,
      updatedByName: myProfile.permanentName
    };
    const ref = await db.collection('sales').add(data);
    await db.collection('sales').doc(sale.id).update({
      accountStatus: 'تم التعويض',
      lastCompensationAt: compDate,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email,
      updatedByName: myProfile.permanentName
    });
    await writeAudit('compensation_created', { saleId: sale.id, compensationId: ref.id, service: sale.service, clientName: sale.clientName, amount, date: compDate, reason, source: 'صندوق الطوارئ', before: summarizeSaleForAudit(sale), after: { accountStatus: 'تم التعويض', lastCompensationAt: compDate } });
    toast('تم تسجيل التعويض كخصم من صندوق الطوارئ، بدون تغيير ربح المبيعة الأصلية.', 'success');
    closeModal('compensationModal');
  } catch (err) {
    console.error(err);
    toast(translateFirebaseError(err), 'error');
  } finally {
    setLoading(btn, false, 'حفظ التعويض من الطوارئ');
  }
});

async function deleteSale(id) {
  const sale = sales.find((x) => x.id === id);
  if (!sale) return;
  if (!canDeleteSale(sale)) return toast('لا تملك صلاحية حذف هذه العملية.', 'error');
  if (isDeletedRecord(sale)) return toast('هذه العملية موجودة أصلاً في سلة المحذوفات.', 'warning');
  if (!confirm('سيتم نقل العملية إلى سلة المحذوفات، ولن تُحذف نهائياً إلا عند تفريغ السلة بواسطة الآدمن. هل تريد المتابعة؟')) return;
  try {
    await db.collection('sales').doc(id).update({
      isDeleted: true,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
      deletedDate: todayISO(),
      deletedByEmail: currentUser.email,
      deletedByName: myProfile.permanentName,
      deletedByRole: myProfile.role,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email,
      updatedByName: myProfile.permanentName
    });
    await writeAudit('sale_moved_to_trash', { saleId: id, service: sale.service || sale.linkedSaleService, clientName: sale.clientName || sale.linkedSaleClientName, price: sale.price || 0, transactionType: sale.transactionType || 'sale', deletedByName: myProfile.permanentName, before: summarizeSaleForAudit(sale), after: { isDeleted: true, deletedByName: myProfile.permanentName, deletedDate: todayISO() } });
    toast('تم نقل العملية إلى سلة المحذوفات.', 'success');
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
        { label: 'الربح الحقيقي ₪', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.10)', tension: 0.4, fill: true, borderWidth: 3 }
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
      labels: ['تكلفة فعلية', 'رأس مال إضافي', 'صندوق طوارئ متبقي', 'صافي أرباح'],
      datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#64748b', '#8b5cf6', '#f97316', '#22c55e'], borderWidth: 0 }]
    },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { color: txtColor, font: { family: 'Cairo', weight: 'bold' } } } } }
  });
}

function getFilteredForDashboard() {
  return filterByPeriod(liveRecords(sales), dashboardPeriod, dashboardDateFilter);
}

function summarize(list) {
  return list.reduce((acc, s) => {
    if (isCompensationRecord(s)) {
      const withdrawal = compensationAmount(s);
      acc.comp += withdrawal;
      acc.emg -= withdrawal;
      acc.compCount += 1;
      return acc;
    }

    const trueProfit = saleTrueProfit(s);
    acc.rev += n(s.price);
    acc.purchase += n(s.costILS);
    acc.immediateComp += n(s.compensationCost);
    acc.cost += n(s.costILS) + n(s.compensationCost);
    acc.trueProfit += trueProfit;
    acc.cap += n(s.extraCapital);
    acc.emergencyBase += n(s.emergency);
    acc.emg += n(s.emergency);
    acc.prf += n(s.profit);
    acc.count += 1;
    return acc;
  }, { rev: 0, cost: 0, purchase: 0, immediateComp: 0, comp: 0, trueProfit: 0, cap: 0, emergencyBase: 0, emg: 0, prf: 0, count: 0, compCount: 0 });
}


function populateDash() {
  if (!trendChart || !splitChart) initCharts();
  updatePeriodLabels();
  const filtered = getFilteredForDashboard();
  const t = summarize(filtered);
  const trueMargin = t.rev > 0 ? (t.trueProfit / t.rev) * 100 : 0;

  byId('statTotalRev').innerText = shekel(t.rev);
  byId('statRealCost').innerText = shekel(t.cost);
  byId('statTrueProfit').innerText = shekel(t.trueProfit);
  byId('statExtraCap').innerText = shekel(t.cap);
  byId('statEmergency').innerText = shekel(t.emg);
  byId('statProfit').innerText = shekel(t.prf);
  byId('statSalesCount').innerText = `${t.count} مبيعة${t.compCount ? ` • ${t.compCount} تعويض` : ''}`;
  if (byId('statEmergencyBase')) byId('statEmergencyBase').innerText = `تراكم ${shekel(t.emergencyBase)}`;
  if (byId('statEmergencyWithdrawals')) byId('statEmergencyWithdrawals').innerText = shekel(t.comp);
  byId('statTrueMargin').innerText = `هامش ${trueMargin.toFixed(1)}%`;
  byId('statMargin').innerText = `70% من الربح الحقيقي`;
  byId('statTrueProfit').className = `metric-value ${t.trueProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`;
  byId('statProfit').className = `metric-value ${t.prf >= 0 ? 'text-green-600' : 'text-red-600'}`;

  updateCharts(filtered, t);
  renderTopServices(filtered);
  renderRecentSales(filtered);
}

function updateCharts(filtered, totals) {
  if (!trendChart || !splitChart) return;
  const [rangeStart, rangeEnd] = periodRange(dashboardPeriod, dashboardDateFilter);
  const days = [];
  if (rangeStart && rangeEnd) {
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd && days.length < 45) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
  }
  trendChart.data.labels = days.map((d) => d.slice(5));
  trendChart.data.datasets[0].data = days.map((date) => filtered.filter((s) => s.startDate === date).reduce((sum, s) => sum + n(s.price), 0));
  trendChart.data.datasets[1].data = days.map((date) => filtered.filter((s) => s.startDate === date).reduce((sum, s) => sum + saleTrueProfit(s), 0));
  trendChart.update();

  splitChart.data.datasets[0].data = [totals.cost, totals.cap, Math.max(0, totals.emg), Math.max(0, totals.prf)];
  splitChart.update();
}

function renderTopServices(list) {
  const root = byId('topServicesList');
  const map = new Map();
  activeSales(list).forEach((s) => {
    const key = s.service || 'غير محدد';
    const old = map.get(key) || { count: 0, profit: 0, revenue: 0 };
    old.count += 1;
    old.profit += saleTrueProfit(s);
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
      <div class="font-black ${v.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}">${shekel(v.profit)}</div>
    </div>
  `).join('');
}

function renderRecentSales(list = sales) {
  const root = byId('recentSalesList');
  const items = [...list].sort((a, b) => String(transactionDate(b)).localeCompare(String(transactionDate(a)))).slice(0, 5);
  if (!items.length) {
    root.innerHTML = `<div class="text-center text-slate-500 text-sm font-bold py-6">لا توجد عمليات في هذا العرض.</div>`;
    return;
  }
  root.innerHTML = items.map((s) => {
    const isComp = isCompensationRecord(s);
    const amount = isComp ? -compensationAmount(s) : saleTrueProfit(s);
    return `
      <div class="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-950/50 p-4 border dark:border-slate-800">
        <div><div class="font-black">${escapeHtml(saleTitle(s))}</div><div class="text-xs text-slate-500 font-bold">${escapeHtml(s.clientName || s.linkedSaleClientName || '-')} • ${escapeHtml(transactionDate(s))}</div></div>
        <div class="font-black ${amount >= 0 ? 'text-emerald-600' : 'text-orange-600'}">${isComp ? '-' : ''}${shekel(Math.abs(amount))}</div>
      </div>
    `;
  }).join('');
}


function setDashboardPeriod(period) {
  dashboardPeriod = period;
  if (period !== 'all' && !dashboardDateFilter) {
    dashboardDateFilter = todayISO();
    if (byId('dashDateFilter')) byId('dashDateFilter').value = dashboardDateFilter;
  }
  if (period === 'all') {
    dashboardDateFilter = null;
    if (byId('dashDateFilter')) byId('dashDateFilter').value = '';
  }
  populateDash();
}
function applyDashFilter() {
  dashboardDateFilter = byId('dashDateFilter').value || null;
  if (dashboardDateFilter && dashboardPeriod === 'all') dashboardPeriod = 'day';
  populateDash();
}
function clearDashFilter() { setDashboardPeriod('all'); }

function setSalesPeriod(period) {
  salesPeriod = period;
  if (period !== 'all' && !salesDateFilter) {
    salesDateFilter = todayISO();
    if (byId('salesDateFilter')) byId('salesDateFilter').value = salesDateFilter;
  }
  if (period === 'all') {
    salesDateFilter = null;
    if (byId('salesDateFilter')) byId('salesDateFilter').value = '';
  }
  updatePeriodLabels();
  renderSalesTable();
}
function applySalesDateFilter() {
  salesDateFilter = byId('salesDateFilter').value || null;
  if (salesDateFilter && salesPeriod === 'all') salesPeriod = 'day';
  updatePeriodLabels();
  renderSalesTable();
}

// ==========================================
// Sales Table and Filters
// ==========================================

function populateFilters() {
  const labelSelect = byId('filterLabel');
  const monthSelect = byId('filterMonth');
  const selectedLabel = labelSelect.value || 'ALL';
  const selectedMonth = monthSelect.value || 'ALL';

  const live = liveRecords(sales);
  const labels = [...new Set(activeSales(live).map((s) => s.label).filter(Boolean))].sort();
  labelSelect.innerHTML = '<option value="ALL">جميع التصنيفات</option>' + labels.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join('');
  labelSelect.value = labels.includes(selectedLabel) ? selectedLabel : 'ALL';

  const months = [...new Set(live.map((s) => String(s.startDate || '').slice(0, 7)).filter(Boolean))].sort().reverse();
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
  const accountStatus = byId('filterAccountStatus')?.value || 'ALL';
  const periodFiltered = filterByPeriod(liveRecords(sales), salesPeriod, salesDateFilter);
  return periodFiltered.filter((s) => {
    const text = `${s.service || ''} ${s.linkedSaleService || ''} ${s.clientName || ''} ${s.linkedSaleClientName || ''} ${s.clientPhone || ''} ${s.supplier || ''} ${s.label || ''} ${s.accountStatus || ''} ${s.compensationReason || ''}`.toLowerCase();
    const st = statusOfSale(s).key;
    return (!q || text.includes(q)) &&
      (label === 'ALL' || s.label === label) &&
      (month === 'ALL' || String(s.startDate || '').startsWith(month)) &&
      (status === 'ALL' || st === status) &&
      (accountStatus === 'ALL' || (s.accountStatus || 'فعال') === accountStatus || (isCompensationRecord(s) && accountStatus === 'تعويض من الطوارئ'));
  });
}

function renderSalesTable(data) {
  populateFilters();
  updatePeriodLabels();
  const body = byId('salesTableBody');
  const rows = data || currentSalesFilter();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-500 font-bold">لا توجد عمليات مطابقة. بياناتك محفوظة، غيّر الفلاتر أو اختر الكل.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((s) => {
    if (isCompensationRecord(s)) return renderCompensationRow(s);
    const st = statusOfSale(s);
    const acct = s.accountStatus || 'فعال';
    const totalCost = saleTotalCost(s);
    const trueProfit = saleTrueProfit(s);
    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
        <td class="px-6 py-4">
          <div class="font-black text-base">${escapeHtml(s.service)}</div>
          <div class="text-[11px] text-slate-500 font-bold mt-1">${escapeHtml(s.clientName)} • <span dir="ltr">${escapeHtml(s.clientPhone)}</span></div>
          <div class="mt-2 flex flex-wrap gap-1">
            ${s.label ? `<span class="badge badge-sky">${escapeHtml(s.label)}</span>` : ''}
            ${s.supplier ? `<span class="badge badge-slate">وسيلة الدفع: ${escapeHtml(s.supplier)}</span>` : ''}
            <span class="badge ${acct === 'تم التعويض' ? 'badge-red' : acct === 'قيد المتابعة' ? 'badge-orange' : 'badge-green'}">${escapeHtml(acct)}</span>
          </div>
        </td>
        <td class="px-4 py-4 text-center font-black text-sky-600">${shekel(s.price)}</td>
        <td class="px-4 py-4 text-center font-bold text-slate-500"><div>${shekel(totalCost)}</div><div class="text-[10px] mt-1">شراء ${shekel(s.costILS)}${n(s.compensationCost) ? ` • تعويض فوري ${shekel(s.compensationCost)}` : ''}</div></td>
        <td class="px-4 py-4 text-center font-black ${trueProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}"><div>${shekel(trueProfit)}</div><div class="text-[10px] text-slate-400 mt-1">صافي 70%: ${shekel(s.profit)}</div></td>
        <td class="px-4 py-4 text-center"><span class="badge ${st.cls}">${st.text}</span></td>
        <td class="px-4 py-4 text-center"><div class="text-[10px] font-black">أنشأ: ${escapeHtml(s.addedBy || '-')}</div><div class="text-[10px] text-slate-400 font-bold">آخر تعديل: ${escapeHtml(s.updatedByName || s.addedBy || '-')}</div><div class="text-[9px] text-slate-400">${escapeHtml(s.startDate)} → ${escapeHtml(s.endDate)}</div></td>
        <td class="px-4 py-4 text-center">
          <div class="flex items-center justify-center gap-2 flex-wrap">
            <button onclick="openModalForEdit('${s.id}')" class="icon-btn text-sm" title="تعديل">✏️</button>
            <button onclick="openModalForCompensation(&#39;${s.id}&#39;)" class="action-chip action-chip-orange" title="&#1578;&#1587;&#1580;&#1610;&#1604; &#1578;&#1593;&#1608;&#1610;&#1590; &#1605;&#1606; &#1575;&#1604;&#1591;&#1608;&#1575;&#1585;&#1574;">&#128736;&#65039; &#1578;&#1593;&#1608;&#1610;&#1590;</button>
            <button onclick="deleteSale('${s.id}')" class="icon-btn text-sm" title="حذف">🗑️</button>
            <button onclick="window.open('${whatsappUrl(s)}', '_blank')" class="icon-btn text-sm" title="واتساب">💬</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCompensationRow(s) {
  const amount = compensationAmount(s);
  return `
    <tr class="bg-orange-50/70 dark:bg-orange-950/10 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors">
      <td class="px-6 py-4">
        <div class="font-black text-base text-orange-700 dark:text-orange-300">🛠️ تعويض من صندوق الطوارئ</div>
        <div class="text-[11px] text-slate-500 font-bold mt-1">${escapeHtml(s.linkedSaleService || s.service || '-')} • ${escapeHtml(s.linkedSaleClientName || s.clientName || '-')}</div>
        <div class="mt-2 flex flex-wrap gap-1">
          <span class="badge badge-orange">خصم طوارئ</span>
          ${s.supplier ? `<span class="badge badge-slate">وسيلة الدفع: ${escapeHtml(s.supplier)}</span>` : ''}
          ${s.compensationReason ? `<span class="badge badge-slate">${escapeHtml(s.compensationReason)}</span>` : ''}
        </div>
      </td>
      <td class="px-4 py-4 text-center font-black text-slate-400">${shekel(0)}</td>
      <td class="px-4 py-4 text-center font-bold text-orange-600"><div>${shekel(amount)}</div><div class="text-[10px] mt-1">لا يخصم من الربح؛ يخصم من الطوارئ</div></td>
      <td class="px-4 py-4 text-center font-black text-slate-500"><div>${shekel(0)}</div><div class="text-[10px] text-orange-500 mt-1">أثر الطوارئ: -${shekel(amount)}</div></td>
      <td class="px-4 py-4 text-center"><span class="badge badge-orange">تعويض</span></td>
      <td class="px-4 py-4 text-center"><div class="text-[10px] font-black">أنشأ: ${escapeHtml(s.addedBy || '-')}</div><div class="text-[10px] text-slate-400 font-bold">آخر تعديل: ${escapeHtml(s.updatedByName || s.addedBy || '-')}</div><div class="text-[9px] text-slate-400">${escapeHtml(transactionDate(s))}</div></td>
      <td class="px-4 py-4 text-center">
        <button onclick="deleteSale('${s.id}')" class="icon-btn text-sm" title="حذف التعويض">🗑️</button>
      </td>
    </tr>
  `;
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
    const list = liveRecords(sales).filter((s) => new Date(transactionDate(s)) >= limit);
    const saleList = activeSales(list);
    const total = saleList.reduce((sum, s) => sum + saleTrueProfit(s), 0);
    const compensation = compensationRecords(list).reduce((sum, s) => sum + compensationAmount(s), 0);
    return `
      <div class="metric-card text-center">
        <div class="metric-label">${label}</div>
        <div class="metric-value ${total >= 0 ? 'text-green-600' : 'text-red-600'}">${shekel(total)}</div>
        <div class="metric-note">${saleList.length} مبيعة • تعويضات ${shekel(compensation)}</div>
      </div>
    `;
  }).join('');
  renderServiceProfitList();
  renderPaymentMethodList();
  renderServiceCountList();
  renderServiceCompensationList();
  renderRiskSalesList();
  renderUserPerformanceList();
}

function aggregateSalesBy(keyFn) {
  const map = new Map();
  activeSales(liveRecords(sales)).forEach((s) => {
    const key = keyFn(s) || 'غير محدد';
    const old = map.get(key) || { revenue: 0, profit: 0, count: 0, compensation: 0 };
    old.revenue += n(s.price);
    old.profit += saleTrueProfit(s);
    old.count += 1;
    old.compensation += n(s.compensationCost);
    map.set(key, old);
  });
  return [...map.entries()];
}

function renderRanking(rootId, items, valueKey, emptyText = 'لا توجد بيانات.') {
  const root = byId(rootId);
  if (!root) return;
  root.innerHTML = items.length ? items.map(([label, v], idx) => `
    <div class="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-950/50 p-4 border dark:border-slate-800 gap-3">
      <div><div class="font-black">${idx + 1}. ${escapeHtml(label)}</div><div class="text-xs text-slate-500 font-bold">${v.count || 0} عملية • إيراد ${shekel(v.revenue || 0)}</div></div>
      <div class="font-black ${(v[valueKey] || 0) >= 0 ? 'text-green-600' : 'text-red-600'}">${valueKey === 'count' ? escapeHtml(v[valueKey]) : shekel(v[valueKey] || 0)}</div>
    </div>
  `).join('') : `<div class="text-center text-slate-500 font-bold py-6">${emptyText}</div>`;
}

function renderServiceProfitList() {
  const items = aggregateSalesBy((s) => s.service).sort((a, b) => b[1].profit - a[1].profit).slice(0, 10);
  renderRanking('serviceProfitList', items, 'profit');
}

function renderPaymentMethodList() {
  const items = aggregateSalesBy((s) => s.supplier || 'غير محدد').sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);
  renderRanking('paymentMethodList', items, 'revenue');
}

function renderServiceCountList() {
  const items = aggregateSalesBy((s) => s.service).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  renderRanking('serviceCountList', items, 'count');
}

function renderServiceCompensationList() {
  const map = new Map();
  liveRecords(sales).forEach((s) => {
    const key = s.service || s.linkedSaleService || 'غير محدد';
    const old = map.get(key) || { revenue: 0, profit: 0, count: 0, compensation: 0 };
    if (isCompensationRecord(s)) {
      old.compensation += compensationAmount(s);
      old.count += 1;
    } else if (n(s.compensationCost) > 0) {
      old.compensation += n(s.compensationCost);
      old.count += 1;
    }
    map.set(key, old);
  });
  const items = [...map.entries()].filter(([, v]) => v.compensation > 0).sort((a, b) => b[1].compensation - a[1].compensation).slice(0, 10);
  renderRanking('serviceCompensationList', items, 'compensation', 'لا توجد تعويضات مسجلة.');
}

function renderUserPerformanceList() {
  const items = aggregateSalesBy((s) => s.addedBy || s.updatedByName || 'غير محدد').sort((a, b) => b[1].profit - a[1].profit).slice(0, 10);
  renderRanking('userPerformanceList', items, 'profit');
}

function renderRiskSalesList() {
  const root = byId('riskSalesList');
  const risky = activeSales(liveRecords(sales)).filter((s) => {
    const margin = n(s.price) > 0 ? saleTrueProfit(s) / n(s.price) : 0;
    return saleTrueProfit(s) <= 0 || margin < 0.12;
  }).slice(0, 10);
  root.innerHTML = risky.length ? risky.map((s) => `
    <div class="flex justify-between rounded-2xl bg-red-50 dark:bg-red-950/10 p-4 border border-red-100 dark:border-red-900/40 gap-3">
      <div><div class="font-black">${escapeHtml(s.service)}</div><div class="text-xs text-slate-500 font-bold">${escapeHtml(s.clientName)} • ${escapeHtml(s.startDate)} • هامش ${n(s.price) > 0 ? ((saleTrueProfit(s) / n(s.price)) * 100).toFixed(2) : '0.00'}%</div></div>
      <div class="font-black text-red-600">${shekel(saleTrueProfit(s))}</div>
    </div>
  `).join('') : `<div class="text-center text-slate-500 font-bold py-6">لا توجد عمليات خطرة حالياً.</div>`;
}

function exportAnalyticsReport() {
  const rows = [['القسم', 'البند', 'عدد العمليات', 'الإيراد', 'الربح الحقيقي', 'التعويضات']];
  aggregateSalesBy((s) => s.service).forEach(([label, v]) => rows.push(['الخدمات', label, v.count, n(v.revenue).toFixed(3), n(v.profit).toFixed(3), n(v.compensation).toFixed(3)]));
  aggregateSalesBy((s) => s.supplier || 'غير محدد').forEach(([label, v]) => rows.push(['وسائل الدفع', label, v.count, n(v.revenue).toFixed(3), n(v.profit).toFixed(3), n(v.compensation).toFixed(3)]));
  aggregateSalesBy((s) => s.addedBy || 'غير محدد').forEach(([label, v]) => rows.push(['المستخدمين', label, v.count, n(v.revenue).toFixed(3), n(v.profit).toFixed(3), n(v.compensation).toFixed(3)]));
  downloadText('KlikStore_Analytics_' + todayISO() + '.csv', '\uFEFF' + rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8;');
  writeAudit('analytics_exported', { rows: rows.length - 1 });
}

function renderAlerts() {
  const expiring = activeSales(sales).filter((s) => ['soon', 'expired'].includes(statusOfSale(s).key)).sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
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
// Trash Bin
// ==========================================

function updateTrashCount() {
  const el = byId('trashCount');
  if (el) el.innerText = String(trashRecords(sales).length);
}

function renderTrash() {
  const root = byId('trashList');
  const btn = byId('emptyTrashBtn');
  if (!root) return;
  const items = trashRecords(sales).sort((a, b) => {
    const ad = a.deletedAt?.toDate ? a.deletedAt.toDate().getTime() : 0;
    const bd = b.deletedAt?.toDate ? b.deletedAt.toDate().getTime() : 0;
    return bd - ad;
  });
  updateTrashCount();
  if (btn) btn.classList.toggle('hidden', !isSuperAdmin() || items.length === 0);
  if (!items.length) {
    root.innerHTML = '<div class="p-8 text-center text-slate-500 font-bold">سلة المحذوفات فارغة.</div>';
    return;
  }
  root.innerHTML = items.map((s) => {
    const deletedTime = s.deletedAt?.toDate ? s.deletedAt.toDate().toLocaleString('ar') : (s.deletedDate || '-');
    const type = isCompensationRecord(s) ? 'تعويض من الطوارئ' : 'مبيعة';
    const value = isCompensationRecord(s) ? compensationAmount(s) : n(s.price);
    return '<div class="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-900">' +
      '<div><div class="font-black text-lg">' + escapeHtml(saleTitle(s)) + '</div>' +
      '<div class="text-xs text-slate-500 font-bold mt-1">' + escapeHtml(type) + ' • ' + escapeHtml(s.clientName || s.linkedSaleClientName || '-') + ' • ' + escapeHtml(transactionDate(s)) + '</div>' +
      '<div class="text-xs text-orange-500 font-black mt-2">حُذف بواسطة: ' + escapeHtml(s.deletedByName || s.deletedByEmail || '-') + ' • ' + escapeHtml(deletedTime) + '</div></div>' +
      '<div class="text-left lg:text-right"><div class="font-black ' + (isCompensationRecord(s) ? 'text-orange-500' : 'text-sky-500') + '">' + shekel(value) + '</div>' +
      '<div class="text-[11px] text-slate-500 font-bold">لا يوجد حذف فردي من السلة</div></div></div>';
  }).join('');
}

async function emptyTrash() {
  if (!isSuperAdmin()) return toast('لا تمتلك صلاحية تنفيذ هذا الإجراء.', 'error');
  const items = trashRecords(sales);
  if (!items.length) return toast('سلة المحذوفات فارغة.', 'info');
  if (!confirm('سيتم حذف ' + items.length + ' سجل من السلة نهائياً دفعة واحدة. لا يمكن حذف سجل واحد فقط من السلة. هل أنت متأكد؟')) return;
  const btn = byId('emptyTrashBtn');
  setLoading(btn, true, 'تفريغ السلة بالكامل');
  try {
    for (let i = 0; i < items.length; i += 400) {
      const batch = db.batch();
      items.slice(i, i + 400).forEach((item) => batch.delete(db.collection('sales').doc(item.id)));
      await batch.commit();
    }
    await writeAudit('trash_emptied', { count: items.length, emptiedByName: myProfile.permanentName });
    toast('تم تفريغ السلة بالكامل.', 'success');
  } catch (err) {
    toast(translateFirebaseError(err), 'error');
  } finally {
    setLoading(btn, false, 'تفريغ السلة بالكامل');
  }
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
  if (!isSuperAdmin()) return toast('هذه العملية للآدمن فقط.', 'error');
  const safe = cssId(id);
  const permanentName = byId(`un_${safe}`).value.trim();
  const role = byId(`ur_${safe}`).value;
  if (!permanentName) return toast('اسم المستخدم لا يمكن أن يكون فارغاً.', 'warning');
  try {
    const beforeUser = users.find((u) => u.id === id) || {};
    const before = { permanentName: beforeUser.permanentName || '', role: beforeUser.role || '' };
    const after = { permanentName, role };
    await db.collection('users').doc(id).update({ permanentName, role, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.email, updatedByName: myProfile.permanentName });
    await writeAudit('user_updated', { email: id, permanentName, role, before, after, changes: diffObjects(before, after) });
    toast('تم تحديث المستخدم.', 'success');
  } catch (err) {
    toast(translateFirebaseError(err), 'error');
  }
}

function renderAudit() {
  const root = byId('auditList');
  if (!root) return;
  populateAuditFilters();
  let items = [...auditLogs];
  const q = String(byId('auditSearch')?.value || '').trim().toLowerCase();
  const user = byId('auditUserFilter')?.value || 'ALL';
  const action = byId('auditActionFilter')?.value || 'ALL';
  const from = byId('auditDateFrom')?.value ? startOfDay(byId('auditDateFrom').value) : null;
  const to = byId('auditDateTo')?.value ? endOfDay(byId('auditDateTo').value) : null;

  items = items.filter((log) => {
    const created = auditDate(log);
    if (user !== 'ALL' && log.actorEmail !== user && log.actorName !== user) return false;
    if (action !== 'ALL' && log.action !== action) return false;
    if (from && (!created || created < from)) return false;
    if (to && (!created || created > to)) return false;
    if (q) {
      const hay = JSON.stringify({ action: actionLabel(log.action), actorName: log.actorName, actorEmail: log.actorEmail, payload: log.payload || {} }).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!items.length) {
    root.innerHTML = `<div class="p-8 text-center text-slate-500 font-bold">لا يوجد سجل نشاط مطابق للفلاتر.</div>`;
    return;
  }

  root.innerHTML = items.map((log) => {
    const time = auditDate(log) ? auditDate(log).toLocaleString('ar') : '...';
    const p = log.payload || {};
    const changes = Array.isArray(p.changes) ? p.changes : [];
    const details = changes.length ? `<details class="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border dark:border-slate-800 p-3"><summary class="cursor-pointer font-black text-xs text-sky-500">عرض تفاصيل قبل / بعد (${changes.length})</summary><div class="mt-3 overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="py-2 text-right">الحقل</th><th class="py-2 text-right">قبل</th><th class="py-2 text-right">بعد</th></tr></thead><tbody>${changes.map((c) => `<tr class="border-t dark:border-slate-800"><td class="py-2 font-black">${escapeHtml(fieldLabel(c.field))}</td><td class="py-2 text-slate-500">${escapeHtml(formatAuditValue(c.before))}</td><td class="py-2 text-emerald-600 font-bold">${escapeHtml(formatAuditValue(c.after))}</td></tr>`).join('')}</tbody></table></div></details>` : '';
    return `
      <div class="p-5 hover:bg-slate-50 dark:hover:bg-slate-900">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <div class="font-black text-base">${actionIcon(log.action)} ${escapeHtml(actionLabel(log.action))}</div>
            <div class="text-xs text-slate-500 font-bold mt-1">نفّذها: ${escapeHtml(log.actorName || '-')} • <span dir="ltr">${escapeHtml(log.actorEmail || '-')}</span> • ${escapeHtml(log.actorRole || '-')}</div>
            <div class="text-[11px] text-slate-400 font-bold mt-2 leading-6">${escapeHtml(auditSummary(log))}</div>
          </div>
          <div class="text-xs text-slate-500 font-bold whitespace-nowrap">${escapeHtml(time)}</div>
        </div>
        ${details}
      </div>
    `;
  }).join('');
}

function auditDate(log) {
  return log.createdAt?.toDate ? log.createdAt.toDate() : (log.createdAt ? new Date(log.createdAt) : null);
}

function populateAuditFilters() {
  const userSel = byId('auditUserFilter');
  const actionSel = byId('auditActionFilter');
  if (userSel && userSel.dataset.loaded !== String(auditLogs.length)) {
    const current = userSel.value || 'ALL';
    const people = [...new Map(auditLogs.map((l) => [l.actorEmail || l.actorName || '', { email: l.actorEmail || '', name: l.actorName || l.actorEmail || '' }])).values()].filter((x) => x.email || x.name);
    userSel.innerHTML = '<option value="ALL">كل المستخدمين</option>' + people.map((u) => `<option value="${escapeHtml(u.email || u.name)}">${escapeHtml(u.name)}${u.email ? ' - ' + escapeHtml(u.email) : ''}</option>`).join('');
    userSel.value = [...userSel.options].some((o) => o.value === current) ? current : 'ALL';
    userSel.dataset.loaded = String(auditLogs.length);
  }
  if (actionSel && actionSel.dataset.loaded !== String(auditLogs.length)) {
    const current = actionSel.value || 'ALL';
    const actions = [...new Set(auditLogs.map((l) => l.action).filter(Boolean))].sort();
    actionSel.innerHTML = '<option value="ALL">كل الحركات</option>' + actions.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(actionLabel(a))}</option>`).join('');
    actionSel.value = [...actionSel.options].some((o) => o.value === current) ? current : 'ALL';
    actionSel.dataset.loaded = String(auditLogs.length);
  }
}

function auditSummary(log) {
  const p = log?.payload || {};
  if (log.action === 'login_success') return 'تسجيل دخول ناجح للنظام';
  if (log.action === 'trash_emptied') return 'تم تفريغ ' + (p.count || 0) + ' سجل من السلة';
  if (log.action === 'backup_exported') return 'تم تصدير نسخة احتياطية تحتوي على ' + (p.totalDocuments || 0) + ' سجل';
  if (log.action === 'backup_restored') return 'تمت استعادة نسخة احتياطية بوضع ' + (p.mode || '-') + '، عدد السجلات: ' + (p.totalDocuments || 0);
  if (log.action === 'settings_updated') return 'تم تعديل نسب التقسيمات: أرباح ' + (p.after?.profitRatio ?? '-') + '%، طوارئ ' + (p.after?.emergencyRatio ?? '-') + '%، رأس مال ' + (p.after?.capitalRatio ?? '-') + '%';
  const bits = [];
  if (p.service) bits.push(p.service);
  if (p.clientName) bits.push(p.clientName);
  if (p.price !== undefined) bits.push('قيمة: ' + shekel(p.price));
  if (p.trueProfit !== undefined) bits.push('ربح حقيقي: ' + shekel(p.trueProfit));
  if (p.amount !== undefined) bits.push('تعويض: ' + shekel(p.amount));
  if (p.source) bits.push('المصدر: ' + p.source);
  if (p.deletedByName) bits.push('الحذف بواسطة: ' + p.deletedByName);
  return bits.join(' • ') || '-';
}

function actionIcon(action) {
  if (String(action).includes('created')) return '➕';
  if (String(action).includes('updated')) return '✏️';
  if (String(action).includes('trash') || String(action).includes('deleted')) return '🗑️';
  if (String(action).includes('backup')) return '💾';
  if (String(action).includes('compensation')) return '🛠️';
  if (String(action).includes('login')) return '🔐';
  return '🧩';
}

function actionLabel(action) {
  const labels = {
    login_success: 'تسجيل دخول',
    sale_created: 'إضافة مبيعة',
    sale_updated: 'تعديل مبيعة',
    sale_deleted: 'حذف مبيعة نهائي',
    sale_moved_to_trash: 'نقل عملية إلى سلة المحذوفات',
    trash_emptied: 'تفريغ سلة المحذوفات بالكامل',
    compensation_created: 'تسجيل تعويض من الطوارئ',
    user_updated: 'تحديث مستخدم',
    user_created_profile: 'إنشاء ملف مستخدم',
    password_updated: 'تحديث كلمة مرور',
    backup_exported: 'تصدير نسخة احتياطية',
    backup_restored: 'استعادة نسخة احتياطية',
    settings_updated: 'تحديث إعدادات النسب',
    audit_exported: 'تصدير سجل النشاط',
    analytics_exported: 'تصدير تقرير التحليل'
  };
  return labels[action] || action || 'نشاط';
}

function fieldLabel(field) {
  const labels = {
    service: 'الخدمة', clientName: 'العميل', clientPhone: 'الهاتف', price: 'الإيراد', trueProfit: 'الربح الحقيقي', accountStatus: 'حالة الحساب', paymentMethod: 'وسيلة الدفع', date: 'التاريخ', permanentName: 'اسم المستخدم', role: 'الصلاحية', isDeleted: 'محذوف', deletedByName: 'حذف بواسطة', deletedDate: 'تاريخ الحذف', profitRatio: 'نسبة الأرباح', emergencyRatio: 'نسبة الطوارئ', capitalRatio: 'نسبة رأس المال'
  };
  return labels[field] || field;
}

function formatAuditValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(Number(value.toFixed(3)));
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function exportAuditCsv() {
  const rows = [['التاريخ', 'نوع الحركة', 'المستخدم', 'البريد', 'الدور', 'الملخص']];
  auditLogs.forEach((log) => {
    rows.push([
      auditDate(log) ? auditDate(log).toISOString() : '',
      actionLabel(log.action),
      log.actorName || '',
      log.actorEmail || '',
      log.actorRole || '',
      auditSummary(log)
    ]);
  });
  downloadText('KlikStore_Audit_Log_' + todayISO() + '.csv', '\uFEFF' + rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8;');
  writeAudit('audit_exported', { count: auditLogs.length });
}

// ==========================================
// Backup / Restore - SuperAdmin only
// ==========================================

const BACKUP_COLLECTIONS = ['sales', 'users', 'auditLogs', 'invites'];

function ensureSuperAdminAction() {
  if (!isSuperAdmin()) {
    toast('هذه العملية متاحة للآدمن فقط.', 'error');
    return false;
  }
  return true;
}

function serializeBackupValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (value && typeof value.toDate === 'function') return { __type: 'timestamp', value: value.toDate().toISOString() };
  if (value instanceof Date) return { __type: 'timestamp', value: value.toISOString() };
  if (Array.isArray(value)) return value.map(serializeBackupValue);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => { out[key] = serializeBackupValue(value[key]); });
    return out;
  }
  return value;
}

function restoreBackupValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(restoreBackupValue);
  if (typeof value === 'object') {
    if (value.__type === 'timestamp' && value.value) return new Date(value.value);
    const out = {};
    Object.keys(value).forEach((key) => { out[key] = restoreBackupValue(value[key]); });
    return out;
  }
  return value;
}

async function getCollectionBackup(collectionName) {
  const snap = await db.collection(collectionName).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: serializeBackupValue(doc.data()) }));
}

function countBackupDocuments(collections) {
  return Object.values(collections || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

async function exportFullBackup() {
  if (!ensureSuperAdminAction()) return;
  const btn = byId('backupExportBtn');
  setLoading(btn, true, 'جاري تصدير النسخة...');
  const errors = {};
  const collections = {};
  try {
    for (const name of BACKUP_COLLECTIONS) {
      try {
        collections[name] = await getCollectionBackup(name);
      } catch (err) {
        console.error('Backup collection failed:', name, err);
        collections[name] = [];
        errors[name] = err.message || String(err);
      }
    }
    const backup = {
      app: 'Klik Store ERP',
      version: 2,
      backupType: 'full-json',
      generatedAt: new Date().toISOString(),
      generatedBy: { email: currentUser?.email || '', name: myProfile.permanentName || '', role: myProfile.role || '' },
      systemSettings,
      collections,
      errors
    };
    const total = countBackupDocuments(collections);
    const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadText('KlikStore_Backup_' + date + '.json', JSON.stringify(backup, null, 2), 'application/json;charset=utf-8;');
    if (byId('backupExportInfo')) byId('backupExportInfo').innerText = 'آخر تصدير: ' + total + ' سجل. ' + (Object.keys(errors).length ? 'بعض المجموعات لم تُقرأ بسبب الصلاحيات.' : 'تم تصدير كل المجموعات المتاحة.');
    await writeAudit('backup_exported', { totalDocuments: total, collections: Object.keys(collections), errors: Object.keys(errors) });
    toast('تم تصدير النسخة الاحتياطية.', 'success');
  } catch (err) {
    console.error(err);
    toast('فشل تصدير النسخة الاحتياطية.', 'error');
  } finally {
    setLoading(btn, false, 'تصدير نسخة احتياطية الآن');
  }
}

function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch (err) { reject(new Error('ملف النسخة ليس JSON صالحاً.')); }
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
    reader.readAsText(file, 'utf-8');
  });
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('ملف النسخة غير صالح.');
  if (!payload.collections || typeof payload.collections !== 'object') throw new Error('ملف النسخة لا يحتوي على collections.');
  const keys = Object.keys(payload.collections).filter((key) => BACKUP_COLLECTIONS.includes(key));
  if (!keys.length) throw new Error('لا توجد مجموعات قابلة للاستعادة داخل الملف.');
  keys.forEach((key) => {
    if (!Array.isArray(payload.collections[key])) throw new Error('تنسيق المجموعة غير صالح: ' + key);
    payload.collections[key].forEach((item) => {
      if (!item || typeof item.id !== 'string' || !item.id || typeof item.data !== 'object') throw new Error('يوجد سجل غير صالح داخل المجموعة: ' + key);
    });
  });
  return keys;
}

async function commitBatchOperations(operations) {
  let batch = db.batch();
  let count = 0;
  for (const op of operations) {
    if (op.type === 'delete') batch.delete(op.ref);
    if (op.type === 'set') batch.set(op.ref, op.data, { merge: false });
    count += 1;
    if (count >= 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

async function restoreFullBackup() {
  if (!ensureSuperAdminAction()) return;
  const input = byId('backupFileInput');
  const file = input?.files?.[0];
  if (!file) return toast('اختر ملف النسخة الاحتياطية أولاً.', 'warning');
  const replaceMode = !!byId('backupReplaceMode')?.checked;
  const message = replaceMode ? 'سيتم حذف البيانات الحالية في المجموعات الموجودة بالنسخة ثم استعادتها من الملف. هل أنت متأكد؟' : 'سيتم دمج بيانات النسخة مع البيانات الحالية بدون حذف الموجود. هل تريد المتابعة؟';
  if (!confirm(message)) return;
  if (replaceMode) {
    const typed = prompt('للتأكيد اكتب RESTORE');
    if (typed !== 'RESTORE') return toast('تم إلغاء الاستعادة.', 'warning');
  }
  const btn = byId('backupRestoreBtn');
  setLoading(btn, true, 'جاري الاستعادة...');
  try {
    const payload = await readBackupFile(file);
    const keys = validateBackupPayload(payload);
    const operations = [];
    if (replaceMode) {
      for (const key of keys) {
        const current = await db.collection(key).get();
        current.docs.forEach((doc) => operations.push({ type: 'delete', ref: db.collection(key).doc(doc.id) }));
      }
    }
    keys.forEach((key) => {
      payload.collections[key].forEach((item) => operations.push({ type: 'set', ref: db.collection(key).doc(item.id), data: restoreBackupValue(item.data) }));
    });
    await commitBatchOperations(operations);
    if (payload.systemSettings && typeof payload.systemSettings === 'object') {
      systemSettings = { profitRatio: n(payload.systemSettings.profitRatio) || 70, emergencyRatio: n(payload.systemSettings.emergencyRatio) || 15, capitalRatio: n(payload.systemSettings.capitalRatio) || 15 };
      await db.collection('users').doc(ADMIN_EMAIL).set({ systemSettings }, { merge: true });
    }
    const total = countBackupDocuments(Object.fromEntries(keys.map((key) => [key, payload.collections[key]])));
    await writeAudit('backup_restored', { mode: replaceMode ? 'استبدال كامل' : 'دمج', totalDocuments: total, collections: keys, sourceGeneratedAt: payload.generatedAt || '' });
    toast('تمت استعادة النسخة الاحتياطية بنجاح.', 'success');
    input.value = '';
  } catch (err) {
    console.error(err);
    toast(err.message || 'فشلت استعادة النسخة الاحتياطية.', 'error');
  } finally {
    setLoading(btn, false, 'استعادة النسخة المحددة');
  }
}

// ==========================================
// System Settings - SuperAdmin
// ==========================================

async function loadSystemSettings() {
  try {
    const doc = await db.collection('users').doc(ADMIN_EMAIL).get();
    const saved = doc.exists ? doc.data().systemSettings : null;
    if (saved && typeof saved === 'object') {
      systemSettings = {
        profitRatio: n(saved.profitRatio) || 70,
        emergencyRatio: n(saved.emergencyRatio) || 15,
        capitalRatio: n(saved.capitalRatio) || 15
      };
    }
  } catch (err) {
    console.warn('Settings load failed', err);
  }
  renderSettings();
}

function renderSettings() {
  if (!byId('setProfitRatio')) return;
  byId('setProfitRatio').value = ratioValue('profitRatio', 70);
  byId('setEmergencyRatio').value = ratioValue('emergencyRatio', 15);
  byId('setCapitalRatio').value = ratioValue('capitalRatio', 15);
}

async function saveSystemSettings() {
  if (myProfile.role !== 'SuperAdmin') return toast('إعدادات النسب للآدمن فقط.', 'error');
  const profitRatio = n(byId('setProfitRatio')?.value);
  const emergencyRatio = n(byId('setEmergencyRatio')?.value);
  const capitalRatio = n(byId('setCapitalRatio')?.value);
  const total = profitRatio + emergencyRatio + capitalRatio;
  if ([profitRatio, emergencyRatio, capitalRatio].some((v) => v < 0 || v > 100)) return toast('كل نسبة يجب أن تكون بين 0 و 100.', 'warning');
  if (Math.abs(total - 100) > 0.0001) return toast('مجموع النسب يجب أن يساوي 100%. المجموع الحالي: ' + total.toFixed(3) + '%.', 'warning');
  const btn = byId('saveSettingsBtn');
  setLoading(btn, true, 'جاري الحفظ...');
  const before = plainCopy(systemSettings);
  try {
    systemSettings = { profitRatio, emergencyRatio, capitalRatio };
    await db.collection('users').doc(ADMIN_EMAIL).set({
      systemSettings,
      systemSettingsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      systemSettingsUpdatedBy: currentUser.email,
      systemSettingsUpdatedByName: myProfile.permanentName
    }, { merge: true });
    await writeAudit('settings_updated', { before, after: plainCopy(systemSettings), changes: diffObjects(before, systemSettings) });
    calculateFinancialPreview();
    populateDash();
    updateAnalytics();
    toast('تم حفظ إعدادات النسب.', 'success');
  } catch (err) {
    console.error(err);
    toast(translateFirebaseError(err), 'error');
  } finally {
    setLoading(btn, false, 'حفظ إعدادات النسب');
  }
}

// ==========================================
// Export
// ==========================================

function exportData(period) {
  const now = new Date();
  let filtered = liveRecords(sales);
  if (period === 'week') {
    const limit = new Date(now.getTime() - 7 * 86400000);
    filtered = sales.filter((s) => new Date(s.startDate) >= limit);
  } else if (period === 'month') {
    const currentMonth = now.toISOString().slice(0, 7);
    filtered = sales.filter((s) => String(s.startDate || '').startsWith(currentMonth));
  }
  if (!filtered.length) return toast('لا توجد بيانات لهذا النطاق.', 'warning');

  const headers = ['نوع الحركة', 'التاريخ', 'الخدمة', 'العميل', 'الهاتف', 'وسيلة الدفع', 'عملة الشراء', 'حالة الحساب', 'الإيراد', 'تكلفة الشراء', 'تعويض فوري', 'تعويض من الطوارئ', 'الربح الحقيقي', 'رأس مال إضافي', 'رصيد/أثر الطوارئ', 'صافي أرباح', 'المسؤول', 'تاريخ الانتهاء'];
  const csvRows = [headers.join(',')];
  filtered.forEach((s) => {
    const row = [
      isCompensationRecord(s) ? 'تعويض من الطوارئ' : 'مبيعة', transactionDate(s), s.service || s.linkedSaleService || '', s.clientName || s.linkedSaleClientName || '', s.clientPhone || s.linkedSaleClientPhone || '', s.supplier || '', s.purchaseCurrency || 'USD', s.accountStatus || (isCompensationRecord(s) ? 'تعويض من الطوارئ' : 'فعال'),
      n(s.price).toFixed(3), n(s.costILS).toFixed(3), (isCompensationRecord(s) ? 0 : n(s.compensationCost)).toFixed(3), (isCompensationRecord(s) ? compensationAmount(s) : 0).toFixed(3), saleTrueProfit(s).toFixed(3), n(s.extraCapital).toFixed(3), n(s.emergency).toFixed(3), n(s.profit).toFixed(3),
      s.addedBy || '', s.endDate || ''
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
  if (window.innerWidth < 768) byId('mainSidebar')?.classList.add('sidebar-collapsed');
};
