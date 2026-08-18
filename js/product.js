let siteData;
let product;
const $=s=>document.querySelector(s);
const formatINR=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v||0);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
const STORE_API_BASE=String(window.INKWAVES_PAYMENT_API_BASE||'').replace(/\/$/,'');
const storeApiUrl=path=>`${STORE_API_BASE}${path.startsWith('/')?path:`/${path}`}`;
async function firebaseSiteData(base){
  if(!window.INKWAVES_FIREBASE){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Firebase did not load.')),10000);window.addEventListener('inkwaves-firebase-ready',()=>{clearTimeout(timer);resolve()},{once:true})})}
  return window.INKWAVES_FIREBASE.loadMergedData(base);
}
function wireImageFallbacks(scope=document){scope.querySelectorAll('img').forEach(img=>{if(img.dataset.fallbackBound)return;img.dataset.fallbackBound='1';img.addEventListener('error',()=>{img.src='assets/image-fallback.svg';},{once:true});});}
const selection={size:'A4',finish:'Matte Laminated'};
let mockupIndex=0;

async function loadData(){
  siteData=window.INKWAVE_DEFAULT_DATA?clone(window.INKWAVE_DEFAULT_DATA):null;
  if((location.protocol==='http:'||location.protocol==='https:')&&siteData){
    siteData=await firebaseSiteData(siteData);
  }
  if(!siteData)throw new Error('Store data is missing.');
  const id=new URLSearchParams(location.search).get('id');
  product=(siteData.products||[]).find(p=>p.id===id)||(siteData.products||[])[0];
  if(!product)throw new Error('Product not found.');
  const available=sizeOrder(product);selection.size=available.includes('A4')?'A4':available[0]||'A4';
  render();
}
function categoryName(id){return(siteData.categories||[]).find(c=>c.id===id)?.name||'InkWaves'}
function sizeOrder(p=product){const global=['A6','A5','A4','A3'].filter(k=>siteData.commerce.sizes[k]),own=p?.sizes&&Object.keys(p.sizes).length?p.sizes:null;return global.filter(k=>!own||(own[k]&&own[k].enabled!==false))}
function productPrice(p,size){const own=p?.sizes?.[size];return own&&own.price!==null&&own.price!==undefined?Number(own.price):Number(siteData.commerce.sizes[size]?.price||0)}
function calcPrice(){const c=siteData.commerce;return productPrice(product,selection.size)+(c.finishes[selection.finish]?.price||0)}
function renderChoiceGroup(el,options,selected,type,isSize=false){el.innerHTML=Object.entries(options).map(([key,o])=>`<button class="detail-choice ${key===selected?'active':''}" data-choice="${type}" data-value="${esc(key)}"><strong>${esc(o.label||key)}</strong>${isSize?`<small>${esc(o.detail||'')} · ${formatINR(o.price)}</small>`:o.price?`<small>+ ${formatINR(o.price)}</small>`:'<small>Included</small>'}</button>`).join('')}
function renderMockups(){
  const track=$('#productMockupTrack');
  track.innerHTML=`<article class="product-mockup-slide direct-product-slide"><div class="direct-product-art"><img class="mockup-poster-art" referrerpolicy="no-referrer" src="${esc(product.image)}" alt="${esc(product.name)}" /></div></article>`;
  $('#productMockupDots').innerHTML='';
  $('#productMockupCounter').textContent='';
  $('#productMockupPrev').hidden=true;
  $('#productMockupNext').hidden=true;
  mockupIndex=0;
  track.style.transform='translateX(0)';
  wireImageFallbacks(track)
}
function updateMockupSlider(){const track=$('#productMockupTrack');track.style.transform='none';$('#productMockupCounter').textContent=''}
function changeMockup(){return}
function render(){
  document.title=`${product.name} — InkWaves`;
  $('#productName').textContent=product.name;$('#crumbName').textContent=product.name;$('#productCategory').textContent=categoryName(product.category);$('#productDescription').textContent=product.description||'';
  if(product.badge){$('#productBadge').hidden=false;$('#productBadge').textContent=product.badge}
  const sizes=sizeOrder(product),lowest=sizes.length?Math.min(...sizes.map(k=>productPrice(product,k))):0;$('#fromPrice').textContent=formatINR(lowest);
  renderChoiceGroup($('#detailSizeOptions'),Object.fromEntries(sizes.map(k=>[k,{...siteData.commerce.sizes[k],price:productPrice(product,k),label:k}])),selection.size,'size',true);
  renderChoiceGroup($('#detailFinishOptions'),siteData.commerce.finishes,selection.finish,'finish');
  renderMockups();renderOffers();renderRelated();updatePrice();updateCartCount();wireImageFallbacks(document);
  if($('#footerEmail'))$('#footerEmail').href=`mailto:${siteData.settings?.email||'hello@inkwave.in'}`;
  if($('#footerInstagram'))$('#footerInstagram').href=siteData.settings?.instagram||'https://instagram.com';
}
function updatePrice(){const s=siteData.commerce.sizes[selection.size];$('#sizeDetail').textContent=`${selection.size} · ${s.detail||''}`;$('#detailOffer').textContent=s.offer||'';$('#detailPrice').textContent=formatINR(calcPrice());document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('active',selection[b.dataset.choice]===b.dataset.value))}
function renderOffers(){const sizes=siteData.commerce.sizes;$('#productOfferGrid').innerHTML=['A3','A4','A5','A6'].filter(k=>sizes[k]).map(k=>`<article class="offer-card"><div><span class="size">${k}</span><span class="price">${formatINR(sizes[k].price)} each</span></div><strong>${esc(sizes[k].offer)}</strong><small>Automatically applied when the required number of ${k} posters is in your bag.</small></article>`).join('')}
function renderRelated(){
  const related=(siteData.products||[])
    .filter(p=>p.id!==product.id)
    .sort((a,b)=>Number(b.category===product.category)-Number(a.category===product.category))
    .slice(0,3);
  $('#relatedProducts').innerHTML=related.map(p=>`<article class="related-card"><a class="related-card-image" href="product.html?id=${encodeURIComponent(p.id)}"><img referrerpolicy="no-referrer" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></a><div class="related-card-copy"><span class="related-card-theme">${esc(categoryName(p.category))}</span><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3><p>From ${formatINR(Math.min(...sizeOrder(p).map(k=>productPrice(p,k)))||0)}</p><a class="related-card-link" href="product.html?id=${encodeURIComponent(p.id)}">View product →</a></div></article>`).join('');
  wireImageFallbacks($('#relatedProducts'))
}
function getCart(){try{return JSON.parse(localStorage.getItem('inkwave-cart-v4')||'[]')}catch{return[]}}
function updateCartCount(){const n=getCart().reduce((s,i)=>s+(Number(i.quantity)||0),0);$('#productCartCount').textContent=n}
function addToBag(){const cart=getCart();cart.push({key:`${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,id:product.id,name:product.name,image:product.image,quantity:1,options:{...selection}});localStorage.setItem('inkwave-cart-v4',JSON.stringify(cart));updateCartCount();$('#detailCartNote').innerHTML=`Added to your bag. <a href="index.html?cart=1"><strong>VIEW BAG →</strong></a>`;showToast('Added to your bag')}
function showToast(msg){const t=$('#productToast');t.textContent=msg;t.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>t.classList.remove('show'),2600)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-choice]');if(b){selection[b.dataset.choice]=b.dataset.value;updatePrice();return}const d=e.target.closest('[data-mockup-dot]');if(d){mockupIndex=Number(d.dataset.mockupDot)||0;updateMockupSlider()}});
$('#productMockupPrev').addEventListener('click',()=>changeMockup(-1));$('#productMockupNext').addEventListener('click',()=>changeMockup(1));$('#detailAddToBag').addEventListener('click',addToBag);
let touchX=0;$('#productMockupSlider').addEventListener('touchstart',e=>{touchX=e.touches[0].clientX},{passive:true});$('#productMockupSlider').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>45)changeMockup(dx<0?1:-1)},{passive:true});
loadData().catch(e=>{console.error(e);$('#productName').textContent='PRODUCT NOT FOUND';$('#productDescription').textContent='Return to the shop and choose another InkWaves poster.'});
