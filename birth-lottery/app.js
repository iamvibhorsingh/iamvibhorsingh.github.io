import { locales } from './locales.js';

// Template string helper: t('key', { var: value }) replaces {var} in locale string
const t = (key, vars = {}) => {
  const l = locales[state.lang] || locales.en;
  let str = (l[key] !== undefined ? l[key] : locales.en[key]) ?? key;
  Object.entries(vars).forEach(([k, v]) => {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  });
  return str;
};

// Application State
const state = {
  lang: 'en',
  activeDraw: null,
  heldDraw: null,
  compareMode: false,
  isSpinning: false,
  disabilityToggle: false,
  filters: {
    licOnly: false,
    femaleOnly: false,
    ruralOnly: false
  },
  userCountry: 'USA',
  dataIndex: [],
  countriesCache: {},
  // Cached list of all countries for dropdown comparison
  allCountriesList: [],
  worldTopology: null,
  iso3ToNumericMap: {},
  globeFeatures: null,
  activeGlobeCountry: null,
  ignoreHashChange: false,
  activeTab: 'single'
};

// DOM Elements cache
const el = {};
const cacheElements = () => {
  const ids = [
    'logo-title', 'logo-subtitle', 'lang-select', 'user-country-select', 'user-country-label',
    'filter-title', 'filter-select', 'compare-mode-btn', 'hold-btn', 'spin-btn', 'spin-1000-btn',
    'draw-results-section', 'country-flag', 'country-name', 'active-sex-badge', 'active-wealth-badge',
    'active-residence-badge', 'active-disability-badge', 'luck-score-label', 'luck-score-number',
    'luck-score-desc', 'disability-toggle-container', 'disability-toggle', 'disability-toggle-label',
    'survival-title', 'education-title', 'material-title', 'freedoms-title', 'cta-title', 'cta-body',
    'cta-btn', 'data-vintage-link', 'data-gaps-link', 'methodology-overlay', 'gaps-overlay',
    'methodology-close', 'gaps-close', 'gaps-list', 'last-updated-text', 'comparison-area',
    'compare-flag-1', 'compare-name-1', 'compare-flag-2', 'compare-name-2', 'compare-tags-1', 'compare-tags-2',
    'aggregate-dashboard', 'aggregate-grid', 'chart-region-container', 'chart-income-container',
    'chart-wealth-container', 'chart-life-container', 'wheel', 'probabilistic-note',
    'tab-single', 'tab-aggregate', 'single-view', 'globe-svg',
    'cb-legend-draw-label', 'cb-legend-base-label', 'cb-legend-deficit-label',
    'share-card-btn', 'download-card-btn',
    'agg-eyebrow', 'agg-title', 'agg-subtitle',
    'step-back-btn', 'step-next-btn', 'step-pill-1', 'step-pill-2', 'step-pill-3', 'step-pill-4',
    'aggregate-takeaway', 'share-step-text',
    'opt-toggle-water', 'opt-toggle-electricity', 'opt-toggle-schooling',
    'chart-placeholder-title', 'chart-placeholder-hint', 'spin-1000-placeholder-btn'
  ];
  ids.forEach(id => {
    el[id] = document.getElementById(id);
  });
};

// Initialize App
const init = async () => {
  cacheElements();

  // Set language based on user's system locale or default
  const browserLang = navigator.language.split('-')[0];
  if (locales[browserLang]) {
    state.lang = browserLang;
  }
  if (el['lang-select']) el['lang-select'].value = state.lang;

  // Fetch primary index data
  try {
    const res = await fetch('./data/index.json');
    state.dataIndex = await res.json();
    state.allCountriesList = [...state.dataIndex].sort((a, b) => a.name.localeCompare(b.name));
    populateCountryDropdowns();
  } catch (err) {
    console.error('Failed to load data index:', err);
    alert('Failed to load database. Please ensure generate_data.py has been run.');
    return;
  }

  // Fetch Globe Map Data and ISO Code mappings
  try {
    const [topoRes, isoRes] = await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
      fetch('https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/slim-3/slim-3.json')
    ]);
    state.worldTopology = await topoRes.json();
    const slimIsoData = await isoRes.json();

    state.iso3ToNumericMap = {};
    slimIsoData.forEach(d => {
      state.iso3ToNumericMap[d['alpha-3']] = parseInt(d['country-code'], 10);
    });

    initGlobe();
  } catch (err) {
    console.error('Failed to load globe resources:', err);
  }

  setupEventListeners();
  updateTranslations();
  drawWheelSVG();

  // Parse URL hash for seeds
  handleHashChange();
  window.addEventListener('hashchange', handleHashChange);
};

// Dashboard Tab Switcher
const switchToTab = (tab) => {
  state.activeTab = tab;
  const l = locales[state.lang] || locales.en;
  if (el['spin-btn']) {
    el['spin-btn'].textContent = tab === 'aggregate' ? l.spin_1000_btn : l.spin_btn;
  }
  if (tab === 'single') {
    if (el['tab-single']) el['tab-single'].classList.add('active');
    if (el['tab-aggregate']) el['tab-aggregate'].classList.remove('active');
    if (el['single-view']) el['single-view'].classList.remove('hidden');
    if (el['aggregate-dashboard']) el['aggregate-dashboard'].classList.add('hidden');

    if (state.activeDraw) {
      if (state.compareMode) {
        if (el['comparison-area']) el['comparison-area'].classList.remove('hidden');
        if (el['draw-results-section']) el['draw-results-section'].classList.add('hidden');
      } else {
        if (el['draw-results-section']) el['draw-results-section'].classList.remove('hidden');
        if (el['comparison-area']) el['comparison-area'].classList.add('hidden');
      }
    }
  } else if (tab === 'aggregate') {
    if (el['tab-single']) el['tab-single'].classList.remove('active');
    if (el['tab-aggregate']) el['tab-aggregate'].classList.add('active');
    if (el['single-view']) el['single-view'].classList.add('hidden');
    if (el['aggregate-dashboard']) el['aggregate-dashboard'].classList.remove('hidden');

    if (el['draw-results-section']) el['draw-results-section'].classList.add('hidden');
    if (el['comparison-area']) el['comparison-area'].classList.add('hidden');
  }
};

// Setup DOM Event Listeners
// Setup DOM Event Listeners
const setupEventListeners = () => {
  // Tab Navigation Listeners
  if (el['tab-single']) {
    el['tab-single'].addEventListener('click', () => switchToTab('single'));
  }
  if (el['tab-aggregate']) {
    el['tab-aggregate'].addEventListener('click', () => switchToTab('aggregate'));
  }

  // Metric Card Interactive Expand Trays
  document.querySelectorAll('.metric-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't toggle tray if clicking links or interactive elements inside
      if (e.target.closest('a') || e.target.closest('button')) return;
      const tray = card.querySelector('.card-details-tray');
      if (tray) {
        tray.classList.toggle('hidden');

        // Highlight active card visual indicator (glow or dot)
        card.classList.toggle('expanded', !tray.classList.contains('hidden'));
      }
    });
  });

  // Accordion Section Trigger Toggle
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const section = trigger.closest('.accordion-section');
      if (!section) return;
      const isCollapsed = section.getAttribute('data-collapsed') === 'true';
      section.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
      trigger.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');

      const icon = trigger.querySelector('.accordion-icon');
      if (icon) {
        icon.textContent = isCollapsed ? '▲' : '▼';
      }
    });
  });

  // Collapse accordions initially on mobile viewports
  if (window.innerWidth <= 767) {
    document.querySelectorAll('.accordion-section').forEach(section => {
      section.setAttribute('data-collapsed', 'true');
      const trigger = section.querySelector('.accordion-trigger');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        const icon = trigger.querySelector('.accordion-icon');
        if (icon) icon.textContent = '▼';
      }
    });
  }

  if (el['lang-select']) {
    el['lang-select'].addEventListener('change', (e) => {
      state.lang = e.target.value;
      updateTranslations();
      drawWheelSVG();
      if (state.activeDraw) renderDraw(state.activeDraw, 'active');
      if (state.heldDraw) renderDraw(state.heldDraw, 'held');
      if (state.cohortDraws && state.cohortDraws.length > 0) {
        renderAggregateStory(state.aggregateStep, true);
      }
    });
  }

  if (el['spin-btn']) {
    el['spin-btn'].addEventListener('click', () => {
      if (state.activeTab === 'aggregate') {
        handleSpin1000();
      } else {
        handleSpin();
      }
    });
  }
  if (el['spin-1000-btn']) el['spin-1000-btn'].addEventListener('click', handleSpin1000);
  if (el['spin-1000-placeholder-btn']) {
    el['spin-1000-placeholder-btn'].addEventListener('click', handleSpin1000);
  }

  // Wheel expand overlay
  const wheelExpandBtn = document.getElementById('wheel-expand-btn');
  const wheelOverlay = document.getElementById('wheel-overlay');
  const wheelOverlayInner = document.getElementById('wheel-overlay-inner');
  const wheelOverlayClose = document.getElementById('wheel-overlay-close');
  const wheelOverlayBackdrop = document.getElementById('wheel-overlay-backdrop');

  const openWheelOverlay = () => {
    if (!wheelOverlay || !wheelOverlayInner || !el['wheel']) return;
    // Clone the rendered wheel SVG node into the overlay container
    const cloned = el['wheel'].cloneNode(true);
    wheelOverlayInner.replaceChildren(...cloned.childNodes);
    wheelOverlay.classList.remove('hidden');
  };

  const closeWheelOverlay = () => {
    if (wheelOverlay) wheelOverlay.classList.add('hidden');
  };

  if (wheelExpandBtn) wheelExpandBtn.addEventListener('click', openWheelOverlay);
  if (wheelOverlayClose) wheelOverlayClose.addEventListener('click', closeWheelOverlay);
  if (wheelOverlayBackdrop) wheelOverlayBackdrop.addEventListener('click', closeWheelOverlay);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWheelOverlay(); });

  // Skip spin on wheel click
  if (el['wheel']) {
    el['wheel'].addEventListener('click', () => {
      if (state.isSpinning) skipSpin();
    });
  }

  // Skip spin on results card click (excluding buttons)
  const resultsCard = document.getElementById('draw-results-section');
  if (resultsCard) {
    resultsCard.addEventListener('click', (e) => {
      if (state.isSpinning && !e.target.closest('button')) {
        skipSpin();
      }
    });
  }

  if (el['compare-mode-btn']) {
    el['compare-mode-btn'].addEventListener('click', () => {
      state.compareMode = !state.compareMode;
      el['compare-mode-btn'].classList.toggle('active', state.compareMode);
      if (state.compareMode) {
        // Freeze current draw as held, spin a new one
        state.heldDraw = state.activeDraw ? { ...state.activeDraw } : null;
        if (el['comparison-area']) el['comparison-area'].classList.remove('hidden');
        if (el['draw-results-section']) el['draw-results-section'].classList.add('hidden');
        renderDraw(state.heldDraw, 'held');
        handleSpin();
      } else {
        if (el['comparison-area']) el['comparison-area'].classList.add('hidden');
        if (el['draw-results-section']) el['draw-results-section'].classList.remove('hidden');
        state.heldDraw = null;
        if (state.activeDraw) updateMetricCards(state.activeDraw);
      }
      updateHash();
    });
  }

  if (el['hold-btn']) {
    el['hold-btn'].addEventListener('click', () => {
      if (state.activeDraw) {
        state.heldDraw = { ...state.activeDraw };
        renderDraw(state.heldDraw, 'held');
        updateMetricCards(state.activeDraw);
        alert('Current draw pinned for comparison!');
      }
    });
  }

  if (el['filter-select']) {
    el['filter-select'].addEventListener('change', (e) => {
      const val = e.target.value;
      state.filters.licOnly = val === 'lic';
      state.filters.femaleOnly = val === 'female';
      state.filters.ruralOnly = val === 'rural';
    });
  }

  if (el['user-country-select']) {
    el['user-country-select'].addEventListener('change', (e) => {
      state.userCountry = e.target.value;
      if (state.activeDraw) renderDraw(state.activeDraw, 'active');
    });
  }

  if (el['disability-toggle']) {
    el['disability-toggle'].addEventListener('change', (e) => {
      state.disabilityToggle = e.target.checked;
      if (state.activeDraw) renderDraw(state.activeDraw, 'active');
      if (state.heldDraw) renderDraw(state.heldDraw, 'held');
    });
  }

  // Share & Download Button Listeners
  const shareCardBtn = document.getElementById('share-card-btn');
  if (shareCardBtn) {
    shareCardBtn.addEventListener('click', handleShareCard);
  }
  const downloadCardBtn = document.getElementById('download-card-btn');
  if (downloadCardBtn) {
    downloadCardBtn.addEventListener('click', handleDownloadCard);
  }

  // Modals
  if (el['data-vintage-link']) {
    el['data-vintage-link'].addEventListener('click', (e) => {
      e.preventDefault();
      if (el['methodology-overlay']) el['methodology-overlay'].style.display = 'flex';
    });
  }
  if (el['methodology-close']) {
    el['methodology-close'].addEventListener('click', () => {
      if (el['methodology-overlay']) el['methodology-overlay'].style.display = 'none';
    });
  }

  if (el['data-gaps-link']) {
    el['data-gaps-link'].addEventListener('click', (e) => {
      e.preventDefault();
      renderDataGaps();
      if (el['gaps-overlay']) el['gaps-overlay'].style.display = 'flex';
    });
  }
  if (el['gaps-close']) {
    el['gaps-close'].addEventListener('click', () => {
      if (el['gaps-overlay']) el['gaps-overlay'].style.display = 'none';
    });
  }

  // Stepper navigation listeners
  const stepBackBtn = document.getElementById('step-back-btn');
  if (stepBackBtn) {
    stepBackBtn.addEventListener('click', () => changeAggregateStep(-1));
  }
  const stepNextBtn = document.getElementById('step-next-btn');
  if (stepNextBtn) {
    stepNextBtn.addEventListener('click', () => changeAggregateStep(1));
  }
  for (let i = 1; i <= 4; i++) {
    const pill = document.getElementById(`step-pill-${i}`);
    if (pill) {
      pill.addEventListener('click', () => setAggregateStep(i));
    }
  }

  // Opportunity sub-toggles
  const toggleWater = document.getElementById('opt-toggle-water');
  if (toggleWater) {
    toggleWater.addEventListener('click', () => setOpportunityMetric('water'));
  }
  const toggleElectricity = document.getElementById('opt-toggle-electricity');
  if (toggleElectricity) {
    toggleElectricity.addEventListener('click', () => setOpportunityMetric('electricity'));
  }
  const toggleSchooling = document.getElementById('opt-toggle-schooling');
  if (toggleSchooling) {
    toggleSchooling.addEventListener('click', () => setOpportunityMetric('schooling'));
  }

  // Share step card
  const shareStepBtn = document.getElementById('share-step-btn');
  if (shareStepBtn) {
    shareStepBtn.addEventListener('click', handleShareCurrentStep);
  }

  // Dynamic D3 layout resize listener
  window.addEventListener('resize', () => {
    if (state.cohortDraws && state.cohortDraws.length > 0) {
      renderAggregateStory(state.aggregateStep, true);
    }
  });
};

// Populate country comparison dropdown list
const populateCountryDropdowns = () => {
  if (!el['user-country-select']) return;
  el['user-country-select'].innerHTML = '';
  state.allCountriesList.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = c.name;
    if (c.code === 'USA') opt.selected = true;
    el['user-country-select'].appendChild(opt);
  });
};

// Hash handling (seeds)
const handleHashChange = () => {
  if (state.ignoreHashChange) {
    state.ignoreHashChange = false;
    return;
  }
  const hash = window.location.hash;
  if (hash.startsWith('#seed=')) {
    const seed = hash.replace('#seed=', '');
    loadSeed(seed);
  }
};

const updateHash = () => {
  if (state.activeDraw) {
    const d = state.activeDraw;
    const seed = `${d.code.toLowerCase()}-${d.sex.toLowerCase()}-${d.quintile.toLowerCase()}-${d.residence.toLowerCase()}`;
    const newHash = `#seed=${seed}`;
    if (window.location.hash !== newHash) {
      state.ignoreHashChange = true;
      window.location.hash = `seed=${seed}`;
    }
  }
};

// Fetch country-level file
const getCountryData = async (code) => {
  const normCode = code.toLowerCase();
  if (state.countriesCache[normCode]) {
    return state.countriesCache[normCode];
  }
  try {
    const res = await fetch(`./data/countries/${normCode}.json`);
    const data = await res.json();
    state.countriesCache[normCode] = data;
    return data;
  } catch (err) {
    console.error(`Failed to load data for country code: ${code}`, err);
    return null;
  }
};

// Draw logic
const drawLottery = () => {
  // Filter active country selection list based on selected constraints
  let pool = [...state.dataIndex];

  if (state.filters.licOnly) {
    // LIC filters - dynamically thresholding by bottom 30% of global births countries
    pool = pool.filter(c => {
      const code = c.code.toLowerCase();
      // Nigeria, Bangladesh, Ethiopia, Congo, Egypt, etc.
      // In a real database, we look up country classification or income level. We approximate here using lower birth weights ranking
      return ['nga', 'eth', 'cod', 'bgd', 'egy', 'pak', 'ind'].includes(code);
    });
  }

  if (pool.length === 0) pool = [...state.dataIndex];

  // Stage 1: Draw country
  let totalWeight = pool.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;
  let drawnCountry = pool[0];
  let cumulative = 0;

  for (const c of pool) {
    cumulative += c.weight;
    if (random <= cumulative) {
      drawnCountry = c;
      break;
    }
  }

  // Stage 2: Within-country traits
  let sex = Math.random() < 0.488 ? 'Female' : 'Male'; // global average default prob
  if (state.filters.femaleOnly) sex = 'Female';

  // Wealth quintile (Q1 - Q5)
  const quintiles = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const quintile = quintiles[Math.floor(Math.random() * 5)];

  // Urban/Rural
  let residence = 'Urban';
  if (state.filters.ruralOnly) {
    residence = 'Rural';
  } else {
    // Draw based on national urbanization rate (approximate default: 50/50 if not loaded, overwritten when fetching)
    residence = Math.random() < 0.5 ? 'Urban' : 'Rural';
  }

  return {
    code: drawnCountry.code,
    iso2: drawnCountry.iso2,
    name: drawnCountry.name,
    sex,
    quintile,
    residence
  };
};

// Stitched persona sentence generator
const generateStitchedPersona = (draw) => {
  const l = locales[state.lang];
  if (!l) return '';

  const genderStr = draw.sex === 'Female' ? l.gender_female : l.gender_male;
  const residenceStr = draw.residence === 'Urban' ? l.residence_urban : l.residence_rural;
  const qKey = `quintile_${draw.quintile.toLowerCase()}`;
  const quintileStr = l[qKey];

  let template = l.persona_template || "An average {residence} {gender} in the {quintile} of {country}.";
  let result = template
    .replace('{gender}', genderStr)
    .replace('{residence}', residenceStr)
    .replace('{quintile}', quintileStr)
    .replace('{country}', draw.name);

  if (draw.hasDisability) {
    result += ` (${l.active_disability_badge || 'Living with a disability'})`;
  }
  return result;
};

// Unmistakable direction text for Luck Score
const getLuckScoreHeroText = (score) => {
  if (score > 50) {
    return `Better than ${score}% of possible lives`;
  } else {
    return `Bottom ${100 - score}% of the global birth lottery`;
  }
};

// Single devastating stat picker
const getDevastatingStat = (draw, userCData) => {
  const stats = [];
  const compName = userCData ? userCData.name : 'American';
  const isUS = userCData && userCData.code === 'USA';
  const compAdjective = isUS ? 'American' : `${compName}'s`;

  // 1. Income Comparison
  if (userCData && userCData.metrics.gdp_pc_ppp && draw.income) {
    const userInc = userCData.metrics.gdp_pc_ppp;
    const ratio = userInc / draw.income;
    if (ratio >= 2) {
      stats.push({
        type: 'income',
        severity: ratio,
        headline: `You'd earn 1/${Math.round(ratio)}th of the average ${compAdjective} income`
      });
    }
  }

  // 2. Under-5 Mortality
  if (userCData && userCData.metrics.under5_mortality && draw.under5) {
    const userMort = userCData.metrics.under5_mortality;
    const ratio = draw.under5 / userMort;
    if (ratio >= 1.8) {
      stats.push({
        type: 'mortality',
        severity: ratio * 1.5,
        headline: `${Math.round(ratio)}× more likely to die before age 5`
      });
    }
  }

  // 3. Schooling
  if (userCData && userCData.metrics.schooling && draw.schooling) {
    const userSchool = userCData.metrics.schooling;
    const diff = userSchool - draw.schooling;
    if (diff >= 3.0) {
      stats.push({
        type: 'schooling',
        severity: diff * 1.2,
        headline: `You'd receive ${Math.round(diff)} fewer years of education than in ${compName}`
      });
    }
  }

  // 4. Maternal Mortality
  if (draw.sex === 'Female' && userCData && userCData.metrics.maternal_mortality && draw.maternalRisk) {
    const userMmr = userCData.metrics.maternal_mortality / 1000.0;
    const ratio = draw.maternalRisk / userMmr;
    if (ratio >= 2 && userMmr > 0) {
      stats.push({
        type: 'maternal',
        severity: ratio * 1.3,
        headline: `${Math.round(ratio)}× higher risk of dying during pregnancy or childbirth`
      });
    }
  }

  // 5. Electricity
  if (draw.electricity < 75) {
    const lackVal = Math.round(100 - draw.electricity);
    stats.push({
      type: 'electricity',
      severity: (lackVal / 10) * 1.1,
      headline: `${lackVal}% probability of living without access to electricity`
    });
  }

  // 6. Clean Water
  if (draw.water < 75) {
    const lackVal = Math.round(100 - draw.water);
    stats.push({
      type: 'water',
      severity: (lackVal / 10) * 1.2,
      headline: `${lackVal}% probability of lacking basic clean drinking water`
    });
  }

  // 7. Democracy
  if (draw.rawData && draw.rawData.metrics && draw.rawData.metrics.democracy_index < 3.5) {
    stats.push({
      type: 'democracy',
      severity: 8,
      headline: `You'd grow up under an authoritarian regime (Democracy Index: ${draw.rawData.metrics.democracy_index}/10)`
    });
  }

  if (stats.length === 0) {
    if (draw.luckScore >= 80) {
      return {
        type: 'positive',
        headline: `You've hit the jackpot: a life in the top ${100 - draw.luckScore}% of global outcomes`
      };
    } else {
      return {
        type: 'average',
        headline: `A relatively typical life with a Luck Score of ${draw.luckScore}%`
      };
    }
  }

  stats.sort((a, b) => b.severity - a.severity);
  return stats[0];
};

// Render Devastating Stat Box
const renderDevastatingStat = async (draw) => {
  const container = document.getElementById('devastating-stat-container');
  const headlineEl = document.getElementById('devastating-stat-headline');
  if (!container || !headlineEl) return;

  const userCData = await getCountryData(state.userCountry);
  const devStat = getDevastatingStat(draw, userCData);

  if (devStat) {
    headlineEl.textContent = devStat.headline;
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
};

// 2x Canvas Card Exporter for Social Sharing (1200x630 resolution)
const drawShareCard = async (draw, canvas) => {
  const ctx = canvas.getContext('2d');

  canvas.width = 1200;
  canvas.height = 630;

  if (document.fonts) {
    await document.fonts.ready;
  }

  // Background Gradient
  const grad = ctx.createLinearGradient(0, 0, 1200, 630);
  grad.addColorStop(0, '#16130E');
  grad.addColorStop(0.5, '#1E1A14');
  grad.addColorStop(1, '#16130E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // Grid Pattern overlay
  ctx.strokeStyle = 'rgba(55, 49, 42, 0.5)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1200; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 630);
    ctx.stroke();
  }
  for (let y = 0; y < 630; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  // Radial glow under luck score
  const radialGlow = ctx.createRadialGradient(900, 315, 10, 900, 315, 250);
  radialGlow.addColorStop(0, 'rgba(181, 138, 99, 0.12)');
  radialGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(600, 50, 600, 530);

  // Outer border frame
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, 1188, 618);

  // Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = 'bold 20px Inter Tight, system-ui, sans-serif';
  ctx.fillText('THE BIRTH LOTTERY', 80, 80);

  // Load Flag CDN SVG
  const flagImg = new Image();
  flagImg.crossOrigin = 'anonymous';
  flagImg.src = `https://flagcdn.com/${draw.iso2.toLowerCase()}.svg`;

  await new Promise((resolve) => {
    flagImg.onload = () => {
      ctx.save();
      const fx = 80, fy = 120, fw = 135, fh = 90;

      const r = 8;
      ctx.beginPath();
      ctx.moveTo(fx + r, fy);
      ctx.lineTo(fx + fw - r, fy);
      ctx.quadraticCurveTo(fx + fw, fy, fx + fw, fy + r);
      ctx.lineTo(fx + fw, fy + fh - r);
      ctx.quadraticCurveTo(fx + fw, fy + fh, fx + fw - r, fy + fh);
      ctx.lineTo(fx + r, fy + fh);
      ctx.quadraticCurveTo(fx, fy + fh, fx, fy + fh - r);
      ctx.lineTo(fx, fy + r);
      ctx.quadraticCurveTo(fx, fy, fx + r, fy);
      ctx.closePath();

      ctx.clip();
      ctx.drawImage(flagImg, fx, fy, fw, fh);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(fx, fy, fw, fh);
      resolve();
    };
    flagImg.onerror = () => resolve();
  });

  // Country Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 64px Inter Tight, system-ui, sans-serif';
  ctx.fillText(draw.name.toUpperCase(), 240, 185);

  // Stitched Persona
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '500 28px Inter, system-ui, sans-serif';

  const wrapText = (text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY;
  };

  const personaText = generateStitchedPersona(draw);
  const endY = wrapText(personaText, 80, 270, 600, 38);

  // Devastating Headline
  const userCData = await getCountryData(state.userCountry);
  const devStat = getDevastatingStat(draw, userCData);
  if (devStat) {
    ctx.fillStyle = 'rgba(188, 70, 59, 0.1)';
    ctx.fillRect(80, endY + 30, 600, 110);
    ctx.strokeStyle = 'rgba(188, 70, 59, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(80, endY + 30, 600, 110);

    ctx.fillStyle = '#BC463B';
    ctx.font = '800 14px Inter, system-ui, sans-serif';
    ctx.fillText('DEVASTATING STATISTIC', 100, endY + 60);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Inter, system-ui, sans-serif';
    wrapText(devStat.headline, 100, endY + 95, 560, 30);
  }

  // Circular progress Luck Score
  const cx = 900, cy = 315;
  ctx.strokeStyle = 'rgba(55, 49, 42, 0.6)';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, 140, 0, Math.PI * 2);
  ctx.stroke();

  const scorePercent = draw.luckScore / 100;
  let arcColor = '#7C9A6A';
  if (draw.luckScore <= 35) arcColor = '#BC463B';
  else if (draw.luckScore < 70) arcColor = '#C9974B';

  ctx.strokeStyle = arcColor;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 140, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * scorePercent));
  ctx.stroke();

  // Score value
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 90px Inter Tight, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${draw.luckScore}%`, cx, cy + 10);

  // Score label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.fillText('LUCK SCORE', cx, cy - 50);

  // Direction description
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  const scoreDesc = getLuckScoreHeroText(draw.luckScore);
  wrapText(scoreDesc, cx, cy + 68, 220, 22);

  ctx.textAlign = 'left';

  // Call to Action
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.font = '16px Inter, system-ui, sans-serif';
  ctx.fillText('Where you are born is pure chance.', 80, 560);
  ctx.fillStyle = 'rgba(181, 138, 99, 0.8)';
  ctx.fillText('birth-lottery.org', 80, 582);
};

// Trigger Web Share API
const handleShareCard = async () => {
  if (!state.activeDraw) return;
  const canvas = document.getElementById('share-canvas');
  if (!canvas) return;

  const shareBtn = document.getElementById('share-card-btn');
  const originalHtml = shareBtn.innerHTML;
  shareBtn.innerHTML = `Generating...`;
  shareBtn.disabled = true;

  try {
    await drawShareCard(state.activeDraw, canvas);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        shareBtn.innerHTML = originalHtml;
        shareBtn.disabled = false;
        return;
      }

      const file = new File([blob], `birth-lottery.png`, { type: 'image/png' });
      const shareData = {
        title: 'My Birth Lottery Draw',
        text: generateStitchedPersona(state.activeDraw) + ` Luck Score: ${state.activeDraw.luckScore}%. Play yours at:`,
        url: window.location.href
      };

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            ...shareData,
            files: [file]
          });
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') {
            console.error("Web share failed:", shareErr);
            fallbackShare(shareData);
          }
        }
      } else {
        fallbackShare(shareData);
      }
    });
  } catch (err) {
    console.error("Failed to generate share card:", err);
    alert("Could not share. Copied link to clipboard instead!");
    navigator.clipboard.writeText(window.location.href);
  } finally {
    shareBtn.innerHTML = originalHtml;
    shareBtn.disabled = false;
  }
};

// Download Card fallback
const handleDownloadCard = async () => {
  if (!state.activeDraw) return;
  const canvas = document.getElementById('share-canvas');
  if (!canvas) return;

  const downloadBtn = document.getElementById('download-card-btn');
  const originalHtml = downloadBtn.innerHTML;
  downloadBtn.innerHTML = `Generating...`;
  downloadBtn.disabled = true;

  try {
    await drawShareCard(state.activeDraw, canvas);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `birth-lottery-${state.activeDraw.name.toLowerCase()}-${state.activeDraw.luckScore}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  } catch (err) {
    console.error("Failed to generate download card:", err);
    alert("Could not generate download image.");
  } finally {
    downloadBtn.innerHTML = originalHtml;
    downloadBtn.disabled = false;
  }
};

const fallbackShare = (shareData) => {
  navigator.clipboard.writeText(window.location.href);
  alert(`Link copied to clipboard!\n\n"${shareData.text} ${window.location.href}"`);
};

// Counting up animation for Luck Score
const animateLuckScore = (targetScore, duration, callback) => {
  if (!el['luck-score-number']) {
    if (callback) callback();
    return;
  }

  let start = 0;
  const startTime = performance.now();

  const step = (timestamp) => {
    const elapsed = timestamp - startTime;
    const progress = Math.min(1.0, elapsed / duration);
    const easeProgress = progress * (2 - progress);
    const current = Math.round(easeProgress * targetScore);

    el['luck-score-number'].textContent = `${current}%`;

    if (progress < 1.0) {
      requestAnimationFrame(step);
    } else {
      el['luck-score-number'].textContent = `${targetScore}%`;
      if (callback) callback();
    }
  };

  requestAnimationFrame(step);
};

// Skip Spin Sequence
const skipSpin = () => {
  if (!state.isSpinning) return;
  if (state.spinTimerId) {
    clearTimeout(state.spinTimerId);
    state.spinTimerId = null;
  }

  if (el['wheel']) {
    el['wheel'].style.transition = 'none';
    el['wheel'].style.transform = 'none';
  }

  completeSpin(state.activeDraw, true);
};

// Complete Spin Sequence
const completeSpin = (draw, skipped = false) => {
  state.isSpinning = false;

  const drawLabelEl = document.getElementById('demographic-draw-label');
  if (drawLabelEl) {
    const labelSpan = drawLabelEl.querySelector('span');
    if (labelSpan) {
      labelSpan.textContent = t('draw_label_spin');
    }
  }

  if (el['spin-btn']) {
    const l = locales[state.lang];
    el['spin-btn'].innerHTML = l.spin_btn;
    el['spin-btn'].classList.remove('spinning');
    el['spin-btn'].classList.add('landed');
    el['spin-btn'].disabled = false;
  }
  // Transition needle from violet to sober after landing
  const needle = document.querySelector('.spinner-needle');
  if (needle) needle.classList.add('landed');

  if (el['country-name']) el['country-name'].textContent = draw.name;
  if (el['country-flag']) el['country-flag'].innerHTML = getFlagEmoji(draw.iso2, draw.name);

  const l = locales[state.lang];
  if (el['active-sex-badge']) {
    el['active-sex-badge'].innerHTML = `<span class="icon">👤</span> ${draw.sex === 'Female' ? l.gender_female : l.gender_male}`;
  }
  if (el['active-wealth-badge']) {
    const qKey = `quintile_${draw.quintile.toLowerCase()}`;
    el['active-wealth-badge'].innerHTML = `<span class="icon">💰</span> ${l[qKey]}`;
  }
  if (el['active-residence-badge']) {
    const rKey = `residence_${draw.residence.toLowerCase()}`;
    el['active-residence-badge'].innerHTML = `<span class="icon">📍</span> ${l[rKey]}`;
  }
  if (el['active-disability-badge']) {
    if (draw.hasDisability) {
      el['active-disability-badge'].classList.remove('hidden');
      el['active-disability-badge'].textContent = `♿ ${locales[state.lang].disabled}`;
    } else {
      el['active-disability-badge'].classList.add('hidden');
    }
  }

  const personaEl = document.getElementById('stitched-persona');
  if (personaEl) {
    personaEl.textContent = generateStitchedPersona(draw);
    personaEl.classList.remove('pulse-highlight');
    void personaEl.offsetWidth; // trigger reflow
    personaEl.classList.add('pulse-highlight');
  }

  const tagsContainer = document.querySelector('.characteristics-tags');
  if (tagsContainer) {
    tagsContainer.classList.remove('pulse-highlight');
    void tagsContainer.offsetWidth; // trigger reflow
    tagsContainer.classList.add('pulse-highlight');
  }

  renderDevastatingStat(draw);

  const scoreDescEl = document.getElementById('luck-score-desc');
  if (scoreDescEl) {
    scoreDescEl.textContent = getLuckScoreHeroText(draw.luckScore);
  }

  if (state.compareMode) {
    renderDraw(draw, 'active');
  }

  updateGlobe(draw);
  updateHash();

  if (skipped) {
    if (el['luck-score-number']) el['luck-score-number'].textContent = `${draw.luckScore}%`;
    updateMetricCards(draw, true);
  } else {
    animateLuckScore(draw.luckScore, 600, () => {
      updateMetricCards(draw, false);
    });
  }
};

// Align wheel rings to a draw result — instant skip for link/globe loads, animated for real spins
const alignWheelToDraw = (draw, instant) => {
  if (!el['wheel']) return;
  if (!state.wheelRingAngles) state.wheelRingAngles = { wealth: 0, residence: 0, sex: 0 };

  const quintileIdx = { Q1: 0, Q2: 1, Q3: 2, Q4: 3, Q5: 4 }[draw.quintile] ?? 0;
  const residenceIdx = draw.residence === 'Urban' ? 0 : 1;
  const sexIdx = draw.sex === 'Male' ? 0 : 1;

  const wealthOffset = (360 - ((quintileIdx + 0.5) * 72) % 360) % 360;
  const residenceOffset = (360 - ((residenceIdx + 0.5) * 180) % 360) % 360;
  const sexOffset = (360 - ((sexIdx + 0.5) * 180) % 360) % 360;

  if (instant) {
    state.wheelRingAngles.wealth = wealthOffset;
    state.wheelRingAngles.residence = residenceOffset;
    state.wheelRingAngles.sex = sexOffset;
    ['wheel-wealth', 'wheel-residence', 'wheel-sex'].forEach((id, i) => {
      const g = document.getElementById(id);
      if (!g) return;
      g.style.transition = 'none';
      g.style.transform = `rotate(${[wealthOffset, residenceOffset, sexOffset][i]}deg)`;
    });
  } else {
    state.wheelRingAngles.wealth += (5 + Math.floor(Math.random() * 3)) * 360 + wealthOffset;
    state.wheelRingAngles.residence += (4 + Math.floor(Math.random() * 3)) * 360 + residenceOffset;
    state.wheelRingAngles.sex += (3 + Math.floor(Math.random() * 3)) * 360 + sexOffset;
    const spinRing = (id, angle, duration) => {
      const g = document.getElementById(id);
      if (!g) return;
      g.style.transition = `transform ${duration}s cubic-bezier(0.12, 0.8, 0.18, 1)`;
      g.style.transform = `rotate(${angle}deg)`;
    };
    spinRing('wheel-wealth', state.wheelRingAngles.wealth, 2.6);
    spinRing('wheel-residence', state.wheelRingAngles.residence, 2.2);
    spinRing('wheel-sex', state.wheelRingAngles.sex, 1.9);
  }
};

// Main Spin Lottery Handler
const handleSpin = async () => {
  if (state.isSpinning) {
    skipSpin();
    return;
  }

  state.isSpinning = true;
  if (el['spin-btn']) {
    el['spin-btn'].classList.remove('landed');
    el['spin-btn'].classList.add('spinning');
    el['spin-btn'].disabled = false;
  }
  // Reset needle to violet
  const needle = document.querySelector('.spinner-needle');
  if (needle) needle.classList.remove('landed');

  switchToTab('single');
  if (state.compareMode) {
    if (el['comparison-area']) el['comparison-area'].classList.remove('hidden');
    if (el['draw-results-section']) el['draw-results-section'].classList.add('hidden');
  } else {
    if (el['draw-results-section']) el['draw-results-section'].classList.remove('hidden');
    if (el['comparison-area']) el['comparison-area'].classList.add('hidden');
  }

  const finalDraw = drawLottery();

  const finalCountryData = await getCountryData(finalDraw.code);
  if (!finalCountryData) {
    state.isSpinning = false;
    if (el['spin-btn']) {
      el['spin-btn'].innerHTML = locales[state.lang].spin_btn;
      el['spin-btn'].classList.remove('spinning');
    }
    return;
  }

  if (!state.filters.ruralOnly) {
    const urbanPct = finalCountryData.urban_pct / 100.0;
    finalDraw.residence = Math.random() < urbanPct ? 'Urban' : 'Rural';
  }
  const calculated = calculateGroupMetrics(finalCountryData, finalDraw.sex, finalDraw.quintile, finalDraw.residence);
  const resolvedDraw = { ...finalDraw, ...calculated, rawData: finalCountryData };
  state.activeDraw = resolvedDraw;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    completeSpin(resolvedDraw, true);
    return;
  }

  let currentDelay = 80;
  let elapsed = 0;
  const maxDuration = 2000;

  // Spin each demographic ring to land on the drawn result
  if (el['wheel']) el['wheel'].style.transform = 'none';
  alignWheelToDraw(resolvedDraw, false);

  state.spinTimerId = null;

  const tick = () => {
    if (!state.isSpinning) return;

    const tempCountry = state.dataIndex[Math.floor(Math.random() * state.dataIndex.length)];
    if (el['country-name']) el['country-name'].textContent = tempCountry.name;
    if (el['country-flag']) el['country-flag'].innerHTML = getFlagEmoji(tempCountry.iso2, tempCountry.name);

    elapsed += currentDelay;
    currentDelay = Math.min(350, currentDelay * 1.14);

    if (elapsed >= maxDuration) {
      completeSpin(resolvedDraw, false);
    } else {
      state.spinTimerId = setTimeout(tick, currentDelay);
    }
  };

  state.spinTimerId = setTimeout(tick, currentDelay);
};

// Handle interactive country clicks on D3 Earth globe
const handleCountryClick = async (feature) => {
  if (state.isSpinning) return;
  const numericId = parseInt(feature.id, 10);
  let code = null;
  for (const [c, id] of Object.entries(state.iso3ToNumericMap)) {
    if (id === numericId) {
      code = c;
      break;
    }
  }

  // Fallback: match by name in state.dataIndex
  if (!code && feature.properties && feature.properties.name) {
    const name = feature.properties.name.toLowerCase().trim();
    const found = state.dataIndex.find(c => c.name.toLowerCase().trim() === name || c.name.toLowerCase().includes(name));
    if (found) code = found.code;
  }

  if (!code) return;

  // Create a custom draw for this specific country based on active filters
  const sex = state.filters.femaleOnly ? 'Female' : (Math.random() < 0.488 ? 'Female' : 'Male');
  const quintiles = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const quintile = quintiles[Math.floor(Math.random() * 5)];

  const countryData = await getCountryData(code);
  if (!countryData) return;

  let residence = 'Urban';
  if (state.filters.ruralOnly) {
    residence = 'Rural';
  } else {
    const urbanPct = (countryData.urban_pct || 50) / 100.0;
    residence = Math.random() < urbanPct ? 'Urban' : 'Rural';
  }

  const calculated = calculateGroupMetrics(countryData, sex, quintile, residence);

  // In compare mode: push active draw to held, spin a new active one for this country
  if (state.compareMode) {
    state.heldDraw = state.activeDraw ? { ...state.activeDraw } : null;
  }

  state.activeDraw = {
    code,
    iso2: countryData.iso2,
    name: countryData.name,
    sex,
    quintile,
    residence,
    ...calculated,
    rawData: countryData
  };

  // Switch view to individual results tab
  switchToTab('single');
  if (state.compareMode) {
    if (el['comparison-area']) el['comparison-area'].classList.remove('hidden');
    if (el['draw-results-section']) el['draw-results-section'].classList.add('hidden');
    renderDraw(state.heldDraw, 'held');
  } else {
    if (el['draw-results-section']) el['draw-results-section'].classList.remove('hidden');
    if (el['comparison-area']) el['comparison-area'].classList.add('hidden');
  }

  renderDraw(state.activeDraw, 'active');
  alignWheelToDraw(state.activeDraw, true);

  const drawLabelEl = document.getElementById('demographic-draw-label');
  if (drawLabelEl) {
    const labelSpan = drawLabelEl.querySelector('span');
    if (labelSpan) {
      labelSpan.textContent = t('draw_label_click');
    }
  }

  updateGlobe(state.activeDraw);
  updateHash();
};

// Calculations for Group-Specific Metrics
const calculateGroupMetrics = (cData, sex, quintile, residence) => {
  const m = cData.metrics;
  const isFemale = sex === 'Female';
  const isRural = residence === 'Rural';

  // Map quintile index
  const qMap = { 'Q1': 0, 'Q2': 1, 'Q3': 2, 'Q4': 3, 'Q5': 4 };
  const qIdx = qMap[quintile];

  // 1. Income (PPP Adjusted Annual Equivalents)
  const share = cData.distributions.quintile_shares[qIdx];
  // scale GDP per capita by quintile share relative to 20% flat share
  let income = Math.round(m.gdp_pc_ppp * (share / 0.20));
  if (income < 300) income = 300; // minimum survival floor

  // 2. Life Expectancy
  let lifeExp = isFemale ? m.life_exp_female : m.life_exp_male;
  const lifeExpQOffsets = [-4.5, -2.0, 0.0, 2.0, 4.5];
  lifeExp += lifeExpQOffsets[qIdx];
  lifeExp += isRural ? -1.0 : 1.0;
  lifeExp = Math.max(38.0, Math.min(92.0, Math.round(lifeExp * 10) / 10));

  // 3. Under-5 Mortality (probability per 1,000 births)
  const under5QFactors = [1.8, 1.3, 1.0, 0.6, 0.35];
  let under5 = m.under5_mortality * under5QFactors[qIdx];
  under5 = under5 * (isRural ? 1.2 : 0.8);
  under5 = Math.max(2.0, Math.min(320.0, Math.round(under5 * 10) / 10));

  // 4. Maternal Mortality Risk (calculated for females, default 0 for males)
  let maternalRisk = 0;
  if (isFemale) {
    // Maternal mortality ratio is deaths per 100,000 live births.
    // Lifetime risk incorporates fertility rates. We approximate it:
    // Risk = 1 - (1 - MMR/100,000) ^ TFR.
    const mmr = m.maternal_mortality;
    const tfr = m.gdp_pc_ppp > 30000 ? 1.6 : (m.gdp_pc_ppp > 10000 ? 2.1 : 4.5);
    const rawRisk = 1.0 - Math.pow(1.0 - (mmr / 100000.0), tfr);
    maternalRisk = Math.round(rawRisk * 10000) / 100; // percent probability
    // scale by wealth
    const matQFactors = [1.6, 1.2, 1.0, 0.7, 0.4];
    maternalRisk = Math.max(0.01, Math.min(15.0, Math.round(maternalRisk * matQFactors[qIdx] * 100) / 100));
  }

  // 5. Schooling (Expected Years)
  // Guard: many countries have null schooling in the dataset — keep it null rather
  // than letting arithmetic coerce it to a fake low value.
  const schoolQOffsets = [-2.5, -1.0, 0.0, 1.0, 2.5];
  let schooling = (m.schooling != null)
    ? Math.max(1.0, Math.min(20.0, Math.round(
      (m.schooling + schoolQOffsets[qIdx] + (isRural ? -0.8 : 0.8)) * 10) / 10))
    : null;

  // 6. Access to Utilities
  let electricity = isRural ? m.electricity_rural : m.electricity_urban;
  electricity += (qIdx - 2) * 5.0; // scale slightly by wealth
  electricity = Math.max(0.0, Math.min(100.0, Math.round(electricity * 10) / 10));

  let water = m.water_basic;
  water += isRural ? -8.0 : 4.0;
  water += (qIdx - 2) * 6.0;
  water = Math.max(0.0, Math.min(100.0, Math.round(water * 10) / 10));

  let sanitation = m.sanitation_basic;
  sanitation += isRural ? -12.0 : 6.0;
  sanitation += (qIdx - 2) * 8.0;
  sanitation = Math.max(0.0, Math.min(100.0, Math.round(sanitation * 10) / 10));

  // 7. Child Marriage & FGM (Female specific)
  let childMarriage = 0;
  if (isFemale) {
    const cmFactor = [1.6, 1.2, 0.9, 0.5, 0.2];
    childMarriage = Math.max(0.0, Math.min(95.0, Math.round(m.child_marriage * cmFactor[qIdx] * 10) / 10));
  }

  let fgm = 0;
  if (isFemale && m.fgm_prevalence > 0) {
    const fgmFactor = [1.3, 1.1, 0.9, 0.7, 0.4];
    fgm = Math.max(0.0, Math.min(98.0, Math.round(m.fgm_prevalence * fgmFactor[qIdx] * 10) / 10));
  }

  // 8. Luck Score (0 - 100 percentile score)
  // Weighted score on Income log-scale, life expectancy, and schooling
  const incomeScore = Math.min(100, Math.max(0, (Math.log(income) - Math.log(300)) / (Math.log(120000) - Math.log(300)) * 100));
  const lifeScore = Math.min(100, Math.max(0, (lifeExp - 40) / (90 - 40) * 100));
  const schoolScore = Math.min(100, Math.max(0, (schooling - 2) / (18 - 2) * 100));

  let luckScore = Math.round(0.4 * incomeScore + 0.3 * lifeScore + 0.3 * schoolScore);

  let hasDisability = false;
  // Disability adjustment if toggle is active
  if (state.disabilityToggle) {
    // 15% probability of drawing disability
    hasDisability = Math.random() < 0.15;
    if (hasDisability) {
      luckScore = Math.max(0, Math.round(luckScore * 0.75));
      lifeExp = Math.max(38, Math.round(lifeExp * 0.9 * 10) / 10);
      schooling = Math.max(1, Math.round(schooling * 0.7 * 10) / 10);
    }
  }

  return {
    income,
    lifeExp,
    under5,
    maternalRisk,
    schooling,
    electricity,
    water,
    sanitation,
    childMarriage,
    fgm,
    luckScore,
    hasDisability
  };
};

// Render Sorteo Result on DOM
const renderDraw = async (draw, target = 'active') => {
  if (!draw) return;
  const l = locales[state.lang];

  if (target === 'active') {
    // Main dashboard display
    if (el['country-name']) el['country-name'].textContent = draw.name;
    if (el['country-flag']) el['country-flag'].innerHTML = getFlagEmoji(draw.iso2, draw.name);

    // Characteristics badges
    if (el['active-sex-badge']) {
      el['active-sex-badge'].innerHTML = `<span class="icon">👤</span> ${draw.sex === 'Female' ? l.gender_female : l.gender_male}`;
    }
    if (el['active-wealth-badge']) {
      const qKey = `quintile_${draw.quintile.toLowerCase()}`;
      el['active-wealth-badge'].innerHTML = `<span class="icon">💰</span> ${l[qKey]}`;
    }
    if (el['active-residence-badge']) {
      const rKey = `residence_${draw.residence.toLowerCase()}`;
      el['active-residence-badge'].innerHTML = `<span class="icon">📍</span> ${l[rKey]}`;
    }

    // Disability badge
    if (el['active-disability-badge']) {
      if (draw.hasDisability) {
        el['active-disability-badge'].classList.remove('hidden');
        el['active-disability-badge'].textContent = `♿ ${l.disabled}`;
      } else {
        el['active-disability-badge'].classList.add('hidden');
      }
    }

    // Stitched persona
    const personaEl = document.getElementById('stitched-persona');
    if (personaEl) {
      personaEl.textContent = generateStitchedPersona(draw);
      personaEl.classList.remove('pulse-highlight');
      void personaEl.offsetWidth; // trigger reflow
      personaEl.classList.add('pulse-highlight');
    }

    const tagsContainer = document.querySelector('.characteristics-tags');
    if (tagsContainer) {
      tagsContainer.classList.remove('pulse-highlight');
      void tagsContainer.offsetWidth; // trigger reflow
      tagsContainer.classList.add('pulse-highlight');
    }

    // Devastating stat
    renderDevastatingStat(draw);

    // Luck score description
    const scoreDescEl = document.getElementById('luck-score-desc');
    if (scoreDescEl) {
      scoreDescEl.textContent = getLuckScoreHeroText(draw.luckScore);
    }

    // Luck score number (if not currently spinning/animating)
    if (!state.isSpinning) {
      if (el['luck-score-number']) el['luck-score-number'].textContent = `${draw.luckScore}%`;
    }

    // Update Globe visualization
    updateGlobe(draw);

    // Render specific cards with comparative values
    updateMetricCards(draw, false);
  } else if (target === 'held') {
    // Held column in comparison view
    if (el['compare-name-1']) el['compare-name-1'].textContent = draw.name;
    if (el['compare-flag-1']) el['compare-flag-1'].innerHTML = getFlagEmoji(draw.iso2, draw.name);

    // tags
    if (el['compare-tags-1']) {
      const qKey = `quintile_${draw.quintile.toLowerCase()}`;
      const rKey = `residence_${draw.residence.toLowerCase()}`;
      el['compare-tags-1'].innerHTML = `
        <span class="badge">${draw.sex === 'Female' ? l.gender_female : l.gender_male}</span>
        <span class="badge">${l[qKey]}</span>
        <span class="badge">${l[rKey]}</span>
        <span class="badge primary">${draw.luckScore}% ${l.luck_pct}</span>
      `;
    }
  }

  // Update comparing active column
  if (state.compareMode && target === 'active') {
    if (el['compare-name-2']) el['compare-name-2'].textContent = draw.name;
    if (el['compare-flag-2']) el['compare-flag-2'].innerHTML = getFlagEmoji(draw.iso2, draw.name);
    if (el['compare-tags-2']) {
      const qKey = `quintile_${draw.quintile.toLowerCase()}`;
      const rKey = `residence_${draw.residence.toLowerCase()}`;
      el['compare-tags-2'].innerHTML = `
        <span class="badge">${draw.sex === 'Female' ? l.gender_female : l.gender_male}</span>
        <span class="badge">${l[qKey]}</span>
        <span class="badge">${l[rKey]}</span>
        <span class="badge primary">${draw.luckScore}% ${l.luck_pct}</span>
      `;
    }
  }
};

// Render Individual Metric Card details and compare lines
const updateMetricCards = async (draw, instant = false) => {
  // Fetch actual country data for side-by-side comparison markers
  const uCode = state.userCountry;
  const userCData = await getCountryData(uCode);
  const l = locales[state.lang];

  const isComparingHeld = state.compareMode && state.heldDraw;
  const compareIso2 = isComparingHeld ? state.heldDraw.iso2 : (userCData ? userCData.iso2 : null);
  const compareName = isComparingHeld ? state.heldDraw.name : (userCData ? userCData.name : '');

  const compMetrics = {
    lifeExp: isComparingHeld ? state.heldDraw.lifeExp : (userCData ? userCData.metrics.life_exp : null),
    under5: isComparingHeld ? state.heldDraw.under5 : (userCData ? userCData.metrics.under5_mortality : null),
    maternalRisk: isComparingHeld ? state.heldDraw.maternalRisk : (userCData ? userCData.metrics.maternal_mortality / 1000 : null),
    schooling: isComparingHeld ? state.heldDraw.schooling : (userCData ? userCData.metrics.schooling : null),
    income: isComparingHeld ? state.heldDraw.income : (userCData ? userCData.metrics.gdp_pc_ppp : null),
    electricity: isComparingHeld ? state.heldDraw.electricity : (userCData ? userCData.metrics.electricity_total : null),
    water: isComparingHeld ? state.heldDraw.water : (userCData ? userCData.metrics.water_basic : null),
    sanitation: isComparingHeld ? state.heldDraw.sanitation : (userCData ? userCData.metrics.sanitation_basic : null),
    democracy: isComparingHeld ? state.heldDraw.rawData.metrics.democracy_index : (userCData ? userCData.metrics.democracy_index : null),
    conflict: isComparingHeld ? state.heldDraw.rawData.metrics.conflict_deaths : (userCData ? userCData.metrics.conflict_deaths : null),
    childMarriage: isComparingHeld ? state.heldDraw.childMarriage : (userCData ? userCData.metrics.child_marriage : null),
    fgm: isComparingHeld ? state.heldDraw.fgm : null
  };

  const formatCardValueOnly = (val, unitType) => {
    if (val === null || val === undefined) return '--';
    const cleanVal = typeof val === 'string' ? val.replace(/,/g, '') : val;
    const num = parseFloat(cleanVal);
    if (isNaN(num)) return val;

    if (unitType === 'USD') {
      return Math.round(num).toLocaleString();
    }
    if (unitType === '%') {
      const decimals = num < 1 ? 2 : 1;
      return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    }
    if (unitType === 'yrs' || unitType === '\u2030' || unitType === '/10') {
      return (Math.round(num * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    }
    if (unitType === 'deaths') {
      return Math.round(num).toLocaleString();
    }
    return Math.round(num).toLocaleString();
  };

  const formatComparisonValue = (val, unitType) => {
    if (val === null || val === undefined) return '';
    const num = parseFloat(val);
    if (isNaN(num)) return val;

    if (unitType === 'USD') {
      return `$${Math.round(num).toLocaleString()}`;
    }
    if (unitType === '%') {
      const decimals = num < 1 ? 2 : 1;
      return `${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })}%`;
    }
    if (unitType === 'yrs') {
      return `${(Math.round(num * 10) / 10)} ${t('unit_yrs')}`;
    }
    if (unitType === '\u2030') {
      return `${(Math.round(num * 10) / 10)} \u2030`;
    }
    if (unitType === '/10') {
      return `${(Math.round(num * 10) / 10)}/10`;
    }
    if (unitType === 'deaths') {
      return `${Math.round(num).toLocaleString()} ${t('unit_deaths')}`;
    }
    return `${Math.round(num).toLocaleString()}`;
  };

  const updateCard = (cardId, value, unit, minVal, maxVal, userVal = null, userLabelText = '', instant = false, useAbsoluteScale = false) => {
    const cardEl = document.getElementById(`${cardId}-card`);
    const valEl = document.getElementById(`${cardId}-val`);
    const activeFillEl = document.getElementById(`${cardId}-fill`);
    const activeFlagEl = document.getElementById(`${cardId}-flag-active`);
    const activeValLabelEl = document.getElementById(`${cardId}-val-active`);

    const compareRowEl = cardEl ? cardEl.querySelector('.compare-bar-row') : null;
    const compareFillEl = document.getElementById(`${cardId}-fill-compare`);
    const compareFlagEl = document.getElementById(`${cardId}-flag-compare`);
    const compareValLabelEl = document.getElementById(`${cardId}-val-compare`);

    if (valEl) {
      valEl.textContent = formatCardValueOnly(value, unit);
    }

    if (activeFlagEl) {
      activeFlagEl.innerHTML = getFlagEmoji(draw.iso2, draw.name);
    }
    if (activeValLabelEl) {
      activeValLabelEl.textContent = formatComparisonValue(value, unit);
    }

    // Toggle transition if instant requested
    const setTransition = (el, styleVal) => {
      if (el) el.style.transition = styleVal;
    };

    if (instant) {
      setTransition(activeFillEl, 'none');
      setTransition(compareFillEl, 'none');
    } else {
      setTransition(activeFillEl, '');
      setTransition(compareFillEl, '');
    }

    const numVal = parseFloat(typeof value === 'string' ? value.replace(/,/g, '') : value);
    let activePct = 0;
    let comparePct = 0;

    if (userVal !== null && userVal !== undefined) {
      if (compareRowEl) compareRowEl.classList.remove('hidden');

      const numUserVal = parseFloat(userVal);
      const maxOfTwo = Math.max(numVal, numUserVal);

      if (useAbsoluteScale) {
        // Absolute scaling: each bar reflects position within [minVal, maxVal]
        // Prevents tiny near-zero values from making one bar look 100% vs the other.
        const range = maxVal - minVal;
        activePct = range > 0 ? Math.min(100, ((numVal - minVal) / range) * 100) : 0;
        comparePct = range > 0 ? Math.min(100, ((numUserVal - minVal) / range) * 100) : 0;
        if (numVal > minVal) activePct = Math.max(3.5, activePct);
        if (numUserVal > minVal) comparePct = Math.max(3.5, comparePct);
      } else if (maxOfTwo > 0) {
        activePct = (numVal / maxOfTwo) * 100;
        comparePct = (numUserVal / maxOfTwo) * 100;
        // Only apply minimum stub width for non-zero values so the bar is legible
        if (numVal > 0) activePct = Math.max(3.5, Math.min(100, activePct));
        if (numUserVal > 0) comparePct = Math.max(3.5, Math.min(100, comparePct));
      } else {
        // Both are 0 — render both bars as fully empty
        activePct = 0;
        comparePct = 0;
      }

      if (compareFlagEl && compareIso2 && compareName) {
        compareFlagEl.innerHTML = getFlagEmoji(compareIso2, compareName);
      }
      if (compareValLabelEl) {
        compareValLabelEl.textContent = formatComparisonValue(userVal, unit);
      }
      if (compareFillEl) {
        compareFillEl.style.width = `${comparePct}%`;
      }
    } else {
      if (compareRowEl) compareRowEl.classList.add('hidden');
      activePct = Math.min(100, Math.max(0, ((numVal - minVal) / (maxVal - minVal)) * 100));
      if (numVal > 0) activePct = Math.max(3.5, activePct);
    }

    if (activeFillEl) {
      activeFillEl.style.width = `${activePct}%`;
    }

    // Color code based on percentile of active and relative gaps
    if (cardEl) {
      cardEl.classList.remove('card-state-safe', 'card-state-risk');
      if (activeFillEl) activeFillEl.classList.remove('safe-bar', 'risk-bar');

      let stateClass = '';

      // Custom heuristic per category to define safety/risk thresholds
      if (cardId === 'life-exp') {
        if (numVal >= 75) stateClass = 'card-state-safe';
        else if (numVal < 60) stateClass = 'card-state-risk';
      } else if (cardId === 'under5-mort') {
        if (numVal <= 10) stateClass = 'card-state-safe';
        else if (numVal > 50) stateClass = 'card-state-risk';
      } else if (cardId === 'maternal-risk') {
        if (numVal < 0.1) stateClass = 'card-state-safe';
        else if (numVal > 1.5) stateClass = 'card-state-risk';
      } else if (cardId === 'schooling') {
        if (numVal >= 12.5) stateClass = 'card-state-safe';
        else if (numVal < 6) stateClass = 'card-state-risk';
      } else if (cardId === 'income') {
        if (numVal >= 25000) stateClass = 'card-state-safe';
        else if (numVal < 3000) stateClass = 'card-state-risk';
      } else if (cardId === 'electricity' || cardId === 'water' || cardId === 'sanitation') {
        if (numVal >= 90) stateClass = 'card-state-safe';
        else if (numVal < 40) stateClass = 'card-state-risk';
      } else if (cardId === 'democracy') {
        if (numVal >= 7.5) stateClass = 'card-state-safe';
        else if (numVal < 4.0) stateClass = 'card-state-risk';
      } else if (cardId === 'conflict') {
        if (numVal === 0) stateClass = 'card-state-safe';
        else if (numVal > 50) stateClass = 'card-state-risk';
      } else if (cardId === 'child-marriage') {
        if (numVal <= 5) stateClass = 'card-state-safe';
        else if (numVal > 30) stateClass = 'card-state-risk';
      } else if (cardId === 'fgm-risk') {
        if (numVal <= 1) stateClass = 'card-state-safe';
        else if (numVal > 25) stateClass = 'card-state-risk';
      }

      if (stateClass) {
        cardEl.classList.add(stateClass);
      }

      // Apply corresponding styling to the fill bars
      const fillBarClass = stateClass === 'card-state-safe' ? 'safe-bar' : (stateClass === 'card-state-risk' ? 'risk-bar' : '');
      if (fillBarClass) {
        if (activeFillEl) activeFillEl.classList.add(fillBarClass);
      }
    }

    // ContrastBar: deficit hatch + values row
    const hatchEl = document.getElementById(`${cardId}-deficit-hatch`);
    const cbValuesEl = document.getElementById(`${cardId}-cb-values`);
    if (hatchEl && cbValuesEl) {
      if (userVal !== null && userVal !== undefined) {
        const numUserVal = parseFloat(userVal);
        const polarityMap = {
          'life-exp': 'more', 'under5-mort': 'less', 'maternal-risk': 'less',
          'income': 'more', 'electricity': 'more', 'water': 'more',
          'sanitation': 'more', 'schooling': 'more', 'democracy': 'more',
          'conflict': 'less', 'child-marriage': 'less', 'fgm-risk': 'less',
        };
        const polarity = polarityMap[cardId] || 'more';
        const deficit = polarity === 'more' ? (numUserVal - numVal) : (numVal - numUserVal);
        const isDeficit = deficit > 0;

        const fmtCB = (v) => {
          if (unit === 'USD' || unit === 'PPP$') return '$' + (v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(0));
          if (v >= 100) return Math.round(v).toString();
          if (v >= 10) return v.toFixed(1);
          return v.toFixed(1);
        };

        const cbDrawEl = document.getElementById(`${cardId}-cb-draw`);
        const cbBaseEl = document.getElementById(`${cardId}-cb-base`);
        const cbDeficitEl = document.getElementById(`${cardId}-cb-deficit`);
        if (cbDrawEl) cbDrawEl.textContent = fmtCB(numVal);
        if (cbBaseEl) cbBaseEl.textContent = fmtCB(numUserVal);

        const lo = Math.min(activePct, comparePct);
        const gapPct = Math.abs(activePct - comparePct);
        if (isDeficit && gapPct > 0.5) {
          hatchEl.style.left = `${lo}%`;
          hatchEl.style.width = `${gapPct}%`;
          hatchEl.style.display = 'block';
          if (cbDeficitEl) {
            cbDeficitEl.textContent = `−${fmtCB(Math.abs(deficit))} ${polarity === 'more' ? l.deficit_short : l.deficit_excess}`;
            cbDeficitEl.className = 'cb-deficit-label';
          }
        } else {
          hatchEl.style.display = 'none';
          if (cbDeficitEl) {
            if (!isDeficit && gapPct > 0.5) {
              cbDeficitEl.textContent = `+${fmtCB(Math.abs(deficit))} ${l.deficit_ahead}`;
              cbDeficitEl.className = 'cb-surplus-label';
            } else {
              cbDeficitEl.textContent = l.deficit_parity;
              cbDeficitEl.className = 'cb-parity-label';
            }
          }
        }
        cbValuesEl.style.display = 'flex';
      } else {
        hatchEl.style.display = 'none';
        cbValuesEl.style.display = 'none';
      }
    }
  };

  // 1. Survival & Health
  updateCard('life-exp', draw.lifeExp, 'yrs', 40, 90, compMetrics.lifeExp, '', instant, true);
  updateCard('under5-mort', draw.under5, '‰', 1, 250, compMetrics.under5, '', instant, true);

  const matEl = document.getElementById('maternal-card');
  const activeFemale = draw.sex === 'Female';
  const compareFemale = isComparingHeld
    ? state.heldDraw.sex === 'Female'
    : false; // user-country baseline is national-level, not sex-specific

  if (activeFemale || compareFemale) {
    if (matEl) matEl.classList.remove('hidden');
    // Active value: use real risk for females, 0 for males
    const activeMatRisk = activeFemale ? draw.maternalRisk : 0;
    // Compare value: use held draw's risk for females, 0 for males (or null if no compare)
    const compareMatRisk = isComparingHeld
      ? (compareFemale ? state.heldDraw.maternalRisk : 0)
      : compMetrics.maternalRisk;
    updateCard('maternal-risk', activeMatRisk, '%', 0, 15, compareMatRisk, '', instant, true);
  } else {
    if (matEl) matEl.classList.add('hidden');
  }

  // 2. Education
  updateCard('schooling', draw.schooling, 'yrs', 0, 18, compMetrics.schooling, '', instant, true);

  // School completion probabilities
  // Only calculate when real schooling data exists; otherwise show '--' so the
  // cards don't appear blank or carry a misleading near-zero value.
  if (draw.schooling != null) {
    const primPct = Math.min(99, Math.max(5, Math.round(100 / (1 + Math.exp(-(draw.schooling - 5.5) / 1.2)))));
    const secPct = Math.min(99, Math.max(1, Math.round(100 / (1 + Math.exp(-(draw.schooling - 11.5) / 1.8)))));
    const tertPct = Math.min(95, Math.max(1, Math.round(100 / (1 + Math.exp(-(draw.schooling - 15.5) / 2.2)))));
    updateCard('school-prim', primPct, '%', 0, 100, null, '', instant);
    updateCard('school-sec', secPct, '%', 0, 100, null, '', instant);
    updateCard('school-tert', tertPct, '%', 0, 100, null, '', instant);
  } else {
    updateCard('school-prim', null, '%', 0, 100, null, '', instant);
    updateCard('school-sec', null, '%', 0, 100, null, '', instant);
    updateCard('school-tert', null, '%', 0, 100, null, '', instant);
  }

  // 3. Material Conditions
  updateCard('income', draw.income, 'USD', 300, 100000, compMetrics.income, '', instant, true);
  updateCard('electricity', draw.electricity, '%', 0, 100, compMetrics.electricity, '', instant, true);
  updateCard('water', draw.water, '%', 0, 100, compMetrics.water, '', instant, true);
  updateCard('sanitation', draw.sanitation, '%', 0, 100, compMetrics.sanitation, '', instant, true);

  // 4. Freedoms & Risk
  updateCard('democracy', draw.rawData.metrics.democracy_index, '/10', 0, 10, compMetrics.democracy, '', instant, true);
  updateCard('conflict', draw.rawData.metrics.conflict_deaths, 'deaths', 0, 1000, compMetrics.conflict, '', instant, true);

  // Female-specific risks
  const marriageEl = document.getElementById('child-marriage-card');
  const fgmEl = document.getElementById('fgm-card');

  if (draw.sex === 'Female' && draw.childMarriage > 0) {
    if (marriageEl) marriageEl.classList.remove('hidden');
    updateCard('child-marriage', draw.childMarriage, '%', 0, 90, compMetrics.childMarriage, '', instant, true);
  } else {
    if (marriageEl) marriageEl.classList.add('hidden');
  }

  if (draw.sex === 'Female' && draw.rawData.metrics.fgm_prevalence > 0) {
    if (fgmEl) fgmEl.classList.remove('hidden');
    updateCard('fgm-risk', draw.fgm, '%', 0, 100, compMetrics.fgm, '', instant);
  } else {
    if (fgmEl) fgmEl.classList.add('hidden');
  }
};

// Render Data Gaps list dynamically
const GAP_LABELS = {
  life_exp: 'Life Expectancy',
  under5_mortality: 'Under-5 Mortality',
  schooling: 'Expected Years of Schooling',
  gdp_pc_ppp: 'GDP per Capita (PPP)',
  electricity_total: 'Electricity Access',
  water_basic: 'Basic Water Access',
  sanitation_basic: 'Basic Sanitation',
};

const renderDataGaps = () => {
  if (!el['gaps-list'] || !state.activeDraw) return;
  while (el['gaps-list'].firstChild) el['gaps-list'].removeChild(el['gaps-list'].firstChild);

  const gaps = state.activeDraw.rawData.data_gaps || [];
  if (gaps.length === 0) {
    const item = document.createElement('div');
    item.className = 'gap-item';
    const lbl = document.createElement('span');
    lbl.className = 'gap-label';
    lbl.textContent = t('gaps_no_gaps');
    item.appendChild(lbl);
    el['gaps-list'].appendChild(item);
    return;
  }

  gaps.forEach(g => {
    const item = document.createElement('div');
    item.className = 'gap-item';
    const lbl = document.createElement('span');
    lbl.className = 'gap-label';
    lbl.textContent = GAP_LABELS[g] || g;
    const status = document.createElement('span');
    status.className = 'gap-status';
    status.textContent = t('gaps_status');
    item.append(lbl, status);
    el['gaps-list'].appendChild(item);
  });
};

// ─── Survival dot animation helpers (Step 1, matches zip design) ─────────────

let _survivalRaf = null;

const stopSurvivalAnimation = () => {
  if (_survivalRaf) { cancelAnimationFrame(_survivalRaf); _survivalRaf = null; }
};

const generateSurvivalAgesFromCohort = (cohortDraws) =>
  cohortDraws.map(d => {
    if (d.diedUnder5) return d.deathAge != null ? d.deathAge : Math.random() * 4.9;

    const lifeExp = d.lifeExp || 70;

    // Background young/middle-adult mortality (accidents, illness, violence — not
    // old-age decline). A pure normal around lifeExp leaves ages 18-55 nearly
    // empty, which doesn't match reality. Rate roughly tracks UN's 45q15 metric:
    // ~5% Japan-tier, ~10% USA-tier, ~15% middle-income, ~25% low-income.
    // These deaths spread uniformly across ages 5-60.
    const bgRate = 0.05 + Math.max(0, (82 - lifeExp)) * 0.008;
    if (Math.random() < bgRate) {
      return 5 + Math.random() * 55;
    }

    // Main old-age mortality: tighter normal so the right tail matches real
    // centenarian rates even after cohort variance amplifies it. Sigma of
    // ~8.5% of lifeExp keeps Q5-Urban-Female subgroups from inflating the tail.
    const mu = lifeExp + 3.5;
    const sigma = Math.min(8, Math.max(5, lifeExp * 0.085));
    const u = Math.random() || 0.0001;
    const v = Math.random() || 0.0001;
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(5.01, Math.min(115, mu + z * sigma));
  });

const deterministicShuffle = (arr, seedStr) => {
  const result = [...arr];
  let seed = [...(seedStr || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) * 17;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const renderSurvivalStep = (isResize) => {
  const container = document.getElementById('chart-story-container');
  if (!container || !state.cohortDraws?.length) return;

  stopSurvivalAnimation();
  container.querySelectorAll('svg, .chart-loader, .chart-placeholder-message, .survival-canvas').forEach(n => n.remove());

  const subToggles = document.getElementById('opportunity-subtoggles');
  if (subToggles) subToggles.classList.add('hidden');

  const drawAges = generateSurvivalAgesFromCohort(state.cohortDraws);
  const compAges = generateSurvivalAgesFromCohort(state.compareCohortDraws);
  const shuffledDraw = deterministicShuffle(drawAges, state.cohortDraws[0]?.code || 'xxx');
  const shuffledComp = deterministicShuffle(compAges, state.compareCohortDraws[0]?.code || 'yyy');

  // Draw cohort spans many countries — use a generic label, not the first draw's country
  const drawCountry = t('chart_draw_header_mobile');
  const compCountry = state.compareCohortDraws[0]?.name || '';
  const drawIso2 = ''; // no single flag for a multi-country cohort
  const compIso2 = (state.compareCohortDraws[0]?.iso2 || '').toLowerCase();
  const truncStr = (s, n) => s.length > n ? s.substring(0, n - 1) + '…' : s;

  const drawDeaths = state.cohortDraws.filter(d => d.diedUnder5).length;
  const compDeaths = state.compareCohortDraws.filter(d => d.diedUnder5).length;

  const drawLifeExpAvg = state.cohortDraws.length
    ? Math.round(state.cohortDraws.reduce((s, d) => s + (d.lifeExp || 70), 0) / state.cohortDraws.length)
    : 70;
  const compLifeExpAvg = state.compareCohortDraws.length
    ? Math.round(state.compareCohortDraws.reduce((s, d) => s + (d.lifeExp || 70), 0) / state.compareCohortDraws.length)
    : 70;

  const milestones = [
    { age: 5, label: t('surv_milestone_age5'), text: t('chart_died_before_5', { n: drawDeaths }) },
    { age: 18, label: t('surv_milestone_adult'), text: t('surv_ms_adult_text') },
    { age: drawLifeExpAvg, label: t('surv_milestone_draw'), text: t('surv_ms_draw_text') },
    { age: compLifeExpAvg, label: t('surv_milestone_your'), text: compCountry },
  ];

  // Build DOM with safe methods — no innerHTML + dynamic HTML
  const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  const canvas = mk('div', 'survival-canvas');

  // ── Top: copy + counters ──────────────────────────────────────────
  const top = mk('div', 'survival-top');

  const copy = mk('div', 'survival-copy');
  const eyebrow = mk('div', 'eyebrow'); eyebrow.textContent = t('surv_eyebrow');
  const ttl = mk('h2', 'survival-title'); ttl.textContent = t('surv_chart_title');
  const desc = mk('p', 'survival-desc');
  desc.textContent = t('surv_desc');
  copy.append(eyebrow, ttl, desc);

  const makeFlagImg = (iso2, name) => {
    if (!iso2 || iso2.length !== 2) return null;
    const img = mk('img', 'flag-img');
    img.src = 'https://flagcdn.com/' + iso2 + '.svg';
    img.alt = name + ' flag';
    return img;
  };

  const makeCounter = (name, iso2, aliveId, color) => {
    const ctr = mk('div', 'survival-counter');
    const lbl = mk('span', 'survival-counter-label');
    const fi = makeFlagImg(iso2, name);
    if (fi) lbl.appendChild(fi);
    lbl.appendChild(document.createTextNode(' ' + t('surv_alive_label') + ' · ' + name));
    const valRow = mk('div'); valRow.style.cssText = 'display:flex;align-items:baseline;gap:4px';
    const val = mk('span', 'survival-counter-value num'); val.id = aliveId; val.style.color = color; val.textContent = '1000';
    const tot = mk('span', 'num'); tot.style.cssText = 'font-size:13px;color:var(--text-dim)'; tot.textContent = '/1000';
    valRow.append(val, tot);
    ctr.append(lbl, valRow);
    return ctr;
  };

  const counters = mk('div', 'survival-counters');
  counters.append(
    makeCounter(drawCountry, drawIso2, 'surv-draw-alive', 'var(--cohort-draw)'),
    makeCounter(compCountry, compIso2, 'surv-comp-alive', 'var(--cohort-baseline)')
  );
  top.append(copy, counters);

  // ── Scrubber ──────────────────────────────────────────────────────
  const scrubber = mk('div', 'survival-scrubber');
  const ageDsp = mk('div', 'survival-age-display');
  const ageEy = mk('span', 'eyebrow'); ageEy.textContent = t('surv_age_label');
  const ageNum = mk('span', 'num'); ageNum.id = 'surv-age-num';
  ageNum.style.cssText = 'font-size:22px;font-weight:700;min-width:38px;display:inline-block';
  ageNum.textContent = '0';
  ageDsp.append(ageEy, ageNum);

  const track = mk('div', 'survival-age-track');
  const fill = mk('div', 'survival-age-fill'); fill.id = 'surv-age-fill';
  track.appendChild(fill);
  [5, 18, 40, 65, 78].forEach(m => {
    const tick = mk('div', 'survival-age-tick'); tick.style.left = m + '%';
    const tl = mk('span', 'survival-age-tick-label'); tl.textContent = String(m);
    tick.appendChild(tl); track.appendChild(tick);
  });

  const replayBtn = mk('button', 'survival-replay-btn'); replayBtn.id = 'surv-replay-btn';
  replayBtn.textContent = t('surv_replay_btn');
  scrubber.append(ageDsp, track, replayBtn);

  // ── Dot grid (1000 spans) ─────────────────────────────────────────
  const dotGrid = mk('div', 'survival-dot-grid'); dotGrid.id = 'surv-dot-grid';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 1000; i++) {
    const dot = mk('span', 'survival-dot alive');
    frag.appendChild(dot);
  }
  dotGrid.appendChild(frag);

  // ── Milestone strip ───────────────────────────────────────────────
  const msRow = mk('div', 'survival-milestones');
  milestones.forEach((m, i) => {
    const ms = mk('div', 'survival-milestone'); ms.id = 'surv-ms-' + i; ms.dataset.age = String(m.age);
    const msLbl = mk('div', 'survival-milestone-label');
    msLbl.appendChild(document.createTextNode(m.label + ' '));
    const msAge = mk('span', 'survival-milestone-age'); msAge.textContent = '· ' + m.age;
    msLbl.appendChild(msAge);
    const msTxt = mk('div', 'survival-milestone-text'); msTxt.textContent = m.text;
    ms.append(msLbl, msTxt); msRow.appendChild(ms);
  });

  canvas.append(top, scrubber, dotGrid, msRow);
  container.appendChild(canvas);

  // ── Animation ─────────────────────────────────────────────────────
  const dotEls = dotGrid.children;
  const drawAliveEl = canvas.querySelector('#surv-draw-alive');
  const compAliveEl = canvas.querySelector('#surv-comp-alive');
  const milEls = msRow.querySelectorAll('.survival-milestone');
  const DURATION = 24000;
  let startTime = null;

  const countAlive = (ages, age) => { let n = 0; for (let i = 0; i < ages.length; i++) if (ages[i] > age) n++; return n; };

  const tick = (ts) => {
    if (!startTime) startTime = ts;
    const age = Math.min(100, ((ts - startTime) / DURATION) * 100);
    ageNum.textContent = Math.floor(age);
    fill.style.width = age + '%';
    for (let i = 0; i < dotEls.length; i++) {
      const dead = shuffledDraw[i] <= age;
      if (dead && dotEls[i].classList.contains('alive')) dotEls[i].classList.replace('alive', 'dead');
      if (!dead && dotEls[i].classList.contains('dead')) dotEls[i].classList.replace('dead', 'alive');
    }
    if (drawAliveEl) drawAliveEl.textContent = countAlive(shuffledDraw, age);
    if (compAliveEl) compAliveEl.textContent = countAlive(shuffledComp, age);
    milEls.forEach(ms => ms.classList.toggle('reached', age >= parseInt(ms.dataset.age)));
    if (age < 100) { _survivalRaf = requestAnimationFrame(tick); } else { _survivalRaf = null; }
  };

  const startAnimation = () => {
    stopSurvivalAnimation();
    startTime = null;
    for (let i = 0; i < dotEls.length; i++) { dotEls[i].className = 'survival-dot alive'; }
    ageNum.textContent = '0'; fill.style.width = '0%';
    if (drawAliveEl) drawAliveEl.textContent = '1000';
    if (compAliveEl) compAliveEl.textContent = '1000';
    milEls.forEach(ms => ms.classList.remove('reached'));
    _survivalRaf = requestAnimationFrame(tick);
  };

  replayBtn.addEventListener('click', startAnimation);

  if (isResize) {
    for (let i = 0; i < dotEls.length; i++) dotEls[i].className = shuffledDraw[i] <= 100 ? 'survival-dot dead' : 'survival-dot alive';
    ageNum.textContent = '100'; fill.style.width = '100%';
    if (drawAliveEl) drawAliveEl.textContent = countAlive(shuffledDraw, 100);
    if (compAliveEl) compAliveEl.textContent = countAlive(shuffledComp, 100);
    milEls.forEach(ms => ms.classList.add('reached'));
  } else {
    setTimeout(startAnimation, 750);
  }

  // Takeaway
  const takeawayEl = document.getElementById('aggregate-takeaway');
  if (takeawayEl) {
    takeawayEl.textContent = t('take_survival', { draw: drawDeaths, country: compCountry, comp: compDeaths });
    takeawayEl.dataset.state = 'loaded';
  }
};

// Spin 1000 Times aggregate simulations
const showAggregateLoaders = () => {
  const container = document.getElementById('chart-story-container');
  if (container) {
    // Clear old SVG and placeholder messages immediately so they don't artifact!
    const svg = container.querySelector('svg');
    if (svg) svg.remove();
    const placeholder = container.querySelector('.chart-placeholder-message');
    if (placeholder) placeholder.remove();

    if (container.querySelector('.chart-loader')) return;
    const loader = document.createElement('div');
    loader.className = 'chart-loader';
    const spinner = document.createElement('div');
    spinner.className = 'loader-spinner';
    const loaderText = document.createElement('div');
    loaderText.className = 'loader-text';
    loaderText.textContent = t('surv_loader_text');
    loader.append(spinner, loaderText);
    container.appendChild(loader);
  }
};

const getRegionLabel = (code) => {
  if (['IND', 'PAK', 'BGD', 'LKA', 'NPL'].includes(code)) return 'South Asia';
  if (['CHN', 'JPN', 'KOR', 'IDN', 'PHL', 'VNM', 'THA', 'MYS'].includes(code)) return 'East Asia & Pacific';
  if (['USA', 'CAN'].includes(code)) return 'North America';
  if (['BRA', 'COL', 'ARG', 'MEX', 'PER', 'VEN', 'CHL'].includes(code)) return 'Latin America & Caribbean';
  if (['DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'SWE', 'NOR', 'DNK', 'FIN', 'IRL', 'CHE', 'AUT'].includes(code)) return 'Western Europe';
  if (['NGA', 'ETH', 'COD', 'ZAF', 'KEN', 'TZA', 'UGA', 'GHA', 'AGO', 'MOZ', 'MDG', 'CIV', 'CMR', 'NER', 'MLI'].includes(code)) return 'Sub-Saharan Africa';
  return 'Other Regions';
};

// Unified narrative cohort storytelling D3 renderer
const renderAggregateStory = (step, isResize = false) => {
  const containerId = 'chart-story-container';
  const container = document.getElementById(containerId);
  if (!container || !state.cohortDraws || state.cohortDraws.length === 0) return;

  // Show/Hide step 2 sub-toggles (must happen before early return)
  const subTogglesEarly = document.getElementById('opportunity-subtoggles');
  if (subTogglesEarly) subTogglesEarly.classList.toggle('hidden', step !== 2);

  // Step 1 uses the CSS dot-grid animation — bypass D3 entirely
  if (step === 1) {
    container.style.height = '';
    renderSurvivalStep(isResize);
    return;
  }

  // Steps 2–4: stop any running survival animation and clean up its canvas
  stopSurvivalAnimation();
  const survCanvas = container.querySelector('.survival-canvas');
  if (survCanvas) survCanvas.remove();

  const truncateText = (text, maxLength = 20) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
  };

  // Clear loaders/placeholders
  const loaders = container.querySelectorAll('.chart-loader, .chart-placeholder-message');
  loaders.forEach(l => l.remove());

  // Dynamically read container dimensions so we NEVER hardcode height or width!
  const width = container.clientWidth || 800;
  const isMobile = width < 768;
  let height;

  if (isMobile) {
    if (step === 2) {
      const cols = 25;
      const rows = 40;
      const gridW = width * 0.90;
      const colSpacing = gridW / (cols - 1);
      const spacing = Math.min(colSpacing, 14);
      const idealGridH = (rows - 1) * spacing;
      height = Math.max(500, Math.round(2 * idealGridH + 340));
    } else {
      height = 500;
    }
    container.style.height = height + 'px';
  } else {
    container.style.height = '';
    height = Math.max(container.clientHeight || 0, 640);
  }

  let svg = d3.select(container).select('svg');
  if (svg.empty()) {
    svg = d3.select(container).append('svg')
      .attr('width', '100%')
      .attr('height', height);

    svg.append('rect')
      .attr('class', 'chart-bg-rect')
      .style('fill', 'var(--bg)')
      .style('stroke', 'var(--border)')
      .attr('stroke-width', 1.5)
      .attr('rx', 12);
  }

  // Update SVG viewBox, explicit height, and rect size dynamically
  svg.attr('viewBox', `0 0 ${width} ${height}`)
    .attr('height', height);
  svg.select('.chart-bg-rect')
    .attr('width', width)
    .attr('height', height);

  let layout = {};
  if (!isMobile) {
    // Desktop layout (Side-by-Side)
    const paddingX = width * 0.03; // reduced padding for wider grids
    const paddingY = height * 0.13;
    const gridW = width * 0.45; // 45% of width (total 90% space)

    const cols = 40;
    const rows = 25;
    const graveCols = 30;

    // Spacing
    let colSpacing = gridW / (cols - 1);
    let rowSpacing = colSpacing;
    let gridH = (rows - 1) * rowSpacing;

    // If grid height is too tall, scale down rowSpacing and colSpacing proportionally
    const maxGridH = height * 0.60;
    if (gridH > maxGridH) {
      rowSpacing = maxGridH / (rows - 1);
      colSpacing = rowSpacing;
      gridH = maxGridH;
    }

    // Center the pair of grids with a controlled gap between them
    const totalGridW = (cols - 1) * colSpacing;
    const centerGap = Math.max(width * 0.04, 40);
    const pairW = 2 * totalGridW + centerGap;
    const pairStartX = (width - pairW) / 2;
    const drawStartX = pairStartX;
    const compStartX = pairStartX + totalGridW + centerGap;

    layout = {
      isMobile: false,
      cols,
      rows,
      graveCols,
      colSpacing,
      rowSpacing,
      dotRadius: Math.max(2.2, Math.min(8.0, colSpacing * 0.42)),

      // Draw grid
      drawX: drawStartX,
      drawY: paddingY,

      // Comp grid
      compX: compStartX,
      compY: paddingY,

      // Graveyards (shared baseline)
      yBaseline: height * 0.84,
      drawGraveX: drawStartX + (cols - graveCols) * colSpacing / 2,
      compGraveX: compStartX + (cols - graveCols) * colSpacing / 2,

      // Headers
      headerY: paddingY - 14,
      drawHeaderX: drawStartX,
      compHeaderX: compStartX,

      // Counter labels
      counterY: height * 0.90,
      drawCounterX: drawStartX,
      compCounterX: compStartX,
    };
  } else {
    // Mobile layout (Vertical stack)
    const paddingX = width * 0.05;
    const gridW = width * 0.90;

    const cols = 25; // 25 cols instead of 40 for mobile to expand grid spacing
    const rows = 40; // 40 rows to stack 1000 dots
    const graveCols = 20; // 20 cols graveyard to fit inside 25 cols grid width

    let colSpacing = gridW / (cols - 1);
    let rowSpacing = colSpacing;
    let gridH = (rows - 1) * rowSpacing;

    // Calculate max grid height that can be allowed without overlap (using height formula)
    const maxGridH = (height - 140) / 2;
    if (gridH > maxGridH) {
      rowSpacing = maxGridH / (rows - 1);
      colSpacing = rowSpacing;
      gridH = maxGridH;
    }

    const totalGridW = (cols - 1) * colSpacing;
    const startX = (width - totalGridW) / 2;

    const drawY = height * 0.08;
    const drawGraveY = drawY + gridH + 20;

    const compY = drawGraveY + 36 + 25; // 25px gap between draw group and comparison group
    const compGraveY = compY + gridH + 20;

    layout = {
      isMobile: true,
      cols,
      rows,
      graveCols,
      colSpacing,
      rowSpacing,
      dotRadius: Math.max(1.5, Math.min(5.5, colSpacing * 0.42)),

      // Draw grid
      drawX: startX,
      drawY,

      // Comp grid
      compX: startX,
      compY,

      // Graveyards (separate baselines under each grid)
      drawGraveBaseline: drawGraveY,
      compGraveBaseline: compGraveY,
      drawGraveX: startX + (cols - graveCols) * colSpacing / 2,
      compGraveX: startX + (cols - graveCols) * colSpacing / 2,

      // Headers
      headerY: drawY - 10,
      compHeaderY: compY - 10,
      headerX: startX,

      // Counter labels
      drawCounterY: drawGraveY + 16,
      compCounterY: compGraveY + 16,
      counterX: startX
    };
  }

  // Background grid slots for Step 1 & 2 "absence in place" visual metaphor
  let gridBg = svg.select('.grid-background');
  if (gridBg.empty()) {
    gridBg = svg.insert('g', ':first-child').attr('class', 'grid-background');
  }
  gridBg.selectAll('circle').remove();

  // Re-draw background slots based on current layout coordinates!
  for (let i = 0; i < 1000; i++) {
    const col = i % layout.cols;
    const row = Math.floor(i / layout.cols);
    gridBg.append('circle')
      .attr('cx', layout.drawX + col * layout.colSpacing)
      .attr('cy', layout.drawY + row * layout.rowSpacing)
      .attr('r', layout.dotRadius)
      .attr('fill', 'none')
      .attr('stroke', 'hsla(var(--text-primary), 0.05)')
      .attr('stroke-width', 0.5);
  }

  for (let i = 0; i < 1000; i++) {
    const col = i % layout.cols;
    const row = Math.floor(i / layout.cols);
    gridBg.append('circle')
      .attr('cx', layout.compX + col * layout.colSpacing)
      .attr('cy', layout.compY + row * layout.rowSpacing)
      .attr('r', layout.dotRadius)
      .attr('fill', 'none')
      .attr('stroke', 'hsla(var(--text-primary), 0.05)')
      .attr('stroke-width', 0.5);
  }

  gridBg.style('display', step === 2 ? 'block' : 'none');

  // Clear dynamic labels/axes/references
  svg.selectAll('.chart-title, .chart-axis, .chart-ref-line, .chart-ref-label, .chart-legend').remove();


  const compCountry = state.compareCohortDraws[0] ? state.compareCohortDraws[0].name : 'comparison country';
  const userCData = state.compareCohortDraws[0] ? state.compareCohortDraws[0].rawData : null;

  const allNodes = [...state.cohortDraws, ...state.compareCohortDraws];

  let dotsGroup = svg.select('.dots-group');
  if (dotsGroup.empty()) {
    dotsGroup = svg.append('g').attr('class', 'dots-group');
  }

  const circleSelection = dotsGroup.selectAll('circle.story-dot')
    .data(allNodes, d => d.id);

  const enterCircles = circleSelection.enter()
    .append('circle')
    .attr('class', 'story-dot')
    .attr('r', layout.dotRadius)
    .attr('cx', d => {
      const idx = parseInt(d.id.split('-')[1]);
      return d.type === 'draw'
        ? layout.drawX + (idx % layout.cols) * layout.colSpacing
        : layout.compX + (idx % layout.cols) * layout.colSpacing;
    })
    .attr('cy', d => {
      const idx = parseInt(d.id.split('-')[1]);
      return d.type === 'draw'
        ? layout.drawY + Math.floor(idx / layout.cols) * layout.rowSpacing
        : layout.compY + Math.floor(idx / layout.cols) * layout.rowSpacing;
    })
    .attr('opacity', 0);

  circleSelection.exit().remove();
  const allCircles = circleSelection.merge(enterCircles);

  // Set up tooltip
  let tooltip = d3.select('body').select('.d3-tooltip');
  if (tooltip.empty()) {
    tooltip = d3.select('body').append('div').attr('class', 'd3-tooltip');
  }

  allCircles.on('mouseover', function (event, d) {
    d3.select(this)
      .transition()
      .duration(150)
      .attr('r', layout.dotRadius * 1.6);

    let detailsHtml = `
      <div class="d3-tooltip-title">${d.name} (${d.type === 'draw' ? 'Lottery' : 'Comparison'})</div>
      <div>👤 Sex: ${d.sex}</div>
      <div>📍 Residence: ${d.residence}</div>
      <div>💰 Wealth: ${d.quintile}</div>
    `;

    if (d.diedUnder5) {
      detailsHtml += `<div class="d3-tooltip-stat" style="color: #BC463B;">☠️ Died before age 5 (simulated age: ${d.deathAge.toFixed(1)})</div>`;
    } else {
      detailsHtml += `
        <div>💰 PPP Income: $${Math.round(d.income).toLocaleString()}/yr</div>
        <div>🎓 Schooling: ${d.schooling.toFixed(1)} yrs</div>
        <div>🔌 Utilities: Water: ${d.hasWater ? 'Yes' : 'No'}, Elec: ${d.hasElectricity ? 'Yes' : 'No'}</div>
        <div class="d3-tooltip-stat" style="color: #7C9A6A;">🍀 Luck Score: ${d.luckScore}%</div>
      `;
    }

    tooltip.html(detailsHtml)
      .style('opacity', 1);
  })
    .on('mousemove', function (event) {
      tooltip
        .style('left', (event.pageX + 15) + 'px')
        .style('top', (event.pageY - 20) + 'px');
    })
    .on('mouseout', function (event, d) {
      d3.select(this)
        .transition()
        .duration(150)
        .attr('r', layout.dotRadius);
      tooltip.style('opacity', 0);
    });

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tDuration = prefersReduced ? 0 : 800;
  const transitionDuration = isResize ? 0 : tDuration;

  const takeawayEl = document.getElementById('aggregate-takeaway');

  if (step === 1) {
    // Step 1: Survival Attrition Grid
    const drawDeceased = state.cohortDraws.filter(d => d.diedUnder5);
    drawDeceased.sort((a, b) => parseInt(a.id.split('-')[1]) - parseInt(b.id.split('-')[1]));
    const drawDeceasedMap = new Map(drawDeceased.map((d, i) => [d.id, i]));

    const compDeceased = state.compareCohortDraws.filter(d => d.diedUnder5);
    compDeceased.sort((a, b) => parseInt(a.id.split('-')[1]) - parseInt(b.id.split('-')[1]));
    const compDeceasedMap = new Map(compDeceased.map((d, i) => [d.id, i]));

    // 1. Survivors transition: normal speed
    allCircles.filter(d => !d.diedUnder5)
      .transition('morph')
      .duration(transitionDuration)
      .attr('cx', d => {
        const idx = parseInt(d.id.split('-')[1]);
        return d.type === 'draw'
          ? layout.drawX + (idx % layout.cols) * layout.colSpacing
          : layout.compX + (idx % layout.cols) * layout.colSpacing;
      })
      .attr('cy', d => {
        const idx = parseInt(d.id.split('-')[1]);
        return d.type === 'draw'
          ? layout.drawY + Math.floor(idx / layout.cols) * layout.rowSpacing
          : layout.compY + Math.floor(idx / layout.cols) * layout.rowSpacing;
      })
      .attr('fill', d => d.type === 'draw' ? '#B58A63' : '#6F8CA1') // Soft Indigo vs Soft Blue
      .attr('opacity', 0.85)
      .attr('r', layout.dotRadius);

    // Dynamic ticking counters for deaths
    const drawDeathsText = svg.append('text')
      .attr('class', 'chart-title')
      .attr('id', 'draw-deaths-counter-text')
      .attr('x', layout.isMobile ? layout.counterX : layout.drawCounterX)
      .attr('y', layout.isMobile ? layout.drawCounterY : layout.counterY)
      .attr('fill', 'hsl(var(--text-secondary))')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text((isResize || prefersReduced) ? `☠️ ${t('chart_died_before_5', { n: drawDeceased.length })}` : `☠️ ${t('chart_died_before_5', { n: 0 })}`);

    const compDeathsText = svg.append('text')
      .attr('class', 'chart-title')
      .attr('id', 'comp-deaths-counter-text')
      .attr('x', layout.isMobile ? layout.counterX : layout.compCounterX)
      .attr('y', layout.isMobile ? layout.compCounterY : layout.counterY)
      .attr('fill', 'hsl(var(--text-secondary))')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text((isResize || prefersReduced) ? `☠️ ${t('chart_died_before_5', { n: compDeceased.length })}` : `☠️ ${t('chart_died_before_5', { n: 0 })}`);

    let currentDrawCount = 0;
    let currentCompCount = 0;

    const deceasedDuration = isResize ? 0 : (prefersReduced ? 0 : 2200);
    const deceasedDelay = d => {
      if (isResize || prefersReduced) return 0;
      const idx = parseInt(d.id.split('-')[1]);
      return idx * 2.2 + Math.random() * 400; // staggered trickle
    };

    // 2. Deceased transition: start at survivor slots, then slow gravity drift and accumulation on shared baseline
    allCircles.filter(d => d.diedUnder5)
      .attr('cx', d => {
        const idx = parseInt(d.id.split('-')[1]);
        return d.type === 'draw'
          ? layout.drawX + (idx % layout.cols) * layout.colSpacing
          : layout.compX + (idx % layout.cols) * layout.colSpacing;
      })
      .attr('cy', d => {
        const idx = parseInt(d.id.split('-')[1]);
        return d.type === 'draw'
          ? layout.drawY + Math.floor(idx / layout.cols) * layout.rowSpacing
          : layout.compY + Math.floor(idx / layout.cols) * layout.rowSpacing;
      })
      .attr('fill', d => d.type === 'draw' ? '#B58A63' : '#6F8CA1') // start colored like survivors
      .attr('opacity', 0)
      .attr('r', layout.dotRadius);

    // Fade them in along with the survivors
    allCircles.filter(d => d.diedUnder5)
      .transition('fadeIn')
      .duration(transitionDuration)
      .attr('opacity', 0.85);

    // Drop them to the graveyard baseline sequentially with a slower, solemn animation
    allCircles.filter(d => d.diedUnder5)
      .transition('drop')
      .ease(d3.easeQuadIn)
      .duration(isResize ? 0 : 3000) // slower animation (3.0s instead of 2.2s)
      .delay(d => {
        if (isResize || prefersReduced) return 0;
        const idx = parseInt(d.id.split('-')[1]);
        return 1200 + idx * 4.5 + Math.random() * 400; // staggered delay starting after fade-in
      })
      .attr('cx', d => {
        const sortedIdx = d.type === 'draw' ? drawDeceasedMap.get(d.id) : compDeceasedMap.get(d.id);
        const col = sortedIdx % layout.graveCols;
        const startX = d.type === 'draw' ? layout.drawGraveX : layout.compGraveX;
        return startX + col * layout.colSpacing;
      })
      .attr('cy', d => {
        const sortedIdx = d.type === 'draw' ? drawDeceasedMap.get(d.id) : compDeceasedMap.get(d.id);
        const row = Math.floor(sortedIdx / layout.graveCols);
        if (!layout.isMobile) {
          return layout.yBaseline - row * layout.rowSpacing;
        } else {
          const baseline = d.type === 'draw' ? layout.drawGraveBaseline : layout.compGraveBaseline;
          return baseline - row * layout.rowSpacing;
        }
      })
      .attr('fill', '#2f2836') // slate-700/charcoal
      .attr('opacity', 0.25)
      .attr('r', layout.dotRadius)
      .on('end', function (d) {
        if (isResize || prefersReduced) return;
        if (d.type === 'draw') {
          currentDrawCount++;
          drawDeathsText.text(`☠️ ${t('chart_died_before_5', { n: currentDrawCount })}`);
        } else {
          currentCompCount++;
          compDeathsText.text(`☠️ ${t('chart_died_before_5', { n: currentCompCount })}`);
        }
      });

    // Safety fallback to guarantee final exact totals are displayed
    if (isResize || prefersReduced) {
      const textDraw = document.getElementById('draw-deaths-counter-text');
      if (textDraw) textDraw.textContent = `☠️ ${t('chart_died_before_5', { n: drawDeceased.length })}`;
      const textComp = document.getElementById('comp-deaths-counter-text');
      if (textComp) textComp.textContent = `☠️ ${t('chart_died_before_5', { n: compDeceased.length })}`;
    } else {
      setTimeout(() => {
        const textDraw = document.getElementById('draw-deaths-counter-text');
        if (textDraw) textDraw.textContent = `☠️ ${t('chart_died_before_5', { n: drawDeceased.length })}`;
        const textComp = document.getElementById('comp-deaths-counter-text');
        if (textComp) textComp.textContent = `☠️ ${t('chart_died_before_5', { n: compDeceased.length })}`;
      }, 5000);
    }

    const displayCompCountry = truncateText(compCountry, layout.isMobile ? 18 : 28);

    // Headers
    svg.append('text').attr('class', 'chart-title')
      .attr('x', layout.isMobile ? layout.headerX : layout.drawHeaderX)
      .attr('y', layout.isMobile ? layout.headerY : layout.headerY)
      .attr('fill', '#ffffff')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text(layout.isMobile ? t('chart_draw_header_mobile') : t('chart_draw_header'));

    svg.append('text').attr('class', 'chart-title')
      .attr('x', layout.isMobile ? layout.headerX : layout.compHeaderX)
      .attr('y', layout.isMobile ? layout.compHeaderY : layout.headerY)
      .attr('fill', '#ffffff')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text(layout.isMobile ? t('chart_comp_header_mobile', { country: displayCompCountry }) : t('chart_comp_header', { country: compCountry }));

    const drawDeaths = drawDeceased.length;
    const compareDeaths = compDeceased.length;

    if (takeawayEl) {
      takeawayEl.textContent = t('take_survival', { draw: drawDeaths, country: compCountry, comp: compareDeaths });
      takeawayEl.dataset.state = 'loaded';
    }

  } else if (step === 2) {
    // Step 2: Opportunity & Access
    const activeMetric = state.opportunityMetric;
    const metricLabel = activeMetric === 'water' ? t('chart_metric_water') : (activeMetric === 'electricity' ? t('chart_metric_electricity') : t('chart_metric_university'));

    const drawDeceased = state.cohortDraws.filter(d => d.diedUnder5);
    drawDeceased.sort((a, b) => parseInt(a.id.split('-')[1]) - parseInt(b.id.split('-')[1]));
    const drawDeceasedMap = new Map(drawDeceased.map((d, i) => [d.id, i]));

    const compDeceased = state.compareCohortDraws.filter(d => d.diedUnder5);
    compDeceased.sort((a, b) => parseInt(a.id.split('-')[1]) - parseInt(b.id.split('-')[1]));
    const compDeceasedMap = new Map(compDeceased.map((d, i) => [d.id, i]));

    const graveX = d => {
      const sortedIdx = d.type === 'draw' ? drawDeceasedMap.get(d.id) : compDeceasedMap.get(d.id);
      const col = sortedIdx % layout.graveCols;
      return (d.type === 'draw' ? layout.drawGraveX : layout.compGraveX) + col * layout.colSpacing;
    };
    const graveY = d => {
      const sortedIdx = d.type === 'draw' ? drawDeceasedMap.get(d.id) : compDeceasedMap.get(d.id);
      const row = Math.floor(sortedIdx / layout.graveCols);
      if (!layout.isMobile) return layout.yBaseline - row * layout.rowSpacing;
      const baseline = d.type === 'draw' ? layout.drawGraveBaseline : layout.compGraveBaseline;
      return baseline - row * layout.rowSpacing;
    };

    // Survivors: normal morph into grid with access colouring
    allCircles.filter(d => !d.diedUnder5)
      .transition('morph')
      .duration(transitionDuration)
      .attr('cx', d => {
        const idx = parseInt(d.id.split('-')[1]);
        return d.type === 'draw'
          ? layout.drawX + (idx % layout.cols) * layout.colSpacing
          : layout.compX + (idx % layout.cols) * layout.colSpacing;
      })
      .attr('cy', d => {
        const idx = parseInt(d.id.split('-')[1]);
        return d.type === 'draw'
          ? layout.drawY + Math.floor(idx / layout.cols) * layout.rowSpacing
          : layout.compY + Math.floor(idx / layout.cols) * layout.rowSpacing;
      })
      .attr('fill', d => {
        let hasAccess = false;
        if (activeMetric === 'water') hasAccess = d.hasWater;
        else if (activeMetric === 'electricity') hasAccess = d.hasElectricity;
        else if (activeMetric === 'schooling') hasAccess = d.hasUniversity;
        return hasAccess
          ? (d.type === 'draw' ? '#B58A63' : '#6F8CA1')
          : '#BC463B';
      })
      .attr('opacity', 0.85)
      .attr('r', layout.dotRadius);

    // Deceased: first snap to their grid slots so they're visible in the main chart,
    // then fall to the graveyard with a slow staggered animation
    const deadGridX = d => {
      const idx = parseInt(d.id.split('-')[1]);
      return d.type === 'draw'
        ? layout.drawX + (idx % layout.cols) * layout.colSpacing
        : layout.compX + (idx % layout.cols) * layout.colSpacing;
    };
    const deadGridY = d => {
      const idx = parseInt(d.id.split('-')[1]);
      return d.type === 'draw'
        ? layout.drawY + Math.floor(idx / layout.cols) * layout.rowSpacing
        : layout.compY + Math.floor(idx / layout.cols) * layout.rowSpacing;
    };

    allCircles.filter(d => d.diedUnder5)
      .interrupt()
      .attr('cx', deadGridX)
      .attr('cy', deadGridY)
      .attr('fill', d => d.type === 'draw' ? '#B58A63' : '#6F8CA1')
      .attr('opacity', isResize ? 0.25 : 0.7)
      .attr('r', layout.dotRadius);

    allCircles.filter(d => d.diedUnder5)
      .transition('fall')
      .ease(d3.easeQuadIn)
      .duration(isResize ? 0 : (prefersReduced ? 0 : 2400))
      .delay(d => {
        if (isResize || prefersReduced) return 0;
        const idx = parseInt(d.id.split('-')[1]);
        return 300 + idx * 2.0 + Math.random() * 350;
      })
      .attr('cx', graveX)
      .attr('cy', graveY)
      .attr('fill', '#2f2836')
      .attr('opacity', 0.25)
      .attr('r', layout.dotRadius);

    const displayCompCountry = truncateText(compCountry, layout.isMobile ? 18 : 28);

    // Headers
    svg.append('text').attr('class', 'chart-title')
      .attr('x', layout.isMobile ? layout.headerX : layout.drawHeaderX)
      .attr('y', layout.isMobile ? layout.headerY : layout.headerY)
      .attr('fill', '#ffffff')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text(layout.isMobile ? t('chart_draw_header_mobile') : t('chart_draw_header'));

    svg.append('text').attr('class', 'chart-title')
      .attr('x', layout.isMobile ? layout.headerX : layout.compHeaderX)
      .attr('y', layout.isMobile ? layout.compHeaderY : layout.headerY)
      .attr('fill', '#ffffff')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text(layout.isMobile ? t('chart_comp_header_mobile', { country: displayCompCountry }) : t('chart_comp_header', { country: compCountry }));

    const drawAccessCount = state.cohortDraws.filter(d => !d.diedUnder5 && (activeMetric === 'water' ? d.hasWater : (activeMetric === 'electricity' ? d.hasElectricity : d.hasUniversity))).length;
    const compareAccessCount = state.compareCohortDraws.filter(d => !d.diedUnder5 && (activeMetric === 'water' ? d.hasWater : (activeMetric === 'electricity' ? d.hasElectricity : d.hasUniversity))).length;

    svg.append('text').attr('class', 'chart-title')
      .attr('x', layout.isMobile ? layout.counterX : layout.drawCounterX)
      .attr('y', layout.isMobile ? layout.drawCounterY : layout.counterY)
      .attr('fill', '#B58A63')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text(`🔵 ${t('chart_had_access', { n: drawAccessCount })}`);

    svg.append('text').attr('class', 'chart-title')
      .attr('x', layout.isMobile ? layout.counterX : layout.compCounterX)
      .attr('y', layout.isMobile ? layout.compCounterY : layout.counterY)
      .attr('fill', '#6F8CA1')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text(`🔵 ${t('chart_had_access', { n: compareAccessCount })}`);

    if (takeawayEl) {
      takeawayEl.textContent = t('take_opportunity', { draw: drawAccessCount, metric: metricLabel, comp: compareAccessCount, country: compCountry });
      takeawayEl.dataset.state = 'loaded';
    }

  } else if (step === 3) {
    // Step 3: Household Income (Linear scaled ribbon)
    const maxVal = 15000;
    const xLeft = width * 0.08;
    const xRight = width * 0.92;
    const xScale = d3.scaleLinear().domain([0, maxVal]).range([xLeft, xRight]);

    const centerY = height * 0.48;
    const spreadY = height * 0.32;
    const deceasedX = xLeft - (width * 0.03); // just left of the zero mark

    allCircles.transition('morph')
      .duration(transitionDuration)
      .attr('cx', d => {
        if (d.type === 'compare') return width + 50; // hide comparison cohort off chart
        if (d.diedUnder5) return deceasedX; // zero/death clump
        return xScale(Math.min(maxVal, d.income));
      })
      .attr('cy', d => {
        if (d.type === 'compare') return centerY;
        return centerY + d.jitter * spreadY;
      })
      .attr('fill', d => {
        if (d.type === 'compare') return '#6F8CA1';
        if (d.diedUnder5) return '#2f2836'; // dead stay charcoal
        if (d.income < 1000) return '#BC463B'; // extreme poverty (warning rose)
        if (d.income < 5000) return '#C9974B'; // moderate poverty (warning orange)
        return '#B58A63'; // normal indigo
      })
      .attr('opacity', d => {
        if (d.type === 'compare') return 0;
        if (d.diedUnder5) return 0.25;
        return 0.9;
      })
      .attr('r', layout.isMobile ? Math.max(1.5, layout.dotRadius * 0.95) : layout.dotRadius);

    // Draw Axis
    const xAxis = d3.axisBottom(xScale).ticks(layout.isMobile ? 4 : 8).tickFormat(d => `$${d.toLocaleString()}`);
    svg.append('g')
      .attr('class', 'chart-axis')
      .attr('transform', `translate(0, ${height * 0.72})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', 'hsl(var(--text-secondary))')
      .attr('font-size', layout.isMobile ? '8px' : '10px');
    svg.selectAll('.chart-axis path, .chart-axis line').attr('stroke', 'rgba(255, 255, 255, 0.12)');

    svg.append('text').attr('class', 'chart-title')
      .attr('x', width * 0.05)
      .attr('y', height * 0.09)
      .attr('fill', '#ffffff')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text(layout.isMobile ? t('chart_income_title_mobile') : t('chart_income_title'));

    // Vertical line & comparison annotation
    if (userCData) {
      const compInc = userCData.metrics.gdp_pc_ppp;
      const fits = compInc <= maxVal;
      const lineX = fits ? xScale(compInc) : xRight;

      svg.append('line')
        .attr('class', 'chart-ref-line')
        .attr('x1', lineX)
        .attr('y1', height * 0.16)
        .attr('x2', lineX)
        .attr('y2', height * 0.72)
        .attr('stroke', '#6F8CA1')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4');

      const drawSurvivors = state.cohortDraws.filter(d => !d.diedUnder5);
      const medianInc = d3.median(drawSurvivors, d => d.income) || 300;
      const multiplier = Math.max(1, Math.round(compInc / medianInc));

      const displayCompCountryShort = truncateText(compCountry, layout.isMobile ? 12 : 25);
      let labelText = t('chart_income_ref', { country: displayCompCountryShort, amount: Math.round(compInc).toLocaleString() });
      if (!fits) {
        labelText += ' ' + t('chart_income_offscale', { mult: multiplier });
      } else {
        labelText += ' ' + t('chart_income_higher', { mult: multiplier });
      }

      const anchor = lineX < width * 0.45 ? 'start' : 'end';
      const textX = anchor === 'start' ? lineX + 8 : lineX - 8;

      svg.append('text')
        .attr('class', 'chart-ref-label')
        .attr('x', textX)
        .attr('y', height * 0.20)
        .attr('text-anchor', anchor)
        .attr('fill', '#6F8CA1')
        .attr('font-size', layout.isMobile ? '9px' : '11px')
        .attr('font-weight', '700')
        .text(labelText);

      if (takeawayEl) {
        takeawayEl.textContent = t('take_income', { median: Math.round(medianInc).toLocaleString(), comp: Math.round(compInc).toLocaleString(), mult: multiplier });
        takeawayEl.dataset.state = 'loaded';
      }
    }

  } else if (step === 4) {
    // Step 4: Life Expectancy (Age Timeline)
    const xLeft = width * 0.08;
    const xRight = width * 0.92;
    const xScaleLife = d3.scaleLinear().domain([0, 95]).range([xLeft, xRight]);

    const centerY = height * 0.48;
    const spreadY = height * 0.32;

    allCircles.transition('morph')
      .duration(transitionDuration)
      .attr('cx', d => {
        if (d.type === 'compare') return width + 50;
        if (d.diedUnder5) return xScaleLife(d.deathAge);
        return xScaleLife(d.lifeExp);
      })
      .attr('cy', d => {
        if (d.type === 'compare') return centerY;
        return centerY + d.jitter * spreadY;
      })
      .attr('fill', d => {
        if (d.type === 'compare') return '#6F8CA1';
        if (d.diedUnder5) return '#2f2836'; // dead stay charcoal

        const compLife = userCData ? userCData.metrics.life_exp : 78;
        return d.lifeExp < compLife ? '#BC463B' : '#B58A63'; // warning rose vs normal indigo
      })
      .attr('opacity', d => {
        if (d.type === 'compare') return 0;
        if (d.diedUnder5) return 0.25; // extinguished dead
        return 0.9;
      })
      .attr('r', layout.isMobile ? Math.max(1.5, layout.dotRadius * 0.95) : layout.dotRadius);

    // Draw Axis
    const xAxisLife = d3.axisBottom(xScaleLife).ticks(layout.isMobile ? 5 : 10).tickFormat(d => `${d}y`);
    svg.append('g')
      .attr('class', 'chart-axis')
      .attr('transform', `translate(0, ${height * 0.72})`)
      .call(xAxisLife)
      .selectAll('text')
      .attr('fill', 'hsl(var(--text-secondary))')
      .attr('font-size', layout.isMobile ? '8px' : '10px');
    svg.selectAll('.chart-axis path, .chart-axis line').attr('stroke', 'rgba(255, 255, 255, 0.12)');

    svg.append('text').attr('class', 'chart-title')
      .attr('x', width * 0.05)
      .attr('y', height * 0.09)
      .attr('fill', '#ffffff')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text(layout.isMobile ? t('chart_life_title_mobile') : t('chart_life_title'));

    if (userCData) {
      const compLife = userCData.metrics.life_exp;
      const lineX = xScaleLife(compLife);

      svg.append('line')
        .attr('class', 'chart-ref-line')
        .attr('x1', lineX)
        .attr('y1', height * 0.16)
        .attr('x2', lineX)
        .attr('y2', height * 0.72)
        .attr('stroke', '#6F8CA1')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4');

      const medianLife = d3.median(state.cohortDraws, d => d.diedUnder5 ? d.deathAge : d.lifeExp) || 0;
      const difference = Math.max(0, compLife - medianLife);

      const displayCompCountryShort = truncateText(compCountry, layout.isMobile ? 12 : 25);
      const anchor = lineX < width * 0.45 ? 'start' : 'end';
      const textX = anchor === 'start' ? lineX + 8 : lineX - 8;

      svg.append('text')
        .attr('class', 'chart-ref-label')
        .attr('x', textX)
        .attr('y', height * 0.20)
        .attr('text-anchor', anchor)
        .attr('fill', '#6F8CA1')
        .attr('font-size', layout.isMobile ? '9px' : '11px')
        .attr('font-weight', '700')
        .text(t('chart_life_ref', { country: displayCompCountryShort, life: compLife.toFixed(1), diff: difference.toFixed(1) }));

      if (takeawayEl) {
        takeawayEl.textContent = t('take_life', { median: medianLife.toFixed(1), diff: difference.toFixed(1), country: compCountry, comp: compLife.toFixed(1) });
        takeawayEl.dataset.state = 'loaded';
      }
    }
  }
};

// Navigation lock to enforce stillness and prevent visual overlap glitching
const lockNavigation = (duration) => {
  const nextBtn = document.getElementById('step-next-btn');
  const backBtn = document.getElementById('step-back-btn');
  const spinBtn = document.getElementById('spin-1000-btn');
  const regularSpinBtn = document.getElementById('spin-btn');
  const pills = document.querySelectorAll('.step-pill');

  if (nextBtn) { nextBtn.disabled = true; nextBtn.classList.add('nav-locked'); }
  if (backBtn) { backBtn.disabled = true; backBtn.classList.add('nav-locked'); }
  if (spinBtn) { spinBtn.disabled = true; spinBtn.classList.add('nav-locked'); }
  if (regularSpinBtn) { regularSpinBtn.disabled = true; regularSpinBtn.classList.add('nav-locked'); }
  pills.forEach(p => { p.style.pointerEvents = 'none'; p.classList.add('nav-locked'); });

  setTimeout(() => {
    if (nextBtn) {
      nextBtn.disabled = state.aggregateStep === 4;
      nextBtn.classList.remove('nav-locked');
    }
    if (backBtn) {
      backBtn.disabled = state.aggregateStep === 1;
      backBtn.classList.remove('nav-locked');
    }
    if (spinBtn) { spinBtn.disabled = false; spinBtn.classList.remove('nav-locked'); }
    if (regularSpinBtn) { regularSpinBtn.disabled = false; regularSpinBtn.classList.remove('nav-locked'); }
    pills.forEach(p => {
      p.style.pointerEvents = 'auto';
      p.classList.remove('nav-locked');
    });
  }, duration);
};

// Stepper state navigation triggers
const setAggregateStep = (step) => {
  if (!state.cohortDraws || state.cohortDraws.length === 0) return;
  state.aggregateStep = step;

  // Toggle active class on pills
  for (let i = 1; i <= 4; i++) {
    const pill = document.getElementById(`step-pill-${i}`);
    if (pill) {
      pill.classList.toggle('active', i === step);
    }
  }

  // Enable/disable back/next buttons
  const backBtn = document.getElementById('step-back-btn');
  const nextBtn = document.getElementById('step-next-btn');
  if (backBtn) backBtn.disabled = step === 1;
  if (nextBtn) nextBtn.disabled = step === 4;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduced) {
    lockNavigation(1000); // 800ms transition buffer; survival animation manages itself
  }

  renderAggregateStory(step);
};

const changeAggregateStep = (delta) => {
  const target = state.aggregateStep + delta;
  if (target >= 1 && target <= 4) {
    setAggregateStep(target);
  }
};

const setOpportunityMetric = (metric) => {
  state.opportunityMetric = metric;

  // Toggle active class on opt buttons
  ['water', 'electricity', 'schooling'].forEach(m => {
    const btn = document.getElementById(`opt-toggle-${m}`);
    if (btn) {
      btn.classList.toggle('active', m === metric);
    }
  });

  if (state.aggregateStep === 2) {
    renderAggregateStory(2);
  }
};

// Aggregate step sharing handlers
const handleShareCurrentStep = async () => {
  if (!state.cohortDraws || state.cohortDraws.length === 0) return;
  const canvas = document.getElementById('share-canvas');
  if (!canvas) return;

  const shareBtn = document.getElementById('share-step-btn');
  const originalHtml = shareBtn.innerHTML;
  shareBtn.innerHTML = `Generating...`;
  shareBtn.disabled = true;

  try {
    await drawAggregateShareCard(state.aggregateStep, canvas);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        shareBtn.innerHTML = originalHtml;
        shareBtn.disabled = false;
        return;
      }

      const file = new File([blob], `birth-lottery-step${state.aggregateStep}.png`, { type: 'image/png' });
      const takeawayText = document.getElementById('aggregate-takeaway').innerText;
      const shareData = {
        title: `Birth Lottery Cohort Simulation`,
        text: `${takeawayText} Experience the Birth Lottery at:`,
        url: window.location.href
      };

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            ...shareData,
            files: [file]
          });
        } catch (shareErr) {
          if (shareErr.name !== 'AbortError') {
            console.error("Web share failed:", shareErr);
            fallbackShare(shareData);
          }
        }
      } else {
        fallbackShare(shareData);
      }
    });
  } catch (err) {
    console.error("Failed to generate aggregate share card:", err);
    alert("Could not share. Copied link instead!");
    navigator.clipboard.writeText(window.location.href);
  } finally {
    shareBtn.innerHTML = originalHtml;
    shareBtn.disabled = false;
  }
};

// Draw aggregate card for social sharing
const drawAggregateShareCard = async (step, canvas) => {
  const ctx = canvas.getContext('2d');
  canvas.width = 1200;
  canvas.height = 630;

  if (document.fonts) {
    await document.fonts.ready;
  }

  // Background Gradient
  const grad = ctx.createLinearGradient(0, 0, 1200, 630);
  grad.addColorStop(0, '#16130E');
  grad.addColorStop(0.5, '#1E1A14');
  grad.addColorStop(1, '#16130E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // Grid Pattern overlay
  ctx.strokeStyle = 'rgba(55, 49, 42, 0.5)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1200; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 630); ctx.stroke();
  }
  for (let y = 0; y < 630; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1200, y); ctx.stroke();
  }

  // Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = 'bold 20px Inter Tight, system-ui, sans-serif';
  ctx.fillText('THE BIRTH LOTTERY  •  1,000 LIVES SIMULATION', 80, 70);

  // Takeaway container
  ctx.fillStyle = 'rgba(55, 49, 42, 0.5)';
  ctx.fillRect(80, 100, 1040, 110);
  ctx.strokeStyle = 'rgba(74, 67, 56, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(80, 100, 1040, 110);

  ctx.fillStyle = '#B58A63';
  ctx.font = '800 12px Inter, system-ui, sans-serif';
  ctx.fillText(`STEP ${step} TAKEAWAY MESSAGE`, 100, 128);

  const wrapText = (text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  };

  const takeawayText = document.getElementById('aggregate-takeaway').innerText;
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 20px Inter, system-ui, sans-serif';
  wrapText(takeawayText, 100, 165, 1000, 26);

  const compCountry = state.compareCohortDraws[0] ? state.compareCohortDraws[0].name : 'comparison country';

  if (step === 1 || step === 2) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Inter Tight, system-ui, sans-serif';
    ctx.fillText('Draw Cohort (Born in Lottery)', 100, 250);
    ctx.fillText(`Comparison Cohort (Born in ${compCountry})`, 700, 250);

    const activeMetric = state.opportunityMetric;

    // Draw cohort dots
    state.cohortDraws.forEach((d, i) => {
      const col = i % 40;
      const row = Math.floor(i / 40);
      let cx = 100 + col * 11;
      let cy = 280 + row * 11;
      let fill = '#B58A63'; // Soft Indigo
      let opacity = 0.85;

      if (step === 1) {
        if (d.diedUnder5) {
          cy = 560 + (i % 10) * 6;
          fill = '#2f2836'; // Charcoal
          opacity = 0.25;
        }
      } else {
        if (d.diedUnder5) {
          cy = 560 + (i % 10) * 6;
          fill = '#2f2836'; // Charcoal
          opacity = 0.15;
        } else {
          let hasAccess = activeMetric === 'water' ? d.hasWater : (activeMetric === 'electricity' ? d.hasElectricity : d.hasUniversity);
          fill = hasAccess ? '#B58A63' : '#BC463B'; // Indigo vs Warning Rose
        }
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw comparison cohort dots
    state.compareCohortDraws.forEach((d, i) => {
      const col = i % 40;
      const row = Math.floor(i / 40);
      let cx = 700 + col * 11;
      let cy = 280 + row * 11;
      let fill = '#6F8CA1'; // Soft Blue
      let opacity = 0.85;

      if (step === 1) {
        if (d.diedUnder5) {
          cy = 560 + (i % 10) * 6;
          fill = '#2f2836'; // Charcoal
          opacity = 0.25;
        }
      } else {
        if (d.diedUnder5) {
          cy = 560 + (i % 10) * 6;
          fill = '#2f2836'; // Charcoal
          opacity = 0.15;
        } else {
          let hasAccess = activeMetric === 'water' ? d.hasWater : (activeMetric === 'electricity' ? d.hasElectricity : d.hasUniversity);
          fill = hasAccess ? '#6F8CA1' : '#BC463B'; // Blue vs Warning Rose
        }
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

  } else if (step === 3) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Inter Tight, system-ui, sans-serif';
    ctx.fillText('Household Annual Income Distribution (PPP)', 80, 250);

    const maxVal = 15000;
    const paddingX = 80;
    const chartW = 1040;
    const xScale = val => paddingX + (val / maxVal) * chartW;

    state.cohortDraws.forEach((d, i) => {
      let cx = xScale(Math.min(maxVal, d.income));
      let cy = 420 + d.jitter * 180;
      let fill = '#B58A63'; // Soft Indigo
      let opacity = 0.85;

      if (d.diedUnder5) {
        cx = 60;
        fill = '#2f2836'; // Charcoal
        opacity = 0.25;
      } else {
        if (d.income < 1000) fill = '#BC463B'; // Warning Rose
        else if (d.income < 5000) fill = '#C9974B'; // Orange
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const userCData = state.compareCohortDraws[0] ? state.compareCohortDraws[0].rawData : null;
    if (userCData) {
      const compInc = userCData.metrics.gdp_pc_ppp;
      const fits = compInc <= maxVal;
      const lineX = fits ? xScale(compInc) : xScale(maxVal);

      ctx.strokeStyle = '#6F8CA1'; // Soft Blue
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(lineX, 280);
      ctx.lineTo(lineX, 550);
      ctx.stroke();
      ctx.setLineDash([]);

      const drawSurvivors = state.cohortDraws.filter(d => !d.diedUnder5);
      const medianInc = d3.median(drawSurvivors, d => d.income) || 300;
      const multiplier = Math.max(1, Math.round(compInc / medianInc));

      ctx.fillStyle = '#6F8CA1'; // Soft Blue
      ctx.font = 'bold 16px Inter, system-ui, sans-serif';
      let labelText = `${compCountry} Avg: $${Math.round(compInc).toLocaleString()}/yr`;
      if (!fits) {
        labelText += ` (← all lives fit here. YOU are ${multiplier}x further right)`;
      }
      ctx.fillText(labelText, lineX - 10, 305);
    }

  } else if (step === 4) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Inter Tight, system-ui, sans-serif';
    ctx.fillText('Life Expectancy Timeline & Attrition', 80, 250);

    const paddingX = 80;
    const chartW = 1040;
    const xScale = val => paddingX + (val / 95) * chartW;

    state.cohortDraws.forEach((d, i) => {
      let val = d.diedUnder5 ? d.deathAge : d.lifeExp;
      let cx = xScale(val);
      let cy = 420 + d.jitter * 180;
      let fill = '#B58A63'; // Soft Indigo
      let opacity = 0.85;

      if (d.diedUnder5) {
        fill = '#2f2836'; // Charcoal
        opacity = 0.25;
      } else {
        const compLife = state.compareCohortDraws[0] ? state.compareCohortDraws[0].rawData.metrics.life_exp : 78;
        if (d.lifeExp < compLife) fill = '#BC463B'; // Warning Rose
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const userCData = state.compareCohortDraws[0] ? state.compareCohortDraws[0].rawData : null;
    if (userCData) {
      const compLife = userCData.metrics.life_exp;
      const lineX = xScale(compLife);

      ctx.strokeStyle = '#6F8CA1'; // Soft Blue
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(lineX, 280);
      ctx.lineTo(lineX, 550);
      ctx.stroke();
      ctx.setLineDash([]);

      const medianLife = d3.median(state.cohortDraws, d => d.diedUnder5 ? d.deathAge : d.lifeExp) || 0;
      const diff = Math.max(0, compLife - medianLife);

      ctx.fillStyle = '#6F8CA1'; // Soft Blue
      ctx.font = 'bold 16px Inter, system-ui, sans-serif';
      ctx.fillText(`${compCountry} Average: ${compLife.toFixed(1)} years (← +${diff.toFixed(1)} yrs longer)`, lineX - 10, 305);
    }
  }

  // Footer / Branding
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.font = '14px Inter, system-ui, sans-serif';
  ctx.fillText('Where you are born is pure chance.', 80, 595);
  ctx.fillStyle = 'rgba(181, 138, 99, 0.8)';
  ctx.fillText('birth-lottery.org', 1020, 595);
};

// Simulation generator for 1,000 spins
const handleSpin1000 = async () => {
  if (state.isSpinning) return;
  state.isSpinning = true;

  const spinBtn = el['spin-btn'];
  const spin1000Btn = el['spin-1000-btn'];
  const placeholderBtn = el['spin-1000-placeholder-btn'];

  if (spinBtn) {
    spinBtn.disabled = true;
    spinBtn.classList.add('spinning');
    spinBtn.innerHTML = 'Spinning...';
  }
  if (spin1000Btn) {
    spin1000Btn.disabled = true;
    spin1000Btn.classList.add('spinning');
    spin1000Btn.innerHTML = 'Spinning...';
  }
  if (placeholderBtn) {
    placeholderBtn.disabled = true;
    placeholderBtn.classList.add('spinning');
    placeholderBtn.innerHTML = 'Spinning...';
  }

  switchToTab('aggregate');
  showAggregateLoaders();

  // Allow browser to render loading states
  await new Promise(resolve => setTimeout(resolve, 50));

  const draws = [];
  const uniqueCodes = new Set();
  for (let i = 0; i < 1000; i++) {
    const draw = drawLottery();
    draws.push(draw);
    uniqueCodes.add(draw.code);
  }

  // Pre-fetch all unique country data in parallel
  try {
    await Promise.all(Array.from(uniqueCodes).map(code => getCountryData(code)));
  } catch (err) {
    console.error("Error pre-fetching country data:", err);
  }

  // Draw cohort simulation calculations
  const fullDraws = [];
  for (const draw of draws) {
    const countryData = state.countriesCache[draw.code.toLowerCase()];
    if (countryData) {
      if (!state.filters.ruralOnly) {
        const urbanPct = countryData.urban_pct / 100.0;
        draw.residence = Math.random() < urbanPct ? 'Urban' : 'Rural';
      }
      const calculated = calculateGroupMetrics(countryData, draw.sex, draw.quintile, draw.residence);

      // Compute stable attributes for identity continuity
      const diedUnder5 = Math.random() * 1000 < calculated.under5;
      const deathAge = diedUnder5 ? Math.random() * 5 : null;
      const hasWater = Math.random() * 100 < calculated.water;
      const hasElectricity = Math.random() * 100 < calculated.electricity;
      const hasUniversity = Math.random() * 18 < calculated.schooling;

      fullDraws.push({
        id: `d-${fullDraws.length}`,
        type: 'draw',
        ...draw,
        ...calculated,
        diedUnder5,
        deathAge,
        hasWater,
        hasElectricity,
        hasUniversity,
        jitter: Math.random() - 0.5,
        rawData: countryData
      });
    }
  }

  // Generate comparison cohort simulation of exactly 1,000 draws
  const userCode = state.userCountry || 'USA';
  const userCData = await getCountryData(userCode);
  const compareDraws = [];
  if (userCData) {
    for (let i = 0; i < 1000; i++) {
      let sex = Math.random() < 0.488 ? 'Female' : 'Male';
      if (state.filters.femaleOnly) sex = 'Female';

      const quintiles = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
      const quintile = quintiles[Math.floor(Math.random() * 5)];

      let residence = 'Urban';
      if (state.filters.ruralOnly) {
        residence = 'Rural';
      } else {
        const urbanPct = (userCData.urban_pct || 50) / 100.0;
        residence = Math.random() < urbanPct ? 'Urban' : 'Rural';
      }

      const calculated = calculateGroupMetrics(userCData, sex, quintile, residence);

      const diedUnder5 = Math.random() * 1000 < calculated.under5;
      const deathAge = diedUnder5 ? Math.random() * 5 : null;
      const hasWater = Math.random() * 100 < calculated.water;
      const hasElectricity = Math.random() * 100 < calculated.electricity;
      const hasUniversity = Math.random() * 18 < calculated.schooling;

      compareDraws.push({
        id: `c-${i}`,
        type: 'compare',
        code: userCode,
        iso2: userCData.iso2,
        name: userCData.name,
        sex,
        quintile,
        residence,
        ...calculated,
        diedUnder5,
        deathAge,
        hasWater,
        hasElectricity,
        hasUniversity,
        jitter: Math.random() - 0.5,
        rawData: userCData
      });
    }
  }

  state.cohortDraws = fullDraws;
  state.compareCohortDraws = compareDraws;
  state.aggregateStep = 1;
  state.opportunityMetric = 'water';

  // Render the narrative stepper
  setAggregateStep(1);

  state.isSpinning = false;

  const l = locales[state.lang] || locales.en;
  if (spinBtn) {
    spinBtn.disabled = false;
    spinBtn.classList.remove('spinning');
    spinBtn.innerHTML = state.activeTab === 'aggregate' ? l.spin_1000_btn : l.spin_btn;
  }
  if (spin1000Btn) {
    spin1000Btn.disabled = false;
    spin1000Btn.classList.remove('spinning');
    spin1000Btn.innerHTML = l.spin_1000_btn;
  }
  if (placeholderBtn) {
    placeholderBtn.disabled = false;
    placeholderBtn.classList.remove('spinning');
    placeholderBtn.innerHTML = l.spin_1000_btn;
  }
};

// Seed load method
const loadSeed = async (seed) => {
  const parts = seed.split('-');
  if (parts.length < 4) return;

  const code = parts[0].toUpperCase();
  const sex = (parts[1] === 'f' || parts[1] === 'female') ? 'Female' : 'Male';

  const qMap = { 'q1': 'Q1', 'q2': 'Q2', 'q3': 'Q3', 'q4': 'Q4', 'q5': 'Q5' };
  const quintile = qMap[parts[2]] || 'Q3';

  const residence = (parts[3] === 'r' || parts[3] === 'rural') ? 'Rural' : 'Urban';

  const countryData = await getCountryData(code);
  if (countryData) {
    const calculated = calculateGroupMetrics(countryData, sex, quintile, residence);
    state.activeDraw = { code, iso2: countryData.iso2, name: countryData.name, sex, quintile, residence, ...calculated, rawData: countryData };
    if (el['draw-results-section']) el['draw-results-section'].classList.remove('hidden');
    renderDraw(state.activeDraw, 'active');
    alignWheelToDraw(state.activeDraw, true);
    const drawLabelEl = document.getElementById('demographic-draw-label');
    if (drawLabelEl) {
      const labelSpan = drawLabelEl.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = t('draw_label_loaded');
      }
    }
  }
};

// Translation updates across elements
const updateTranslations = () => {
  const l = locales[state.lang];
  if (!l) return;

  // Header / Logo
  if (el['logo-title']) el['logo-title'].textContent = l.title;
  if (el['logo-subtitle']) el['logo-subtitle'].textContent = l.subtitle;
  if (el['user-country-label']) el['user-country-label'].textContent = l.actual_country_label;

  // Controls
  if (el['spin-btn']) el['spin-btn'].textContent = state.activeTab === 'aggregate' ? l.spin_1000_btn : l.spin_btn;
  if (el['spin-1000-btn']) el['spin-1000-btn'].textContent = l.spin_1000_btn;
  if (el['spin-1000-placeholder-btn']) el['spin-1000-placeholder-btn'].textContent = l.spin_1000_btn;
  if (el['compare-mode-btn']) el['compare-mode-btn'].textContent = l.compare_mode;
  if (el['hold-btn']) el['hold-btn'].textContent = l.hold_active;

  // Filter Options
  if (el['filter-title']) el['filter-title'].textContent = l.filter_label;
  if (el['filter-select']) {
    el['filter-select'].options[0].textContent = l.filter_none;
    el['filter-select'].options[1].textContent = l.filter_lic;
    el['filter-select'].options[2].textContent = l.filter_female;
    el['filter-select'].options[3].textContent = l.filter_rural;
  }

  // Grid Titles
  if (el['survival-title']) el['survival-title'].textContent = l.survival;
  if (el['education-title']) el['education-title'].textContent = l.education;
  if (el['material-title']) el['material-title'].textContent = l.material_conditions;
  if (el['freedoms-title']) el['freedoms-title'].textContent = l.freedoms_risk;

  // Call to action
  if (el['cta-title']) el['cta-title'].textContent = l.cta_title;
  if (el['cta-body']) el['cta-body'].textContent = l.cta_body;
  if (el['cta-btn']) el['cta-btn'].textContent = l.cta_link_text;

  // Footers & Metadata Links
  if (el['data-vintage-link']) el['data-vintage-link'].textContent = l.methodology;
  if (el['data-gaps-link']) el['data-gaps-link'].textContent = l.data_gaps;
  if (el['luck-score-label']) el['luck-score-label'].textContent = l.luck_score;
  if (el['luck-score-desc']) el['luck-score-desc'].textContent = l.luck_desc;
  if (el['probabilistic-note']) el['probabilistic-note'].textContent = l.probabilistic_note;

  // Disability toggle
  if (el['disability-toggle-label']) el['disability-toggle-label'].textContent = l.disability_label;

  // Legend labels
  if (el['cb-legend-draw-label']) el['cb-legend-draw-label'].textContent = l.legend_draw;
  if (el['cb-legend-base-label']) el['cb-legend-base-label'].textContent = l.legend_base;
  if (el['cb-legend-deficit-label']) el['cb-legend-deficit-label'].textContent = l.legend_deficit;

  // Dashboard tabs
  if (el['tab-single']) el['tab-single'].textContent = l.tab_individual;
  if (el['tab-aggregate']) el['tab-aggregate'].textContent = l.tab_aggregate;

  // Metric card titles
  const metricTitleMap = {
    'life-exp-card': l.life_expectancy,
    'under5-mort-card': l.under_5_mortality,
    'maternal-card': l.maternal_mortality,
    'income-card': l.ppp_income,
    'electricity-card': l.electricity,
    'water-card': l.clean_water,
    'sanitation-card': l.sanitation,
    'schooling-card': l.expected_schooling,
    'school-prim-card': l.primary,
    'school-sec-card': l.secondary,
    'school-tert-card': l.tertiary,
    'democracy-card': l.democracy,
    'conflict-card': l.conflict_risk,
    'child-marriage-card': l.child_marriage,
    'fgm-card': l.fgm,
  };
  Object.entries(metricTitleMap).forEach(([cardId, title]) => {
    const card = document.getElementById(cardId);
    if (card) {
      const titleEl = card.querySelector('.metric-title');
      if (titleEl) titleEl.textContent = title;
    }
  });

  // Aggregate dashboard static elements
  if (el['agg-eyebrow']) el['agg-eyebrow'].textContent = l.agg_eyebrow;
  if (el['agg-title']) el['agg-title'].textContent = l.agg_title;
  if (el['agg-subtitle']) el['agg-subtitle'].textContent = l.agg_subtitle;
  if (el['step-back-btn']) el['step-back-btn'].textContent = l.agg_back_btn;
  if (el['step-next-btn']) el['step-next-btn'].textContent = l.agg_next_btn;
  if (el['step-pill-1']) el['step-pill-1'].textContent = l.agg_pill_1;
  if (el['step-pill-2']) el['step-pill-2'].textContent = l.agg_pill_2;
  if (el['step-pill-3']) el['step-pill-3'].textContent = l.agg_pill_3;
  if (el['step-pill-4']) el['step-pill-4'].textContent = l.agg_pill_4;
  if (el['opt-toggle-water']) el['opt-toggle-water'].textContent = l.agg_toggle_water;
  if (el['opt-toggle-electricity']) el['opt-toggle-electricity'].textContent = l.agg_toggle_elec;
  if (el['opt-toggle-schooling']) el['opt-toggle-schooling'].textContent = l.agg_toggle_university;
  if (el['chart-placeholder-title']) el['chart-placeholder-title'].textContent = l.agg_placeholder_title;
  if (el['chart-placeholder-hint']) el['chart-placeholder-hint'].textContent = l.agg_placeholder_hint;
  if (el['share-step-text']) el['share-step-text'].textContent = ' ' + l.agg_share_step;
  // Only update takeaway if still showing the initial placeholder text
  if (el['aggregate-takeaway'] && el['aggregate-takeaway'].dataset.state !== 'loaded') {
    el['aggregate-takeaway'].textContent = l.agg_takeaway_init;
  }

  // Section fullscreen titles (kept in sync with translated section headings)
  sectionFullscreenMap['survival-health'].title = l.survival;
  sectionFullscreenMap['material-conditions'].title = l.material_conditions;
  sectionFullscreenMap['education'].title = l.education;
  sectionFullscreenMap['freedoms-risk'].title = l.freedoms_risk;

  // Layout direction for RTL
  if (state.lang === 'ar') {
    document.documentElement.dir = 'rtl';
  } else {
    document.documentElement.dir = 'ltr';
  }
};

// Draw three-ring demographic wheel: sex (inner) · residence (mid) · wealth (outer)
const drawWheelSVG = () => {
  if (!el['wheel']) return;
  const lw = locales[state.lang] || locales.en;

  const xe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Donut arc path helper (angles in degrees, 0=right, clockwise)
  const arc = (r1, r2, a1, a2) => {
    const R = Math.PI / 180;
    const [x1, y1] = [Math.cos(a1 * R) * r2, Math.sin(a1 * R) * r2];
    const [x2, y2] = [Math.cos(a2 * R) * r2, Math.sin(a2 * R) * r2];
    const [x3, y3] = [Math.cos(a2 * R) * r1, Math.sin(a2 * R) * r1];
    const [x4, y4] = [Math.cos(a1 * R) * r1, Math.sin(a1 * R) * r1];
    const laf = (a2 - a1) > 180 ? 1 : 0;
    return `M${f(x1)},${f(y1)} A${r2},${r2} 0 ${laf} 1 ${f(x2)},${f(y2)} L${f(x3)},${f(y3)} A${r1},${r1} 0 ${laf} 0 ${f(x4)},${f(y4)}Z`;
  };
  const f = (n) => n.toFixed(2);
  const G = 1.5; // gap between sectors (degrees)

  // Ring definitions
  const rings = [
    {
      id: 'wheel-wealth',
      r1: 80, r2: 107,
      sectors: [
        { label: lw.quintile_q1, color: '#3D3530' },
        { label: lw.quintile_q2, color: '#5C4E44' },
        { label: lw.quintile_q3, color: '#8A6E52' },
        { label: lw.quintile_q4, color: '#A27B5C' },
        { label: lw.quintile_q5, color: '#B58A63' },
      ],
      fontSize: 6.0, textR: 93,
    },
    {
      id: 'wheel-residence',
      r1: 56, r2: 76,
      sectors: [
        { label: lw.residence_urban, color: '#C9974B' },
        { label: lw.residence_rural, color: '#7C9A6A' },
      ],
      fontSize: 7.5, textR: 66,
    },
    {
      id: 'wheel-sex',
      r1: 30, r2: 52,
      sectors: [
        { label: lw.gender_male, color: '#6F8CA1' },
        { label: lw.gender_female, color: '#B58A63' },
      ],
      fontSize: 7.5, textR: 41,
    },
  ];

  let svgParts = `<svg viewBox="-110 -110 220 220" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
  // Background
  svgParts += `<circle r="109" fill="var(--surface)" stroke="var(--border)" stroke-width="0.5"/>`;

  rings.forEach(({ id, r1, r2, sectors, fontSize, textR }) => {
    const n = sectors.length;
    const seg = 360 / n;
    let paths = '';
    sectors.forEach((s, i) => {
      const a1 = -90 + i * seg + G / 2;
      const a2 = -90 + (i + 1) * seg - G / 2;
      const mid = -90 + (i + 0.5) * seg;
      const R = Math.PI / 180;
      const tx = Math.cos(mid * R) * textR, ty = Math.sin(mid * R) * textR;
      const rot = mid + 90;
      paths += `<path d="${arc(r1, r2, a1, a2)}" fill="${s.color}" stroke="var(--bg)" stroke-width="1.5"/>`;
      paths += `<text x="${f(tx)}" y="${f(ty)}" fill="rgba(241,235,223,0.9)" font-size="${fontSize}" font-family="Inter Tight,system-ui,sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="middle" transform="rotate(${f(rot)},${f(tx)},${f(ty)})">${xe(s.label)}</text>`;
    });
    // Separator rings
    svgParts += `<circle r="${r2 + G / 4}" fill="none" stroke="var(--bg)" stroke-width="2"/>`;
    svgParts += `<g id="${id}" style="transform-origin:0 0">${paths}</g>`;
  });

  // Center hub
  svgParts += `<circle r="28" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="0.8"/>`;
  svgParts += `</svg>`;
  el['wheel'].innerHTML = svgParts;

  // Reset tracked angles when wheel is redrawn
  state.wheelRingAngles = { wealth: 0, residence: 0, sex: 0 };
};

// Section fullscreen expand/collapse
const sectionFullscreenMap = {
  'survival-health': { title: 'Survival & Health', selector: '#metrics-dashboard-grid .accordion-section:nth-child(1) .metrics-grid' },
  'material-conditions': { title: 'Material Conditions', selector: '#metrics-dashboard-grid .accordion-section:nth-child(2) .metrics-grid' },
  'education': { title: 'Education', selector: '#metrics-dashboard-grid .accordion-section:nth-child(3) .metrics-grid' },
  'freedoms-risk': { title: 'Freedoms & Risk', selector: '#metrics-dashboard-grid .accordion-section:nth-child(4) .metrics-grid' },
};

window.openSectionFullscreen = (sectionKey) => {
  const cfg = sectionFullscreenMap[sectionKey];
  if (!cfg) return;
  const overlay = document.getElementById('section-fullscreen-overlay');
  const titleEl = document.getElementById('section-fullscreen-title');
  const bodyEl = document.getElementById('section-fullscreen-body');
  if (!overlay || !titleEl || !bodyEl) return;
  const src = document.querySelector(cfg.selector);
  if (!src) return;
  titleEl.textContent = cfg.title;
  bodyEl.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'metrics-grid';
  // Clone only metric cards (skip hidden ones)
  [...src.querySelectorAll('.metric-card')].forEach((card) => {
    if (card.classList.contains('hidden')) return;
    const clone = card.cloneNode(true);
    clone.style.cursor = 'default';
    grid.appendChild(clone);
  });
  bodyEl.appendChild(grid);
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.closeSectionFullscreen = () => {
  const overlay = document.getElementById('section-fullscreen-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.closeSectionFullscreen();
});

// Flag emoji converter using FlagCDN images for high-quality cross-platform display
const getFlagEmoji = (iso2, countryName = '') => {
  if (!iso2 || iso2.length !== 2) return '';
  const flagUrl = `https://flagcdn.com/${iso2.toLowerCase()}.svg`;
  return `<img src="${flagUrl}" alt="${countryName} flag" class="flag-img" />`;
};

// D3 Globe logic
let projection, path, globeSvg;

const initGlobe = () => {
  if (!state.worldTopology || !el['globe-svg']) return;

  globeSvg = d3.select(el['globe-svg']);

  // Extract GeoJSON features from TopoJSON
  state.globeFeatures = topojson.feature(state.worldTopology, state.worldTopology.objects.countries).features;

  const width = 250;
  const height = 250;

  // Define orthographic projection
  projection = d3.geoOrthographic()
    .scale(115)
    .translate([width / 2, height / 2])
    .clipAngle(90);

  path = d3.geoPath().projection(projection);

  // Clear any existing content
  globeSvg.selectAll('*').remove();

  // Create defs for ocean gradient
  const defs = globeSvg.append('defs');

  // Radial ocean gradient
  const oceanGrad = defs.append('radialGradient')
    .attr('id', 'ocean-gradient')
    .attr('cx', '35%')
    .attr('cy', '35%');

  oceanGrad.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', 'hsla(220, 40%, 18%, 0.85)');
  oceanGrad.append('stop')
    .attr('offset', '60%')
    .attr('stop-color', 'hsla(225, 45%, 10%, 0.9)');
  oceanGrad.append('stop')
    .attr('offset', '100%')
    .attr('stop-color', 'hsla(230, 50%, 4%, 0.95)');

  // Ocean background circle
  globeSvg.append('circle')
    .attr('cx', width / 2)
    .attr('cy', height / 2)
    .attr('r', projection.scale())
    .attr('class', 'globe-ocean');

  // Graticules (lat/long grid lines)
  const graticule = d3.geoGraticule();
  globeSvg.append('path')
    .datum(graticule)
    .attr('class', 'globe-graticule')
    .attr('d', path);

  // Draw land paths
  globeSvg.append('g')
    .attr('class', 'globe-land-group')
    .selectAll('path')
    .data(state.globeFeatures)
    .enter()
    .append('path')
    .attr('class', 'globe-land')
    .attr('d', path)
    .attr('data-numeric-id', d => parseInt(d.id, 10))
    .on('click', (event, d) => {
      if (event.defaultPrevented) return;
      handleCountryClick(d);
    });

  // Enable dragging interaction
  const drag = d3.drag()
    .on('start', () => {
      globeSvg.interrupt('globe-spin-transition');
    })
    .on('drag', (event) => {
      const rotate = projection.rotate();
      const k = 75 / projection.scale();
      projection.rotate([
        rotate[0] + event.dx * k,
        rotate[1] - event.dy * k
      ]);
      globeSvg.selectAll('path').attr('d', path);

      // Real-time centroid pin drop update during drag
      const pinGroup = globeSvg.select('.globe-pin-group');
      if (!pinGroup.empty() && state.activeDraw) {
        const numericId = state.iso3ToNumericMap[state.activeDraw.code];
        const targetFeature = state.globeFeatures.find(f => {
          if (f.id && parseInt(f.id, 10) === numericId) return true;
          const fName = f.properties && f.properties.name;
          if (fName && state.activeDraw.name) {
            const cleanDraw = state.activeDraw.name.toLowerCase().trim();
            const cleanF = fName.toLowerCase().trim();
            return cleanF === cleanDraw || cleanF.includes(cleanDraw) || cleanDraw.includes(cleanF);
          }
          return false;
        });

        if (targetFeature) {
          const centroid = d3.geoCentroid(targetFeature);
          if (!isNaN(centroid[0]) && !isNaN(centroid[1])) {
            const distance = d3.geoDistance(centroid, [-projection.rotate()[0], -projection.rotate()[1]]);
            const isVisible = distance < Math.PI / 2;
            if (isVisible) {
              const projected = projection(centroid);
              pinGroup.style('opacity', 1);
              pinGroup.selectAll('circle').attr('cx', projected[0]).attr('cy', projected[1]);
            } else {
              pinGroup.style('opacity', 0);
            }
          }
        }
      }
    });

  globeSvg.call(drag);
};

const updateGlobe = (draw) => {
  if (!projection || !path || !globeSvg || !state.globeFeatures) return;

  const numericId = state.iso3ToNumericMap[draw.code];

  // Find matching feature with robust name-based fallback
  const targetFeature = state.globeFeatures.find(f => {
    if (f.id && parseInt(f.id, 10) === numericId) return true;

    // Fallback: match by name
    const fName = f.properties && f.properties.name;
    if (fName && draw.name) {
      const cleanDraw = draw.name.toLowerCase().trim();
      const cleanF = fName.toLowerCase().trim();
      return cleanF === cleanDraw || cleanF.includes(cleanDraw) || cleanDraw.includes(cleanF);
    }
    return false;
  });

  if (!targetFeature) return;

  const centroid = d3.geoCentroid(targetFeature);
  if (isNaN(centroid[0]) || isNaN(centroid[1])) return;

  // Clear previous active states on all land paths
  globeSvg.selectAll('.globe-land')
    .classed('globe-active', false)
    .classed('safe-active', false)
    .classed('risk-active', false);

  // Set active class on target land path and raise it above others
  const activeSelection = globeSvg.selectAll('.globe-land')
    .filter(d => d === targetFeature);

  activeSelection
    .classed('globe-active', true)
    .classed('safe-active', draw.luckScore >= 70)
    .classed('risk-active', draw.luckScore <= 35)
    .raise();

  // Clear previous pin drops
  globeSvg.selectAll('.globe-pin-group').remove();

  // Create glowing pin group
  const pinGroup = globeSvg.append('g')
    .attr('class', 'globe-pin-group')
    .style('pointer-events', 'none');

  const color = draw.luckScore >= 70 ? 'rgba(124, 154, 106, 0.5)' : (draw.luckScore <= 35 ? 'rgba(188, 70, 59, 0.5)' : 'rgba(201, 151, 75, 0.5)');
  const dotColor = draw.luckScore >= 70 ? '#7C9A6A' : (draw.luckScore <= 35 ? '#BC463B' : '#C9974B');

  const pinGlow = pinGroup.append('circle')
    .attr('class', 'globe-pin-glow')
    .attr('fill', color);

  const pinDot = pinGroup.append('circle')
    .attr('class', 'globe-pin-dot')
    .attr('r', 4.5)
    .attr('fill', dotColor)
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 1.5);

  const updatePinPosition = () => {
    const distance = d3.geoDistance(centroid, [-projection.rotate()[0], -projection.rotate()[1]]);
    const isVisible = distance < Math.PI / 2;

    if (isVisible) {
      const projected = projection(centroid);
      pinGroup.style('opacity', 1);
      pinGlow.attr('cx', projected[0]).attr('cy', projected[1]);
      pinDot.attr('cx', projected[0]).attr('cy', projected[1]);
    } else {
      pinGroup.style('opacity', 0);
    }
  };

  // Animate rotation to centroid
  const currentRotate = projection.rotate();
  const targetRotate = [-centroid[0], -centroid[1], currentRotate[2] || 0];
  const interpolate = d3.interpolate(currentRotate, targetRotate);

  globeSvg.transition('globe-spin-transition')
    .duration(1200)
    .ease(d3.easeCubicOut)
    .tween('rotate', () => {
      return (t) => {
        projection.rotate(interpolate(t));
        globeSvg.selectAll('path').attr('d', path);
        updatePinPosition();
      };
    })
    .on('end', () => {
      updatePinPosition();
    });
};

// Bind to window onload
window.addEventListener('DOMContentLoaded', init);
export default state;
