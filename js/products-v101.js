let siteData;
let activeCategory=new URLSearchParams(location.search).get('category')||'all';
let searchQuery='';
let shownCount=20;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
function shuffleProducts(list){
  const out=[...(Array.isArray(list)?list:[])];
  for(let i=out.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [out[i],out[j]]=[out[j],out[i]];
  }
  return out;
}
const STORE_API_BASE=String(window.INKWAVES_PAYMENT_API_BASE||'').replace(/\/$/,'');
const storeApiUrl=path=>`${STORE_API_BASE}${path.startsWith('/')?path:`/${path}`}`;
async function waitForFirebase(){
  if(window.INKWAVES_FIREBASE) return window.INKWAVES_FIREBASE;
  return await new Promise((resolve,reject)=>{
    let finished=false;
    const done=()=>{if(finished)return; if(window.INKWAVES_FIREBASE){finished=true;clearInterval(poll);clearTimeout(timeout);resolve(window.INKWAVES_FIREBASE)}};
    const poll=setInterval(done,100);
    const timeout=setTimeout(()=>{if(!finished){finished=true;clearInterval(poll);reject(new Error('Firebase catalog did not load. Please refresh the page.'))}},15000);
    window.addEventListener('inkwaves-firebase-ready',done,{once:true});
    done();
  });
}
async function firebaseSiteData(base){
  const firebase=await waitForFirebase();
  return firebase.loadMergedData(base);
}
const formatINR=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v||0);
function wireImageFallbacks(scope=document){scope.querySelectorAll('img').forEach(img=>{if(img.dataset.fallbackBound)return;img.dataset.fallbackBound='1';img.addEventListener('error',()=>{img.src='assets/image-fallback.svg';},{once:true});});}
function optimizedImageUrl(src,width=720){const value=String(src||'');return value.includes('drive.google.com/thumbnail')?value.replace(/([?&]sz=)w\d+/,'$1w'+width):value}
const requestedProductMedia=new Set();
async function hydrateVisibleProductMedia(list){if(!window.INKWAVES_FIREBASE||typeof window.INKWAVES_FIREBASE.loadProductMedia!=='function')return;const missing=(list||[]).filter(p=>p&&!p.image&&!requestedProductMedia.has(String(p.id)));if(!missing.length)return;missing.forEach(p=>requestedProductMedia.add(String(p.id)));try{const media=await window.INKWAVES_FIREBASE.loadProductMedia(missing.map(p=>p.id));missing.forEach(p=>{const src=media[p.id];if(!src)return;p.image=src;document.querySelectorAll(`[data-product-media=\"${CSS.escape(String(p.id))}\"]`).forEach(img=>img.src=optimizedImageUrl(src,720))})}catch(e){console.warn('InkWaves product images could not be loaded:',e)}}

async function loadProductsData(){
  siteData=window.INKWAVE_DEFAULT_DATA?clone(window.INKWAVE_DEFAULT_DATA):null;
  if((location.protocol==='http:'||location.protocol==='https:')&&siteData){
    siteData=await firebaseSiteData(siteData);
  }
  if(!siteData)throw new Error('Store data is missing.');
  siteData.products=shuffleProducts(siteData.products||[]);
  renderShell();
  renderCatalog();
}
function sameCategory(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase()}
function categoryName(id){return(siteData.categories||[]).find(c=>sameCategory(c.id,id))?.name||id||'InkWave';}
function sizeOrder(){return['A6','A5','A4','A3'].filter(k=>siteData.commerce?.sizes?.[k]);}
function productSizes(p){const own=p?.sizes&&Object.keys(p.sizes).length?p.sizes:null;return sizeOrder().filter(k=>!own||(own[k]&&own[k].enabled!==false))}
function productPrice(p,k){const own=p?.sizes?.[k];return own&&own.price!==null&&own.price!==undefined?Number(own.price):Number(siteData.commerce.sizes[k]?.price||0)}
function cartCount(){try{return JSON.parse(localStorage.getItem('inkwave-cart-v4')||'[]').reduce((s,i)=>s+(Number(i.quantity)||0),0)}catch{return 0}}
function renderShell(){
  $('#productsCartCount').textContent=cartCount();
  const cats=siteData.categories||[];
  const categorySelect=$('#productsCategorySelect');
  categorySelect.innerHTML=`<option value="all">All posters</option>${cats.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}`;
  categorySelect.value=activeCategory;
  $('#productsSizeBoard').innerHTML=sizeOrder().map(size=>{const o=siteData.commerce.sizes[size];return `<span><strong>${size} · ${formatINR(o.price)}</strong><small>${esc(o.detail||'')}<br>${esc(o.offer||'')}</small></span>`}).join('');
  if($('#footerEmail'))$('#footerEmail').href=`mailto:${siteData.settings?.email||'hello@inkwave.in'}`;
  if($('#footerInstagram'))$('#footerInstagram').href=siteData.settings?.instagram||'https://instagram.com';
}
function renderCatalog(){
  const q=searchQuery.trim().toLowerCase(),all=siteData.products||[],allList=all.filter(p=>(activeCategory==='all'||sameCategory(p.category,activeCategory))&&`${p.name} ${p.description||''} ${categoryName(p.category)}`.toLowerCase().includes(q)),list=allList.slice(0,shownCount);
  $('#productsGrid').innerHTML=list.map(p=>{const sizes=productSizes(p),lowest=sizes.length?Math.min(...sizes.map(k=>productPrice(p,k))):0,desc=(p.description||'300 GSM matte laminated poster from the InkWaves collection.').trim(),src=optimizedImageUrl(p.image||'assets/image-fallback.svg',720);return `<article class="product product-minimal product-catalog-card"><a class="product-image" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="View ${esc(p.name)}"><img data-product-media="${esc(p.id)}" referrerpolicy="no-referrer" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" decoding="async" />${p.badge?`<span class="product-badge">${esc(p.badge)}</span>`:''}</a><div class="product-meta"><span class="product-theme">${esc(categoryName(p.category))}</span><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3><p class="product-card-description">${esc(desc)}</p><div class="product-card-price-row"><div><small>FROM</small><strong>${formatINR(lowest)}</strong></div><label class="product-card-size"><span>SIZE</span><select data-card-size="${esc(p.id)}">${sizes.map(k=>`<option value="${k}">${k} · ${formatINR(productPrice(p,k))}</option>`).join('')}</select></label></div><button class="product-card-add" type="button" data-card-add="${esc(p.id)}" ${sizes.length?'':'disabled'}>${sizes.length?'ADD TO BAG':'UNAVAILABLE'}</button><a class="product-card-details" href="product.html?id=${encodeURIComponent(p.id)}">View details →</a></div></article>`}).join('');
  $('#productsCount').textContent=`Showing ${list.length} of ${allList.length} ${allList.length===1?'poster':'posters'}${activeCategory!=='all'?` in ${categoryName(activeCategory)}`:''}`;$('#productsEmpty').hidden=allList.length>0;const more=$('#productsLoadMore');if(more)more.hidden=list.length>=allList.length;wireImageFallbacks($('#productsGrid'));hydrateVisibleProductMedia(list);
}

function getCatalogCart(){try{return JSON.parse(localStorage.getItem('inkwave-cart-v4')||'[]')}catch{return[]}}
function addCatalogProduct(productId){
  const product=(siteData.products||[]).find(p=>p.id===productId);if(!product)return;
  const size=document.querySelector(`[data-card-size="${CSS.escape(productId)}"]`)?.value||'A4';
  const cart=getCatalogCart();
  cart.push({key:`${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,id:product.id,name:product.name,image:product.image,quantity:1,options:{size,finish:'Matte Laminated'}});
  localStorage.setItem('inkwave-cart-v4',JSON.stringify(cart));
  $('#productsCartCount').textContent=cart.reduce((s,i)=>s+(Number(i.quantity)||0),0);
  const button=document.querySelector(`[data-card-add="${CSS.escape(productId)}"]`);if(button){const old=button.textContent;button.textContent='ADDED ✓';button.classList.add('added');setTimeout(()=>{button.textContent=old;button.classList.remove('added')},1400)}
}
document.addEventListener('click',e=>{const add=e.target.closest('[data-card-add]');if(add){e.preventDefault();addCatalogProduct(add.dataset.cardAdd)}});

$('#productsCategorySelect').addEventListener('change',e=>{activeCategory=e.target.value;shownCount=20;const url=activeCategory==='all'?'products.html':`products.html?category=${encodeURIComponent(activeCategory)}`;history.replaceState(null,'',url);renderCatalog();});
$('#productsSearch').addEventListener('input',e=>{searchQuery=e.target.value;shownCount=20;renderCatalog();});
$('#productsLoadMore')?.addEventListener('click',()=>{shownCount+=20;renderCatalog();});
loadProductsData().catch(e=>{console.error('InkWaves products load failed:',e);$('#productsCount').textContent='Unable to load products. Please refresh this page.';$('#productsEmpty').hidden=false;$('#productsEmpty').textContent=e?.message||'Could not connect to the product catalog.';$('#productsLoadMore').hidden=true;});
