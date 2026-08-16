import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBwUGzv4TJoAbs0_WSAZe8pn0KHVdADcEg",
  authDomain: "inkwaves-51327.firebaseapp.com",
  projectId: "inkwaves-51327",
  storageBucket: "inkwaves-51327.firebasestorage.app",
  messagingSenderId: "743178781397",
  appId: "1:743178781397:web:37a2ef39977ec002c7585c",
  measurementId: "G-QEVB57QL8Q"
};

const ADMIN_UID = "WV1xGunguGhnMEl5XmelNztNVZx2";
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
let lastLoaded = null;

const clone = value => JSON.parse(JSON.stringify(value));
const clean = value => JSON.parse(JSON.stringify(value, (_, v) => v === undefined ? null : v));

function stripMeta(data) {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  delete out.updatedAt;
  delete out.createdAt;
  return out;
}

async function readCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...stripMeta(d.data()) })).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
}

async function loadMergedData(baseData) {
  const base = clone(baseData || { settings:{}, heroSlides:[], categories:[], products:[], commerce:{sizes:{},finishes:{}}, reviews:[] });
  try {
    const [products, categories, settingsSnap] = await Promise.all([
      readCollection('products'),
      readCollection('categories'),
      getDoc(doc(db, 'settings', 'store'))
    ]);
    if (settingsSnap.exists()) {
      const s = stripMeta(settingsSnap.data());
      if (s.settings) base.settings = { ...base.settings, ...s.settings };
      if (s.commerce) base.commerce = { ...base.commerce, ...s.commerce };
      if (Array.isArray(s.heroSlides)) base.heroSlides = s.heroSlides;
      if (Array.isArray(s.reviews)) base.reviews = s.reviews;
    }
    // Firestore is the source of truth for catalog data. Empty collections mean an empty catalog.
    base.products = products;
    base.categories = categories;
    lastLoaded = clone(base);
    return base;
  } catch (error) {
    console.error('InkWaves Firebase load failed:', error);
    throw new Error('Could not connect to the InkWaves Firebase catalog.');
  }
}

function stable(value) {
  return JSON.stringify(clean(value));
}

async function syncCollection(name, currentItems, previousItems) {
  const next = new Map((currentItems || []).map((item,index) => [String(item.id), clean({...item,order:index})]));
  const prev = new Map((previousItems || []).map(item => [String(item.id), clean(item)]));
  const jobs = [];
  for (const [id, item] of next) {
    const old = prev.get(id);
    if (!old || stable(old) !== stable(item)) {
      const payload = { ...item };
      delete payload.id;
      jobs.push(() => setDoc(doc(db, name, id), payload));
    }
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) jobs.push(() => deleteDoc(doc(db, name, id)));
  }
  // Limit parallel writes to avoid flooding browsers on larger catalogs.
  for (let i = 0; i < jobs.length; i += 20) {
    await Promise.all(jobs.slice(i, i + 20).map(fn => fn()));
  }
}

async function saveWholeStore(data) {
  requireAdmin();
  const current = clean(data);
  const previous = lastLoaded || { products:[], categories:[] };
  await Promise.all([
    syncCollection('products', current.products || [], previous.products || []),
    syncCollection('categories', current.categories || [], previous.categories || [])
  ]);
  const settingsPayload = clean({
    settings: current.settings || {},
    commerce: current.commerce || {},
    heroSlides: current.heroSlides || [],
    reviews: current.reviews || [],
    schemaVersion: 72
  });
  await setDoc(doc(db, 'settings', 'store'), settingsPayload);
  lastLoaded = clone(current);
  return clone(current);
}


function checkoutOrderId() {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0,6).toUpperCase();
  return `IW-${stamp}-${rand}`;
}

async function createCheckoutOrder(orderInput) {
  const id = String(orderInput?.id || checkoutOrderId());
  const createdAt = orderInput?.createdAt || new Date().toISOString();
  const items = [];
  const photoJobs = [];
  let photoSeq = 0;
  for (const row of Array.isArray(orderInput?.items) ? orderInput.items : []) {
    const item = clean({...row});
    const photos = Array.isArray(item.photos) ? item.photos : [];
    delete item.photos;
    if (photos.length) {
      item.photoCount = photos.length;
      item.photoCollection = true;
      photos.forEach((data,index) => {
        const photoId = String(photoSeq++).padStart(3,'0');
        photoJobs.push(() => setDoc(doc(db,'orders',id,'photos',photoId), clean({
          index,
          itemId: item.id || 'custom-polaroid',
          name: `Photo ${index+1}`,
          data,
          createdAt
        })));
      });
    }
    items.push(item);
  }
  const payload = clean({
    customer: orderInput?.customer || {},
    items,
    totals: orderInput?.totals || {},
    coupon: orderInput?.coupon || '',
    paymentStatus: 'pending',
    fulfillmentStatus: 'New',
    paymentSource: 'razorpay-secure-link',
    razorpayPaymentId: '',
    createdAt,
    updatedAt: createdAt
  });
  await setDoc(doc(db,'orders',id), payload);
  for (let i=0;i<photoJobs.length;i+=6) await Promise.all(photoJobs.slice(i,i+6).map(fn=>fn()));
  return {id, ...payload};
}

async function loadCheckoutOrders() {
  requireAdmin();
  const snap = await getDocs(collection(db,'orders'));
  return snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

async function loadOrderPhotos(orderId) {
  requireAdmin();
  const snap = await getDocs(collection(db,'orders',String(orderId),'photos'));
  return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(Number(a.index)||0)-(Number(b.index)||0));
}

async function updateCheckoutOrder(orderId, patch) {
  requireAdmin();
  await setDoc(doc(db,'orders',String(orderId)), clean({...patch, updatedAt:new Date().toISOString()}), {merge:true});
}

function currentUser() { return auth.currentUser; }
function isAdminUser(user = auth.currentUser) { return Boolean(user && user.uid === ADMIN_UID); }
function requireAdmin() {
  if (!isAdminUser()) throw new Error('Your Firebase admin session is not authorized.');
}

async function signInAdmin(email, password) {
  const credential = await signInWithEmailAndPassword(auth, String(email || '').trim(), password || '');
  if (!isAdminUser(credential.user)) {
    await signOut(auth);
    throw new Error('This Firebase account is not authorized for InkWaves admin.');
  }
  return credential.user;
}

async function signOutAdmin() { await signOut(auth); }
async function getAdminIdToken(forceRefresh=false) { requireAdmin(); return auth.currentUser.getIdToken(Boolean(forceRefresh)); }
function waitForAuth() {
  return new Promise(resolve => {
    const stop = onAuthStateChanged(auth, user => { stop(); resolve(user); });
  });
}

function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read this image. Try another JPG, PNG or WebP file.'));
    img.src = dataUrl;
  });
}

async function compressImageDataUrl(dataUrl, options = {}) {
  const maxChars = options.maxChars || 620000;
  const maxW = options.maxWidth || 1000;
  const maxH = options.maxHeight || 1250;
  const img = await imageFromDataUrl(dataUrl);
  let scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
  let quality = 0.82;
  let result = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    result = canvas.toDataURL('image/webp', quality);
    if (!result.startsWith('data:image/webp')) result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= maxChars) return result;
    if (quality > 0.5) quality -= 0.08;
    else scale *= 0.82;
  }
  if (result.length > 850000) throw new Error('Image is still too large after compression. Please use a simpler or smaller image.');
  return result;
}

window.INKWAVES_FIREBASE = {
  app, db, auth, ADMIN_UID,
  loadMergedData, saveWholeStore,
  createCheckoutOrder, loadCheckoutOrders, loadOrderPhotos, updateCheckoutOrder, checkoutOrderId,
  signInAdmin, signOutAdmin, getAdminIdToken, waitForAuth,
  currentUser, isAdminUser,
  compressImageDataUrl
};
window.dispatchEvent(new CustomEvent('inkwaves-firebase-ready'));
