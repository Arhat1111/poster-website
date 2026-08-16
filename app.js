let siteData;
let products=[];
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const formatINR=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v||0);
const escapeHTML=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
const PAYMENT_API_BASE=String(window.INKWAVES_PAYMENT_API_BASE||'').trim().replace(/\/$/,'');
const PAYMENT_PAGE_URL=String(window.INKWAVES_RAZORPAY_PAYMENT_PAGE_URL||'').trim();
const paymentApi=path=>`${PAYMENT_API_BASE}${path.startsWith('/')?path:`/${path}`}`;
const STORE_API_BASE=String(window.INKWAVES_PAYMENT_API_BASE||'').replace(/\/$/,'');
const storeApiUrl=path=>`${STORE_API_BASE}${path.startsWith('/')?path:`/${path}`}`;
async function firebaseSiteData(base){
  if(!window.INKWAVES_FIREBASE){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Firebase did not load.')),10000);window.addEventListener('inkwaves-firebase-ready',()=>{clearTimeout(timer);resolve()},{once:true})})}
  return window.INKWAVES_FIREBASE.loadMergedData(base);
}
async function checkoutPost(action,nodePath,payload){if(!PAYMENT_API_BASE && location.hostname && !['localhost','127.0.0.1'].includes(location.hostname)){throw new Error('Payment backend is not connected yet. Deploy the included InkWaves Cloudflare Worker and paste its URL into payment-config.js.');}const candidates=PAYMENT_API_BASE?[paymentApi(nodePath)]:[`api.php?action=${encodeURIComponent(action)}`,paymentApi(nodePath)];let last=null;for(const url of candidates){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});const j=await r.json().catch(()=>({}));if(r.ok)return j;last=new Error(j.error||'Checkout request failed.')}catch(e){last=e}}throw last||new Error('Checkout backend is unavailable.')}
function wireImageFallbacks(scope=document){scope.querySelectorAll('img').forEach(img=>{if(img.dataset.fallbackBound)return;img.dataset.fallbackBound='1';img.addEventListener('error',()=>{img.classList.add('remote-image-failed');img.src='assets/image-fallback.svg';},{once:true});});}
function polaroidPrice(count){count=Math.max(0,Math.min(20,Number(count)||0));return count===20?100:count*10}
function normalizedCart(){try{return(JSON.parse(localStorage.getItem('inkwave-cart-v4')||'[]')||[]).map(i=>i.customType==='polaroid'?({...i,quantity:1,photoCount:Number(i.photoCount)||0,customPrice:polaroidPrice(i.photoCount),photos:Array.isArray(i.photos)?i.photos:[],options:{size:`${Number(i.photoCount)||0} polaroid${Number(i.photoCount)===1?'':'s'}`,finish:'Custom photo print'}}):({...i,options:{size:i.options?.size||'A4',finish:'Matte Laminated'}}))}catch{return[]}}
const state={activeProduct:null,activeArtwork:'',selection:{size:'A4',finish:'Matte Laminated'},cart:normalizedCart(),filter:'all',query:'',coupon:localStorage.getItem('inkwave-coupon-v4')||'',modalMockup:0,polaroidPhotos:[]};
const els={};
function mapElements(){Object.assign(els,{productGrid:$('#productGrid'),emptyState:$('#emptyState'),productModal:$('#productModal'),overlay:$('#overlay'),modalTitle:$('#modalTitle'),modalCategory:$('#modalCategory'),modalDescription:$('#modalDescription'),modalPrice:$('#modalPrice'),sizeOptions:$('#sizeOptions'),finishOptions:$('#finishOptions'),selectedSizeText:$('#selectedSizeText'),selectedOffer:$('#selectedOffer'),uploadBox:$('#uploadBox'),customUpload:$('#customUpload'),modalMockupTrack:$('#modalMockupTrack'),modalMockupDots:$('#modalMockupDots'),modalFullPageLink:$('#modalFullPageLink'),cartDrawer:$('#cartDrawer'),cartItems:$('#cartItems'),cartEmpty:$('#cartEmpty'),cartFooter:$('#cartFooter'),cartCount:$('#cartCount'),cartSubtotal:$('#cartSubtotal'),offerSavings:$('#offerSavings'),offerMessage:$('#offerMessage'),cartTotal:$('#cartTotal'),couponInput:$('#couponInput'),couponMessage:$('#couponMessage'),checkoutModal:$('#checkoutModal'),checkoutAmount:$('#checkoutAmount'),toast:$('#toast'),searchField:$('#searchField'),productSearch:$('#productSearch'),polaroidUpload:$('#polaroidUpload'),polaroidUploadCount:$('#polaroidUploadCount'),polaroidPreviewGrid:$('#polaroidPreviewGrid'),polaroidPreviewEmpty:$('#polaroidPreviewEmpty'),polaroidTotal:$('#polaroidTotal'),polaroidPriceHint:$('#polaroidPriceHint'),addPolaroidsToBag:$('#addPolaroidsToBag')})}
async function loadSite(){
  siteData=window.INKWAVE_DEFAULT_DATA?clone(window.INKWAVE_DEFAULT_DATA):null;
  if((location.protocol==='http:'||location.protocol==='https:')&&siteData){
    try{siteData=await firebaseSiteData(siteData)}catch(e){console.error(e);throw e}
  }
  if(!siteData)throw new Error('Store data missing.');
  products=siteData.products||[];applySiteContent();renderSlider();renderOffers();renderCategories();renderFilters();renderProducts();renderReviews();renderCart();renderPolaroidBuilder();bindEvents();
  if(new URLSearchParams(location.search).get('cart')==='1')setTimeout(openCart,120)
}
function applySiteContent(){const s=siteData.settings||{};const set=(id,v)=>{const e=$(id);if(e&&v!==undefined)e.textContent=v};set('#announcement',s.announcement);set('#heroKicker',s.heroKicker);set('#heroTitle',s.heroTitle);set('#heroAccent',s.heroAccent);set('#heroDescription',s.heroDescription);set('#customTitle',s.customTitle);set('#customDescription',s.customDescription);set('#categoriesTitle',s.categoriesTitle);set('#shopTitle',s.shopTitle);set('#aboutTitle',s.aboutTitle);set('#aboutBody',s.aboutBody);if($('#footerEmail'))$('#footerEmail').href=`mailto:${s.email||'hello@inkwave.in'}`;if($('#footerInstagram'))$('#footerInstagram').href=s.instagram||'https://instagram.com'}
function categoryName(id){return(siteData.categories||[]).find(c=>c.id===id)?.name||id||'InkWaves'}function sizeOrder(){return['A6','A5','A4','A3'].filter(k=>siteData.commerce.sizes[k])}function productSizes(p){const own=p?.sizes&&Object.keys(p.sizes).length?p.sizes:null;return sizeOrder().filter(k=>!own||(own[k]&&own[k].enabled!==false))}function productPrice(p,k){const own=p?.sizes?.[k];return own&&own.price!==null&&own.price!==undefined?Number(own.price):Number(siteData.commerce.sizes[k]?.price||0)}
function renderSlider(){const wall=$('#polaroidWall');if(!wall)return;const slides=(siteData.heroSlides||[]).map((s,i)=>({image:s.image,label:s.label||`InkWaves ${i+1}`,caption:s.caption||'Poster drop'}));const picks=(siteData.categories||[]).flatMap(c=>(siteData.products||[]).filter(p=>p.category===c.id).slice(0,2)).map(p=>({image:p.image,label:p.name,caption:`${categoryName(p.category)} · from ₹19`}));const base=[...slides,...picks];if(!base.length)return;wall.innerHTML=Array.from({length:3},(_,lane)=>{const ordered=base.map((_,i)=>base[(i+lane*3)%base.length]);const cards=ordered.map((item,i)=>`<article class="polaroid-card polaroid-tilt-${(i+lane)%4}"><div class="polaroid-photo"><img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.label)} poster"></div><div class="polaroid-copy"><strong>${escapeHTML(item.label)}</strong><span>${escapeHTML(item.caption)}</span></div></article>`).join('');return`<div class="polaroid-lane lane-${lane+1}"><div class="polaroid-run">${cards}${cards}</div></div>`}).join('');wireImageFallbacks(wall)}
function renderReviews(){const reviews=siteData.reviews||[],track=$('#reviewsTrack');if(!track)return;const stars=n=>'★'.repeat(Math.max(1,Math.min(5,Number(n)||5)))+'☆'.repeat(5-Math.max(1,Math.min(5,Number(n)||5)));track.innerHTML=reviews.map((r,i)=>`<article class="review-card"><div class="review-card-top"><span class="review-stars">${stars(r.rating)}</span><span class="review-index">${String(i+1).padStart(2,'0')}</span></div><blockquote>“${escapeHTML(r.text||'')}”</blockquote><div class="review-person"><strong>${escapeHTML(r.name||'Customer')}</strong><span>${escapeHTML(r.location||'')}</span></div>${r.product?`<small>${escapeHTML(r.product)}</small>`:''}</article>`).join('');const avg=reviews.length?reviews.reduce((a,r)=>a+(Number(r.rating)||5),0)/reviews.length:5;if($('#reviewAverage'))$('#reviewAverage').textContent=avg.toFixed(1);if($('#reviewCount'))$('#reviewCount').textContent=`${reviews.length} ${reviews.length===1?'review':'reviews'}`}
function renderOffers(){const sizes=siteData.commerce.sizes;$('#offerGrid').innerHTML=['A3','A4','A5','A6'].filter(k=>sizes[k]).map(k=>`<article class="offer-card"><div><span class="size">${k}</span><span class="price">${formatINR(sizes[k].price)} each</span></div><strong>${escapeHTML(sizes[k].offer)}</strong><small>Automatically applied when the required quantity of ${k} posters is in your bag.</small></article>`).join('')}
async function compressPolaroidPhoto(file){
  if(!file?.type?.startsWith('image/'))throw new Error('Please upload image files only.');
  if(file.size>12*1024*1024)throw new Error(`${file.name} is larger than 12 MB.`);
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=dataUrl});
  const maxW=480,maxH=600,scale=Math.min(1,maxW/img.width,maxH/img.height),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  return canvas.toDataURL('image/webp',.58);
}
function renderPolaroidBuilder(){
  if(!els.polaroidPreviewGrid)return;
  const count=state.polaroidPhotos.length,total=polaroidPrice(count);
  els.polaroidUploadCount.textContent=`${count} / 20`;
  els.polaroidTotal.textContent=formatINR(total);
  els.polaroidPriceHint.textContent=count===0?'Upload at least 1 photo':count===20?'20-photo bundle applied · you save ₹100':`${count} × ₹10`;
  els.addPolaroidsToBag.disabled=count<1||count>20;
  els.polaroidPreviewEmpty.hidden=count>0;
  els.polaroidPreviewGrid.innerHTML=state.polaroidPhotos.map((p,i)=>`<article class="polaroid-preview-card"><img src="${p.data}" alt="Custom polaroid photo ${i+1}"><button type="button" data-remove-polaroid-preview="${i}" aria-label="Remove photo ${i+1}">×</button><span>${String(i+1).padStart(2,'0')}</span></article>`).join('');
}
async function handlePolaroidUpload(files){
  const selected=[...files].filter(f=>f.type.startsWith('image/'));
  if(!selected.length)return showToast('Choose at least one JPG, PNG or WebP photo.');
  if(selected.length>20)showToast('Only the first 20 photos were selected.',4500);
  const use=selected.slice(0,20);els.addPolaroidsToBag.disabled=true;els.addPolaroidsToBag.textContent='PREPARING PHOTOS…';
  try{const photos=[];for(let i=0;i<use.length;i++){photos.push({name:use[i].name,data:await compressPolaroidPhoto(use[i])})}state.polaroidPhotos=photos;renderPolaroidBuilder();showToast(`${photos.length} photo${photos.length===1?'':'s'} ready for polaroid printing`)}catch(e){showToast(e.message||'One of the photos could not be prepared.',5500)}finally{els.addPolaroidsToBag.textContent='ADD POLAROIDS TO BAG →';els.addPolaroidsToBag.disabled=state.polaroidPhotos.length<1}
}
function addPolaroidsToBag(){
  const count=state.polaroidPhotos.length;if(count<1||count>20)return showToast('Upload between 1 and 20 photos first.');
  const price=polaroidPrice(count),photos=state.polaroidPhotos.map(p=>p.data);
  state.cart.push({key:`custom-polaroid-${Date.now()}-${Math.random().toString(16).slice(2)}`,id:'custom-polaroid',name:'Customized Polaroids',image:photos[0]||'assets/poster-custom.svg',quantity:1,customType:'polaroid',photoCount:count,customPrice:price,photos,options:{size:`${count} polaroid${count===1?'':'s'}`,finish:'Custom photo print'}});
  saveCart();state.polaroidPhotos=[];if(els.polaroidUpload)els.polaroidUpload.value='';renderPolaroidBuilder();showToast(`${count} custom polaroid${count===1?'':'s'} added to your bag`);setTimeout(openCart,180)
}

function renderCategories(){const cats=siteData.categories||[],section=$('#categories');if(section)section.hidden=cats.length===0;$('#categoryGrid').innerHTML=cats.map((c,i)=>`<a class="category-tile" style="--cat-accent:${escapeHTML(c.accent||'#eee')}" href="products.html?category=${encodeURIComponent(c.id)}"><span class="category-number">${String(i+1).padStart(2,'0')}</span><span class="category-art"><img src="${escapeHTML(c.image)}" alt="${escapeHTML(c.name)} poster category"></span><span class="category-info"><strong>${escapeHTML(c.name)}</strong><small>${escapeHTML(c.subtitle)}</small><b>SHOP CATEGORY →</b></span></a>`).join('');$('#categoryBar').innerHTML=`<a href="products.html">Shop all</a>${cats.map(c=>`<a href="products.html?category=${encodeURIComponent(c.id)}">${escapeHTML(c.name)}</a>`).join('')}<button data-custom-product>Custom</button>`;wireImageFallbacks($('#categoryGrid'))}
function renderFilters(){$('#filterChips').innerHTML=`<button class="chip active" data-filter="all">All posters</button>${(siteData.categories||[]).map(c=>`<button class="chip" data-filter="${escapeHTML(c.id)}">${escapeHTML(c.name)}</button>`).join('')}`}
function renderProducts(){const q=state.query.trim().toLowerCase(),filtered=products.filter(p=>(state.filter==='all'||p.category===state.filter)&&`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)),visible=filtered.slice(0,(state.filter==='all'&&!q)?15:30);els.productGrid.innerHTML=visible.map(p=>{const sizes=productSizes(p),lowest=sizes.length?Math.min(...sizes.map(k=>productPrice(p,k))):0;return`<article class="product home-product-card"><a class="product-image" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="View ${escapeHTML(p.name)}"><img referrerpolicy="no-referrer" src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" loading="lazy">${p.badge?`<span class="product-badge">${escapeHTML(p.badge)}</span>`:''}</a><div class="product-meta"><span class="product-theme">${escapeHTML(categoryName(p.category))}</span><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeHTML(p.name)}</a></h3><p class="product-card-description">${escapeHTML(p.description||'300 GSM matte laminated poster.')}</p><div class="home-product-bottom"><strong>From ${formatINR(lowest)}</strong><button type="button" data-quick-view="${escapeHTML(p.id)}" ${sizes.length?'':'disabled'}>${sizes.length?'CHOOSE SIZE + ADD':'UNAVAILABLE'}</button></div></div></article>`}).join('');els.emptyState.hidden=filtered.length>0;wireImageFallbacks(els.productGrid)}
function renderOptionButtons(container,options,selected,type,isSize=false){container.innerHTML=Object.entries(options).map(([key,opt])=>`<button class="option-btn ${selected===key?'active':''}" data-option-type="${type}" data-option="${escapeHTML(key)}">${escapeHTML(opt.label||key)}${isSize?`<br><small>${formatINR(opt.price)}</small>`:opt.price?`<br><small>+ ${formatINR(opt.price)}</small>`:''}</button>`).join('')}
function selectionPrice(){if(!state.activeProduct)return 0;const c=siteData.commerce;return productPrice(state.activeProduct,state.selection.size)+(c.finishes[state.selection.finish]?.price||0)}function updateModalPrice(){const s=siteData.commerce.sizes[state.selection.size];els.modalPrice.textContent=formatINR(selectionPrice());els.selectedSizeText.textContent=`${state.selection.size} · ${s.detail}`;els.selectedOffer.textContent=s.offer}
function renderModalMockups(){
  els.modalMockupTrack.innerHTML=`<div class="popup-mockup-slide direct-popup-slide"><div class="direct-popup-art"><img class="popup-poster-art" referrerpolicy="no-referrer" src="${escapeHTML(state.activeArtwork)}" alt="${escapeHTML(state.activeProduct.name)}"></div></div>`;
  els.modalMockupDots.innerHTML='';
  state.modalMockup=0;
  if($('#modalMockupPrev'))$('#modalMockupPrev').hidden=true;
  if($('#modalMockupNext'))$('#modalMockupNext').hidden=true;
  els.modalMockupTrack.style.transform='translateX(0)';
  wireImageFallbacks(els.modalMockupTrack);
}
function updateModalMockup(){els.modalMockupTrack.style.transform='translateX(0)'}
function moveModalMockup(){return}
function setModalArtwork(src){state.activeArtwork=src;els.modalMockupTrack.querySelectorAll('.popup-poster-art').forEach(img=>img.src=src)}
function showProductModal(p,custom=false){state.activeProduct=custom?{id:'custom',name:'Your Custom Poster',category:'custom',image:'assets/poster-custom.svg',description:'Upload your own photograph, artwork or design and turn it into a 300 GSM InkWaves print.',sizes:{}}:p;state.activeArtwork=state.activeProduct.image;const sizes=productSizes(state.activeProduct);state.selection={size:sizes.includes('A4')?'A4':sizes[0]||'A4',finish:'Matte Laminated'};els.modalTitle.textContent=state.activeProduct.name;els.modalCategory.textContent=custom?'CUSTOM BUILD':categoryName(state.activeProduct.category);els.modalDescription.textContent=state.activeProduct.description;els.customUpload.value='';els.uploadBox.hidden=!custom;els.modalFullPageLink.hidden=custom;els.modalFullPageLink.href=custom?'products.html':`product.html?id=${encodeURIComponent(state.activeProduct.id)}`;const sizeOptions=Object.fromEntries(sizes.map(k=>[k,{...siteData.commerce.sizes[k],price:productPrice(state.activeProduct,k)}]));renderOptionButtons(els.sizeOptions,sizeOptions,state.selection.size,'size',true);renderOptionButtons(els.finishOptions,siteData.commerce.finishes,state.selection.finish,'finish');renderModalMockups();updateModalPrice();closeMobileMenu();openLayer(els.productModal)}
function offerBasePrice(size,prices){const o=siteData.commerce.sizes[size];if(!o||!prices.length)return 0;let remaining=[...prices].sort((a,b)=>b-a),total=0;if(size==='A6'&&o.bundle20Price){while(remaining.length>=20){const group=remaining.splice(0,20),sum=group.reduce((a,b)=>a+b,0);total+=Math.min(sum,Number(o.bundle20Price)||sum)}}const gq=Math.max(1,Number(o.groupQty)||1),pq=Math.max(0,Number(o.payQty)||gq);if(gq>1&&pq<gq){const groups=Math.floor(remaining.length/gq),freeCount=groups*(gq-pq),sorted=[...remaining].sort((a,b)=>a-b),free=sorted.slice(0,freeCount).reduce((a,b)=>a+b,0);total+=remaining.reduce((a,b)=>a+b,0)-free}else total+=remaining.reduce((a,b)=>a+b,0);return total}
function calculateCart(){
  const c=siteData.commerce,sizePrices={};let rawBase=0,extras=0,specialBase=0;
  state.cart.forEach(item=>{
    const q=Number(item.quantity)||0;
    if(item.customType==='polaroid'||item.id==='custom-polaroid'){specialBase+=polaroidPrice(item.photoCount)*Math.max(1,q);return}
    const s=item.options?.size||'A4',finish=item.options?.finish||'Matte Laminated',p=item.id==='custom'?{sizes:{}}:products.find(x=>x.id===item.id),bp=p?productPrice(p,s):Number(c.sizes[s]?.price||0);
    sizePrices[s]=sizePrices[s]||[];for(let i=0;i<q;i++)sizePrices[s].push(bp);rawBase+=bp*q;extras+=(c.finishes[finish]?.price||0)*q
  });
  const offeredBase=Object.entries(sizePrices).reduce((sum,[s,prices])=>sum+offerBasePrice(s,prices),0),offerSavings=rawBase-offeredBase,rawSubtotal=rawBase+extras+specialBase,afterOffer=offeredBase+extras+specialBase,coupon=(state.coupon===(siteData.settings.couponCode||'').toUpperCase())?Math.round(afterOffer*(Number(siteData.settings.couponPercent)||0)/100):0,afterDiscount=afterOffer-coupon,shipping=0;
  return{rawSubtotal,offerSavings,coupon,shipping,total:afterDiscount,sizePrices}
}
function saveCart(){
  const safe=state.cart.map(i=>i.customType==='polaroid'?({...i,quantity:1,customPrice:polaroidPrice(i.photoCount),options:{size:`${i.photoCount} polaroid${i.photoCount===1?'':'s'}`,finish:'Custom photo print'}}):({...i,image:String(i.image||'').startsWith('data:')?'assets/poster-custom.svg':i.image,options:{size:i.options?.size||'A4',finish:'Matte Laminated'}}));
  try{localStorage.setItem('inkwave-cart-v4',JSON.stringify(safe))}catch(e){console.warn('Cart photo data could not be persisted.',e);localStorage.setItem('inkwave-cart-v4',JSON.stringify(safe.map(i=>i.customType==='polaroid'?({...i,photos:[],image:'assets/poster-custom.svg'}):i)))}renderCart()
}
function addToCart(){const item={key:`${state.activeProduct.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,id:state.activeProduct.id,name:state.activeProduct.name,image:state.activeArtwork,quantity:1,options:{...state.selection}};state.cart.push(item);saveCart();closeLayer(els.productModal);setTimeout(openCart,220);showToast('Added to your bag')}
function selectionPriceForItem(item){if(item.customType==='polaroid'||item.id==='custom-polaroid')return polaroidPrice(item.photoCount);const c=siteData.commerce,p=item.id==='custom'?{sizes:{}}:products.find(x=>x.id===item.id);return(p?productPrice(p,item.options?.size):Number(c.sizes[item.options?.size]?.price||0))+(c.finishes[item.options?.finish]?.price||0)}
function renderCart(){if(!siteData)return;els.cartCount.textContent=state.cart.reduce((s,i)=>s+i.quantity,0);els.cartItems.innerHTML=state.cart.map(item=>{const pol=item.customType==='polaroid'||item.id==='custom-polaroid';return`<article class="cart-item ${pol?'polaroid-cart-item':''}"><img src="${escapeHTML(item.image||'assets/poster-custom.svg')}" alt=""><div><h4>${escapeHTML(item.name)}</h4>${pol?`<p class="cart-polaroid-note">${item.photoCount} uploaded photo${item.photoCount===1?'':'s'} · custom polaroid print</p>${item.photoCount===20?'<span class="polaroid-bundle-badge">20 FOR ₹100 BUNDLE</span>':''}`:`<p>${escapeHTML(item.options?.size||'A4')} · ${escapeHTML(item.options?.finish||'Matte Laminated')}</p><div class="cart-qty"><button data-qty="minus" data-key="${item.key}">−</button><span>${item.quantity}</span><button data-qty="plus" data-key="${item.key}">+</button></div>`}</div><div><strong>${formatINR(selectionPriceForItem(item)*item.quantity)}</strong><button class="cart-remove" data-remove="${item.key}">Remove</button></div></article>`}).join('');wireImageFallbacks(els.cartItems);const t=calculateCart();els.cartSubtotal.textContent=formatINR(t.rawSubtotal);els.offerSavings.textContent=`− ${formatINR(t.offerSavings)}`;els.cartTotal.textContent=formatINR(t.total);els.checkoutAmount.textContent=formatINR(t.total);els.cartEmpty.hidden=state.cart.length>0;els.cartFooter.hidden=state.cart.length===0;els.couponInput.value=state.coupon;els.couponMessage.textContent=t.coupon?`${siteData.settings.couponCode} applied · saved ${formatINR(t.coupon)}`:'';els.offerMessage.textContent=t.offerSavings?`Size offers applied · you saved ${formatINR(t.offerSavings)}`:(state.cart.some(i=>i.customType==='polaroid')?'Your custom polaroid set is ready for checkout.':'Add more posters in the same size to unlock bundle offers.')}
function openLayer(el){el.hidden=false;els.overlay.classList.add('active');document.body.classList.add('locked');requestAnimationFrame(()=>el.classList.add('visible'))}function closeLayer(el){el.classList.remove('visible');setTimeout(()=>{el.hidden=true},200);els.overlay.classList.remove('active');document.body.classList.remove('locked')}function openCart(){els.cartDrawer.classList.add('open');els.cartDrawer.setAttribute('aria-hidden','false');els.overlay.classList.add('active');document.body.classList.add('locked')}function closeCart(){els.cartDrawer.classList.remove('open');els.cartDrawer.setAttribute('aria-hidden','true');els.overlay.classList.remove('active');document.body.classList.remove('locked')}function closeMobileMenu(){$('#mobileMenu').classList.remove('open');$('#menuButton').setAttribute('aria-expanded','false')}function showToast(msg,d=2800){els.toast.textContent=msg;els.toast.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>els.toast.classList.remove('show'),d)}function applyFilter(filter,scroll=true){state.filter=filter;$$('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));renderProducts();closeMobileMenu();if(scroll)$('#shop').scrollIntoView({behavior:'smooth',block:'start'})}
function startRazorpayPaymentPage(customer,totals){
  if(!PAYMENT_PAGE_URL)return false;
  let url;
  try{url=new URL(PAYMENT_PAGE_URL)}catch{return false}
  // Razorpay Payment Pages support pre-population through URL fields.
  // The configured hosted page remains the source of truth for payment collection.
  url.searchParams.set('amount',String(Math.round(totals.total)));
  if(customer?.name)url.searchParams.set('full_name',customer.name);
  if(customer?.email)url.searchParams.set('email',customer.email);
  if(customer?.phone)url.searchParams.set('phone',customer.phone);
  const summary=state.cart.map(i=>`${i.name||'InkWaves item'} x${Number(i.quantity)||1}`).join(', ').slice(0,180);
  url.searchParams.set('description',summary||'InkWaves order');
  sessionStorage.setItem('inkwaves-pending-order',JSON.stringify({createdAt:Date.now(),amount:totals.total,customer,cart:state.cart.map(i=>({id:i.id,name:i.name,quantity:i.quantity,options:i.options,customType:i.customType,photoCount:i.photoCount}))}));
  showToast('Opening Razorpay secure payment…',1800);
  setTimeout(()=>{window.location.assign(url.toString())},120);
  return true;
}

async function startRazorpayCheckout(customer){
  try{
    const totals=calculateCart();
    if(!state.cart.length)throw new Error('Your bag is empty.');
    if(!PAYMENT_API_BASE){
      if(startRazorpayPaymentPage(customer,totals))return;
      throw new Error('Razorpay payment page is not configured.');
    }
    if(!window.Razorpay)throw new Error('Razorpay Checkout could not load. Check your internet connection and try again.');
    const payload={amount:totals.total,cart:state.cart.map(item=>item.customType==='polaroid'?{id:'custom-polaroid',quantity:1,customType:'polaroid',photoCount:item.photoCount,photos:item.photos||[]}:({id:item.id,quantity:item.quantity,options:{size:item.options.size,finish:item.options.finish}})),coupon:state.coupon,customer};
    const order=await checkoutPost('create-order','/api/create-order',payload);
    const checkout=new Razorpay({
      key:order.keyId,
      amount:order.amount,
      currency:order.currency||'INR',
      name:'InkWaves',
      description:`InkWaves · ${state.cart.reduce((s,i)=>s+i.quantity,0)} poster(s)`,
      order_id:order.id,
      prefill:{name:customer.name,email:customer.email,contact:customer.phone},
      notes:{store_order_id:order.storeOrderId||''},
      theme:{color:'#111111'},
      retry:{enabled:true},
      handler:async resp=>{
        try{
          const result=await checkoutPost('verify-payment','/api/verify-payment',{...resp,storeOrderId:order.storeOrderId});
          if(!result.verified)throw new Error(result.error||'Payment verification failed.');
          if(result.paid){
            state.cart=[];state.coupon='';localStorage.removeItem('inkwave-coupon-v4');saveCart();
            closeLayer(els.checkoutModal);
            const invoice=result.invoiceUrl?` Invoice: ${result.invoiceUrl}`:'';
            showToast(`Payment successful · Order ${result.orderId} confirmed.${invoice}`,8000);
          }else{
            showToast(result.message||`Payment verified. Order ${result.orderId} is awaiting capture.`,8000);
          }
        }catch(err){showToast(err.message||'Payment verification failed. Please keep your Razorpay payment ID.',8000)}
      },
      modal:{ondismiss:()=>showToast('Razorpay checkout closed — your bag is still saved.',5000)}
    });
    closeLayer(els.checkoutModal);
    checkout.open();
  }catch(e){
    const offline=e?.message==='Failed to fetch'||e instanceof TypeError;
    const msg=offline?'Razorpay payment service could not be reached. Check payment-config.js and try again.':e.message;
    showToast(msg,9000);
  }
}
function applyCoupon(){const code=els.couponInput.value.trim().toUpperCase(),valid=(siteData.settings.couponCode||'').toUpperCase();if(code===valid&&valid){state.coupon=code;localStorage.setItem('inkwave-coupon-v4',code);renderCart();showToast(`${code} applied`)}else{state.coupon='';localStorage.removeItem('inkwave-coupon-v4');renderCart();els.couponMessage.textContent=code?'That code is not valid.':''}}
function bindEvents(){if(els.polaroidUpload)els.polaroidUpload.addEventListener('change',e=>handlePolaroidUpload(e.target.files));if(els.addPolaroidsToBag)els.addPolaroidsToBag.addEventListener('click',addPolaroidsToBag);const reviewTrack=$('#reviewsTrack');if(reviewTrack){const scrollReviews=d=>reviewTrack.scrollBy({left:d*Math.min(reviewTrack.clientWidth*.88,420),behavior:'smooth'});$('#reviewPrev')?.addEventListener('click',()=>scrollReviews(-1));$('#reviewNext')?.addEventListener('click',()=>scrollReviews(1))}document.addEventListener('click',e=>{const pr=e.target.closest('[data-remove-polaroid-preview]');if(pr){state.polaroidPhotos.splice(Number(pr.dataset.removePolaroidPreview),1);renderPolaroidBuilder();return}const qv=e.target.closest('[data-quick-view]');if(qv){e.preventDefault();e.stopPropagation();const p=products.find(x=>x.id===qv.dataset.quickView);if(p)showProductModal(p,false);return}const md=e.target.closest('[data-modal-mockup]');if(md){state.modalMockup=Number(md.dataset.modalMockup)||0;updateModalMockup();return}const f=e.target.closest('[data-filter]');if(f){applyFilter(f.dataset.filter,false);return}const tf=e.target.closest('[data-theme-filter]');if(tf){e.preventDefault();applyFilter(tf.dataset.themeFilter);return}const cp=e.target.closest('[data-custom-product]');if(cp){e.preventDefault();showProductModal(null,true)}});els.productSearch.addEventListener('input',e=>{state.query=e.target.value;renderProducts()});$('#searchToggle').addEventListener('click',()=>{els.searchField.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>els.productSearch.focus(),400)});els.productModal.addEventListener('click',e=>{const o=e.target.closest('[data-option-type]');if(!o)return;state.selection[o.dataset.optionType]=o.dataset.option;[...o.parentElement.children].forEach(c=>c.classList.toggle('active',c===o));updateModalPrice()});$('#modalMockupPrev').addEventListener('click',()=>moveModalMockup(-1));$('#modalMockupNext').addEventListener('click',()=>moveModalMockup(1));els.customUpload.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;if(!f.type.startsWith('image/'))return showToast('Please choose an image.');if(f.size>5*1024*1024)return showToast('Use an image under 5 MB.');const r=new FileReader();r.onload=x=>{setModalArtwork(x.target.result);showToast('Artwork updated')};r.readAsDataURL(f)});$('#addToCartButton').addEventListener('click',addToCart);$$('[data-close-modal]').forEach(b=>b.addEventListener('click',()=>closeLayer(els.productModal)));$('#cartButton').addEventListener('click',openCart);$('#closeCart').addEventListener('click',closeCart);els.cartItems.addEventListener('click',e=>{const q=e.target.closest('[data-qty]'),rm=e.target.closest('[data-remove]');if(q){const i=state.cart.find(x=>x.key===q.dataset.key);if(i){i.quantity=Math.max(1,Math.min(50,i.quantity+(q.dataset.qty==='plus'?1:-1)));saveCart()}}if(rm){state.cart=state.cart.filter(i=>i.key!==rm.dataset.remove);saveCart()}});$('#applyCoupon').addEventListener('click',applyCoupon);els.couponInput.addEventListener('keydown',e=>{if(e.key==='Enter')applyCoupon()});$('#checkoutButton').addEventListener('click',()=>{closeCart();setTimeout(()=>openLayer(els.checkoutModal),220)});$$('[data-close-checkout]').forEach(b=>b.addEventListener('click',()=>closeLayer(els.checkoutModal)));$('#checkoutForm').addEventListener('submit',e=>{e.preventDefault();startRazorpayCheckout(Object.fromEntries(new FormData(e.target)))});els.overlay.addEventListener('click',()=>{if(els.productModal.classList.contains('visible'))closeLayer(els.productModal);else if(els.checkoutModal.classList.contains('visible'))closeLayer(els.checkoutModal);else closeCart()});$('#menuButton').addEventListener('click',e=>{const m=$('#mobileMenu'),open=m.classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',String(open))});$$('#mobileMenu a').forEach(a=>a.addEventListener('click',closeMobileMenu));document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.activeElement?.dataset?.quickView){e.preventDefault();const p=products.find(x=>x.id===document.activeElement.dataset.quickView);if(p)showProductModal(p,false)}if(e.key!=='Escape')return;if(els.productModal.classList.contains('visible'))closeLayer(els.productModal);else if(els.checkoutModal.classList.contains('visible'))closeLayer(els.checkoutModal);else if(els.cartDrawer.classList.contains('open'))closeCart();else closeMobileMenu()})}
mapElements();loadSite().catch(e=>{console.error(e);showToast('Store preview could not start. Check that all website files are kept together.',6000)});
