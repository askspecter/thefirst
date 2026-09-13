(() => {
  'use strict';

  /* ---------- Nav scroll state ---------- */
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 20) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile menu ---------- */
  const burger = document.getElementById('navBurger');
  const navLinks = document.getElementById('navLinks');
  burger?.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => navLinks.classList.remove('open'));
  });

  /* ---------- Active TOC highlighting via scroll spy ---------- */
  const tocLinks = Array.from(document.querySelectorAll('.doc-toc a[href^="#"]'));
  const sections = tocLinks
    .map(a => document.getElementById(a.getAttribute('href').slice(1)))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map(a => [a.getAttribute('href').slice(1), a]));
    let activeId = null;

    const setActive = (id) => {
      if (id === activeId) return;
      activeId = id;
      tocLinks.forEach(a => a.classList.remove('active'));
      byId.get(id)?.classList.add('active');
    };

    const visible = new Map();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
        else visible.delete(e.target.id);
      });
      // Pick the topmost visible section; fall back to the last passed one.
      if (visible.size) {
        const top = sections.find(s => visible.has(s.id));
        if (top) setActive(top.id);
      } else {
        // none intersecting — choose the last section above the viewport
        let above = null;
        for (const s of sections) {
          if (s.getBoundingClientRect().top < 120) above = s;
        }
        if (above) setActive(above.id);
      }
    }, { rootMargin: '-90px 0px -60% 0px', threshold: [0, 0.25, 1] });

    sections.forEach(s => spy.observe(s));
  }

  /* ---------- Scroll reveal (optional, matches landing) ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }
})();
