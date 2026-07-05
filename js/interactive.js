/* 桃子家摄影 - Core Interactive & Dynamic Data Loader (English Version) */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initMobileNav();
  initTestimonialSlider();
  initFaqAccordion();
  initContactForm();
  
  // Check if we are on the portfolio or case detail page
  if (document.getElementById('portfolio-grid')) {
    initPortfolio();
  }
  if (document.getElementById('case-detail-container')) {
    initCaseDetail();
  }
});

/* ================= 1. Sticky Navigation Scroll Effect ================= */
function initNavbar() {
  const header = document.querySelector('header');
  if (!header) return;
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('nav-scrolled');
    } else {
      header.classList.remove('nav-scrolled');
    }
  });
}

/* ================= 2. Mobile Responsive Menu Drawer ================= */
function initMobileNav() {
  const burger = document.querySelector('.mobile-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  const overlay = document.querySelector('.mobile-nav-overlay');
  
  if (!burger || !mobileNav || !overlay) return;
  
  const toggleMenu = () => {
    mobileNav.classList.toggle('active');
    overlay.classList.toggle('active');
  };
  
  burger.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', toggleMenu);
  
  mobileNav.addEventListener('click', (e) => e.stopPropagation());
}

/* ================= 3. Testimonial Slider Carousel ================= */
function initTestimonialSlider() {
  const track = document.querySelector('.testimonial-track');
  const slides = document.querySelectorAll('.testimonial-slide');
  const dotsContainer = document.querySelector('.slider-dots');
  
  if (!track || slides.length === 0) return;
  
  let currentIndex = 0;
  
  // Dynamically create slider indicators
  dotsContainer.innerHTML = '';
  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.classList.add('slider-dot');
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
  });
  
  const dots = document.querySelectorAll('.slider-dot');
  
  function goToSlide(index) {
    if (index < 0 || index >= slides.length) return;
    
    track.style.transform = `translateX(-${index * 100}%)`;
    dots[currentIndex].classList.remove('active');
    dots[index].classList.add('active');
    currentIndex = index;
  }
  
  // Auto play carousel
  let slideInterval = setInterval(nextSlide, 6000);
  
  function nextSlide() {
    let nextIdx = (currentIndex + 1) % slides.length;
    goToSlide(nextIdx);
  }
  
  const container = document.querySelector('.slider-container');
  if (container) {
    container.addEventListener('mouseenter', () => clearInterval(slideInterval));
    container.addEventListener('mouseleave', () => {
      slideInterval = setInterval(nextSlide, 6000);
    });
  }
}

/* ================= 4. FAQ Accordion Dropdown ================= */
function initFaqAccordion() {
  const questions = document.querySelectorAll('.faq-question');
  
  questions.forEach(q => {
    q.addEventListener('click', () => {
      const item = q.parentElement;
      const answer = item.querySelector('.faq-answer');
      const isActive = item.classList.contains('active');
      
      // Close all other FAQ drawers
      document.querySelectorAll('.faq-item').forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
          otherItem.querySelector('.faq-answer').style.maxHeight = null;
        }
      });
      
      // Toggle current FAQ drawer
      if (isActive) {
        item.classList.remove('active');
        answer.style.maxHeight = null;
      } else {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
}

/* ================= 5. Contact Form Validation & Success Modal ================= */
function initContactForm() {
  const form = document.querySelector('.contact-form');
  const subscribeForms = document.querySelectorAll('.subscribe-form');
  
  // Create and append success modal in English
  if (!document.querySelector('.success-modal')) {
    const modal = document.createElement('div');
    modal.classList.add('success-modal');
    modal.innerHTML = `
      <div class="success-box">
        <h3>Submission Successful</h3>
        <p>Thank you! We have received your message. A member of the Taozijia Photography team will get back to you within 24-48 hours.</p>
        <button class="btn btn-primary close-success-btn">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('.close-success-btn').addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }
  
  const successModal = document.querySelector('.success-modal');
  
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      successModal.classList.add('active');
      form.reset();
    });
  }
  
  subscribeForms.forEach(subForm => {
    subForm.addEventListener('submit', (e) => {
      e.preventDefault();
      successModal.classList.add('active');
      subForm.reset();
    });
  });
}

/* ================= 6. Dynamic Portfolio Loading & Tab Filtering ================= */
const categoryMapping = {
  'all': [],
  'maternity': ['孕照', '棚拍孕照|全家福'],
  'newborn': ['新生儿—满月', 'Fresh 48'],
  'family': ['棚拍孕照|全家福', '纪实跟拍', '宝宝外景写真'],
  'milestone': ['百天布景写真', '周岁布景写真', '布景周岁礼', '百天纪实'],
  'studio': ['棚拍写真', 'Mini Session'],
  'seasonal': ['季节限定', '外景 Mini', 'Darcy 作品', '领证·婚礼系列']
};

const categoryTranslations = {
  'Darcy 作品': 'Darcy Collection',
  'Fresh 48': 'Fresh 48',
  'Mini Session': 'Mini Session',
  '周岁布景写真': 'One-Year Studio',
  '外景 Mini': 'Outdoor Mini',
  '孕照': 'Maternity',
  '季节限定': 'Seasonal Special',
  '宝宝外景写真': 'Baby Outdoor',
  '布景周岁礼': 'One-Year Ceremony',
  '新生儿—满月': 'Newborn',
  '棚拍写真': 'Studio Portrait',
  '棚拍孕照|全家福': 'Studio Family',
  '百天布景写真': '100-Day Studio',
  '百天纪实': '100-Day Documentary',
  '纪实跟拍': 'Family Documentary',
  '领证·婚礼系列': 'Wedding & Registry'
};

let allCases = [];
let filteredCases = [];
let currentCategory = 'all';
let currentPage = 1;
const itemsPerPage = 12;

function initPortfolio() {
  const grid = document.getElementById('portfolio-grid');
  const tabs = document.querySelectorAll('.filter-tab');
  
  if (!grid) return;
  
  fetch('data/cases.json')
    .then(res => res.json())
    .then(data => {
      // Flatten all cases
      allCases = [];
      data.categories.forEach(cat => {
        allCases.push(...cat.cases);
      });
      
      // Parse URL query parameter "?cat=..."
      const urlParams = new URLSearchParams(window.location.search);
      const catParam = urlParams.get('cat');
      
      if (catParam) {
        const decodedCat = decodeURIComponent(catParam);
        const matchTab = Array.from(tabs).find(tab => tab.dataset.category.toLowerCase() === decodedCat.toLowerCase());
        if (matchTab) {
          tabs.forEach(t => t.classList.remove('active'));
          matchTab.classList.add('active');
          currentCategory = matchTab.dataset.category;
        } else {
          // Sub-category selected from Mega Menu (e.g. Fresh 48)
          currentCategory = decodedCat;
          tabs.forEach(t => t.classList.remove('active'));
        }
      }
      
      filterAndRender();
      
      // Setup tabs filters click listeners
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          currentCategory = tab.dataset.category;
          currentPage = 1;
          
          // Clear URL query parameter on tab click to avoid confusion
          const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.pushState({ path: newUrl }, '', newUrl);
          
          filterAndRender();
        });
      });
    })
    .catch(err => {
      console.error('Error loading cases:', err);
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Failed to load portfolio. Please check your data connection.</div>';
    });
}

function filterAndRender() {
  const grid = document.getElementById('portfolio-grid');
  
  // Filter cases based on mapping
  if (currentCategory === 'all') {
    filteredCases = allCases;
  } else if (categoryMapping[currentCategory]) {
    const targetCats = categoryMapping[currentCategory];
    filteredCases = allCases.filter(c => {
      const cleanCat = c.category.trim();
      return targetCats.some(tc => cleanCat === tc.trim());
    });
  } else {
    // Filter by specific sub-category name
    filteredCases = allCases.filter(c => {
      const cleanCat = c.category.trim();
      const displayCat = categoryTranslations[cleanCat] || cleanCat;
      return cleanCat.toLowerCase() === currentCategory.toLowerCase() || 
             displayCat.toLowerCase() === currentCategory.toLowerCase();
    });
  }
  
  grid.innerHTML = '';
  
  const endIdx = currentPage * itemsPerPage;
  const pageItems = filteredCases.slice(0, endIdx);
  
  if (pageItems.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No cases found in this category. Stay tuned!</div>';
    removeLoadMoreBtn();
    return;
  }
  
  pageItems.forEach(c => {
    const cleanCat = c.category.trim();
    const cleanFolder = c.folder_name.trim();
    
    // Translate category display label
    const displayCat = categoryTranslations[cleanCat] || cleanCat;
    
    const coverName = c.cover_thumbnail || c.cover;
    const coverPath = coverName ? `taozijia-images/${cleanCat}/${cleanFolder}/${coverName}` : 'images/placeholder.jpg';
    
    const card = document.createElement('div');
    card.className = 'case-card animate-fade-in-up';
    card.innerHTML = `
      <div class="case-card-img">
        <img src="${coverPath}" alt="${c.title}" loading="lazy">
      </div>
      <div class="case-card-overlay">
        <div class="case-card-info">
          <div class="case-card-cat">${displayCat}</div>
          <h3 class="case-card-title">${c.title}</h3>
          <div class="case-card-count">${c.images_count} Photos</div>
        </div>
      </div>
    `;
    
    card.addEventListener('click', () => {
      window.location.href = `case-detail.html?uuid=${c.uuid}`;
    });
    
    grid.appendChild(card);
  });
  
  // Paginations button
  if (filteredCases.length > endIdx) {
    setupLoadMoreBtn();
  } else {
    removeLoadMoreBtn();
  }
}

function setupLoadMoreBtn() {
  const container = document.querySelector('.pagination-container');
  if (!container) return;
  
  container.innerHTML = `<button class="btn btn-secondary load-more-btn">Load More Works (${filteredCases.length - (currentPage * itemsPerPage)})</button>`;
  
  const btn = container.querySelector('.load-more-btn');
  btn.addEventListener('click', () => {
    currentPage++;
    filterAndRender();
  });
}

function removeLoadMoreBtn() {
  const container = document.querySelector('.pagination-container');
  if (container) container.innerHTML = '';
}


/* ================= 7. Case details viewer & Lightbox ================= */
let activeCasePhotos = [];
let activePhotoIndex = 0;

function initCaseDetail() {
  const container = document.getElementById('case-detail-container');
  const photosGrid = document.getElementById('case-photos-grid');
  
  if (!container || !photosGrid) return;
  
  const urlParams = new URLSearchParams(window.location.search);
  const uuid = urlParams.get('uuid');
  
  if (!uuid) {
    showError('No portfolio case was selected.');
    return;
  }
  
  fetch('data/cases.json')
    .then(res => res.json())
    .then(data => {
      let foundCase = null;
      for (let cat of data.categories) {
        foundCase = cat.cases.find(c => c.uuid === uuid);
        if (foundCase) break;
      }
      
      if (!foundCase) {
        showError('Specified case could not be found.');
        return;
      }
      
      // Translate category label
      const cleanCat = foundCase.category.trim();
      const cleanFolder = foundCase.folder_name.trim();
      const displayCat = categoryTranslations[cleanCat] || cleanCat;
      
      document.getElementById('case-title').textContent = foundCase.title;
      document.getElementById('case-category').textContent = displayCat;
      document.getElementById('case-count').textContent = foundCase.images_count;
      document.title = `${foundCase.title} - ${displayCat} - Taozijia Photography`;
      
      activeCasePhotos = foundCase.images.map(imgName => `taozijia-images/${cleanCat}/${cleanFolder}/${imgName}`);
      
      photosGrid.innerHTML = '';
      
      foundCase.images.forEach((imgName, index) => {
        let thumbName = imgName;
        const wechatThumb = `${imgName}-wechatPcShare`;
        if (foundCase.thumbnails.includes(wechatThumb)) {
          thumbName = wechatThumb;
        }
        
        const thumbPath = `taozijia-images/${cleanCat}/${cleanFolder}/${thumbName}`;
        
        const photoItem = document.createElement('div');
        photoItem.className = 'case-photo-item';
        photoItem.innerHTML = `<img src="${thumbPath}" alt="${foundCase.title} - ${index + 1}" loading="lazy">`;
        
        photoItem.addEventListener('click', () => {
          openLightbox(index);
        });
        
        photosGrid.appendChild(photoItem);
      });
      
      initLightboxEvents();
    })
    .catch(err => {
      console.error('Error loading case detail:', err);
      showError('Failed to load portfolio images.');
    });
}

function showError(msg) {
  const photosGrid = document.getElementById('case-photos-grid');
  if (photosGrid) {
    photosGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">${msg}</div>`;
  }
}

// Lightbox Modal functions
function initLightboxEvents() {
  if (!document.querySelector('.lightbox')) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `
      <div class="lightbox-content">
        <span class="lightbox-close">&times;</span>
        <div class="lightbox-nav lightbox-prev">&#10094;</div>
        <img id="lightbox-img" src="" alt="Zoomed Photo">
        <div class="lightbox-nav lightbox-next">&#10095;</div>
      </div>
    `;
    document.body.appendChild(lb);
    
    lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.className === 'lightbox-content') {
        closeLightbox();
      }
    });
    
    lb.querySelector('.lightbox-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      changePhoto(-1);
    });
    lb.querySelector('.lightbox-next').addEventListener('click', (e) => {
      e.stopPropagation();
      changePhoto(1);
    });
    
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('active')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') changePhoto(-1);
      if (e.key === 'ArrowRight') changePhoto(1);
    });
  }
}

function openLightbox(index) {
  const lb = document.querySelector('.lightbox');
  const lbImg = document.getElementById('lightbox-img');
  
  if (!lb || !lbImg || activeCasePhotos.length === 0) return;
  
  activePhotoIndex = index;
  lbImg.src = activeCasePhotos[index];
  lb.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lb = document.querySelector('.lightbox');
  if (lb) lb.classList.remove('active');
  document.body.style.overflow = '';
}

function changePhoto(dir) {
  const lbImg = document.getElementById('lightbox-img');
  if (!lbImg || activeCasePhotos.length === 0) return;
  
  activePhotoIndex = (activePhotoIndex + dir + activeCasePhotos.length) % activeCasePhotos.length;
  lbImg.src = activeCasePhotos[activePhotoIndex];
}
