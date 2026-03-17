/* ─────────────────────────────────────────
   Nerdlandia — main.js
───────────────────────────────────────── */

/* Mobile nav toggle */
function toggleNav() {
  const nav = document.getElementById('navMobile');
  if (nav) nav.classList.toggle('open');
}

/* Close mobile nav on outside click */
document.addEventListener('click', function(e) {
  const nav = document.getElementById('navMobile');
  const toggle = document.querySelector('.nav-toggle');
  if (nav && nav.classList.contains('open')) {
    if (!nav.contains(e.target) && e.target !== toggle) {
      nav.classList.remove('open');
    }
  }
});

/* Scroll-in animation for cards and panels */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.feature-card, .panel, .stat, .event-item, .lb-row').forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity 0.4s ease ${i * 0.06}s, transform 0.4s ease ${i * 0.06}s`;
    observer.observe(el);
  });
});

/* Add visible class */
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = '.visible { opacity: 1 !important; transform: translateY(0) !important; }';
  document.head.appendChild(style);
});

/* Active nav link highlighting */
document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(link => {
    const linkPath = link.getAttribute('href').split('/').pop();
    if (linkPath === currentPath && currentPath !== '') {
      link.style.background = 'var(--amber-light)';
      link.style.color = 'var(--amber)';
    }
  });
});
