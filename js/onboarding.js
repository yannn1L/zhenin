/* ============================================================
   ZHENIN - Onboarding Module (v2.3.0)
   4 slide carousel dengan swipe + skip
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';

export const Onboarding = {
  currentSlide: 0,
  totalSlides: 0,
  _swipeStartX: 0,
  _swipeEndX: 0,
  _isOpen: false,
  
  /**
   * Show onboarding
   */
  show() {
    const modal = document.getElementById('modalOnboarding');
    if (!modal) return;
    
    this.currentSlide = 0;
    this.totalSlides = CONFIG.ONBOARDING_SLIDES.length;
    
    this.render();
    this.bindEvents();
    
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    this._isOpen = true;
  },
  
  /**
   * Hide onboarding
   */
  hide(markComplete = true) {
    const modal = document.getElementById('modalOnboarding');
    if (!modal) return;
    
    modal.hidden = true;
    document.body.style.overflow = '';
    this._isOpen = false;
    
    if (markComplete) {
      Data.setOnboarded();
    }
  },
  
  /**
   * Render slides + dots
   */
  render() {
    const slidesContainer = document.getElementById('onboardingSlides');
    const dotsContainer = document.getElementById('onboardingDots');
    
    if (slidesContainer) {
      slidesContainer.innerHTML = CONFIG.ONBOARDING_SLIDES.map((slide, i) => `
        <div class="onboarding-slide${i === this.currentSlide ? ' active' : ''}" data-slide="${i}">
          <div class="onboarding-slide-icon">${slide.icon}</div>
          <div class="onboarding-slide-title">${escapeHtml(slide.title)}</div>
          <div class="onboarding-slide-desc">${escapeHtml(slide.desc)}</div>
        </div>
      `).join('');
    }
    
    if (dotsContainer) {
      dotsContainer.innerHTML = CONFIG.ONBOARDING_SLIDES.map((_, i) => `
        <button class="onboarding-dot${i === this.currentSlide ? ' active' : ''}" data-dot="${i}" aria-label="Slide ${i + 1}"></button>
      `).join('');
      
      dotsContainer.querySelectorAll('[data-dot]').forEach(dot => {
        dot.addEventListener('click', () => {
          this.goToSlide(parseInt(dot.dataset.dot));
        });
      });
    }
    
    this.updateButtons();
  },
  
  /**
   * Update button state
   */
  updateButtons() {
    const prevBtn = document.getElementById('onboardingPrev');
    const nextBtn = document.getElementById('onboardingNext');
    
    if (prevBtn) {
      prevBtn.style.display = this.currentSlide > 0 ? '' : 'none';
    }
    
    if (nextBtn) {
      if (this.currentSlide === this.totalSlides - 1) {
        nextBtn.textContent = 'Mulai Sekarang 🚀';
      } else {
        nextBtn.textContent = 'Lanjut';
      }
    }
  },
  
  /**
   * Bind events
   */
  bindEvents() {
    const skipBtn = document.getElementById('onboardingSkip');
    const prevBtn = document.getElementById('onboardingPrev');
    const nextBtn = document.getElementById('onboardingNext');
    
    if (skipBtn && !skipBtn.dataset.bound) {
      skipBtn.dataset.bound = '1';
      skipBtn.addEventListener('click', () => this.hide(true));
    }
    
    if (prevBtn && !prevBtn.dataset.bound) {
      prevBtn.dataset.bound = '1';
      prevBtn.addEventListener('click', () => this.prev());
    }
    
    if (nextBtn && !nextBtn.dataset.bound) {
      nextBtn.dataset.bound = '1';
      nextBtn.addEventListener('click', () => {
        if (this.currentSlide === this.totalSlides - 1) {
          this.hide(true);
        } else {
          this.next();
        }
      });
    }
    
    // Swipe
    const container = document.querySelector('.onboarding-slides');
    if (container && !container.dataset.swipeBound) {
      container.dataset.swipeBound = '1';
      
      container.addEventListener('touchstart', (e) => {
        this._swipeStartX = e.touches[0].clientX;
      }, { passive: true });
      
      container.addEventListener('touchend', (e) => {
        this._swipeEndX = e.changedTouches[0].clientX;
        const diff = this._swipeStartX - this._swipeEndX;
        if (Math.abs(diff) > 50) {
          if (diff > 0) this.next();
          else this.prev();
        }
      }, { passive: true });
    }
    
    // Keyboard
    if (!document._onboardingKeyBound) {
      document._onboardingKeyBound = true;
      document.addEventListener('keydown', (e) => {
        if (!this._isOpen) return;
        if (e.key === 'ArrowRight') this.next();
        if (e.key === 'ArrowLeft') this.prev();
        if (e.key === 'Escape') this.hide(true);
      });
    }
  },
  
  /**
   * Next slide
   */
  next() {
    if (this.currentSlide < this.totalSlides - 1) {
      this.goToSlide(this.currentSlide + 1);
    }
  },
  
  /**
   * Prev slide
   */
  prev() {
    if (this.currentSlide > 0) {
      this.goToSlide(this.currentSlide - 1);
    }
  },
  
  /**
   * Go to specific slide
   */
  goToSlide(index) {
    if (index < 0 || index >= this.totalSlides) return;
    this.currentSlide = index;
    this.render();
  }
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default Onboarding;