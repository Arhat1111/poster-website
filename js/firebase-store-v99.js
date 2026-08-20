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
let lastCatalogDocs = { products: [], categories: [] };
const mediaCache = {
  product: new Map(),
  category: new Map(),
  review: new Map()
};

const clone = value => JSON.parse(JSON.stringify(value));
const clean = value => JSON.parse(JSON.stringify(value, (_, v) => v === undefined ? null : v));
const stable = value => JSON.stringify(clean(value));
const isInlineImage = value => typeof value === 'string' && value.startsWith('data:image/');

function stripMeta(data) {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  delete out.updatedAt;
  delete out.createdAt;
  return out;
}

async function readCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs
    .map(d => ({ id: d.id, ...stripMeta(d.data()) }))
    .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
}

function safeMediaId(value) {
  return encodeURIComponent(String(value || '').trim());
}

function mediaDocId(kind, id) {
  if (kind === 'review') return `review-media-${String(id)}`;
  return `${kind}-media-${safeMediaId(id)}`;
}

async function readMediaDoc(kind, id) {
  const key = String(id);
  const cache = mediaCache[kind];
  if (cache.has(key)) return cache.get(key);
  const snap = await getDoc(doc(db, 'settings', mediaDocId(kind, key)));
  const value = snap.exists() ? stripMeta(snap.data()) : null;
  cache.set(key, value);
  return value;
}

async function loadMediaBatch(kind, ids) {
  const unique = [...new Set((ids || []).map(String).filter(Boolean))];
  const out = {};
  for (let i = 0; i < unique.length; i += 12) {
    const slice = unique.slice(i, i + 12);
    const rows = await Promise.all(slice.map(async id => [id, await readMediaDoc(kind, id)]));
    rows.forEach(([id, value]) => { if (value) out[id] = value; });
  }
  return out;
}

async function loadProductMedia(ids) {
  const rows = await loadMediaBatch('product', ids);
  return Object.fromEntries(Object.entries(rows).map(([id, value]) => [id, value?.image || '']));
}

async function loadCategoryMedia(ids) {
  const rows = await loadMediaBatch('category', ids);
  return Object.fromEntries(Object.entries(rows).map(([id, value]) => [id, value?.image || '']));
}

async function loadReviewMedia(ids) {
  return loadMediaBatch('review', ids);
}

function reviewId(review, index) {
  const current = String(review?.id || '').trim();
  return current || `review-${String(index + 1).padStart(3,'0')}`;
}

async function loadMergedData(baseData, options = {}) {
  const includeAllMedia = Boolean(options.includeAllMedia);
  const base = clone(baseData || {
    settings:{}, heroSlides:[], categories:[], products:[], commerce:{sizes:{},finishes:{}}, reviews:[]
  });

  try {
    const [products, categories, settingsSnap] = await Promise.all([
      readCollection('products'),
      readCollection('categories'),
      getDoc(doc(db, 'settings', 'store'))
    ]);

    lastCatalogDocs = {
      products: clone(products),
      categories: clone(categories)
    };

    let legacyProducts = [];
    let legacyCategories = [];
    if (settingsSnap.exists()) {
      const s = stripMeta(settingsSnap.data());
      if (s.settings) base.settings = { ...base.settings, ...s.settings };
      if (s.commerce) base.commerce = { ...base.commerce, ...s.commerce };
      if (Array.isArray(s.heroSlides)) base.heroSlides = s.heroSlides;
      if (Array.isArray(s.reviews)) base.reviews = s.reviews;
      // Compatibility with older InkWaves builds that stored the catalog in
      // settings/store rather than one Firestore document per product/category.
      if (Array.isArray(s.products)) legacyProducts = s.products;
      if (Array.isArray(s.categories)) legacyCategories = s.categories;
    }

    // Merge the modern collections with any legacy catalog still stored in
    // settings/store. Modern documents win on duplicate IDs, while legacy-only
    // products/categories remain visible until they are deliberately migrated
    // or removed. This prevents older products from disappearing just because
    // one newer product exists in the dedicated Firestore collection.
    const mergeCatalog = (legacy, modern) => {
      const merged = new Map();
      (Array.isArray(legacy) ? legacy : []).forEach((item, index) => {
        const id = String(item?.id || '').trim();
        if (id) merged.set(id, { ...item, __sourceOrder: Number(item?.order ?? index) });
      });
      (Array.isArray(modern) ? modern : []).forEach((item, index) => {
        const id = String(item?.id || '').trim();
        if (id) {
          const prior = merged.get(id) || {};
          merged.set(id, { ...prior, ...item, __sourceOrder: Number(item?.order ?? prior.__sourceOrder ?? index) });
        }
      });
      return [...merged.values()]
        .sort((a,b)=>(Number(a.__sourceOrder)||0)-(Number(b.__sourceOrder)||0))
        .map(({__sourceOrder, ...item}) => item);
    };

    base.products = mergeCatalog(legacyProducts, products);
    base.categories = mergeCatalog(legacyCategories, categories);
    base.reviews = (base.reviews || []).map((review,index) => ({
      ...review,
      id: reviewId(review,index),
      image: review.image || '',
      productImages: Array.isArray(review.productImages) ? review.productImages : []
    }));

    if (includeAllMedia) {
      const [productMedia, categoryMedia, reviewMedia] = await Promise.all([
        loadProductMedia(base.products.map(p => p.id)),
        loadCategoryMedia(base.categories.map(c => c.id)),
        loadReviewMedia(base.reviews.map(r => r.id))
      ]);

      base.products = base.products.map(p => ({ ...p, image: p.image || productMedia[p.id] || '' }));
      base.categories = base.categories.map(c => ({ ...c, image: c.image || categoryMedia[c.id] || '' }));
      base.reviews = base.reviews.map(r => {
        const media = reviewMedia[r.id] || {};
        return {
          ...r,
          image: media.avatar || r.image || '',
          productImages: Array.isArray(media.productImages)
            ? media.productImages
            : (Array.isArray(r.productImages) ? r.productImages : [])
        };
      });
    }

    lastLoaded = clone(base);
    return base;
  } catch (error) {
    console.error('InkWaves Firebase load failed:', error);
    throw new Error('Could not connect to the InkWaves Firebase catalog.');
  }
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

  for (let i = 0; i < jobs.length; i += 20) {
    await Promise.all(jobs.slice(i, i + 20).map(fn => fn()));
  }
}

function catalogMetadata(item) {
  const out = clean(item || {});
  if (isInlineImage(out.image)) delete out.image;
  return out;
}

async function syncMediaDocs(kind, currentItems) {
  const jobs = [];
  for (const item of currentItems || []) {
    const id = String(item?.id || '');
    if (!id) continue;
    const image = isInlineImage(item?.image) ? item.image : '';
    const currentCached = mediaCache[kind].get(id);
    const cachedImage = currentCached?.image || '';

    if (image) {
      if (cachedImage !== image) {
        jobs.push(async () => {
          await setDoc(doc(db, 'settings', mediaDocId(kind, id)), { image });
          mediaCache[kind].set(id, { image });
        });
      }
    } else if (currentCached) {
      jobs.push(async () => {
        await deleteDoc(doc(db, 'settings', mediaDocId(kind, id)));
        mediaCache[kind].set(id, null);
      });
    }
  }

  for (let i = 0; i < jobs.length; i += 12) {
    await Promise.all(jobs.slice(i, i + 12).map(fn => fn()));
  }
}

async function syncReviewMedia(currentItems, previousItems) {
  const next = new Map((currentItems || []).map(item => [String(item.id), clean(item)]));
  const prev = new Map((previousItems || []).map(item => [String(item.id), clean(item)]));
  const jobs = [];

  for (const [id, item] of next) {
    const old = prev.get(id);
    if (!old || stable(old) !== stable(item)) {
      const payload = { ...item };
      delete payload.id;
      jobs.push(async () => {
        await setDoc(doc(db, 'settings', mediaDocId('review', id)), payload);
        mediaCache.review.set(id, payload);
      });
    }
  }

  for (const id of prev.keys()) {
    if (!next.has(id)) {
      jobs.push(async () => {
        await deleteDoc(doc(db, 'settings', mediaDocId('review', id)));
        mediaCache.review.set(id, null);
      });
    }
  }

  for (let i = 0; i < jobs.length; i += 12) {
    await Promise.all(jobs.slice(i, i + 12).map(fn => fn()));
  }
}

function safetyCheckCatalog(current, previous) {
  if ((previous.products || []).length > 0 && (current.products || []).length === 0) {
    throw new Error('Safety stop: refusing to replace a non-empty Firebase product catalog with an empty one. Remove products individually instead.');
  }
  if ((previous.categories || []).length > 0 && (current.categories || []).length === 0) {
    throw new Error('Safety stop: refusing to replace a non-empty Firebase category catalog with an empty one. Remove categories individually instead.');
  }
}

async function saveWholeStore(data) {
  requireAdmin();
  const current = clean(data);
  const previous = lastLoaded || { products:[], categories:[], reviews:[] };

  safetyCheckCatalog(current, previous);

  current.reviews = (current.reviews || []).map((review,index) => ({
    ...review,
    id: reviewId(review,index),
    productImages: Array.isArray(review.productImages) ? review.productImages.slice(0,4) : []
  }));

  // Ensure we know whether media docs already exist before deciding what to write.
  await Promise.all([
    loadProductMedia((current.products || []).map(p => p.id)),
    loadCategoryMedia((current.categories || []).map(c => c.id)),
    loadReviewMedia((current.reviews || []).map(r => r.id))
  ]);

  const productMetadata = (current.products || []).map(catalogMetadata);
  const categoryMetadata = (current.categories || []).map(catalogMetadata);

  const reviewMedia = current.reviews.map((review,index) => ({
    id: reviewId(review,index),
    avatar: review.image || '',
    productImages: Array.isArray(review.productImages) ? review.productImages.slice(0,4) : []
  }));
  const previousReviewMedia = (previous.reviews || []).map((review,index) => ({
    id: reviewId(review,index),
    avatar: review.image || '',
    productImages: Array.isArray(review.productImages) ? review.productImages.slice(0,4) : []
  }));

  await Promise.all([
    syncCollection('products', productMetadata, lastCatalogDocs.products || []),
    syncCollection('categories', categoryMetadata, lastCatalogDocs.categories || []),
    syncMediaDocs('product', current.products || []),
    syncMediaDocs('category', current.categories || []),
    syncReviewMedia(reviewMedia, previousReviewMedia)
  ]);

  const reviewMetadata = current.reviews.map(review => {
    const { image, productImages, ...metadata } = review;
    return metadata;
  });

  const settingsPayload = clean({
    settings: current.settings || {},
    commerce: current.commerce || {},
    heroSlides: current.heroSlides || [],
    reviews: reviewMetadata,
    schemaVersion: 98
  });

  await setDoc(doc(db, 'settings', 'store'), settingsPayload);

  lastCatalogDocs = {
    products: clone(productMetadata.map((item,index) => ({...item, order:index}))),
    categories: clone(categoryMetadata.map((item,index) => ({...item, order:index})))
  };
  lastLoaded = clone(current);
  return clone(current);
}

async function removeLegacyCatalogItem(field, id) {
  const settingsRef = doc(db, 'settings', 'store');
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) return;
  const current = stripMeta(snap.data());
  const list = Array.isArray(current?.[field]) ? current[field] : null;
  if (!list) return;
  const next = list.filter(item => String(item?.id || '') !== String(id));
  if (next.length !== list.length) {
    await setDoc(settingsRef, { [field]: clean(next) }, { merge: true });
  }
}

async function deleteProduct(productId) {
  requireAdmin();
  const id = String(productId || '').trim();
  if (!id) throw new Error('Product ID is missing.');

  await Promise.all([
    deleteDoc(doc(db, 'products', id)),
    deleteDoc(doc(db, 'settings', mediaDocId('product', id))),
    removeLegacyCatalogItem('products', id)
  ]);

  mediaCache.product.set(id, null);
  lastCatalogDocs.products = (lastCatalogDocs.products || []).filter(p => String(p.id) !== id);
  if (lastLoaded) lastLoaded.products = (lastLoaded.products || []).filter(p => String(p.id) !== id);
  return true;
}

async function deleteCategory(categoryId) {
  requireAdmin();
  const id = String(categoryId || '').trim();
  if (!id) throw new Error('Category ID is missing.');

  await Promise.all([
    deleteDoc(doc(db, 'categories', id)),
    deleteDoc(doc(db, 'settings', mediaDocId('category', id))),
    removeLegacyCatalogItem('categories', id)
  ]);

  mediaCache.category.set(id, null);
  lastCatalogDocs.categories = (lastCatalogDocs.categories || []).filter(c => String(c.id) !== id);
  if (lastLoaded) lastLoaded.categories = (lastLoaded.categories || []).filter(c => String(c.id) !== id);
  return true;
}

function hasInlineCatalogMedia(data) {
  return Boolean(
    (data?.products || []).some(p => isInlineImage(p?.image)) ||
    (data?.categories || []).some(c => isInlineImage(c?.image))
  );
}

async function optimizeCatalogMedia(data) {
  requireAdmin();
  if (!hasInlineCatalogMedia(data)) return false;
  await saveWholeStore(data);
  return true;
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
      item.attachmentType = item.customType === 'poster'
        ? 'custom-poster'
        : (item.customType === 'polaroid' ? 'custom-polaroid' : 'order-image');

      photos.forEach((data,index) => {
        const photoId = String(photoSeq++).padStart(3,'0');
        const label = item.customType === 'poster' ? 'Custom poster artwork' : `Polaroid photo ${index+1}`;
        photoJobs.push(() => setDoc(doc(db,'orders',id,'photos',photoId), clean({
          index,
          itemId: item.id || 'custom-polaroid',
          itemName: item.name || 'Custom item',
          kind: item.attachmentType,
          name: label,
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
  for (let i=0;i<photoJobs.length;i+=6) {
    await Promise.all(photoJobs.slice(i,i+6).map(fn=>fn()));
  }
  return {id, ...payload};
}

async function loadCheckoutOrders() {
  requireAdmin();
  const snap = await getDocs(collection(db,'orders'));
  return snap.docs
    .map(d => ({id:d.id, ...d.data()}))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

async function loadOrderPhotos(orderId) {
  requireAdmin();
  const snap = await getDocs(collection(db,'orders',String(orderId),'photos'));
  return snap.docs
    .map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(Number(a.index)||0)-(Number(b.index)||0));
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
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
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
  loadMergedData, saveWholeStore, optimizeCatalogMedia, deleteProduct, deleteCategory,
  loadProductMedia, loadCategoryMedia, loadReviewMedia,
  createCheckoutOrder, loadCheckoutOrders, loadOrderPhotos, updateCheckoutOrder, checkoutOrderId,
  signInAdmin, signOutAdmin, getAdminIdToken, waitForAuth,
  currentUser, isAdminUser,
  compressImageDataUrl
};
window.dispatchEvent(new CustomEvent('inkwaves-firebase-ready'));
